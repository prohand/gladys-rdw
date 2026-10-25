// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/capabilities/actions.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widget.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { APK_STAGES } from '../src/rdw/status.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them.
const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];
const STORE_FIELDS = ['keywords', 'countries', 'music'];
const STORE_FIELDS_MIN_GLADYS_VERSION = [5, 3, 0];
const STORE_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

// Every multi-language text of the manifest, with its path.
function texts(value, path = 'manifest') {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => texts(child, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    ['label', 'description', 'placeholder'].includes(key) && typeof child !== 'string'
      ? [[`${path}.${key}`, child]]
      : texts(child, `${path}.${key}`),
  );
}

test('every text is written in English, French, German and Spanish', () => {
  const all = texts(manifest);
  assert.ok(all.length > 50);
  for (const [path, text] of all) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim(), `${path}.${language} is empty`);
    }
  }
});

test('no text is a plain string', () => {
  // label, description and placeholder alike: a plain string rejects the manifest.
  const check = (value, path) => {
    if (Array.isArray(value)) return value.forEach((child, i) => check(child, `${path}[${i}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['label', 'description', 'placeholder'].includes(key)) {
        assert.equal(typeof child, 'object', `${path}.${key} must be a multi-language object`);
      }
      check(child, `${path}.${key}`);
    }
  };
  check(manifest, 'manifest');
});

test('the integration is a cloud one: it talks to the RDW over the internet', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('catalog categories are store keys, and need Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(STORE_CATEGORIES.includes(category), `unknown category "${category}"`);
  }
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('the catalog shelves are vehicles and services', () => {
  assert.deepEqual(manifest.categories, ['vehicles', 'services']);
});

test('keywords, countries and music need Gladys >= 5.3.0', () => {
  if (STORE_FIELDS.some((field) => field in manifest)) {
    assert.ok(
      isAtLeast(minGladysVersion(), STORE_FIELDS_MIN_GLADYS_VERSION),
      `got "${manifest.gladys_version}"`,
    );
  }
});

test('1 to 10 unique search keywords of 2 to 30 characters', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'duplicate keyword');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('the integration is declared for the Netherlands only: the RDW register is Dutch', () => {
  assert.deepEqual(manifest.countries, ['NL']);
  for (const country of manifest.countries) {
    assert.match(country, /^[A-Z]{2}$/);
  }
});

test('scene triggers, scene actions and widgets need Gladys >= 5.1.0', () => {
  for (const field of CAPABILITY_FIELDS) {
    assert.ok(manifest[field]?.length > 0, `${field} is declared`);
  }
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `got "${manifest.gladys_version}"`,
  );
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('the APK stage filter offers the stages the code fires', () => {
  const stage = manifest.scene_triggers
    .find((trigger) => trigger.key === 'apk_reminder')
    .fields.find((field) => field.key === 'stage');
  assert.deepEqual(
    stage.options.map((option) => option.value),
    [APK_STAGES.DUE_SOON, APK_STAGES.EXPIRED],
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(keysOf(stored).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('the app token is a secret field', () => {
  const token = manifest.config_schema.find((field) => field.key === 'app_token');
  assert.equal(token.type, 'secret');
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by hand.
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-rdw:${manifest.version}`);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('scene outputs and variables are scalars', () => {
  for (const item of [...manifest.scene_triggers, ...manifest.scene_actions]) {
    for (const entry of [...(item.variables ?? []), ...(item.outputs ?? [])]) {
      assert.ok(['string', 'number', 'boolean'].includes(entry.type), `${item.key}.${entry.key}`);
    }
  }
});
