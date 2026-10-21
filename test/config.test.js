import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('an empty configuration takes the defaults', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.equal(config[key], value, key);
  }
  assert.deepEqual(config.plateList, []);
  assert.deepEqual(config.invalidPlates, []);
});

test('the plates are parsed once, for the whole code', () => {
  const config = normalizeConfig({ plates: 'ab-123-c, 12 XYZ 3, ???' });
  assert.equal(config.plates, 'ab-123-c, 12 XYZ 3, ???', 'what the user typed is kept');
  assert.deepEqual(config.plateList, ['AB123C', '12XYZ3']);
  assert.deepEqual(config.invalidPlates, ['???']);
});

test('numbers typed as strings are read, out-of-range ones are clamped', () => {
  const config = normalizeConfig({ apk_warning_days: '14', refresh_hours: '48' });
  assert.equal(config.apk_warning_days, 14);
  assert.equal(config.refresh_hours, 24);
  assert.equal(normalizeConfig({ refresh_hours: 0 }).refresh_hours, 1);
  assert.equal(normalizeConfig({ apk_warning_days: 2.6 }).apk_warning_days, 3);
});

test('an empty or broken number falls back to the default', () => {
  assert.equal(normalizeConfig({ apk_warning_days: '' }).apk_warning_days, 30);
  assert.equal(normalizeConfig({ refresh_hours: 'often' }).refresh_hours, 6);
  assert.equal(normalizeConfig({ refresh_hours: null }).refresh_hours, 6);
});

test('the app token is trimmed', () => {
  assert.equal(normalizeConfig({ app_token: '  abc  ' }).app_token, 'abc');
  assert.equal(normalizeConfig({ app_token: 12 }).app_token, '');
});
