// -----------------------------------------------------------------------------
// Device type: VEHICLE
//
// One Gladys device per followed plate, read-only: the register is a mirror of
// the paperwork, nothing is commanded. Its features are what an owner checks:
//   - APK days left (duration, days): negative once expired, so a scene
//     condition "less than 14" covers both "due" and "late";
//   - APK expiry date (text, YYYY-MM-DD);
//   - insured (binary): the WAM third-party insurance the register knows of;
//   - open recall (binary): a manufacturer recall not yet carried out.
//
// The plate is the platform id: it is what the RDW keys the vehicle on and
// what never changes for the vehicle (a new plate is a new registration).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { formatPlate } from '../rdw/plate.js';

export const DEVICE_TYPE = 'vehicle';

// Feature keys: part of the external ids, never rename.
export const FEATURE = {
  APK_DAYS_LEFT: 'apk-days-left',
  APK_EXPIRY: 'apk-expiry',
  INSURED: 'insured',
  OPEN_RECALL: 'open-recall',
};

// Gladys stores min/max on every feature (NOT NULL): ten years either way
// covers any APK date.
const APK_DAYS_RANGE = 3650;

/** External ids of the device of a plate (`ids.device`, `ids.feature(key)`). */
export function vehicleIds(gladys, plate) {
  return gladys.externalIds(DEVICE_TYPE, plate);
}

/** "Volkswagen Golf", from what the register knows; null when it knows nothing. */
export function vehicleName(vehicle) {
  const words = [vehicle?.brand, vehicle?.model].filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  // The register writes everything in capitals: "VOLKSWAGEN GOLF".
  return words
    .join(' ')
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase());
}

/** The discovery payload of one vehicle. */
export function buildVehicleDevice(gladys, plate, vehicle) {
  const ids = vehicleIds(gladys, plate);
  const name = vehicleName(vehicle);
  return {
    name: name ? `${name} (${formatPlate(plate)})` : formatPlate(plate),
    external_id: ids.device,
    // Refreshed by the integration's own schedule (see src/rdw/fleet.js): the
    // register changes once a day, far slower than Gladys' fastest poll.
    should_poll: false,
    features: [
      {
        name: 'APK days left',
        external_id: ids.feature(FEATURE.APK_DAYS_LEFT),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.DAYS,
        min: -APK_DAYS_RANGE,
        max: APK_DAYS_RANGE,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'APK expiry date',
        external_id: ids.feature(FEATURE.APK_EXPIRY),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Insured (WAM)',
        external_id: ids.feature(FEATURE.INSURED),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Open recall',
        external_id: ids.feature(FEATURE.OPEN_RECALL),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}

/**
 * The states of one vehicle. A value the register does not give is not
 * published: Gladys keeps showing "no value" rather than a made-up one.
 */
export function vehicleStates(gladys, plate, vehicle, status) {
  const ids = vehicleIds(gladys, plate);
  const states = [];
  if (status.apkDaysLeft !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.APK_DAYS_LEFT),
      state: status.apkDaysLeft,
    });
  }
  if (vehicle.apkExpiry) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.APK_EXPIRY),
      text: vehicle.apkExpiry,
    });
  }
  if (vehicle.insured !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.INSURED),
      state: vehicle.insured ? 1 : 0,
    });
  }
  if (vehicle.openRecall !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.OPEN_RECALL),
      state: vehicle.openRecall ? 1 : 0,
    });
  }
  return states;
}
