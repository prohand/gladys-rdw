// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
//   - test_connection : read the register now for every configured plate and
//                       say what it found;
//   - check_plate     : look up any plate, followed or not (before adding it,
//                       or for a car you are about to buy).
//
// The resolved message (multi-language object) is shown under the button; a
// thrown error is shown too.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { formatDate, localize, pick } from '../i18n.js';
import { fetchVehicles } from '../rdw/client.js';
import { formatPlate, normalizePlate } from '../rdw/plate.js';
import { today, vehicleStatus } from '../rdw/status.js';
import { vehicleName } from '../devices/vehicle.js';

const logger = createLogger({ name: 'actions' });

const UNREACHABLE = {
  en: 'The RDW register did not answer',
  fr: "Le registre RDW n'a pas répondu",
  de: 'Das RDW-Register hat nicht geantwortet',
  es: 'El registro RDW no ha respondido',
};

const plates = (list) => list.map(formatPlate).join(', ');

function describe(language, vehicle, warningDays, now) {
  const name = vehicleName(vehicle) ?? formatPlate(vehicle.plate);
  const status = vehicleStatus(vehicle, { warningDays, today: today(now) });
  const parts = [`${name} (${formatPlate(vehicle.plate)})`];
  if (vehicle.apkExpiry) {
    const days = status.apkDaysLeft;
    const date = formatDate(language, vehicle.apkExpiry);
    parts.push(
      days >= 0
        ? pick(language, {
            en: `APK until ${date} (${days} days left)`,
            fr: `APK jusqu'au ${date} (${days} jours restants)`,
            de: `APK bis ${date} (noch ${days} Tage)`,
            es: `APK hasta el ${date} (quedan ${days} días)`,
          })
        : pick(language, {
            en: `APK expired on ${date}`,
            fr: `APK expirée le ${date}`,
            de: `APK am ${date} abgelaufen`,
            es: `APK caducada el ${date}`,
          }),
    );
  }
  if (vehicle.insured !== null) {
    parts.push(
      pick(
        language,
        vehicle.insured
          ? { en: 'insured', fr: 'assuré', de: 'versichert', es: 'asegurado' }
          : { en: 'NOT insured', fr: 'NON assuré', de: 'NICHT versichert', es: 'SIN seguro' },
      ),
    );
  }
  if (vehicle.openRecall !== null) {
    parts.push(
      pick(
        language,
        vehicle.openRecall
          ? {
              en: 'open recall',
              fr: 'rappel ouvert',
              de: 'offener Rückruf',
              es: 'revisión abierta',
            }
          : { en: 'no open recall', fr: 'aucun rappel', de: 'kein Rückruf', es: 'sin revisión' },
      ),
    );
  }
  return parts.join(' · ');
}

export const ACTIONS = {
  async test_connection(fleet) {
    logger.info('Action test_connection');
    const { plateList, invalidPlates } = fleet.config;
    const invalid = (language) =>
      invalidPlates.length > 0
        ? ' ' +
          pick(language, {
            en: `Not plates, ignored: ${invalidPlates.join(', ')}.`,
            fr: `Pas des plaques, ignorées : ${invalidPlates.join(', ')}.`,
            de: `Keine Kennzeichen, ignoriert: ${invalidPlates.join(', ')}.`,
            es: `No son matrículas, ignoradas: ${invalidPlates.join(', ')}.`,
          })
        : '';
    if (plateList.length === 0) {
      return localize(
        (language) =>
          pick(language, {
            en: 'No plate to look up: add at least one in the "Plates" field.',
            fr: 'Aucune plaque à consulter : ajoutez-en au moins une dans le champ « Plaques ».',
            de: 'Kein Kennzeichen zum Abfragen: Füge mindestens eines im Feld „Kennzeichen“ hinzu.',
            es: 'Ninguna matrícula que consultar: añade al menos una en el campo «Matrículas».',
          }) + invalid(language),
      );
    }
    const result = await fleet.update({ force: true });
    if (!result.ok) {
      return localize((language) => `${pick(language, UNREACHABLE)}: ${result.error.message}`);
    }
    return localize((language) => {
      let message = pick(language, {
        en: `RDW register OK: ${result.found.length} vehicle(s) found.`,
        fr: `Registre RDW OK : ${result.found.length} véhicule(s) trouvé(s).`,
        de: `RDW-Register OK: ${result.found.length} Fahrzeug(e) gefunden.`,
        es: `Registro RDW OK: ${result.found.length} vehículo(s) encontrado(s).`,
      });
      if (result.unknown.length > 0) {
        message +=
          ' ' +
          pick(language, {
            en: `Not in the register: ${plates(result.unknown)}.`,
            fr: `Absentes du registre : ${plates(result.unknown)}.`,
            de: `Nicht im Register: ${plates(result.unknown)}.`,
            es: `No están en el registro: ${plates(result.unknown)}.`,
          });
      }
      return message + invalid(language);
    });
  },

  async check_plate(fleet, { fields }) {
    const plate = normalizePlate(fields.plate);
    if (!plate) {
      return {
        en: 'This is not a Dutch plate: letters and digits only, like AB-123-C.',
        fr: "Ce n'est pas une plaque néerlandaise : lettres et chiffres seulement, comme AB-123-C.",
        de: 'Das ist kein niederländisches Kennzeichen: nur Buchstaben und Ziffern, wie AB-123-C.',
        es: 'No es una matrícula neerlandesa: solo letras y cifras, como AB-123-C.',
      };
    }
    logger.info(`Action check_plate <- ${formatPlate(plate)}`);
    let vehicles;
    try {
      vehicles = await fetchVehicles([plate], {
        appToken: fleet.config.app_token,
        fetch: fleet.fetch,
      });
    } catch (err) {
      return localize((language) => `${pick(language, UNREACHABLE)}: ${err.message}`);
    }
    const vehicle = vehicles.get(plate);
    if (!vehicle) {
      return {
        en: `${formatPlate(plate)} is not in the RDW register.`,
        fr: `${formatPlate(plate)} n'est pas dans le registre RDW.`,
        de: `${formatPlate(plate)} ist nicht im RDW-Register.`,
        es: `${formatPlate(plate)} no está en el registro RDW.`,
      };
    }
    return localize((language) =>
      describe(language, vehicle, fleet.config.apk_warning_days, fleet.now()),
    );
  },
};
