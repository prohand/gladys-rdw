import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/capabilities/actions.js';
import { LANGUAGES } from '../src/i18n.js';
import { registerRow } from './helpers/fakeRdw.js';
import { setupFleet } from './helpers/fleet.js';

function assertAllLanguages(message) {
  for (const language of LANGUAGES) {
    assert.equal(typeof message[language], 'string', `${language} is missing`);
  }
}

test('test_connection says what the register found', async (t) => {
  const { fleet, rdw } = await setupFleet(t, { plates: 'AB-123-C, ZZ-999-Z, ???' });
  const message = await ACTIONS.test_connection(fleet, { fields: {} });
  assertAllLanguages(message);
  assert.equal(rdw.requests.length, 1);
  assert.equal(
    message.en,
    'RDW register OK: 1 vehicle(s) found. Not in the register: ZZ-999-Z. Not plates, ignored: ???.',
  );
});

test('test_connection without plate asks for one', async (t) => {
  const { fleet, rdw } = await setupFleet(t, { plates: '' });
  const message = await ACTIONS.test_connection(fleet, { fields: {} });
  assertAllLanguages(message);
  assert.match(message.en, /No plate/);
  assert.equal(rdw.requests.length, 0);
});

test('test_connection reports an unreachable register', async (t) => {
  const { fleet, rdw } = await setupFleet(t);
  rdw.fail(503);
  const message = await ACTIONS.test_connection(fleet, { fields: {} });
  assertAllLanguages(message);
  assert.match(message.en, /did not answer: RDW HTTP 503/);
});

test('check_plate looks up any plate, followed or not', async (t) => {
  const { fleet } = await setupFleet(t, {
    plates: '',
    rows: {
      '12XYZ3': registerRow('12XYZ3', { vervaldatum_apk: '20261201', wam_verzekerd: 'Nee' }),
    },
  });
  const message = await ACTIONS.check_plate(fleet, { fields: { plate: '12 xyz 3' } });
  assertAllLanguages(message);
  assert.equal(
    message.en,
    'Volkswagen Golf (12-XYZ-3) · APK until 2026-12-01 (30 days left) · NOT insured · no open recall',
  );
  assert.equal(
    message.fr,
    "Volkswagen Golf (12-XYZ-3) · APK jusqu'au 01/12/2026 (30 jours restants) · NON assuré · aucun rappel",
  );
  assert.match(message.de, /APK bis 01\.12\.2026/);
});

test('check_plate tells an expired APK, an unknown plate and a typing mistake apart', async (t) => {
  const { fleet } = await setupFleet(t, {
    rows: { AB123C: registerRow('AB123C', { vervaldatum_apk: '20260101' }) },
  });
  assert.match(
    (await ACTIONS.check_plate(fleet, { fields: { plate: 'AB-123-C' } })).en,
    /APK expired on 2026-01-01/,
  );
  assert.match(
    (await ACTIONS.check_plate(fleet, { fields: { plate: 'ZZ-999-Z' } })).en,
    /not in the RDW register/,
  );
  assert.match(
    (await ACTIONS.check_plate(fleet, { fields: { plate: '???' } })).en,
    /not a Dutch plate/,
  );
});

test('check_plate reports an unreachable register', async (t) => {
  const { fleet, rdw } = await setupFleet(t);
  rdw.fail(0);
  const message = await ACTIONS.check_plate(fleet, { fields: { plate: 'AB-123-C' } });
  assertAllLanguages(message);
  assert.match(message.en, /did not answer/);
});
