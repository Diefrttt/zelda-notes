import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAreaOverlayBounds, groupCategoriesForMenu, resolveMarkerAge, resolveMarkerArea, SCENE_TO_AREA, stripHtml } from '../../../packages/core/src/index.mjs';

const MAX_ID = (1n << 64n) - 1n;
const EMPTY_TRANSLATIONS = {
  categories: {},
  maps: {},
  submaps: {},
  areas: {},
  names: {},
  texts: {},
};

function normalizeForFont(text) {
  const replaced = String(text ?? '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/\u00a0/g, ' ');
  return [...replaced].filter(ch => ch.codePointAt(0) <= 0x7ff).join('');
}

const translate = (dictionary, text) =>
  normalizeForFont(Object.hasOwn(dictionary, text) ? dictionary[text] : text);
const iconByCategory = new Map(Object.entries({
  SKULLTULA: ['64001'],
  HEART: ['64002', '64004'],
  CHEST: ['64020', '64021', '64024'],
  KEY: ['64027', '64028'],
  RUPEE: ['64005'],
  BOTTLE: ['64006', '64064'],
  OCARINA: ['64008'],
  SWORD: ['64022', '64061'],
  SHIELD: ['64023', '64062'],
  FAIRY: ['64007', '64032', '64065'],
  DOOR: ['64042', '64051', '64052'],
  PERSON: ['64041', '64045', '64053', '64067'],
}).flatMap(([icon, ids]) => ids.map(id => [id, icon])));

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) return 0n;
  const id = BigInt(value);
  return id <= MAX_ID ? id : 0n;
}

function plainText(text) {
  return normalizeForFont(stripHtml(text).replace(/&(amp|quot|apos|nbsp|lt|gt|#\d+|#x[0-9a-f]+);/gi, (entity, name) => {
    const named = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' };
    if (!name.startsWith('#')) return named[name.toLowerCase()] ?? entity;
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return number >= 32 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
  }));
}

export function selectCatalog(markers, maps, categories, translations, lang = 'es') {
  const dict = lang === 'en' ? EMPTY_TRANSLATIONS : (translations ?? EMPTY_TRANSLATIONS);
  const otherLabel = lang === 'en' ? 'Other' : 'Otros';
  const locale = lang === 'en' ? 'en' : 'es';
  const mapById = new Map(maps.map(map => [map.id, map]));
  const grouped = groupCategoriesForMenu(categories);
  const sections = [];
  const groupedItems = [];
  for (let secIdx = 0; secIdx < grouped.length; secIdx++) {
    const group = grouped[secIdx];
    const section = translate(dict.categories, group.title);
    const firstCategory = groupedItems.length;
    for (const category of group.categories) {
      groupedItems.push({
        category,
        section,
        sectionIndex: secIdx,
        iconIndex: groupedItems.length,
      });
    }
    sections.push({
      id: group.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      title: section,
      firstCategory,
      categoryCount: group.categories.length,
    });
  }
  const seenCategoryIds = new Set(groupedItems.map(({ category }) => category.id));
  const extraItems = categories
    .filter(category => !seenCategoryIds.has(category.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    .map(category => ({
      category,
      section: category.menu_section ? translate(dict.categories, category.menu_section) : otherLabel,
      sectionIndex: sections.length,
      iconIndex: 255,
    }));
  const orderedCategories = [...groupedItems, ...extraItems];
  const categoryById = new Map(orderedCategories.map(({ category }, index) => [category.id, index]));
  const markerCountByCategory = new Map();
  for (const m of markers) {
    const key = String(m.cat);
    markerCountByCategory.set(key, (markerCountByCategory.get(key) ?? 0) + 1);
  }
  const resolved = markers.map(marker => ({
    marker,
    area: resolveMarkerArea(marker) ?? mapById.get(marker.map)?.name ?? 'Hyrule',
    gameId: parseId(marker.gameId),
  }));
  const idCounts = new Map();
  for (const { gameId } of resolved) idCounts.set(gameId, (idCounts.get(gameId) ?? 0) + 1);

  const zoneNames = [...new Set([...resolved.map(row => row.area), ...maps.filter(m => m.id !== '65000').map(m => m.name)])].sort((a, b) =>
    translate(dict.areas, a).localeCompare(translate(dict.areas, b), locale));
  const zoneByName = new Map(zoneNames.map((name, index) => [name, index]));
  const worldMarkers = markers.filter(marker => marker.map === '65000');
  const zones = zoneNames.map(name => ({ name: translate(dict.areas, name), color: 0,
    bounds: ['child', 'adult'].map(age => getAreaOverlayBounds(worldMarkers, maps, name, age)) }));
  const labels = orderedCategories.map(({ category, section, sectionIndex, iconIndex }) => ({
    id: category.id,
    numericId: /^\d+$/.test(String(category.id)) ? Number(category.id) : 0,
    name: translate(dict.categories, category.name),
    section,
    sectionIndex,
    iconIndex,
    totalCount: markerCountByCategory.get(String(category.id)) ?? 0,
    color: /^#[0-9a-f]{6}$/i.test(category.color ?? '') ? parseInt(category.color.slice(1), 16) : 0xe8dca4,
    icon: iconByCategory.get(category.id) ?? 'GENERIC',
  }));
  const floors = maps.flatMap(map => (map.subMap ?? []).map(submap => ({
    id: submap.id, mapId: map.id, name: submap.name ? translate(dict.submaps, submap.name) : 'General', color: 0,
    zone: map.id === '65000' ? undefined : zoneByName.get(map.name),
    age: submap.id === '650000' ? 1 : submap.id === '650001' ? 2 : 3,
  })));
  const layoutsByFloor = new Map();
  for (const floor of floors) {
    const key = `${floor.mapId}/${floor.name}`;
    if (!layoutsByFloor.has(key)) layoutsByFloor.set(key, []);
    layoutsByFloor.get(key).push(floor);
  }
  for (const layouts of layoutsByFloor.values()) {
    if (layouts.length < 2) continue;
    layouts.forEach((floor, i) => { floor.name += ` (${i + 1}/${layouts.length})`; });
  }
  const floorByKey = new Map(floors.map((floor, index) => [`${floor.mapId}/${floor.id}`, index]));
  const nativeMarkers = resolved.map(({ marker, area, gameId }) => {
    const key = `${marker.map}/${marker.submap}`;
    const floor = floorByKey.get(key);
    const category = categoryById.get(marker.cat);
    if (floor === undefined || category === undefined || !Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
      throw new Error(`Marcador inválido en el catálogo: ${marker.id}`);
    }
    const age = resolveMarkerAge(marker);
    const source = gameId !== 0n && idCounts.get(gameId) === 1 ? 1 : 0;
    return {
      id: marker.id, name: plainText(translate(dict.names, marker.name)),
      hint: plainText(marker.text ? translate(dict.texts, marker.text) : ''),
      gameId, x: marker.x, y: marker.y, zone: zoneByName.get(area), floor,
      category, age: age === 'child' ? 1 : age === 'adult' ? 2 : 3, source,
    };
  }).sort((a, b) => a.category - b.category);
  const aliases = Object.entries(SCENE_TO_AREA).flatMap(([name, area]) =>
    zoneByName.has(area) ? [{ name, zone: zoneByName.get(area) }] : []);
  return { markers: nativeMarkers, zones, floors, categories: labels, sections, aliases };
}

// Octal escapes preserve the UTF-8 bytes in both host and target C compilers.
function cString(text) {
  const clean = normalizeForFont(text);
  const bytes = [...Buffer.from(clean, 'utf8')];
  return `"${bytes.map(byte => byte >= 32 && byte <= 126 && byte !== 34 && byte !== 92
    ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, '0')}`).join('')}"`;
}

export async function writeCatalog(dataDir, output, artManifest, lang = 'es') {
  if (lang !== 'en' && lang !== 'es') {
    throw new Error(`Unsupported catalog language: ${lang}`);
  }
  const [rawMarkers, maps, categories] = await Promise.all(['markers', 'maps', 'categories'].map(async name =>
    JSON.parse(await readFile(resolve(dataDir, `${name}.json`), 'utf8'))));
  const translations = lang === 'en'
    ? EMPTY_TRANSLATIONS
    : JSON.parse(await readFile(resolve(dataDir, 'es.json'), 'utf8'));
  const catalog = selectCatalog(rawMarkers, maps, categories, translations, lang);
  const artwork = artManifest ? JSON.parse(await readFile(artManifest, 'utf8')) : {};
  const { markers, aliases } = catalog;
  const count = markers.filter(marker => marker.source !== 0).length;
  const lines = ['/* Generated from the Zelda Notes catalog. */', '#include "catalog.h"',
    `_Static_assert(${count} <= ZN_MAX_COLLECT_SIGNS, "CollectSign capacity");`,
    'const ZnMarker zn_markers[] = {'];
  for (const m of markers) {
    lines.push(`    { UINT64_C(${m.gameId}), ${cString(m.id)}, ${cString(m.name)}, ${cString(m.hint)}, ${m.x.toFixed(6)}f, ${m.y.toFixed(6)}f, ${m.zone}, ${m.floor}, ${m.category}, ${m.age}, ${m.source} },`);
  }
  lines.push('};', `const size_t zn_marker_count = ${markers.length};`);
  for (const [key, singular] of [['zones', 'zone'], ['floors', 'floor'], ['categories', 'category']]) {
    lines.push(`const ZnLabel zn_${key}[] = {`,
      ...catalog[key].map(item => `    { ${cString(item.name)}, ${item.color}u },`), '};',
      `const uint16_t zn_${singular}_count = ${catalog[key].length};`);
  }
  lines.push('const ZnCategoryIcon zn_category_icons[] = {',
    ...catalog.categories.map(({ icon }) => `    ZN_ICON_${icon},`), '};',
    'const ZnSection zn_sections[] = {',
    ...catalog.sections.map(s => `    { ${cString(s.id)}, ${cString(s.title)}, ${s.firstCategory}, ${s.categoryCount} },`), '};',
    `const uint16_t zn_section_count = ${catalog.sections.length};`,
    'const ZnCategoryMeta zn_category_meta[] = {',
    ...catalog.categories.map(c => `    { ${c.numericId}u, ${c.sectionIndex}, ${c.iconIndex}, ${c.totalCount} },`), '};',
    'const ZnSceneAlias zn_scene_aliases[] = {',
    ...aliases.map(alias => `    { ${cString(alias.name)}, ${alias.zone} },`), '};',
    `const size_t zn_scene_alias_count = ${aliases.length};`);
  const boundsLiteral = bounds => `{ ${bounds.map(n => `${n.toFixed(6)}f`).join(', ')} }`;
  lines.push('const ZnMapArtwork zn_artwork[] = {');
  for (const floor of catalog.floors) {
    const art = artwork[floor.id];
    if (artManifest && !art) throw new Error(`Falta el fondo del plano ${floor.id}`);
    lines.push(`    { ${floor.id}, ${floor.mapId}, ${art?.width ?? 0}, ${art?.height ?? 0}, ${floor.zone ?? 'ZN_NO_INDEX'}, ${floor.age}, ${boundsLiteral(art?.bounds ?? [0, -256, 256, 0])} },`);
  }
  lines.push('};', 'const ZnBounds zn_world_bounds[][2] = {');
  for (const zone of catalog.zones) {
    lines.push(`    { ${zone.bounds.map(box => boundsLiteral(box ? [box.minX, box.minY, box.maxX, box.maxY] : [0, 0, 0, 0])).join(', ')} },`);
  }
  lines.push('};', '');
  await writeFile(output, lines.join('\n'));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let lang = 'es';
  const positional = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') {
      lang = args[++i];
    } else if (args[i].startsWith('--lang=')) {
      lang = args[i].slice('--lang='.length);
    } else {
      positional.push(args[i]);
    }
  }
  const [dataDir, output, artManifest] = positional;
  if (!dataDir || !output || (lang !== 'en' && lang !== 'es')) {
    throw new Error('Uso: export-catalog.mjs <data-dir> <catalog_gen.c> [art-manifest] [--lang en|es]');
  }
  await writeCatalog(dataDir, output, artManifest, lang);
}
