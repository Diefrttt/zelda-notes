import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveMarkerAge, resolveMarkerArea } from '../../../packages/core/src/index.mjs';

const EXPECTED_IDS = ['341792603838029977', '2730878115209290675', '15889002414176907668'];
const UINT64_MAX = (1n << 64n) - 1n;

export function selectRanchIds(markers) {
  const ids = new Set();
  for (const marker of markers) {
    if (marker.cat !== '64001' || resolveMarkerArea(marker) !== 'Lon Lon Ranch'
        || resolveMarkerAge(marker) !== 'child') continue;
    const id = marker.gameId;
    if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > UINT64_MAX) {
      throw new Error(`ID uint64 inválido en el marcador ${marker.id}`);
    }
    if (ids.has(id)) throw new Error(`ID duplicado en el Rancho Lon Lon (${id})`);
    ids.add(id);
  }
  if (ids.size !== EXPECTED_IDS.length || !EXPECTED_IDS.every(id => ids.has(id))) {
    throw new Error('Cambió el catálogo de Skulltulas del Rancho Lon Lon');
  }
  return [...EXPECTED_IDS];
}

export async function writeRanchHeader(markersPath, outputPath) {
  const markers = JSON.parse(await readFile(markersPath, 'utf8'));
  const ids = selectRanchIds(markers);
  const entries = ids.map(id => `    UINT64_C(${id})`).join(',\n');
  const header = `/* Generated from data/markers.json. */\n#ifndef ZN_RANCH_IDS_H\n#define ZN_RANCH_IDS_H\n\n#include <stdint.h>\n\nstatic const uint64_t ZN_RANCH_IDS[3] = {\n${entries}\n};\n\n#endif\n`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, header);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [markersPath, outputPath] = process.argv.slice(2);
  if (!markersPath || !outputPath) throw new Error('Uso: export-ranch-ids.mjs <markers.json> <ranch_ids.h>');
  await writeRanchHeader(markersPath, outputPath);
}
