import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

test('export-icons builds non-empty ZNI1 sprites for all 35 grouped categories including 64025', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zn-icons-'));
  const outBin = path.join(tmp, 'icons.znicons');
  const outMeta = path.join(tmp, 'icons-manifest.json');
  execFileSync('node', [
    path.join(repoRoot, 'mods/fritchii/scripts/export-icons.mjs'),
    path.join(repoRoot, 'data'),
    outBin,
    outMeta,
  ], { stdio: 'inherit' });

  const meta = JSON.parse(fs.readFileSync(outMeta, 'utf8'));
  assert.equal(meta.categories.length, 35);
  assert.ok(meta.categories.some((c) => c.id === '64025' && c.index >= 0));

  const buf = fs.readFileSync(outBin);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'ZNI1');
  const version = buf.readUInt16LE(4);
  const count = buf.readUInt16LE(6);
  assert.equal(version, 1);
  assert.equal(count, 35);

  const perCatBytes = (48 * 48 * 2 + 32 * 32 * 2 + 24 * 24 + 18 * 18) * 4;
  assert.equal(buf.length, 8 + count * perCatBytes);

  for (let i = 0; i < count; i++) {
    const start = 8 + i * perCatBytes;
    const sprite48 = buf.subarray(start, start + 48 * 48 * 4);
    let opaque48 = 0;
    for (let p = 3; p < sprite48.length; p += 4) {
      if (sprite48[p] > 32) opaque48++;
    }
    assert.ok(opaque48 >= 80, `category ${meta.categories[i].id} active48 too empty: ${opaque48}`);

    // Ensure dimmed48 isn't solid empty AND pin24 inside sprite has non-empty glyph pixels
    const pin24Start = start + (48 * 48 * 2 + 32 * 32 * 2) * 4;
    const sprite24 = buf.subarray(pin24Start, pin24Start + 24 * 24 * 4);
    let opaque24 = 0;
    for (let p = 3; p < sprite24.length; p += 4) {
      if (sprite24[p] > 32) opaque24++;
    }
    assert.ok(opaque24 >= 20, `category ${meta.categories[i].id} pin24 too empty: ${opaque24}`);
  }
});
