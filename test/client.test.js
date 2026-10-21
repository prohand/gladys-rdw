import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchVehicles, parseVehicle, RdwError } from '../src/rdw/client.js';
import { createFakeRdw, registerRow } from './helpers/fakeRdw.js';

test('every plate is asked in one request', async () => {
  const rdw = createFakeRdw({ AB123C: registerRow('AB123C'), '12XYZ3': registerRow('12XYZ3') });
  const vehicles = await fetchVehicles(['AB123C', '12XYZ3', 'ZZ999Z'], { fetch: rdw.fetch });
  assert.equal(rdw.requests.length, 1);
  assert.equal(
    rdw.requests[0].origin + rdw.requests[0].pathname,
    'https://opendata.rdw.nl/resource/m9d7-ebf2.json',
  );
  assert.equal(
    rdw.requests[0].searchParams.get('$where'),
    "kenteken in('AB123C','12XYZ3','ZZ999Z')",
  );
  assert.deepEqual([...vehicles.keys()], ['AB123C', '12XYZ3'], 'an unknown plate is absent');
});

test('no plate, no request', async () => {
  const rdw = createFakeRdw();
  assert.equal((await fetchVehicles([], { fetch: rdw.fetch })).size, 0);
  assert.equal(rdw.requests.length, 0);
});

test('the app token goes in its header only when there is one', async () => {
  const rdw = createFakeRdw();
  await fetchVehicles(['AB123C'], { fetch: rdw.fetch });
  await fetchVehicles(['AB123C'], { fetch: rdw.fetch, appToken: 'secret-token' });
  assert.equal(rdw.headers[0]['X-App-Token'], undefined);
  assert.equal(rdw.headers[1]['X-App-Token'], 'secret-token');
  assert.ok(!rdw.requests[1].href.includes('secret-token'), 'never in the URL');
});

test('a register row is read into the integration own words', () => {
  assert.deepEqual(parseVehicle(registerRow('AB123C', { wam_verzekerd: 'Nee' })), {
    plate: 'AB123C',
    brand: 'VOLKSWAGEN',
    model: 'GOLF',
    kind: 'Personenauto',
    color: 'GRIJS',
    firstAdmission: '2019-03-15',
    apkExpiry: '2027-03-15',
    insured: false,
    openRecall: false,
    exported: false,
    odometerVerdict: 'Logisch',
  });
});

test('an absent or odd value stays unknown, never "no"', () => {
  const vehicle = parseVehicle({ kenteken: 'AB123C', vervaldatum_apk: '2027', merk: '  ' });
  assert.equal(vehicle.apkExpiry, null);
  assert.equal(vehicle.brand, null);
  assert.equal(vehicle.insured, null);
  assert.equal(vehicle.openRecall, null);
});

test('a failed request is an RdwError carrying the HTTP status', async () => {
  const rdw = createFakeRdw();
  rdw.fail(503);
  await assert.rejects(fetchVehicles(['AB123C'], { fetch: rdw.fetch }), (err) => {
    assert.ok(err instanceof RdwError);
    assert.equal(err.status, 503);
    return true;
  });
  rdw.fail(0);
  await assert.rejects(fetchVehicles(['AB123C'], { fetch: rdw.fetch }), /RDW unreachable/);
});

test('an answer that is not a list of rows is refused', async () => {
  const notJson = async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') });
  await assert.rejects(fetchVehicles(['AB123C'], { fetch: notJson }), /not JSON/);
  const notList = async () => ({ ok: true, status: 200, json: async () => ({ error: true }) });
  await assert.rejects(fetchVehicles(['AB123C'], { fetch: notList }), /unexpected document/);
});
