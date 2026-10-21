// -----------------------------------------------------------------------------
// The followed vehicles: what the register said, and what Gladys was told.
//
// One object holds the last register row of every configured plate and runs
// the whole cycle:
//   1. read the register (one request for every plate, see client.js), at
//      most every `refresh_hours`;
//   2. compute each vehicle's status for today (status.js) and publish the
//      feature states, only the changed ones;
//   3. publish the transport badge: `cloud` when the register answered,
//      `unreachable` when it did not;
//   4. fire the scene triggers for what changed since the last time
//      (capabilities/scenes.js), remembered across restarts (memory.js).
//
// index.js calls `update()` every hour: steps 2 to 4 always run (the days
// left change at midnight even when the register does not), step 1 only
// when the data is older than the configured interval.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { fetchVehicles } from './client.js';
import { today, vehicleStatus } from './status.js';
import { buildVehicleDevice, vehicleIds, vehicleName, vehicleStates } from '../devices/vehicle.js';
import { rememberedState, sceneEventsFor } from '../capabilities/scenes.js';
import { formatPlate } from './plate.js';

const logger = createLogger({ name: 'fleet' });

const HOUR_MS = 60 * 60 * 1000;

// publishChangedStates only sends what changed; the heartbeat re-sends an
// unchanged value once a day so it stays recently dated in Gladys.
const STATE_HEARTBEAT_MS = 24 * HOUR_MS;

export class Fleet {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {import('./memory.js').Memory} options.memory
   * @param {typeof fetch} [options.fetch] injected by the tests
   * @param {() => Date} [options.now] injected by the tests
   * @param {() => Promise<void>} [options.onPublished] run after every cycle
   *   (index.js: widget refresh and connection status)
   */
  constructor({
    gladys,
    memory,
    fetch: doFetch = fetch,
    now = () => new Date(),
    onPublished = async () => {},
  }) {
    this.gladys = gladys;
    this.memory = memory;
    this.fetch = doFetch;
    this.now = now;
    this.onPublished = onPublished;
    // Cycles run one after the other: the hourly timer, a scene action and a
    // widget button can ask at the same moment, and two interleaved cycles
    // would fire the same scene event twice.
    this.pending = Promise.resolve();
    this.config = null;
    /** @type {Map<string, ReturnType<import('./client.js').parseVehicle> | null>} null: not in the register */
    this.vehicles = new Map();
    this.fetchedAt = null;
    this.lastError = null;
  }

  setConfig(config) {
    const changedPlates = this.config?.plates !== config.plates;
    this.config = config;
    for (const plate of this.vehicles.keys()) {
      if (!config.plateList.includes(plate)) {
        this.vehicles.delete(plate);
      }
    }
    // A plate added since the last read has no data yet: read it now rather
    // than at the next scheduled refresh.
    if (changedPlates && config.plateList.some((plate) => !this.vehicles.has(plate))) {
      this.fetchedAt = null;
    }
  }

  get plates() {
    return this.config?.plateList ?? [];
  }

  /** The discovery payload: one device per configured plate. */
  devices() {
    return this.plates.map((plate) =>
      buildVehicleDevice(this.gladys, plate, this.vehicles.get(plate)),
    );
  }

  /** Is the last read older than the configured interval? */
  isDue() {
    return (
      this.fetchedAt === null ||
      this.now().getTime() - this.fetchedAt >= this.config.refresh_hours * HOUR_MS
    );
  }

  /**
   * Read the register now, whatever the schedule.
   * @returns {Promise<{ ok: boolean, found: string[], unknown: string[], error?: Error }>}
   */
  async refresh() {
    const plates = this.plates;
    try {
      const rows = await fetchVehicles(plates, {
        appToken: this.config.app_token,
        fetch: this.fetch,
      });
      for (const plate of plates) {
        this.vehicles.set(plate, rows.get(plate) ?? null);
      }
      this.fetchedAt = this.now().getTime();
      this.lastError = null;
      const unknown = plates.filter((plate) => !rows.has(plate));
      logger.info(
        `Register read: ${rows.size} vehicle(s) found, ${unknown.length} unknown plate(s)`,
      );
      return { ok: true, found: plates.filter((plate) => rows.has(plate)), unknown };
    } catch (err) {
      // Keep the vehicles read before: an unreachable register does not make
      // an APK date wrong. The badge says the data is not fresh.
      this.lastError = err;
      logger.warn(`Register read failed: ${err.message}`);
      return { ok: false, found: [], unknown: [], error: err };
    }
  }

  /**
   * The hourly cycle: read the register when due, then publish.
   * @param {{ force?: boolean, fireEvents?: boolean }} [options] `force` reads
   *   the register even when not due; `fireEvents` see `publish`
   * @returns {Promise<Awaited<ReturnType<Fleet['refresh']>> | null>} the
   *   register read, null when none was due
   */
  update({ force = false, fireEvents = true } = {}) {
    const run = this.pending.then(async () => {
      let result = null;
      if (this.plates.length > 0 && (force || this.isDue())) {
        result = await this.refresh();
      }
      await this.publish({ fireEvents });
      await this.onPublished();
      return result;
    });
    // The queue goes on after a failed cycle; the caller still gets the error.
    this.pending = run.catch(() => {});
    return run;
  }

  /** Every configured vehicle with its status for today, in the configured order. */
  snapshot() {
    const day = today(this.now());
    return this.plates.map((plate) => {
      const vehicle = this.vehicles.get(plate);
      return {
        plate,
        deviceExternalId: vehicleIds(this.gladys, plate).device,
        // undefined: never read yet; null: not in the register.
        vehicle,
        status: vehicle
          ? vehicleStatus(vehicle, { warningDays: this.config.apk_warning_days, today: day })
          : null,
      };
    });
  }

  /**
   * Publish states, transport badges and scene events of every vehicle.
   *
   * @param {{ fireEvents?: boolean }} [options] `fireEvents: false` when a
   *   scene asked for the refresh: an event fired in answer to a scene action
   *   could loop through a scene bound to it. The changes are then left
   *   unremembered, and the next hourly cycle fires them.
   */
  async publish({ fireEvents = true } = {}) {
    const snapshot = this.snapshot();
    const known = snapshot.filter((entry) => entry.vehicle);

    const states = known.flatMap(({ plate, vehicle, status }) =>
      vehicleStates(this.gladys, plate, vehicle, status),
    );
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }

    const transports = snapshot
      .filter((entry) => entry.vehicle !== undefined || this.lastError)
      .map((entry) => this.transportOf(entry));
    if (transports.length > 0) {
      await this.gladys.publishTransports(transports);
    }

    // Scene events last: a scene reacting to one reads states already up to date.
    for (const entry of fireEvents ? known : []) {
      const previous = this.memory.get(entry.plate);
      for (const event of sceneEventsFor(previous, entry)) {
        logger.info(`Scene event ${event.key} for ${formatPlate(entry.plate)}`);
        try {
          await this.gladys.publishSceneEvent(event.key, event.data);
        } catch (err) {
          // A refused event must not stop the others nor block the memory:
          // firing it again at every refresh would be worse than missing it.
          logger.error(`Scene event ${event.key} refused: ${err.message}`);
        }
      }
      this.memory.set(entry.plate, rememberedState(entry));
    }
    this.memory.keepOnly(this.plates);
    await this.memory.save();
  }

  transportOf({ deviceExternalId, vehicle }) {
    if (this.lastError) {
      return {
        external_id: deviceExternalId,
        transport: DEVICE_TRANSPORTS.UNREACHABLE,
      };
    }
    if (vehicle === null) {
      return {
        external_id: deviceExternalId,
        transport: DEVICE_TRANSPORTS.CLOUD,
        degraded: true,
        message: {
          en: 'This plate is not in the RDW register.',
          fr: "Cette plaque n'est pas dans le registre RDW.",
          de: 'Dieses Kennzeichen ist nicht im RDW-Register.',
          es: 'Esta matrícula no está en el registro RDW.',
        },
      };
    }
    return { external_id: deviceExternalId, transport: DEVICE_TRANSPORTS.CLOUD };
  }

  /** The plate of a device of this integration, or null. */
  plateOf(deviceExternalId) {
    return (
      this.plates.find((plate) => vehicleIds(this.gladys, plate).device === deviceExternalId) ??
      null
    );
  }

  /** "Volkswagen Golf (AB-123-C)" or just the plate. */
  label(plate) {
    const name = vehicleName(this.vehicles.get(plate));
    return name ? `${name} (${formatPlate(plate)})` : formatPlate(plate);
  }
}
