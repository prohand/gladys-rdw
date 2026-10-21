import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-rdw';

test('the first release moves Unreleased under its version and links its tag', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- RDW vehicles.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  assert.equal(
    rollChangelog(before, '1.0.0', '2026-10-21'),
    `# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-10-21\n\n### Added\n\n- RDW vehicles.\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`,
  );
});

test('the changelog of the repository can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(text.includes('## [Unreleased]'));
  assert.match(
    text,
    /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-rdw\/commits\/main$/m,
  );
  const rolled = rollChangelog(text, '9.9.9', '2026-10-21');
  assert.ok(rolled.includes('## [9.9.9] - 2026-10-21'));
  assert.ok(rolled.includes(`[9.9.9]: ${REPO}/releases/tag/v9.9.9`));
});
