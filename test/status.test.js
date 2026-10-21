import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APK_STAGES, daysBetween, today, vehicleStatus } from '../src/rdw/status.js';

const vehicle = (fields) => ({
  apkExpiry: '2026-12-31',
  insured: true,
  openRecall: false,
  ...fields,
});

test('today is the Dutch date, whatever the clock of the machine', () => {
  // 23:30 UTC on 31 October is already 1 November in Amsterdam (UTC+1).
  assert.equal(today(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
  assert.equal(today(new Date('2026-10-31T22:30:00Z')), '2026-10-31');
});

test('days between two dates ignore daylight saving changes', () => {
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-26', '2026-10-24'), -2);
});

test('the APK is ok, due soon, then expired the day after its expiry date', () => {
  const options = { warningDays: 30, today: '2026-11-01' };
  assert.equal(
    vehicleStatus(vehicle({ apkExpiry: '2026-12-31' }), options).apkStage,
    APK_STAGES.OK,
  );
  assert.equal(
    vehicleStatus(vehicle({ apkExpiry: '2026-12-01' }), options).apkStage,
    APK_STAGES.DUE_SOON,
    'exactly 30 days left',
  );
  const lastDay = vehicleStatus(vehicle({ apkExpiry: '2026-11-01' }), options);
  assert.equal(lastDay.apkStage, APK_STAGES.DUE_SOON, 'the expiry date is the last valid day');
  assert.equal(lastDay.apkDaysLeft, 0);
  const late = vehicleStatus(vehicle({ apkExpiry: '2026-10-31' }), options);
  assert.equal(late.apkStage, APK_STAGES.EXPIRED);
  assert.equal(late.apkDaysLeft, -1);
});

test('a vehicle without APK date has an unknown stage', () => {
  const status = vehicleStatus(vehicle({ apkExpiry: null }), {
    warningDays: 30,
    today: '2026-11-01',
  });
  assert.deepEqual(status, { apkDaysLeft: null, apkStage: APK_STAGES.UNKNOWN, alerts: 0 });
});

test('alerts count what needs attention, an unknown value is not an alert', () => {
  const options = { warningDays: 30, today: '2026-11-01' };
  assert.equal(vehicleStatus(vehicle(), options).alerts, 0);
  assert.equal(
    vehicleStatus(vehicle({ apkExpiry: '2026-10-01', insured: false, openRecall: true }), options)
      .alerts,
    3,
  );
  assert.equal(vehicleStatus(vehicle({ insured: null, openRecall: null }), options).alerts, 0);
});
