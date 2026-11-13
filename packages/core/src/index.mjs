// Pure logic: normalization of zeldamaps data + counting + scene-to-area resolution. No I/O, no UI.

export const VALUE_CATEGORIES = new Set([
  '64001', // Gold Skulltulas
  '64002', // Heart Pieces
  '64003', // Big Poes
  '64004', // Heart Containers
  '64005', // Silver Rupees
  '64006', // Bottles
  '64008', // Ocarina Songs
  '64021', // Other Treasure
  '64022', // Weapons (chests)
  '64023', // Shields (chests)
  '64025', // Dungeon Maps
  '64026', // Compasses
  '64027', // Small Keys
  '64028', // Boss Keys
  '64061', // Weapons
  '64062', // Armor & Shields
  '64063', // Tools & Quest Items
  '64064', // Capacity & Upgrades
  '64065', // Spells
  '64066', // Masks
]);

export function isValueMarker(m) {
  return VALUE_CATEGORIES.has(String(m.cat));
}

/**
 * Verified scene/region identifiers from Remake saves (`caption.sav`) and `gameData.region`
 * mapped to `markers.json` `area` names.
 */
export const SCENE_TO_AREA = {
  DeathMountainCrater: 'Death Mountain Crater',
  DeathMountainTrail: 'Death Mountain Trail',
  DesertColossus: 'Desert Colossus',
  GanonCastle: "Ganon's Castle",
  GanonsCastle: "Ganon's Castle",
  GerudoFortress: "Gerudo's Fortress",
  GerudoValley: 'Gerudo Valley',
  GoronCity: 'Goron City',
  Graveyard: 'Graveyard',
  HountedWasteland: 'Haunted Wasteland',
  HauntedWasteland: 'Haunted Wasteland',
  HyruleCastle: 'Hyrule Castle',
  HyruleField: 'Hyrule Field',
  KakarikoVillage: 'Kakariko Village',
  KokiriForest: 'Kokiri Forest',
  LakeHylia: 'Lake Hylia',
  LonLonRanch: 'Lon Lon Ranch',
  LostWood: 'Lost Woods',
  LostWoods: 'Lost Woods',
  Market: 'Market',
  TimeTemple: 'Market',
  TempleOfTime: 'Market',
  SacredForestMeadow: 'Sacred Forest Meadow',
  SacredGrove: 'Sacred Grove',
  ZoraDomain: "Zora's Domain",
  ZorasDomain: "Zora's Domain",
  ZoraFountain: "Zora's Fountain",
  ZorasFountain: "Zora's Fountain",
  ZoraRiver: "Zora's River",
  ZorasRiver: "Zora's River",
  DekuTree: 'Inside the Deku Tree',
  InsideTheDekuTree: 'Inside the Deku Tree',
  DodongoCavern: "Dodongo's Cavern",
  DodongosCavern: "Dodongo's Cavern",
  JabuJabu: "Inside Jabu-Jabu's Belly",
  JabuJabuBelly: "Inside Jabu-Jabu's Belly",
  InsideJabuJabusBelly: "Inside Jabu-Jabu's Belly",
  ForestTemple: 'Forest Temple',
  FireTemple: 'Fire Temple',
  IceCavern: 'Ice Cavern',
  WaterTemple: 'Water Temple',
  BottomOfTheWell: 'Bottom of the Well',
  ShadowTemple: 'Shadow Temple',
  SpiritTemple: 'Spirit Temple',
};

export function sceneToArea(scene) {
  if (!scene) return null;
  if (SCENE_TO_AREA[scene]) return SCENE_TO_AREA[scene];
  // Also allow direct areaName match if already resolved
  const values = Object.values(SCENE_TO_AREA);
  if (values.includes(scene)) return scene;
  return null;
}

/** Resolve active area from live/save progress, falling back to `parentScene` when a sub-room is unmapped. */
export function resolveProgressArea(progress) {
  if (!progress) return null;
  return sceneToArea(progress.scene) ?? sceneToArea(progress.parentScene) ?? null;
}

const LON_LON_RANCH_INTERIOR = { minX: 123.5, maxX: 133.8, minY: -152.5, maxY: -145.8 };
const AREA_OVERLAY_BOUNDS = {
  'Lon Lon Ranch': { minX: 123.3, maxX: 133.9, minY: -153.9, maxY: -145.6 },
};

/** Resolve effective area name for a marker, fixing Zelda Maps items inside Lon Lon Ranch tagged as Hyrule Field. */
export function resolveMarkerArea(m) {
  if (!m) return null;
  if (m.area === 'Lon Lon Ranch') return 'Lon Lon Ranch';
  if (
    String(m.map) === '65000' &&
    m.area === 'Hyrule Field' &&
    m.x >= LON_LON_RANCH_INTERIOR.minX &&
    m.x <= LON_LON_RANCH_INTERIOR.maxX &&
    m.y >= LON_LON_RANCH_INTERIOR.minY &&
    m.y <= LON_LON_RANCH_INTERIOR.maxY
  ) {
    return 'Lon Lon Ranch';
  }
  return m.area ?? null;
}

export const DEFAULT_ZONE_TRANSFORM = { scaleX: 0.78, scaleY: 0.78, offsetX: 0.11, offsetY: 0.11 };

export function computeAreaBounds(markers, area) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let count = 0;
  for (const m of markers) {
    if (m.area !== area) continue;
    if (m.x < minX) minX = m.x;
    if (m.x > maxX) maxX = m.x;
    if (m.y < minY) minY = m.y;
    if (m.y > maxY) maxY = m.y;
    count++;
  }
  if (count === 0) return null;
  return { minX, maxX, minY, maxY };
}

export function projectMarker(m, bounds, transform = DEFAULT_ZONE_TRANSFORM) {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const u = (m.x - bounds.minX) / spanX;
  const v = (bounds.maxY - m.y) / spanY;
  return {
    x: transform.offsetX + u * transform.scaleX,
    y: transform.offsetY + v * transform.scaleY,
  };
}

export function parseGameData(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

/** Remove dangerous HTML; keep a small safe subset. */
export function sanitizeHtml(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  const allowed = new Set(['b', 'i', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li', 'img', 'a']);
  s = s.replace(/<\/?\s*([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (m.startsWith('</')) return `</${tag}>`;
    if (tag === 'img') {
      const src = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
      return src ? `<img src="${src[1]}">` : '';
    }
    if (tag === 'a') {
      const href = /href\s*=\s*["'](https?:[^"']+)["']/i.exec(attrs);
      return href ? `<a href="${href[1]}" target="_blank" rel="noopener">` : '<a>';
    }
    return `<${tag}>`;
  });
  return s.trim();
}

export function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeMarker(m) {
  const gd = parseGameData(m.gameData);
  const text = sanitizeHtml(m.tabText);
  const x = Number(m.x);
  const y = Number(m.y);
  const map = String(m.mapId);
  return {
    id: String(m.id),
    name: m.name,
    cat: String(m.markerCategoryId),
    map,
    submap: m.submapId == null ? null : String(m.submapId),
    x,
    y,
    area: resolveMarkerArea({ map, x, y, area: gd.areaName ?? null }),
    region: gd.region ?? null,
    gameId: gd.gameId ?? null,
    gameRecord: gd.gameRecord ?? null,
    text,
    hasImage: /<img\b/i.test(text),
  };
}

export function normalizeMarkers(list) {
  return list.filter((m) => m.visible !== '0').map(normalizeMarker);
}

/** Count done/total per area. `isCounted(marker)` filters categories; `collected` is a Set of ids. */
export function countByArea(markers, collected, isCounted = isValueMarker) {
  const out = {};
  for (const m of markers) {
    if (!isCounted(m)) continue;
    const key = resolveMarkerArea(m) ?? '(unknown)';
    const e = (out[key] ??= { done: 0, total: 0 });
    e.total++;
    if (collected.has(m.id) || (m.gameId && collected.has(m.gameId))) e.done++;
  }
  return out;
}

const POI_SHAPE_STYLES = {
  circle: 'interest',
  diamond: 'travel',
  square: 'location',
  none: 'treasure',
};

const OOT_POI_STYLES = {
  '64001': 'relic',
  '64002': 'heart',
  '64003': 'korok',
  '64004': 'heart',
  '64005': 'silver',
  '64006': 'memory',
  '64007': 'fairy-thought',
  '64008': 'song',
  '64021': 'treasure',
  '64022': 'treasure',
  '64023': 'treasure',
  '64024': 'treasure',
  '64025': 'treasure',
  '64026': 'treasure',
  '64027': 'treasure',
  '64028': 'treasure',
  '64031': 'location',
  '64032': 'location',
  '64033': 'location',
  '64041': 'interest',
  '64042': 'enemy',
  '64043': 'interest',
  '64044': 'interest',
  '64045': 'interest',
  '64046': 'interest',
  '64051': 'travel',
  '64052': 'travel',
  '64053': 'travel',
  '64061': 'treasure',
  '64062': 'treasure',
  '64063': 'treasure',
  '64064': 'treasure',
  '64065': 'treasure',
  '64066': 'treasure',
};

/** Resolve Zelda Maps visual badge style (`travel`, `heart`, `location`, `treasure`, etc.) for a category. */
export function getPoiStyle(category) {
  if (!category) return 'interest';
  const custom = category.custom_style == 1 || category.custom_style === true || category.customStyle === true;
  if (custom && category.shape && POI_SHAPE_STYLES[category.shape]) {
    return POI_SHAPE_STYLES[category.shape];
  }
  return OOT_POI_STYLES[String(category.id)] ?? 'interest';
}

export const POI_SECTION_ORDER = [
  'Travel Points',
  'Collectibles',
  'Locations',
  'Points of Interest',
  'Items & Equipment',
  'Treasure Chests',
];

/** Group visible categories into Zelda Maps menu sections, preserving `menu_order`. */
export function groupCategoriesForMenu(categories, presentCatIds) {
  const bySection = new Map();
  for (const c of categories) {
    if (String(c.marker_category_type_id) === '3' || !c.menu_section) continue;
    if (presentCatIds && !presentCatIds.has(String(c.id))) continue;
    const list = bySection.get(c.menu_section) ?? [];
    list.push(c);
    bySection.set(c.menu_section, list);
  }
  const order = [...POI_SECTION_ORDER, ...[...bySection.keys()].filter((s) => !POI_SECTION_ORDER.includes(s))];
  const groups = [];
  for (const title of order) {
    const list = bySection.get(title);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => (Number(a.menu_order) || 0) - (Number(b.menu_order) || 0) || Number(a.id) - Number(b.id));
    groups.push({ title, categories: list });
  }
  return groups;
}

/** Zelda Maps Focus click on a single category: isolates from all-on, toggles in subset, restores all when emptied. */
export function toggleCategoryFocus(visibleIds, allIds, targetId) {
  const next = new Set(visibleIds);
  const allOn = allIds.length > 0 && allIds.every((id) => next.has(id));
  if (allOn) {
    return allIds.length <= 1 ? new Set(allIds) : new Set([targetId]);
  }
  if (next.has(targetId)) {
    next.delete(targetId);
  } else {
    next.add(targetId);
  }
  const hasAny = allIds.some((id) => next.has(id));
  return hasAny ? next : new Set(allIds);
}

/** Zelda Maps Focus click on an entire section group. */
export function toggleSectionFocus(visibleIds, allIds, sectionIds) {
  const next = new Set(visibleIds);
  const allOn = allIds.length > 0 && allIds.every((id) => next.has(id));
  const sectionFocused = !allOn && sectionIds.length > 0 && sectionIds.every((id) => next.has(id));
  if (sectionFocused) {
    for (const id of sectionIds) next.delete(id);
  } else if (allOn) {
    return new Set(sectionIds);
  } else {
    for (const id of sectionIds) next.add(id);
  }
  const hasAny = allIds.some((id) => next.has(id));
  return hasAny ? next : new Set(allIds);
}

const TILE_PYRAMID_BOUNDS = [
  [-256, 0],
  [0, 256],
];

/** Compute initial fitBounds and padded maxBounds (including outlier markers) for a submap. */
export function getMapBounds(submap, mapMarkers = [], margin = 16) {
  const raw = submap?.bounds;
  const valid =
    Array.isArray(raw) &&
    raw.length === 2 &&
    Array.isArray(raw[0]) &&
    Array.isArray(raw[1]) &&
    Number.isFinite(raw[0][0]) &&
    Number.isFinite(raw[0][1]) &&
    Number.isFinite(raw[1][0]) &&
    Number.isFinite(raw[1][1]);
  const fit = valid
    ? [
        [raw[0][0], raw[0][1]],
        [raw[1][0], raw[1][1]],
      ]
    : [
        [TILE_PYRAMID_BOUNDS[0][0], TILE_PYRAMID_BOUNDS[0][1]],
        [TILE_PYRAMID_BOUNDS[1][0], TILE_PYRAMID_BOUNDS[1][1]],
      ];

  let south = fit[0][0] - margin;
  let west = fit[0][1] - margin;
  let north = fit[1][0] + margin;
  let east = fit[1][1] + margin;
  for (const m of mapMarkers) {
    if (m.y - margin < south) south = m.y - margin;
    if (m.x - margin < west) west = m.x - margin;
    if (m.y + margin > north) north = m.y + margin;
    if (m.x + margin > east) east = m.x + margin;
  }
  return { fit, max: [[south, west], [north, east]] };
}

/** Compute the L.CRS.Simple zoom level at which `bounds` fits inside `viewport`. */
export function computeFitZoom(viewport, bounds, maxZoom = 6, margin = 16) {
  const freeW = Math.max(1, viewport.width - margin * 2);
  const freeH = Math.max(1, viewport.height - margin * 2);
  const spanLat = Math.max(1, Math.abs(bounds[1][0] - bounds[0][0]));
  const spanLng = Math.max(1, Math.abs(bounds[1][1] - bounds[0][1]));
  const scale = Math.min(freeW / spanLng, freeH / spanLat);
  const zoom = Math.log2(scale);
  if (!Number.isFinite(zoom)) return 0;
  return Math.max(0, Math.min(maxZoom, zoom));
}

/** Integer min & initial zoom levels so native tiles render crisp without fractional scaling. */
export function computeZoomRange(viewport, bounds, maxZoom = 6, margin = 16) {
  const exact = computeFitZoom(viewport, bounds, maxZoom, margin);
  const min = Math.max(0, Math.floor(exact));
  const initial = Math.max(min, Math.min(maxZoom, Math.round(exact)));
  return { min, initial };
}

/** Resolve required Link age ('child' | 'adult' | null) for a marker from Hyrule submap or dungeon text tag. */
export function resolveMarkerAge(m) {
  if (!m) return null;
  const text = String(m.text ?? '');
  if (/\bYoung or Adult Link\b/i.test(text)) return null;
  if (String(m.map) === '65000') {
    if (String(m.submap) === '650000') return 'child';
    if (String(m.submap) === '650001') return 'adult';
    return null;
  }
  const young = /<em>\s*Young Link\b/i.test(text);
  const adult = /<em>\s*Adult Link\b/i.test(text);
  if (young && !adult) return 'child';
  if (adult && !young) return 'adult';
  return null;
}

/** Filter markers to the active Link age ('child' | 'adult' | null). Untagged dungeon markers stay visible for both. */
export function filterMarkersByAge(markers, age) {
  if (!age) return markers;
  return markers.filter((m) => {
    const req = resolveMarkerAge(m);
    return req == null || req === age;
  });
}

function regionBox(region) {
  const ring = region?.polygon?.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const x = Number(pt[0]);
    const y = Number(pt[1]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

function findHyruleRegion(maps, area, submapId) {
  const hyrule = Array.isArray(maps) ? maps.find((m) => String(m.id) === '65000') : null;
  const sub = hyrule?.subMap?.find((s) => String(s.id) === submapId);
  if (!sub?.regions) return null;
  return sub.regions.find((r) => r.name === area || r.connectionKey === area) ?? null;
}

/** Compute overlay bounds for an area, preferring exact Zelda Maps region polygons in Hyrule (Child vs Adult). */
export function getAreaOverlayBounds(markers, maps, area, age = null) {
  if (!area) return null;
  const preferredSub = age === 'adult' ? '650001' : '650000';
  const region =
    findHyruleRegion(maps, area, preferredSub) ??
    findHyruleRegion(maps, area, preferredSub === '650001' ? '650000' : '650001');
  const box = regionBox(region);
  if (box) return box;
  const override = AREA_OVERLAY_BOUNDS[area];
  if (override) return { ...override };

  const filtered = age ? filterMarkersByAge(markers, age) : markers;
  const bounds = computeAreaBounds(filtered, area) ?? computeAreaBounds(markers, area);
  if (!bounds) return null;
  if (bounds.maxX - bounds.minX < 1 || bounds.maxY - bounds.minY < 1) {
    const padX = Math.max(0, (4 - (bounds.maxX - bounds.minX)) / 2);
    const padY = Math.max(0, (4 - (bounds.maxY - bounds.minY)) / 2);
    return {
      minX: bounds.minX - padX,
      maxX: bounds.maxX + padX,
      minY: bounds.minY - padY,
      maxY: bounds.maxY + padY,
    };
  }
  return bounds;
}

/** Resolve storage key for zone calibration: shares identical Child/Adult areas, splits ones whose bounds differ (e.g. Market). */
export function resolveZoneTransformKey(area, age, maps) {
  if (!area || !age) return area;
  const childBox = regionBox(findHyruleRegion(maps, area, '650000'));
  const adultBox = regionBox(findHyruleRegion(maps, area, '650001'));
  if (!childBox || !adultBox) return area;
  const tol = 0.1;
  const differs =
    Math.abs(childBox.minX - adultBox.minX) > tol ||
    Math.abs(childBox.maxX - adultBox.maxX) > tol ||
    Math.abs(childBox.minY - adultBox.minY) > tol ||
    Math.abs(childBox.maxY - adultBox.maxY) > tol;
  return differs ? `${area}:${age}` : area;
}

/** Default aspect-preserving ZoneTransform fitted centered inside `viewport` (82% of shorter axis). */
export function computeDefaultZoneTransform(bounds, viewport = { width: 1, height: 1 }, fill = 0.82, stretchX = 1) {
  if (!bounds) return { ...DEFAULT_ZONE_TRANSFORM };
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const effSpanX = spanX * Math.max(0.5, Math.min(2.5, Number(stretchX) || 1));
  const w = Math.max(1, viewport?.width ?? 1);
  const h = Math.max(1, viewport?.height ?? 1);
  const scalePx = Math.min((w * fill) / effSpanX, (h * fill) / spanY);
  const scaleX = (scalePx * effSpanX) / w;
  const scaleY = (scalePx * spanY) / h;
  return {
    scaleX,
    scaleY,
    offsetX: (1 - scaleX) / 2,
    offsetY: (1 - scaleY) / 2,
  };
}

/** Extract horizontal stretch multiplier relative to 1:1 world coordinates (`> 1` means wider horizontally). */
export function computeTransformStretchX(tf, bounds, viewport = { width: 1, height: 1 }) {
  if (!bounds || !tf || !tf.scaleY) return 1;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const w = Math.max(1, viewport?.width ?? 1);
  const h = Math.max(1, viewport?.height ?? 1);
  const pxPerUnitX = (tf.scaleX * w) / spanX;
  const pxPerUnitY = (tf.scaleY * h) / spanY;
  if (!Number.isFinite(pxPerUnitX / pxPerUnitY) || pxPerUnitY <= 0) return 1;
  return Math.max(0.5, Math.min(2.5, pxPerUnitX / pxPerUnitY));
}

/** Resize a ZoneTransform by dragging an edge (`n|s|e|w`) or corner (`nw|ne|sw|se`) handle in normalized canvas units. */
export function resizeZoneTransformEdge(startTf, handle, dxNorm, dyNorm, keepAspect = true) {
  const minS = 0.05;
  const maxS = 20;
  const hasW = handle.includes('w');
  const hasE = handle.includes('e');
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');
  const isCorner = (hasW || hasE) && (hasN || hasS);

  const right = startTf.offsetX + startTf.scaleX;
  const bottom = startTf.offsetY + startTf.scaleY;

  let nextSx = startTf.scaleX;
  let nextSy = startTf.scaleY;

  if (hasE) nextSx = Math.min(maxS, Math.max(minS, startTf.scaleX + dxNorm));
  if (hasW) nextSx = Math.min(maxS, Math.max(minS, startTf.scaleX - dxNorm));
  if (hasS) nextSy = Math.min(maxS, Math.max(minS, startTf.scaleY + dyNorm));
  if (hasN) nextSy = Math.min(maxS, Math.max(minS, startTf.scaleY - dyNorm));

  if (isCorner && keepAspect && startTf.scaleX > 0 && startTf.scaleY > 0) {
    const fx = nextSx / startTf.scaleX;
    const fy = nextSy / startTf.scaleY;
    const f = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
    nextSx = Math.min(maxS, Math.max(minS, startTf.scaleX * f));
    const realF = nextSx / startTf.scaleX;
    nextSy = Math.min(maxS, Math.max(minS, startTf.scaleY * realF));
  }

  return {
    scaleX: nextSx,
    scaleY: nextSy,
    offsetX: hasW ? right - nextSx : startTf.offsetX,
    offsetY: hasN ? bottom - nextSy : startTf.offsetY,
  };
}

/** Scale a ZoneTransform around normalized anchor `(ax, ay)`, optionally locking current aspect ratio. */
export function scaleZoneTransform(tf, factorX, factorY = factorX, ax = 0.5, ay = 0.5, lockAspect = true) {
  const minS = 0.05;
  const maxS = 20;
  const fx = lockAspect ? factorX : factorX;
  const fy = lockAspect ? factorX : factorY;
  const nextSx = Math.min(maxS, Math.max(minS, tf.scaleX * fx));
  const realFx = nextSx / tf.scaleX;
  const nextSy = lockAspect
    ? Math.min(maxS, Math.max(minS, tf.scaleY * realFx))
    : Math.min(maxS, Math.max(minS, tf.scaleY * fy));
  const realFy = nextSy / tf.scaleY;
  return {
    scaleX: nextSx,
    scaleY: nextSy,
    offsetX: ax - (ax - tf.offsetX) * realFx,
    offsetY: ay - (ay - tf.offsetY) * realFy,
  };
}

/** Compute Leaflet tile coordinates & container-relative percentages covering `bounds` at zoom `z`. */
export function getAreaOverlayTiles(bounds, z = 4) {
  const tileSpan = 256 / (1 << z);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const maxIdx = (1 << z) - 1;
  const txMin = Math.max(0, Math.floor(bounds.minX / tileSpan));
  const txMax = Math.min(maxIdx, Math.floor(bounds.maxX / tileSpan));
  const tyMin = Math.max(0, Math.floor(-bounds.maxY / tileSpan));
  const tyMax = Math.min(maxIdx, Math.floor(-bounds.minY / tileSpan));
  const tiles = [];
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      const worldLeft = tx * tileSpan;
      const worldTop = -ty * tileSpan;
      tiles.push({
        tx,
        ty,
        leftPct: ((worldLeft - bounds.minX) / spanX) * 100,
        topPct: ((bounds.maxY - worldTop) / spanY) * 100,
        widthPct: (tileSpan / spanX) * 100,
        heightPct: (tileSpan / spanY) * 100,
      });
    }
  }
  return { z, tileSpan, tiles };
}
