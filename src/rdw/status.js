// -----------------------------------------------------------------------------
// What a register row means for its owner, today.
//
// The register gives dates and flags; the owner wants to know what needs
// doing: is the APK (the Dutch periodic roadworthiness test) due soon or
// expired, is the vehicle still insured, is a recall open. Everything here is
// computed from the row and today's date, so it changes at midnight even when
// the register does not.
// -----------------------------------------------------------------------------

/** Where a vehicle stands with its APK. Stored by users in scene filters: never rename. */
export const APK_STAGES = {
  OK: 'ok',
  DUE_SOON: 'due_soon',
  EXPIRED: 'expired',
  // No APK date in the register (a moped, a new trailer...).
  UNKNOWN: 'unknown',
};

// APK dates are Dutch calendar days: "today" is today in the Netherlands,
// whatever the time zone of the machine running Gladys.
const RDW_TIME_ZONE = 'Europe/Amsterdam';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today in the Netherlands, `YYYY-MM-DD`.
 * @param {Date} [now]
 */
export function today(now = new Date()) {
  // en-CA writes dates the ISO way.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RDW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whole days from one `YYYY-MM-DD` to another (negative when `to` is earlier).
 * Both are read as UTC midnights, so a daylight saving change never adds or
 * removes an hour that would round to the wrong day.
 */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The status of one vehicle.
 *
 * The APK expiry date is the last day the vehicle may be driven: it is
 * expired from the day after. "Due soon" starts `warningDays` before.
 *
 * @param {{ apkExpiry: string | null, insured: boolean | null, openRecall: boolean | null }} vehicle
 * @param {{ warningDays: number, today: string }} options
 * @returns {{ apkDaysLeft: number | null, apkStage: string, alerts: number }}
 *   `alerts`: how many things need the owner's attention (APK due or
 *   expired, not insured, open recall)
 */
export function vehicleStatus(vehicle, { warningDays, today: day }) {
  let apkDaysLeft = null;
  let apkStage = APK_STAGES.UNKNOWN;
  if (vehicle.apkExpiry) {
    apkDaysLeft = daysBetween(day, vehicle.apkExpiry);
    if (apkDaysLeft < 0) {
      apkStage = APK_STAGES.EXPIRED;
    } else if (apkDaysLeft <= warningDays) {
      apkStage = APK_STAGES.DUE_SOON;
    } else {
      apkStage = APK_STAGES.OK;
    }
  }
  const alerts =
    Number(apkStage === APK_STAGES.DUE_SOON || apkStage === APK_STAGES.EXPIRED) +
    Number(vehicle.insured === false) +
    Number(vehicle.openRecall === true);
  return { apkDaysLeft, apkStage, alerts };
}
