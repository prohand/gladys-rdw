import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { FEATURE, vehicleIds } from '../src/devices/vehicle.js';
import { SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { registerRow } from './helpers/fakeRdw.js';
import { advance, DAY, HOUR, setupFleet } from './helpers/fleet.js';

const feature = (gladys, plate, key) => vehicleIds(gladys, plate).feature(key);

test('one device per plate, named after the register', async (t) => {
  const { fleet, gladys } = await setupFleet(t);
  assert.deepEqual(
    fleet.devices().map((device) => device.name),
    ['AB-123-C', '12-XYZ-3'],
    'before the first read, the plate',
  );
  await fleet.update();
  assert.deepEqual(
    fleet.devices().map((device) => device.name),
    ['Volkswagen Golf (AB-123-C)', 'Toyota Yaris (12-XYZ-3)'],
  );
  // Gladys accepts the payload (the fake refuses what Gladys refuses).
  await gladys.publishDiscoveredDevices(fleet.devices());
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('the states of every vehicle are published', async (t) => {
  const { fleet, gladys } = await setupFleet(t, {
    rows: {
      AB123C: registerRow('AB123C', { vervaldatum_apk: '20261121', wam_verzekerd: 'Nee' }),
      '12XYZ3': registerRow('12XYZ3', { openstaande_terugroepactie_indicator: 'Ja' }),
    },
  });
  await fleet.update();
  const last = (plate, key) => gladys.fake.lastState(feature(gladys, plate, key));
  assert.equal(last('AB123C', FEATURE.APK_DAYS_LEFT), 20);
  assert.equal(last('AB123C', FEATURE.APK_EXPIRY), '2026-11-21');
  assert.equal(last('AB123C', FEATURE.INSURED), 0);
  assert.equal(last('AB123C', FEATURE.OPEN_RECALL), 0);
  assert.equal(last('12XYZ3', FEATURE.INSURED), 1);
  assert.equal(last('12XYZ3', FEATURE.OPEN_RECALL), 1);
});

test('a value the register does not give is not published', async (t) => {
  const { fleet, gladys } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: {
      AB123C: registerRow('AB123C', { vervaldatum_apk: undefined, wam_verzekerd: undefined }),
    },
  });
  await fleet.update();
  const published = new Set(gladys.fake.states.map((state) => state.device_feature_external_id));
  assert.ok(!published.has(feature(gladys, 'AB123C', FEATURE.APK_DAYS_LEFT)));
  assert.ok(!published.has(feature(gladys, 'AB123C', FEATURE.APK_EXPIRY)));
  assert.ok(!published.has(feature(gladys, 'AB123C', FEATURE.INSURED)));
  assert.ok(published.has(feature(gladys, 'AB123C', FEATURE.OPEN_RECALL)));
});

test('the register is read at the configured interval, the days left every cycle', async (t) => {
  const { fleet, gladys, rdw, clock } = await setupFleet(t, { config: { refresh_hours: 6 } });
  await fleet.update();
  assert.equal(rdw.requests.length, 1);

  advance(clock, 5 * HOUR);
  await fleet.update();
  assert.equal(rdw.requests.length, 1, 'not due yet');

  advance(clock, HOUR);
  await fleet.update();
  assert.equal(rdw.requests.length, 2, 'due after 6 hours');

  // The days left follow the calendar even without a new read.
  const before = gladys.fake.lastState(feature(gladys, 'AB123C', FEATURE.APK_DAYS_LEFT));
  advance(clock, DAY);
  await fleet.publish();
  assert.equal(gladys.fake.lastState(feature(gladys, 'AB123C', FEATURE.APK_DAYS_LEFT)), before - 1);
});

test('only changed states are sent again', async (t) => {
  const { fleet, gladys } = await setupFleet(t);
  await fleet.update();
  const count = gladys.fake.states.length;
  await fleet.publish();
  assert.equal(gladys.fake.states.length, count, 'nothing changed, nothing sent');
});

test('a forced update reads the register even when not due', async (t) => {
  const { fleet, rdw } = await setupFleet(t);
  await fleet.update();
  await fleet.update({ force: true });
  assert.equal(rdw.requests.length, 2);
});

test('a plate added to the configuration is read at once', async (t) => {
  const { fleet, rdw } = await setupFleet(t, { plates: 'AB-123-C' });
  await fleet.update();
  fleet.setConfig(normalizeConfig({ plates: 'AB-123-C, 12-XYZ-3' }));
  assert.equal(fleet.isDue(), true);
  await fleet.update();
  assert.equal(rdw.requests.length, 2);
  // Changing another field does not.
  fleet.setConfig(normalizeConfig({ plates: 'AB-123-C, 12-XYZ-3', apk_warning_days: 10 }));
  assert.equal(fleet.isDue(), false);
});

test('a removed plate is dropped from the devices and the memory', async (t) => {
  const { fleet, memory } = await setupFleet(t);
  await fleet.update();
  fleet.setConfig(normalizeConfig({ plates: '12-XYZ-3' }));
  await fleet.update();
  assert.deepEqual(
    fleet.devices().map((device) => device.name),
    ['Toyota Yaris (12-XYZ-3)'],
  );
  assert.deepEqual(Object.keys(memory.vehicles), ['12XYZ3']);
});

test('the transport badge says whether the register answered', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t, { plates: 'AB-123-C, ZZ-999-Z' });
  await fleet.update();
  const badge = (plate) =>
    gladys.fake.transports.findLast(
      (entry) => entry.device_external_id === vehicleIds(gladys, plate).device,
    );
  assert.equal(badge('AB123C').transport, 'cloud');
  assert.equal(badge('AB123C').degraded, undefined);
  assert.equal(badge('ZZ999Z').transport, 'cloud');
  assert.equal(badge('ZZ999Z').degraded, true, 'not in the register');
  assert.ok(badge('ZZ999Z').message.de);

  rdw.fail(500);
  const result = await fleet.update({ force: true });
  assert.equal(result.ok, false);
  assert.equal(badge('AB123C').transport, 'unreachable');
});

test('an unreachable register keeps the vehicles read before', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t);
  await fleet.update();
  rdw.fail(0);
  await fleet.update({ force: true });
  assert.ok(fleet.lastError);
  assert.equal(fleet.devices()[0].name, 'Volkswagen Golf (AB-123-C)');
  assert.equal(gladys.fake.lastState(feature(gladys, 'AB123C', FEATURE.INSURED)), 1);
  rdw.recover();
  await fleet.update({ force: true });
  assert.equal(fleet.lastError, null);
});

test('no badge is published before the first read', async (t) => {
  const { fleet, gladys } = await setupFleet(t);
  await fleet.publish();
  assert.equal(gladys.fake.transports.length, 0);
});

test('cycles asked at the same time run one after the other', async (t) => {
  const { fleet, gladys } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: { AB123C: registerRow('AB123C', { vervaldatum_apk: '20261110' }) },
  });
  await Promise.all([fleet.update(), fleet.update(), fleet.update({ force: true })]);
  assert.equal(
    gladys.fake.sceneEvents.filter((event) => event.key === SCENE_TRIGGERS.APK_REMINDER).length,
    1,
    'the same event is never fired twice',
  );
});

test('a failing cycle does not block the next ones', async (t) => {
  const { fleet, gladys } = await setupFleet(t);
  let fail = true;
  fleet.onPublished = async () => {
    if (fail) throw new Error('boom');
  };
  await assert.rejects(fleet.update(), /boom/);
  fail = false;
  await fleet.update({ force: true });
  assert.ok(gladys.fake.states.length > 0);
});
