import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, LANGUAGES, localize, pick } from '../src/i18n.js';

test('the languages are the ones of the Gladys interface, English first', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('pick falls back to English for a language it has no text for', () => {
  const texts = { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' };
  assert.equal(pick('de', texts), 'Ja');
  assert.equal(pick('es', texts), 'Sí');
  assert.equal(pick('nl', texts), 'Yes');
});

test('localize builds one text per language', () => {
  assert.deepEqual(
    localize((language) => `[${language}]`),
    { en: '[en]', fr: '[fr]', de: '[de]', es: '[es]' },
  );
});

test('dates are written the way each language writes them', () => {
  assert.equal(formatDate('en', '2026-07-29'), '2026-07-29');
  assert.equal(formatDate('fr', '2026-07-29'), '29/07/2026');
  assert.equal(formatDate('es', '2026-07-29'), '29/07/2026');
  assert.equal(formatDate('de', '2026-07-29'), '29.07.2026');
});
