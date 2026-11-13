import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { selectRanchIds, writeRanchHeader } from '../scripts/export-ranch-ids.mjs';

const catalog = new URL('../../../data/markers.json', import.meta.url);
const markers = JSON.parse(await readFile(catalog, 'utf8'));
const ids = ['341792603838029977', '2730878115209290675', '15889002414176907668'];
const target = markers.find(marker => marker.id === '64200014');

test('selects the three ranch IDs losslessly', async t => {
  assert.deepEqual(selectRanchIds(markers), ids);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zelda-notes-catalog-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'ranch_ids.h');
  await writeRanchHeader(catalog, output);
  assert.match(await readFile(output, 'utf8'), /UINT64_C\(15889002414176907668\)/);
});

test('rejects a duplicate ranch ID', () => {
  assert.throws(() => selectRanchIds([...markers, target]), /duplicado/);
});

test('rejects a ranch ID outside uint64', () => {
  const changed = markers.map(marker => marker === target
    ? { ...marker, gameId: '18446744073709551616' } : marker);
  assert.throws(() => selectRanchIds(changed), /uint64/);
});

test('rejects a missing or replaced ranch marker', () => {
  assert.throws(() => selectRanchIds(markers.filter(marker => marker !== target)), /catálogo/);
  const changed = markers.map(marker => marker === target ? { ...marker, gameId: '7' } : marker);
  assert.throws(() => selectRanchIds(changed), /catálogo/);
});
