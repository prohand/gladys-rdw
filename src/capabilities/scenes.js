// -----------------------------------------------------------------------------
// Scene triggers and scene actions (SDK v0.14+, Gladys 5.1+).
//
// Triggers say "this happened" — fired by the fleet after each cycle, once per
// change, never at every refresh:
//   - apk_reminder   : the APK of a vehicle became due soon, or expired;
//   - recall_opened  : the register shows an open recall that was not there;
//   - insurance_lost : the register no longer shows a WAM insurance.
//
// Actions are operations a scene author places in a scene:
//   - refresh_vehicles : read the register now;
//   - get_vehicle      : the facts of one vehicle, as outputs the following
//                        actions of the scene can read.
//
// Keys (triggers, actions, fields, variables, outputs) are stored in users'
// scenes: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { APK_STAGES } from '../rdw/status.js';
import { formatPlate } from '../rdw/plate.js';
import { vehicleName } from '../devices/vehicle.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  APK_REMINDER: 'apk_reminder',
  RECALL_OPENED: 'recall_opened',
  INSURANCE_LOST: 'insurance_lost',
};

/** Every trigger the code fires: each one is declared in the manifest (see the tests). */
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/** What the memory keeps of a vehicle to tell, next time, what changed. */
export function rememberedState({ vehicle, status }) {
  return {
    apkExpiry: vehicle.apkExpiry,
    apkStage: status.apkStage,
    insured: vehicle.insured,
    openRecall: vehicle.openRecall,
  };
}

/**
 * The scene events one vehicle fires, given what was remembered of it.
 *
 * - The APK reminder fires when the vehicle enters a stage (due soon, then
 *   expired), once per APK date: passing the APK moves the date and starts
 *   over. A vehicle seen for the first time already due fires it too: the
 *   owner wants to hear about it, even on the day the plate is added.
 * - The recall and insurance triggers fire on a change only: a vehicle seen
 *   for the first time has nothing to compare with, and an unknown value
 *   (absent from the register) is never a change.
 *
 * @param {ReturnType<typeof rememberedState> | undefined} previous
 * @param {{ plate: string, deviceExternalId: string, vehicle: object, status: object }} entry
 * @returns {{ key: string, data: Record<string, string | number | null> }[]}
 */
export function sceneEventsFor(previous, { plate, deviceExternalId, vehicle, status }) {
  const common = {
    device: deviceExternalId,
    plate: formatPlate(plate),
    vehicle: vehicleName(vehicle) ?? formatPlate(plate),
  };
  const events = [];

  const apkDue = status.apkStage === APK_STAGES.DUE_SOON || status.apkStage === APK_STAGES.EXPIRED;
  const sameApk =
    previous && previous.apkExpiry === vehicle.apkExpiry && previous.apkStage === status.apkStage;
  if (apkDue && !sameApk) {
    events.push({
      key: SCENE_TRIGGERS.APK_REMINDER,
      data: {
        ...common,
        stage: status.apkStage,
        expiry_date: vehicle.apkExpiry,
        days_left: status.apkDaysLeft,
      },
    });
  }
  if (previous?.openRecall === false && vehicle.openRecall === true) {
    events.push({ key: SCENE_TRIGGERS.RECALL_OPENED, data: common });
  }
  if (previous?.insured === true && vehicle.insured === false) {
    events.push({ key: SCENE_TRIGGERS.INSURANCE_LOST, data: common });
  }
  return events;
}

export const SCENE_ACTIONS = {
  // Read the register now. Outputs: whether it answered, how many vehicles it
  // knows, and how many things need attention across them.
  async refresh_vehicles(fleet) {
    logger.info('Scene action refresh_vehicles');
    // No scene event in answer to a scene action: the next hourly cycle fires them.
    const result = await fleet.update({ force: true, fireEvents: false });
    const snapshot = fleet.snapshot();
    return {
      success: result?.ok ?? fleet.plates.length === 0,
      vehicles: snapshot.filter((entry) => entry.vehicle).length,
      alerts: snapshot.reduce((sum, entry) => sum + (entry.status?.alerts ?? 0), 0),
    };
  },

  // The facts of one vehicle. A vehicle the register does not know (or not
  // yet) is an output (`found: false`), not a failure: a scene action is never
  // a condition, the scene author gates on the output.
  async get_vehicle(fleet, { fields }) {
    logger.info(`Scene action get_vehicle <- ${fields.device}`);
    const plate = fleet.plateOf(fields.device);
    if (!plate) {
      throw new Error(`Not a vehicle of this integration: ${fields.device}`);
    }
    const entry = fleet.snapshot().find((candidate) => candidate.plate === plate);
    if (!entry.vehicle) {
      return { found: false, plate: formatPlate(plate) };
    }
    const outputs = {
      found: true,
      plate: formatPlate(plate),
      vehicle: vehicleName(entry.vehicle) ?? formatPlate(plate),
      apk_stage: entry.status.apkStage,
      alerts: entry.status.alerts,
    };
    // Unknown values are left out (null for the scene), never made up.
    if (entry.vehicle.apkExpiry) {
      outputs.apk_expiry = entry.vehicle.apkExpiry;
      outputs.apk_days_left = entry.status.apkDaysLeft;
    }
    if (entry.vehicle.insured !== null) {
      outputs.insured = entry.vehicle.insured;
    }
    if (entry.vehicle.openRecall !== null) {
      outputs.open_recall = entry.vehicle.openRecall;
    }
    return outputs;
  },
};
