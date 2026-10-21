// -----------------------------------------------------------------------------
// Dashboard widget "RDW vehicles" (SDK v0.14+, Gladys 5.1+).
//
// One card per followed vehicle: name, plate, APK date, and a badge with what
// needs attention first (APK expired, not insured, open recall, APK due soon),
// plus a row saying whether the register answered and a "Refresh" button.
//
// Per-instance settings (manifest `widgets[].settings`):
//   - vehicle     : one vehicle only (a `"source": "devices"` select); its
//                   APK days left then shows as a LIVE tile, bound to the
//                   device feature: it follows the published states with no
//                   refresh of the widget;
//   - only_alerts : list only the vehicles that need attention.
//
// The content is declarative (no HTML): the core renders it with its own
// theme, dark mode and the reader's language (multi-language objects).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { formatDate, localize, pick } from '../i18n.js';
import { APK_STAGES } from '../rdw/status.js';
import { formatPlate } from '../rdw/plate.js';
import { FEATURE, vehicleIds, vehicleName } from '../devices/vehicle.js';

const logger = createLogger({ name: 'widget' });

// Widget key, as declared in the manifest `widgets` field: never rename.
export const VEHICLES_WIDGET = 'vehicles';

// Keys of the `button` actions the content declares.
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

// The list display holds 8 cards at most (the core drops the others).
const MAX_CARDS = 8;

const TEXTS = {
  noPlate: {
    en: 'No vehicle yet: add a plate in the integration configuration.',
    fr: "Aucun véhicule : ajoutez une plaque dans la configuration de l'intégration.",
    de: 'Noch kein Fahrzeug: Füge ein Kennzeichen in der Konfiguration der Integration hinzu.',
    es: 'Ningún vehículo: añade una matrícula en la configuración de la integración.',
  },
  noAlert: {
    en: 'Nothing needs your attention.',
    fr: 'Rien ne demande votre attention.',
    de: 'Nichts erfordert deine Aufmerksamkeit.',
    es: 'Nada requiere tu atención.',
  },
  register: { en: 'RDW register', fr: 'Registre RDW', de: 'RDW-Register', es: 'Registro RDW' },
  reachable: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  notRead: {
    en: 'Not read yet',
    fr: 'Pas encore lu',
    de: 'Noch nicht gelesen',
    es: 'Aún sin leer',
  },
  attention: {
    en: 'Needs attention',
    fr: 'À surveiller',
    de: 'Erfordert Beachtung',
    es: 'Requiere atención',
  },
  apkDaysLeft: {
    en: 'APK days left',
    fr: 'Jours avant APK',
    de: 'Tage bis APK',
    es: 'Días hasta APK',
  },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  unknownPlate: {
    en: 'This plate is not in the RDW register.',
    fr: "Cette plaque n'est pas dans le registre RDW.",
    de: 'Dieses Kennzeichen ist nicht im RDW-Register.',
    es: 'Esta matrícula no está en el registro RDW.',
  },
  waiting: {
    en: 'Waiting for the register.',
    fr: 'En attente du registre.',
    de: 'Warte auf das Register.',
    es: 'Esperando el registro.',
  },
  insured: {
    en: 'Insured (WAM)',
    fr: 'Assuré (WAM)',
    de: 'Versichert (WAM)',
    es: 'Asegurado (WAM)',
  },
  openRecall: {
    en: 'Open recall',
    fr: 'Rappel ouvert',
    de: 'Offener Rückruf',
    es: 'Revisión abierta',
  },
  yes: { en: 'yes', fr: 'oui', de: 'ja', es: 'sí' },
  no: { en: 'no', fr: 'non', de: 'nein', es: 'no' },
  unknown: { en: 'unknown', fr: 'inconnu', de: 'unbekannt', es: 'desconocido' },
};

// Badges: 16 characters at most per language.
const BADGES = {
  expired: {
    text: { en: 'APK expired', fr: 'APK expirée', de: 'APK abgelaufen', es: 'APK caducada' },
    color: WIDGET_COLORS.DANGER,
  },
  uninsured: {
    text: { en: 'Not insured', fr: 'Non assuré', de: 'Unversichert', es: 'Sin seguro' },
    color: WIDGET_COLORS.DANGER,
  },
  recall: {
    text: { en: 'Open recall', fr: 'Rappel ouvert', de: 'Rückruf offen', es: 'Revisión abierta' },
    color: WIDGET_COLORS.WARNING,
  },
  ok: { text: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' }, color: WIDGET_COLORS.SUCCESS },
  unknownPlate: {
    text: { en: 'Unknown plate', fr: 'Plaque inconnue', de: 'Unbekannt', es: 'Desconocida' },
    color: WIDGET_COLORS.NEUTRAL,
  },
};

function dueSoonBadge(days) {
  return {
    text: {
      en: `APK in ${days} d`,
      fr: `APK dans ${days} j`,
      de: `APK in ${days} T.`,
      es: `APK en ${days} d`,
    },
    color: WIDGET_COLORS.WARNING,
  };
}

// The most urgent thing first: driving without APK or insurance is illegal,
// a recall is a safety matter, an APK due soon is a reminder.
function badgeOf({ vehicle, status }) {
  if (vehicle === null) {
    return BADGES.unknownPlate;
  }
  if (status.apkStage === APK_STAGES.EXPIRED) {
    return BADGES.expired;
  }
  if (vehicle.insured === false) {
    return BADGES.uninsured;
  }
  if (vehicle.openRecall === true) {
    return BADGES.recall;
  }
  if (status.apkStage === APK_STAGES.DUE_SOON) {
    return dueSoonBadge(status.apkDaysLeft);
  }
  return BADGES.ok;
}

// French puts a space before the colon.
const colon = (language) => (language === 'fr' ? ' : ' : ': ');

function apkLine(language, vehicle, status) {
  if (!vehicle.apkExpiry) {
    return `APK${colon(language)}${pick(language, TEXTS.unknown)}`;
  }
  const date = formatDate(language, vehicle.apkExpiry);
  const days = status.apkDaysLeft;
  const when =
    days >= 0
      ? pick(language, {
          en: `in ${days} days`,
          fr: `dans ${days} jours`,
          de: `in ${days} Tagen`,
          es: `en ${days} días`,
        })
      : pick(language, {
          en: `${-days} days ago`,
          fr: `il y a ${-days} jours`,
          de: `vor ${-days} Tagen`,
          es: `hace ${-days} días`,
        });
  return `APK${colon(language)}${date} (${when})`;
}

function flag(language, value) {
  if (value === null) {
    return pick(language, TEXTS.unknown);
  }
  return pick(language, value ? TEXTS.yes : TEXTS.no);
}

function cardOf(entry) {
  const { plate, vehicle, status } = entry;
  const card = {
    title: vehicleName(vehicle) ?? formatPlate(plate),
    subtitle: vehicle?.kind ? `${formatPlate(plate)} · ${vehicle.kind}` : formatPlate(plate),
  };
  if (vehicle === undefined) {
    return { ...card, description: TEXTS.waiting };
  }
  if (vehicle === null) {
    return { ...card, badge: badgeOf(entry), description: TEXTS.unknownPlate };
  }
  if (vehicle.apkExpiry) {
    card.date = vehicle.apkExpiry;
  }
  return {
    ...card,
    badge: badgeOf(entry),
    description: localize((language) =>
      [
        apkLine(language, vehicle, status),
        `${pick(language, TEXTS.insured)}${colon(language)}${flag(language, vehicle.insured)}`,
        `${pick(language, TEXTS.openRecall)}${colon(language)}${flag(language, vehicle.openRecall)}`,
      ].join('\n'),
    ),
  };
}

function registerStatus(fleet) {
  if (fleet.lastError) {
    return { value: TEXTS.unreachable, color: WIDGET_COLORS.DANGER };
  }
  if (fleet.fetchedAt === null) {
    return { value: TEXTS.notRead, color: WIDGET_COLORS.NEUTRAL };
  }
  return { value: TEXTS.reachable, color: WIDGET_COLORS.SUCCESS };
}

export const WIDGETS = {
  [VEHICLES_WIDGET]: {
    async get(fleet, { settings = {} }) {
      logger.debug(`onWidgetGet <- ${VEHICLES_WIDGET}`);
      const all = fleet.snapshot();
      const refreshButton = {
        type: 'button',
        label: TEXTS.refresh,
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.REFRESH },
      };
      if (all.length === 0) {
        return {
          ttl_seconds: 3600,
          components: [{ type: 'text', variant: 'body', text: TEXTS.noPlate }],
        };
      }

      let entries = all;
      const components = [];
      if (settings.vehicle) {
        entries = all.filter((entry) => entry.deviceExternalId === settings.vehicle);
        const [chosen] = entries;
        if (chosen?.vehicle?.apkExpiry) {
          // LIVE tile: bound to the feature, it follows the published states.
          components.push({
            type: 'value',
            label: TEXTS.apkDaysLeft,
            icon: 'calendar',
            device_feature: vehicleIds(fleet.gladys, chosen.plate).feature(FEATURE.APK_DAYS_LEFT),
          });
        }
      }
      if (settings.only_alerts) {
        entries = entries.filter((entry) => entry.vehicle === null || entry.status?.alerts > 0);
      }

      const alerts = all.reduce((sum, entry) => sum + (entry.status?.alerts ?? 0), 0);
      components.push({
        type: 'status',
        items: [
          { label: TEXTS.register, icon: 'database', ...registerStatus(fleet) },
          {
            label: TEXTS.attention,
            icon: 'alert-triangle',
            value: alerts,
            color: alerts > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
          },
        ],
      });
      if (entries.length > 0) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: entries.slice(0, MAX_CARDS).map(cardOf),
        });
      } else {
        components.push({ type: 'text', variant: 'body', text: TEXTS.noAlert });
      }
      components.push(refreshButton);
      return {
        // index.js nudges the widget after every cycle that publishes (see
        // refreshWidgets): the TTL is only a safety net.
        ttl_seconds: 3600,
        components,
      };
    },

    // Resolve a toast (≤ 200 characters). After it, the core drops the cached
    // content and every open dashboard refetches it.
    async action(fleet, { actionKey }) {
      logger.info(`onWidgetAction <- ${VEHICLES_WIDGET}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REFRESH) {
        // Throwing acks the action as failed: the message reaches the user.
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const result = await fleet.update({ force: true });
      if (result && !result.ok) {
        return {
          en: 'The RDW register did not answer, try again later.',
          fr: "Le registre RDW n'a pas répondu, réessayez plus tard.",
          de: 'Das RDW-Register hat nicht geantwortet, versuche es später erneut.',
          es: 'El registro RDW no ha respondido, inténtalo más tarde.',
        };
      }
      return {
        en: 'Vehicles refreshed.',
        fr: 'Véhicules actualisés.',
        de: 'Fahrzeuge aktualisiert.',
        es: 'Vehículos actualizados.',
      };
    },
  },
};

/**
 * Ask the core to re-pull every widget now instead of waiting for the TTL.
 * Fire-and-forget: rate-limited core-side, dropped while disconnected — so
 * index.js also calls it after every (re)connection.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
