import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { CYCLE_MS, wireIntegration } from '../src/integration.js';
import { Memory } from '../src/rdw/memory.js';
import { vehicleIds } from '../src/devices/vehicle.js';
import { createFakeRdw, registerRow } from './helpers/fakeRdw.js';
import { NOW, tempDir } from './helpers/fleet.js';

async function start(t, { config = { plates: 'AB-123-C' }, rows } = {}) {
  const gladys = createFakeGladys({ config });
  const rdw = createFakeRdw(rows ?? { AB123C: registerRow('AB123C') });
  const memory = new Memory(await tempDir(t));
  const { fleet, stop } = wireIntegration(gladys, { memory, fetch: rdw.fetch, now: () => NOW });
  t.after(stop);
  return { gladys, rdw, fleet, stop };
}

// Let the async `connected` handler run to completion.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('on connection: config read, register read, devices and status published', async (t) => {
  const { gladys, rdw } = await start(t);
  await gladys.connect();
  await settle();
  assert.equal(rdw.requests.length, 1);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Volkswagen Golf (AB-123-C)'],
  );
  assert.ok(gladys.fake.states.length > 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.ok(gladys.fake.widgetRefreshes.includes('vehicles'));
});

test('an unreachable register shows in the connection status', async (t) => {
  const { gladys, rdw } = await start(t);
  rdw.fail(503);
  await gladys.connect();
  await settle();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.ok(gladys.fake.connectionStatus.message.es);
  // Devices are still offered, named after their plate.
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['AB-123-C'],
  );
});

test('the scan request publishes the vehicles', async (t) => {
  const { gladys } = await start(t);
  await gladys.connect();
  await settle();
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('a new configuration reads the new plates before publishing the devices', async (t) => {
  const { gladys, rdw } = await start(t, {
    rows: {
      AB123C: registerRow('AB123C'),
      '12XYZ3': registerRow('12XYZ3', { merk: 'TOYOTA', handelsbenaming: 'YARIS' }),
    },
  });
  await gladys.connect();
  await settle();
  await gladys.fake.configUpdated({ plates: 'AB-123-C, 12-XYZ-3' });
  assert.equal(rdw.requests.length, 2);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Volkswagen Golf (AB-123-C)', 'Toyota Yaris (12-XYZ-3)'],
  );
});

test('a created vehicle gets its values at once', async (t) => {
  const { gladys, fleet } = await start(t);
  await gladys.connect();
  await settle();
  const [device] = fleet.devices();
  const before = gladys.fake.states.length;
  await gladys.fake.deviceCreated(device);
  assert.ok(gladys.fake.states.length > before, 'the values forgotten by the SDK are sent again');
});

test('actions, scene actions and widgets are all registered', async (t) => {
  const { gladys } = await start(t);
  await gladys.connect();
  await settle();
  const device = vehicleIds(gladys, 'AB123C').device;
  assert.equal((await gladys.fake.action('test_connection', {})).success, true);
  assert.equal((await gladys.fake.action('check_plate', { plate: 'AB-123-C' })).success, true);
  const vehicle = await gladys.fake.sceneAction('get_vehicle', { device });
  assert.equal(vehicle.data.outputs.found, true);
  const refreshed = await gladys.fake.sceneAction('refresh_vehicles', {});
  assert.equal(refreshed.data.outputs.success, true);
  const content = await gladys.fake.widgetGet('vehicles', { settings: {} });
  assert.equal(content.success, true);
  const toast = await gladys.fake.widgetAction('vehicles', 'refresh', {}, { settings: {} });
  assert.equal(toast.success, true);
});

test('the hourly cycle runs while connected and stops on disconnection', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { gladys, fleet } = await start(t);
  let cycles = 0;
  const update = fleet.update.bind(fleet);
  fleet.update = (options) => {
    cycles += 1;
    return update(options);
  };
  await gladys.connect();
  await settle();
  const afterConnect = cycles;
  t.mock.timers.tick(CYCLE_MS);
  assert.equal(cycles, afterConnect + 1);
  gladys.emit('disconnected');
  t.mock.timers.tick(CYCLE_MS);
  assert.equal(cycles, afterConnect + 1, 'no cycle while disconnected');
});
