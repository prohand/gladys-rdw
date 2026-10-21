// -----------------------------------------------------------------------------
// What the integration remembers across restarts.
//
// A scene trigger fires once per change ("the APK is now due", "a recall was
// opened"), never at every refresh. Knowing what changed means remembering
// what was seen before, and an update of the integration or a restart of
// Gladys must not fire everything again: so the last state seen of every
// vehicle is kept in a small JSON file under /data, the only writable path of
// the container (the rootfs is read-only).
//
// Nothing secret is stored: plates, flags and dates from a public register.
// Outside the container (development), a /data that cannot be written only
// costs the memory: it is logged once and the integration keeps working.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'memory' });

const FILE_NAME = 'rdw-state.json';

export class Memory {
  /**
   * @param {string} [directory] where the file lives: `RDW_DATA_DIR`, /data by default
   */
  constructor(directory = process.env.RDW_DATA_DIR || '/data') {
    this.file = join(directory, FILE_NAME);
    this.directory = directory;
    /** @type {Record<string, Record<string, unknown>>} plate -> last state seen */
    this.vehicles = {};
    this.warned = false;
  }

  /** Read the file; a missing or broken one starts an empty memory. */
  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.vehicles =
        parsed && typeof parsed.vehicles === 'object' && parsed.vehicles !== null
          ? parsed.vehicles
          : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Could not read ${this.file}, starting from an empty memory: ${err.message}`);
      }
      this.vehicles = {};
    }
  }

  get(plate) {
    return this.vehicles[plate];
  }

  set(plate, state) {
    this.vehicles[plate] = state;
  }

  /** Forget the vehicles no longer configured. */
  keepOnly(plates) {
    for (const plate of Object.keys(this.vehicles)) {
      if (!plates.includes(plate)) {
        delete this.vehicles[plate];
      }
    }
  }

  /** Write the file, atomically (a crash mid-write never leaves half a file). */
  async save() {
    const tmp = `${this.file}.tmp`;
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(tmp, JSON.stringify({ vehicles: this.vehicles }), 'utf8');
      await rename(tmp, this.file);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        logger.warn(
          `Could not write ${this.file}, triggers may fire again after a restart: ${err.message}`,
        );
      }
    }
  }
}
