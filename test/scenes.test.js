import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { vehicleIds } from '../src/devices/vehicle.js';
import { registerRow } from './helpers/fakeRdw.js';
import { advance, DAY, setupFleet } from './helpers/fleet.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

// APK on 1 December 2026: 30 days after the test clock (1 November).
const dueInThirtyDays = { AB123C: registerRow('AB123C', { vervaldatum_apk: '20261201' }) };

test('the APK reminder fires once when the vehicle enters the reminder period', async (t) => {
  const { fleet, gladys, clock } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: dueInThirtyDays,
    config: { apk_warning_days: 14 },
  });
  await fleet.update();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.APK_REMINDER).length, 0, '30 days left, ok');

  advance(clock, 16 * DAY);
  await fleet.update();
  advance(clock, DAY);
  await fleet.update();
  const events = eventsOf(gladys, SCENE_TRIGGERS.APK_REMINDER);
  assert.equal(events.length, 1, 'once, not at every cycle');
  assert.deepEqual(events[0].data, {
    device: vehicleIds(gladys, 'AB123C').device,
    plate: 'AB-123-C',
    vehicle: 'Volkswagen Golf',
    stage: 'due_soon',
    expiry_date: '2026-12-01',
    days_left: 14,
  });
});

test('the APK reminder fires again when the APK expires, then stops', async (t) => {
  const { fleet, gladys, clock } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: dueInThirtyDays,
  });
  await fleet.update();
  advance(clock, 31 * DAY);
  await fleet.update();
  advance(clock, DAY);
  await fleet.update();
  assert.deepEqual(
    eventsOf(gladys, SCENE_TRIGGERS.APK_REMINDER).map((event) => event.data.stage),
    ['due_soon', 'expired'],
  );
});

test('passing the APK starts over with the new date', async (t) => {
  const { fleet, gladys, rdw, clock } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: dueInThirtyDays,
  });
  await fleet.update();
  rdw.rows.AB123C = registerRow('AB123C', { vervaldatum_apk: '20271201' });
  await fleet.update({ force: true });
  advance(clock, 366 * DAY);
  await fleet.update();
  assert.deepEqual(
    eventsOf(gladys, SCENE_TRIGGERS.APK_REMINDER).map((event) => event.data.expiry_date),
    ['2026-12-01', '2027-12-01'],
  );
});

test('a restart does not fire the same reminder again', async (t) => {
  const first = await setupFleet(t, { plates: 'AB-123-C', rows: dueInThirtyDays });
  await first.fleet.update();
  assert.equal(eventsOf(first.gladys, SCENE_TRIGGERS.APK_REMINDER).length, 1);

  const second = await setupFleet(t, { plates: 'AB-123-C', rows: dueInThirtyDays, dir: first.dir });
  await second.fleet.update();
  assert.equal(eventsOf(second.gladys, SCENE_TRIGGERS.APK_REMINDER).length, 0);
});

test('a recall opened and an insurance ended fire on the change only', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: {
      AB123C: registerRow('AB123C', {
        wam_verzekerd: 'Nee',
        openstaande_terugroepactie_indicator: 'Ja',
      }),
    },
  });
  await fleet.update();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'first sight: nothing to compare with');

  rdw.rows.AB123C = registerRow('AB123C');
  await fleet.update({ force: true });
  assert.equal(
    gladys.fake.sceneEvents.length,
    0,
    'insured again, recall done: no trigger for good news',
  );

  rdw.rows.AB123C = registerRow('AB123C', {
    wam_verzekerd: 'Nee',
    openstaande_terugroepactie_indicator: 'Ja',
  });
  await fleet.update({ force: true });
  assert.deepEqual(gladys.fake.sceneEvents.map((event) => event.key).sort(), [
    SCENE_TRIGGERS.INSURANCE_LOST,
    SCENE_TRIGGERS.RECALL_OPENED,
  ]);
});

test('an unknown value is never a change', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t, { plates: 'AB-123-C' });
  await fleet.update();
  rdw.rows.AB123C = registerRow('AB123C', { wam_verzekerd: undefined });
  await fleet.update({ force: true });
  rdw.rows.AB123C = registerRow('AB123C', { wam_verzekerd: 'Nee' });
  await fleet.update({ force: true });
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.INSURANCE_LOST).length, 0);
});

test('event data only carries keys the trigger declares, as primitives', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t, { plates: 'AB-123-C', rows: dueInThirtyDays });
  await fleet.update();
  rdw.rows.AB123C = registerRow('AB123C', {
    vervaldatum_apk: '20261201',
    wam_verzekerd: 'Nee',
    openstaande_terugroepactie_indicator: 'Ja',
  });
  await fleet.update({ force: true });
  assert.equal(gladys.fake.sceneEvents.length, 3);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(
        declared.includes(name),
        `${key}: data.${name} is not declared, the core would drop it`,
      );
      assert.ok(
        value === null || typeof value !== 'object',
        `${key}: data.${name} must be a primitive`,
      );
    }
    for (const field of trigger.fields.filter((f) => f.options)) {
      const values = field.options.map((option) => option.value);
      assert.ok(
        values.includes(data[field.key]),
        `${key}: ${field.key} must be one of its options`,
      );
    }
  }
});

test('a refused scene event does not stop the cycle', async (t) => {
  const { fleet, gladys, memory } = await setupFleet(t, {
    plates: 'AB-123-C',
    rows: dueInThirtyDays,
  });
  gladys.publishSceneEvent = async () => {
    throw new Error('429');
  };
  await fleet.update();
  assert.equal(memory.get('AB123C').apkStage, 'due_soon', 'remembered: not fired at every cycle');
});

function assertDeclaredOutputs(key, outputs) {
  const declared = declarationOf('scene_actions', key).outputs;
  for (const [name, value] of Object.entries(outputs)) {
    const output = declared.find((entry) => entry.key === name);
    assert.ok(output, `${key}: output "${name}" is not declared, the core would drop it`);
    assert.equal(typeof value, output.type, `${key}: output "${name}" is a ${output.type}`);
  }
}

test('refresh_vehicles reads the register and fires no scene event', async (t) => {
  const { fleet, gladys, rdw } = await setupFleet(t, {
    plates: 'AB-123-C, 12-XYZ-3',
    rows: dueInThirtyDays,
  });
  const outputs = await SCENE_ACTIONS.refresh_vehicles(fleet, { fields: {} });
  assert.deepEqual(outputs, { success: true, vehicles: 1, alerts: 1 });
  assertDeclaredOutputs('refresh_vehicles', outputs);
  assert.equal(rdw.requests.length, 1);
  assert.equal(
    gladys.fake.sceneEvents.length,
    0,
    'an event in answer to a scene action could loop',
  );
  // The next cycle fires what the action left.
  await fleet.update();
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('refresh_vehicles says when the register did not answer', async (t) => {
  const { fleet, rdw } = await setupFleet(t);
  rdw.fail(503);
  const outputs = await SCENE_ACTIONS.refresh_vehicles(fleet, { fields: {} });
  assert.equal(outputs.success, false);
});

test('get_vehicle returns the declared outputs', async (t) => {
  const { fleet, gladys } = await setupFleet(t, { plates: 'AB-123-C', rows: dueInThirtyDays });
  await fleet.update();
  const outputs = await SCENE_ACTIONS.get_vehicle(fleet, {
    fields: { device: vehicleIds(gladys, 'AB123C').device },
  });
  assert.deepEqual(outputs, {
    found: true,
    plate: 'AB-123-C',
    vehicle: 'Volkswagen Golf',
    apk_stage: 'due_soon',
    alerts: 1,
    apk_expiry: '2026-12-01',
    apk_days_left: 30,
    insured: true,
    open_recall: false,
  });
  assertDeclaredOutputs('get_vehicle', outputs);
});

test('get_vehicle reports a plate the register does not know through its output', async (t) => {
  const { fleet, gladys } = await setupFleet(t, { plates: 'ZZ-999-Z' });
  await fleet.update();
  const outputs = await SCENE_ACTIONS.get_vehicle(fleet, {
    fields: { device: vehicleIds(gladys, 'ZZ999Z').device },
  });
  assert.deepEqual(outputs, { found: false, plate: 'ZZ-999-Z' });
});

test('get_vehicle fails on a device that is not a vehicle of the integration', async (t) => {
  const { fleet } = await setupFleet(t);
  await assert.rejects(
    SCENE_ACTIONS.get_vehicle(fleet, { fields: { device: 'ext:other:thing' } }),
    /Not a vehicle/,
  );
});
