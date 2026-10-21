// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` declared in
// `gladys-assistant-integration.json`. The SDK fetches it (`gladys.getConfig()`)
// and notifies every change (`gladys.onConfigUpdated()`).
//
// This module provides the defaults and normalizes the received object, so the
// rest of the code never deals with `undefined`, strings typed in a number
// field or a plate list still to be parsed.
// -----------------------------------------------------------------------------

import { parsePlates } from './rdw/plate.js';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // The plates to follow, as typed: "AB-123-C, 12-XYZ-3".
  plates: '',
  // How many days before the APK expiry date the vehicle shows as due soon
  // and the `apk_reminder` trigger fires.
  apk_warning_days: 30,
  // Hours between two reads of the register. It changes once a day at most:
  // reading it more often only spends the portal's patience.
  refresh_hours: 6,
  // Optional Socrata app token (opendata.rdw.nl): lifts the per-IP throttling.
  app_token: '',
};

const LIMITS = {
  apk_warning_days: [1, 365],
  refresh_hours: [1, 24],
};

// A number field may arrive as a string, empty, or out of the form bounds
// (an older saved configuration): fall back to the default, then clamp.
function boundedInteger(raw, key) {
  const value = Number(raw ?? DEFAULT_CONFIG[key]);
  const [min, max] = LIMITS[key];
  if (raw === '' || !Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const plates = typeof raw.plates === 'string' ? raw.plates : DEFAULT_CONFIG.plates;
  const parsed = parsePlates(plates);
  return {
    plates,
    apk_warning_days: boundedInteger(raw.apk_warning_days, 'apk_warning_days'),
    refresh_hours: boundedInteger(raw.refresh_hours, 'refresh_hours'),
    app_token: typeof raw.app_token === 'string' ? raw.app_token.trim() : DEFAULT_CONFIG.app_token,
    // Derived, never stored: the normalized plates, and what could not be one.
    plateList: parsed.plates,
    invalidPlates: parsed.invalid,
  };
}
