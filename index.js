// -----------------------------------------------------------------------------
// Entry point of the RDW integration for Gladys Assistant.
//
// Only creates the SDK object, wires it (src/integration.js) and connects.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// Optional: RDW_DATA_DIR (default /data), where the trigger memory is kept.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { wireIntegration } from './src/integration.js';

const gladys = new GladysIntegration();
const { stop } = wireIntegration(gladys);

// --- Graceful shutdown -------------------------------------------------------
// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the RDW integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
