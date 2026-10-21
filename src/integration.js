// -----------------------------------------------------------------------------
// SDK wiring: every Gladys event routed to the code that serves it.
//
// Kept apart from index.js (which only creates the SDK object and connects)
// so the tests can drive the whole integration against the fake Gladys of the
// SDK. All handlers are registered BEFORE connect(), as the SDK requires.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Fleet } from './rdw/fleet.js';
import { Memory } from './rdw/memory.js';
import { ACTIONS } from './capabilities/actions.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './capabilities/widget.js';

const logger = createLogger({ name: 'integration' });

// The cycle: publish the states (the days left change at midnight), and read
// the register when the configured interval has passed (see Fleet.update).
export const CYCLE_MS = 60 * 60 * 1000;

/**
 * Register every handler on a GladysIntegration.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ memory?: Memory, fetch?: typeof fetch, now?: () => Date }} [options] injected by the tests
 * @returns {{ fleet: Fleet, stop: () => void }}
 */
export function wireIntegration(gladys, { memory = new Memory(), fetch: doFetch, now } = {}) {
  let timer = null;
  let memoryLoaded = false;

  const fleet = new Fleet({
    gladys,
    memory,
    fetch: doFetch,
    now,
    onPublished: async () => {
      // The widget shows what the cycle just published: nudge it instead of
      // waiting for its content TTL.
      refreshWidgets(gladys);
      await reportConnection();
    },
  });
  fleet.setConfig(normalizeConfig());

  // The status of the Configuration screen: is the register answering?
  // Distinct from the container state: the integration can run and still
  // fail to reach the RDW.
  async function reportConnection() {
    try {
      if (fleet.lastError) {
        await gladys.setConnectionStatus(false, {
          en: 'The RDW register does not answer, the data shown may be old.',
          fr: 'Le registre RDW ne répond pas, les données affichées peuvent être anciennes.',
          de: 'Das RDW-Register antwortet nicht, die angezeigten Daten können veraltet sein.',
          es: 'El registro RDW no responde, los datos mostrados pueden ser antiguos.',
        });
      } else {
        await gladys.setConnectionStatus(true);
      }
    } catch (err) {
      logger.warn(`Could not report the connection status: ${err.message}`);
    }
  }

  async function publishDevices() {
    // Idempotent (upsert by external_id): the names follow what the register says.
    await gladys.publishDiscoveredDevices(fleet.devices());
  }

  function startCycle() {
    stopCycle();
    timer = setInterval(() => {
      fleet.update().catch((err) => logger.error('Refresh cycle failed', err));
    }, CYCLE_MS);
  }

  function stopCycle() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the vehicles');
    await publishDevices();
  });

  // --- A vehicle was created: give it its values now -------------------------
  // The SDK forgets the values published before the creation (Gladys dropped
  // them), so this cycle publishes them all again for the new device.
  gladys.onDeviceCreated(async (device) => {
    logger.info(`onDeviceCreated <- ${device.external_id}`);
    await fleet.update();
  });

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    fleet.setConfig(normalizeConfig(newConfig));
    // Read the new plates first, so the devices are published with their names.
    await fleet.update();
    await publishDevices();
  });

  // --- Manifest actions: buttons of the Configuration screen -----------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(fleet, { fields }));
  }

  // --- Scene actions (Gladys 5.1+) -------------------------------------------
  // Scene TRIGGERS need no handler: the fleet fires them (publishSceneEvent).
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(fleet, { fields }));
  }

  // --- Dashboard widgets (Gladys 5.1+) ---------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(fleet, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(fleet, { actionKey, params, settings }),
    );
  }

  // --- Connection lifecycle --------------------------------------------------
  // The SDK logs the WebSocket lifecycle itself (`gladys-sdk` name).
  gladys.on('connected', async () => {
    try {
      if (!memoryLoaded) {
        await memory.load();
        memoryLoaded = true;
      }
      fleet.setConfig(normalizeConfig(await gladys.getConfig()));
      // Not forced: a reconnection within the interval reuses the data read.
      await fleet.update();
      await publishDevices();
      startCycle();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Logs der Integration nach.',
          es: 'La inicialización ha fallado, revisa los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    stopCycle();
  });

  return { fleet, stop: stopCycle };
}
