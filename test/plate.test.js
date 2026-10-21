import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlate, normalizePlate, parsePlates } from '../src/rdw/plate.js';

test('a plate is normalized to the form the RDW stores', () => {
  assert.equal(normalizePlate('ab-123-c'), 'AB123C');
  assert.equal(normalizePlate(' 12 XYZ 3 '), '12XYZ3');
  assert.equal(normalizePlate('AB123C'), 'AB123C');
});

test('what cannot be a plate is refused', () => {
  assert.equal(normalizePlate(''), null);
  assert.equal(normalizePlate('---'), null);
  assert.equal(normalizePlate('ABCDEFGHI'), null, 'nine characters');
  assert.equal(normalizePlate(undefined), null);
  assert.equal(normalizePlate(42), null);
});

test('a plate list is split on commas, semicolons and new lines, never on spaces', () => {
  assert.deepEqual(parsePlates('AB-123-C, 12 XYZ 3;1-ABC-23\n\nab123c'), {
    plates: ['AB123C', '12XYZ3', '1ABC23'],
    invalid: [],
  });
});

test('a plate list keeps what is not a plate aside', () => {
  assert.deepEqual(parsePlates('AB-123-C, !!, ABCDEFGHIJ'), {
    plates: ['AB123C'],
    invalid: ['!!', 'ABCDEFGHIJ'],
  });
  assert.deepEqual(parsePlates(undefined), { plates: [], invalid: [] });
  assert.deepEqual(parsePlates(['AB-123-C', '12-XYZ-3']).plates, ['AB123C', '12XYZ3']);
});

test('plates are displayed with the dashes of their series', () => {
  // Three groups: the dashes go between letters and digits.
  assert.equal(formatPlate('AB123C'), 'AB-123-C');
  assert.equal(formatPlate('12XYZ3'), '12-XYZ-3');
  assert.equal(formatPlate('1ABC23'), '1-ABC-23');
  assert.equal(formatPlate('XXX99X'), 'XXX-99-X');
  // Older 2-2-2 series: the four-character group is cut in two.
  assert.equal(formatPlate('AB1234'), 'AB-12-34');
  assert.equal(formatPlate('1234AB'), '12-34-AB');
  assert.equal(formatPlate('ABCD12'), 'AB-CD-12');
  assert.equal(formatPlate('0001TJ'), '00-01-TJ');
  assert.equal(formatPlate('12AB34'), '12-AB-34');
  // Special series are left as they are.
  assert.equal(formatPlate('CDJ008'), 'CDJ008');
  assert.equal(formatPlate('AA'), 'AA');
});
