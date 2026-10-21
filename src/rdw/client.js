// -----------------------------------------------------------------------------
// RDW open data client.
//
// The RDW (Rijksdienst voor het Wegverkeer, the Dutch vehicle authority)
// publishes the register of every vehicle with a Dutch plate on
// opendata.rdw.nl, a Socrata portal: free, no account, no key. One dataset is
// enough here, "Gekentekende voertuigen" (m9d7-ebf2): make, model, APK expiry
// date, WAM insurance and open recall flags, one row per plate.
//
// All the plates are asked in ONE request (`kenteken in (...)`), whatever
// their number: the portal throttles per IP address, not per plate.
//
// An app token (optional, free on opendata.rdw.nl) lifts that throttling; it
// travels in the X-App-Token header and is never logged.
//
// Node 22 provides `fetch` natively: no dependency needed. Tests inject their
// own `fetch` and never touch the network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'rdw-client' });

export const RDW_VEHICLES_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json';

const REQUEST_TIMEOUT_MS = 15_000;

/** A failed request to the RDW portal: `status` is the HTTP status, 0 when none came back. */
export class RdwError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'RdwError';
    this.status = status;
  }
}

// `20260729` -> `2026-07-29`; anything else (absent, malformed) -> null.
function isoDate(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})(\d{2})(\d{2})$/) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

// The register answers "Ja" / "Nee"; an absent value stays unknown (null),
// it is never read as "no".
function yesNo(value) {
  if (value === 'Ja') {
    return true;
  }
  if (value === 'Nee') {
    return false;
  }
  return null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The fields of one register row this integration uses, in its own words.
 *
 * @param {Record<string, string>} row a row of the m9d7-ebf2 dataset
 */
export function parseVehicle(row) {
  return {
    plate: row.kenteken,
    brand: text(row.merk),
    model: text(row.handelsbenaming),
    kind: text(row.voertuigsoort),
    color: text(row.eerste_kleur),
    firstAdmission: isoDate(row.datum_eerste_toelating),
    apkExpiry: isoDate(row.vervaldatum_apk),
    insured: yesNo(row.wam_verzekerd),
    openRecall: yesNo(row.openstaande_terugroepactie_indicator),
    exported: yesNo(row.export_indicator),
    odometerVerdict: text(row.tellerstandoordeel),
  };
}

/**
 * Read the register rows of some plates.
 *
 * @param {string[]} plates normalized plates (see plate.js): only capitals and
 *   digits, which is what makes them safe to put in the query as is
 * @param {{ appToken?: string, fetch?: typeof fetch }} [options]
 * @returns {Promise<Map<string, ReturnType<typeof parseVehicle>>>} one entry
 *   per plate the register knows; an unknown plate is simply absent
 */
export async function fetchVehicles(plates, { appToken = '', fetch: doFetch = fetch } = {}) {
  const vehicles = new Map();
  if (plates.length === 0) {
    return vehicles;
  }
  const url = new URL(RDW_VEHICLES_URL);
  url.searchParams.set('$where', `kenteken in(${plates.map((p) => `'${p}'`).join(',')})`);
  url.searchParams.set('$limit', String(plates.length));
  const headers = { Accept: 'application/json' };
  if (appToken) {
    headers['X-App-Token'] = appToken;
  }

  logger.debug(`RDW request for ${plates.length} plate(s)`);
  let response;
  try {
    response = await doFetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new RdwError(`RDW unreachable: ${err.message}`);
  }
  if (!response.ok) {
    throw new RdwError(`RDW HTTP ${response.status}`, response.status);
  }
  let rows;
  try {
    rows = await response.json();
  } catch {
    throw new RdwError('RDW answered something that is not JSON', response.status);
  }
  if (!Array.isArray(rows)) {
    throw new RdwError('RDW answered an unexpected document', response.status);
  }
  for (const row of rows) {
    if (row && plates.includes(row.kenteken)) {
      vehicles.set(row.kenteken, parseVehicle(row));
    }
  }
  return vehicles;
}
