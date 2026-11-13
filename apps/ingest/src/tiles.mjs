// M0 tiles mirror: z_x_y.webp per submap, resumable, polite (concurrency 4), skips blank tiles.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const data = path.join(root, 'data');
const tilesDir = path.join(data, 'tiles');
const BLANK_SIZES = new Set([180, 212, 355]);
const UA = 'zelda-notes/0.1 (personal local use)';
const CONCURRENCY = 4;

const maps = JSON.parse(await readFile(path.join(data, 'maps.json'), 'utf8'));
const exists = (p) => access(p).then(() => true, () => false);

const jobs = [];
for (const map of maps) {
  const maxZoom = Number(map.maxZoom);
  for (const sub of map.subMap) {
    for (let z = 0; z <= maxZoom; z++) {
      const n = 2 ** z;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) jobs.push({ sub, z, x, y });
    }
  }
}

const manifest = { downloaded: 0, cached: 0, blank: 0, missing: 0, failed: 0, subs: {} };
let next = 0;

async function worker() {
  while (next < jobs.length) {
    const { sub, z, x, y } = jobs[next++];
    const dir = path.join(tilesDir, sub.tileURL);
    const file = path.join(dir, `${z}_${x}_${y}.webp`);
    const marker = `${file}.none`;
    if ((await exists(file)) || (await exists(marker))) { manifest.cached++; continue; }
    const url = `https://zeldamaps.com/tiles/${sub.tileURL}${z}_${x}_${y}.webp?v=${sub.tileVersion}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      await mkdir(dir, { recursive: true });
      if (res.status === 404) { await writeFile(marker, ''); manifest.missing++; continue; }
      if (!res.ok) { manifest.failed++; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (BLANK_SIZES.has(buf.length)) { await writeFile(marker, ''); manifest.blank++; continue; }
      await writeFile(file, buf);
      (manifest.subs[sub.tileURL] ??= { version: sub.tileVersion, maxZoom: Number(sub.maxZoom ?? 0) });
      manifest.downloaded++;
    } catch { manifest.failed++; }
    await new Promise((r) => setTimeout(r, 60));
    if ((manifest.downloaded + manifest.blank + manifest.missing) % 200 === 0)
      console.log(`${next}/${jobs.length}`, manifest.downloaded, 'dl');
  }
}

console.log(`${jobs.length} candidate tiles`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await mkdir(tilesDir, { recursive: true });
await writeFile(path.join(tilesDir, 'manifest.json'), JSON.stringify({ date: new Date().toISOString(), ...manifest }, null, 2));
console.log('done', manifest);
