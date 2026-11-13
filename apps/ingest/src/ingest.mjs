// M0 ingest: snapshot zeldamaps endpoints -> data/. Personal use, polite (one pass, cached).
// Usage: node apps/ingest/src/ingest.mjs [--refresh] [--from <dir with zm_*.json>]
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMarkers } from '../../../packages/core/src/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const data = path.join(root, 'data');
const GAME = 64;
const BASE = 'https://zeldamaps.com/ajax.php';
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const fromIdx = args.indexOf('--from');
const fromDir = fromIdx >= 0 ? args[fromIdx + 1] : path.resolve(root, '..');

const exists = (p) => access(p).then(() => true, () => false);
const UA = 'zelda-notes/0.1 (personal local use)';

async function getJson(command, localName) {
  const cache = path.join(data, 'snapshot', 'raw', `${command}.json`);
  if (!refresh && (await exists(cache))) return JSON.parse(await readFile(cache, 'utf8'));
  const local = path.join(fromDir, localName);
  let text;
  if (!refresh && (await exists(local))) {
    console.log(`  ${command}: using local ${localName}`);
    text = await readFile(local, 'utf8');
  } else {
    console.log(`  ${command}: fetching`);
    const res = await fetch(`${BASE}?command=${command}&game=${GAME}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${command}: HTTP ${res.status}`);
    text = await res.text();
  }
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, text);
  return JSON.parse(text);
}

const [maps, categories, markersRaw] = await Promise.all([
  getJson('get_map', 'zm_map.json'),
  getJson('get_categories', 'zm_categories.json'),
  getJson('get_markers', 'zm_markers.json'),
]);

const markers = normalizeMarkers(markersRaw);
const hash = createHash('sha256').update(JSON.stringify([maps, categories, markersRaw])).digest('hex').slice(0, 16);

await writeFile(path.join(data, 'markers.json'), JSON.stringify(markers));
await writeFile(path.join(data, 'categories.json'), JSON.stringify(categories));
await writeFile(path.join(data, 'maps.json'), JSON.stringify(maps));
await writeFile(
  path.join(data, 'snapshot', 'manifest.json'),
  JSON.stringify({ date: new Date().toISOString(), hash, markers: markers.length, maps: maps.length }, null, 2),
);

const submaps = maps.reduce((n, m) => n + (m.subMap?.length ?? 0), 0);
console.log(`markers=${markers.length} maps=${maps.length} submaps=${submaps} hash=${hash}`);
if (markers.length !== 632) console.warn(`WARNING: expected 632 markers, got ${markers.length}`);
