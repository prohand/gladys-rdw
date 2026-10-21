import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  refreshWidgets,
  VEHICLES_WIDGET,
  WIDGET_ACTIONS,
  WIDGETS,
} from '../src/capabilities/widget.js';
import { FEATURE, vehicleIds } from '../src/devices/vehicle.js';
import { LANGUAGES } from '../src/i18n.js';
import { registerRow } from './helpers/fakeRdw.js';
import { setupFleet } from './helpers/fleet.js';

const widget = WIDGETS[VEHICLES_WIDGET];
const get = (fleet, settings = {}) =>
  widget.get(fleet, { settings, language: 'en', units: 'metric' });
const componentOf = (content, type) =>
  content.components.find((component) => component.type === type);

// Every kind of card: OK, due soon, expired, not insured, recall, unknown plate.
const rows = {
  AB123C: registerRow('AB123C'),
  '12XYZ3': registerRow('12XYZ3', { vervaldatum_apk: '20261110' }),
  '1ABC23': registerRow('1ABC23', { vervaldatum_apk: '20261001' }),
  XX99XX: registerRow('XX99XX', { wam_verzekerd: 'Nee' }),
  '99XX99': registerRow('99XX99', { openstaande_terugroepactie_indicator: 'Ja' }),
};
const plates = 'AB-123-C, 12-XYZ-3, 1-ABC-23, XX-99-XX, 99-XX-99, ZZ-999-Z';

function assertComplete(value, path) {
  // Every text in the four languages, within what Gladys renders.
  if (value && typeof value === 'object' && 'en' in value && typeof value.en === 'string') {
    for (const language of LANGUAGES) {
      assert.equal(typeof value[language], 'string', `${path}.${language} is missing`);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertComplete(child, `${path}.${key}`);
    }
  }
}

test('the vehicles content is rendered exactly as sent, in every language', async (t) => {
  const { fleet } = await setupFleet(t, { plates, rows });
  await fleet.update();
  const content = await get(fleet);
  assert.deepEqual(validateWidgetContent(content), []);
  assertComplete(content, 'content');
  const badges = componentOf(content, 'card-list').items.map((item) => item.badge.text.en);
  assert.deepEqual(badges, [
    'OK',
    'APK in 9 d',
    'APK expired',
    'Not insured',
    'Open recall',
    'Unknown plate',
  ]);
});

test('before the first read, the cards wait for the register', async (t) => {
  const { fleet } = await setupFleet(t, { plates, rows });
  const content = await get(fleet);
  assert.deepEqual(validateWidgetContent(content), []);
  const status = componentOf(content, 'status');
  assert.equal(status.items[0].value.en, 'Not read yet');
});

test('an unreachable register shows in the status row', async (t) => {
  const { fleet, rdw } = await setupFleet(t, { plates, rows });
  rdw.fail(500);
  await fleet.update();
  const content = await get(fleet);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(componentOf(content, 'status').items[0].color, 'danger');
});

test('no plate: the widget says what to do', async (t) => {
  const { fleet } = await setupFleet(t, { plates: '' });
  const content = await get(fleet);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(componentOf(content, 'text').text.en, /add a plate/);
});

test('the vehicle setting shows one vehicle with a live tile on its APK days left', async (t) => {
  const { fleet, gladys } = await setupFleet(t, { plates, rows });
  await fleet.update();
  const content = await get(fleet, { vehicle: vehicleIds(gladys, '12XYZ3').device });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(componentOf(content, 'card-list').items.length, 1);
  assert.equal(
    componentOf(content, 'value').device_feature,
    vehicleIds(gladys, '12XYZ3').feature(FEATURE.APK_DAYS_LEFT),
  );
  // The tile is bound to a feature the integration publishes.
  const published = fleet.devices().flatMap((device) => device.features.map((f) => f.external_id));
  assert.ok(published.includes(componentOf(content, 'value').device_feature));
});

test('only_alerts lists only the vehicles that need attention', async (t) => {
  const { fleet } = await setupFleet(t, { plates, rows });
  await fleet.update();
  const content = await get(fleet, { only_alerts: true });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(componentOf(content, 'card-list').items.length, 5, 'all but the OK one');

  const calm = await setupFleet(t, { plates: 'AB-123-C', rows });
  await calm.fleet.update();
  const nothing = await get(calm.fleet, { only_alerts: true });
  assert.deepEqual(validateWidgetContent(nothing), []);
  assert.equal(componentOf(nothing, 'card-list'), undefined);
  assert.match(componentOf(nothing, 'text').text.en, /Nothing/);
});

test('more vehicles than the list holds are cut to its eight cards', async (t) => {
  const many = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`AB${100 + i}C`, registerRow(`AB${100 + i}C`)]),
  );
  const { fleet } = await setupFleet(t, { plates: Object.keys(many).join(','), rows: many });
  await fleet.update();
  const content = await get(fleet);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('the refresh button reads the register and answers a short toast', async (t) => {
  const { fleet, rdw } = await setupFleet(t, { plates, rows });
  const content = await get(fleet);
  const button = componentOf(content, 'button');
  assert.equal(button.action.key, WIDGET_ACTIONS.REFRESH);
  const message = await widget.action(fleet, {
    actionKey: button.action.key,
    params: {},
    settings: {},
  });
  assert.equal(rdw.requests.length, 1);
  assertComplete(message, 'toast');
  for (const language of LANGUAGES) {
    assert.ok(message[language].length <= 200);
  }
  rdw.fail(500);
  const failed = await widget.action(fleet, {
    actionKey: button.action.key,
    params: {},
    settings: {},
  });
  assert.match(failed.en, /did not answer/);
});

test('an unknown widget action fails, so the user sees the error', async (t) => {
  const { fleet } = await setupFleet(t);
  await assert.rejects(
    widget.action(fleet, { actionKey: 'nope', params: {}, settings: {} }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
