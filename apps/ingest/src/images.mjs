// Downloads the marker description images referenced in markers.json (`uploads/marker-images/...`) to `data/uploads/marker-images/`.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const data = path.join(root, 'data');
const UA = 'zelda-notes/0.1 (personal local use)';
const exists = (p) => access(p).then(() => true, () => false);

const markers = JSON.parse(await readFile(path.join(data, 'markers.json'), 'utf8'));
const urls = new Set();
for (const m of markers) {
  if (!m.text) continue;
  for (const match of m.text.matchAll(/src="(uploads\/[^"]+)"/gi)) {
    urls.add(match[1]);
  }
}

let dl = 0, cached = 0, failed = 0;
for (const rel of urls) {
  const dest = path.join(data, rel);
  if (await exists(dest)) { cached++; continue; }
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    const res = await fetch(`https://zeldamaps.com/${rel}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) { failed++; console.warn('FAIL', rel, res.status); continue; }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    dl++;
    await new Promise((r) => setTimeout(r, 80));
  } catch (e) {
    failed++;
    console.warn('ERR', rel, e.message);
  }
}
console.log(`images total=${urls.size} downloaded=${dl} cached=${cached} failed=${failed}`);
