// -----------------------------------------------------------------------------
// A Fleet wired to the fake Gladys of the SDK, a fake register, a clock the
// test moves and a memory in a temporary directory.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../../src/config.js';
import { Fleet } from '../../src/rdw/fleet.js';
import { Memory } from '../../src/rdw/memory.js';
import { createFakeRdw, registerRow } from './fakeRdw.js';

// 1 November 2026, 11:00 in Amsterdam.
export const NOW = new Date('2026-11-01T10:00:00Z');

/** A temporary directory removed after the test. */
export async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rdw-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {import('node:test').TestContext} t
 * @param {{ plates?: string, rows?: Record<string, object>, config?: object, dir?: string }} [options]
 */
export async function setupFleet(t, options = {}) {
  const {
    plates = 'AB-123-C, 12-XYZ-3',
    rows = {
      AB123C: registerRow('AB123C'),
      '12XYZ3': registerRow('12XYZ3', { merk: 'TOYOTA', handelsbenaming: 'YARIS' }),
    },
    config = {},
  } = options;
  const dir = options.dir ?? (await tempDir(t));
  const gladys = createFakeGladys();
  const rdw = createFakeRdw(rows);
  const clock = { now: new Date(NOW) };
  const memory = new Memory(dir);
  await memory.load();
  const fleet = new Fleet({ gladys, memory, fetch: rdw.fetch, now: () => clock.now });
  fleet.setConfig(normalizeConfig({ plates, ...config }));
  return { gladys, rdw, clock, memory, fleet, dir };
}

/** Move the clock forward. */
export function advance(clock, ms) {
  clock.now = new Date(clock.now.getTime() + ms);
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
