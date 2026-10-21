import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory } from '../src/rdw/memory.js';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rdw-memory-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('the memory survives a restart', async (t) => {
  const dir = await tempDir(t);
  const before = new Memory(dir);
  await before.load();
  before.set('AB123C', { apkStage: 'ok', insured: true });
  await before.save();

  const after = new Memory(dir);
  await after.load();
  assert.deepEqual(after.get('AB123C'), { apkStage: 'ok', insured: true });
});

test('a missing or broken file starts an empty memory', async (t) => {
  const dir = await tempDir(t);
  const memory = new Memory(dir);
  await memory.load();
  assert.deepEqual(memory.vehicles, {});
  await writeFile(join(dir, 'rdw-state.json'), '{ broken');
  await memory.load();
  assert.deepEqual(memory.vehicles, {});
});

test('vehicles no longer configured are forgotten', async (t) => {
  const memory = new Memory(await tempDir(t));
  memory.set('AB123C', {});
  memory.set('12XYZ3', {});
  memory.keepOnly(['12XYZ3']);
  assert.deepEqual(Object.keys(memory.vehicles), ['12XYZ3']);
});

test('a directory that cannot be written costs the memory, not the integration', async (t) => {
  const dir = await tempDir(t);
  const file = join(dir, 'not-a-directory');
  await writeFile(file, 'x');
  const memory = new Memory(join(file, 'sub'));
  memory.set('AB123C', {});
  await memory.save(); // does not throw
  await memory.save(); // logs once
  assert.equal(memory.warned, true);
  assert.equal(await readFile(file, 'utf8'), 'x');
});

test('the directory defaults to RDW_DATA_DIR, then /data', () => {
  const saved = process.env.RDW_DATA_DIR;
  try {
    delete process.env.RDW_DATA_DIR;
    assert.equal(new Memory().file, '/data/rdw-state.json');
    process.env.RDW_DATA_DIR = '/tmp/x';
    assert.equal(new Memory().file, '/tmp/x/rdw-state.json');
  } finally {
    if (saved === undefined) delete process.env.RDW_DATA_DIR;
    else process.env.RDW_DATA_DIR = saved;
  }
});
