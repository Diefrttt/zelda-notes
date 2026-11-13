import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import {
  computeDefaultZoneTransform,
  computeTransformStretchX,
  filterMarkersByAge,
  getAreaOverlayBounds,
  getAreaOverlayTiles,
  isValueMarker,
  projectMarker,
  resizeZoneTransformEdge,
  resolveMarkerArea,
  resolveProgressArea,
  resolveZoneTransformKey,
  scaleZoneTransform,
  type AreaBounds,
  type LinkAge,
  type ZoneTransform,
} from '../../../packages/core/src/index.mjs';
import {
  applyDomTranslations,
  badge,
  createTranslator,
  describeLocation,
  emptyProgress,
  initBackend,
  isTauri,
  loadStaticData,
  resetZoneTransform,
  resolveEffectiveAge,
  saveOverlayRect,
  saveZoneTransform,
  setHudStretchX,
  setManualAge,
  setMarkerStatus,
  setOverlayOnlyValue,
  subscribeLangChanged,
  subscribeUpdates,
  toggleOverlayCalibrating,
  toggleOverlayExpanded,
  type Category,
  type Marker,
  type OverlayStatus,
  type SaveProgress,
  type SubMap,
  type UserState,
} from './shared';
import {
  getStoredLangPref,
  normalizeLangPref,
  resolveLang,
  t,
  type AppLang,
} from './i18n';
import './overlay.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const GUIDE_OPACITY_STEPS = [0.5, 0.8, 0] as const;
type AxisMode = 'prop' | 'width' | 'height';
type HandleName = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const { markers, categories, maps, es } = await loadStaticData();
let currentLang: AppLang = resolveLang(getStoredLangPref());
let tr = createTranslator(es, currentLang);
const catById = new Map<string, Category>(categories.map((c) => [c.id, c]));
const isLabel = (m: Marker) => catById.get(m.cat)?.marker_category_type_id === '3';
const isMajor = (m: Marker) => isValueMarker(m) || m.cat === '64024';
const knownIds = markers.map((m) => m.gameId ?? '').filter((g) => /^\d+$/.test(g));

let progress = emptyProgress();
let waitingForProgress = isTauri();
let { userState, overlayStatus } = await initBackend(knownIds);
let draftTransform: ZoneTransform | null = null;
let draftKey: string | null = null;
let selectedMarker: Marker | null = null;
let guideOpacityIdx = 0;
let axisMode: AxisMode = 'prop';
const guideFloorIdx = new Map<string, number>();

let lastGuideKey = '';
let guideGen = 0;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function getActiveArea() {
  return resolveProgressArea(progress) ?? userState.manualArea;
}

function canvasBox() {
  const rect = $('ov-canvas').getBoundingClientRect();
  return { width: rect.width > 0 ? rect.width : 272, height: rect.height > 0 ? rect.height : 240 };
}

function getSavedOrDefaultTransform(area: string, tfKey: string, bounds: AreaBounds | null): ZoneTransform {
  return (
    userState.zoneTransforms?.[tfKey] ??
    userState.zoneTransforms?.[area] ??
    computeDefaultZoneTransform(bounds, canvasBox(), 0.82, userState.hudStretchX ?? 1)
  );
}

function getTransform(area: string, tfKey: string, bounds: AreaBounds | null): ZoneTransform {
  if (overlayStatus.calibrating && draftTransform && draftKey === tfKey) return draftTransform;
  return getSavedOrDefaultTransform(area, tfKey, bounds);
}

function resolveGuideSource(
  area: string,
  age: LinkAge | null,
  areaMarkers: Marker[],
): { mapId: string; maxZoom: number; sub: SubMap; floorLabel: string | null; floorCount: number } | null {
  const hyrule = maps.find((m) => m.id === '65000');
  const isHyrule = hyrule?.subMap.some((s) => areaMarkers.some((m) => m.submap === s.id)) ||
    hyrule?.subMap[0]?.regions?.some((r) => r.name === area || r.connectionKey === area);
  if (hyrule && isHyrule) {
    const subId = age === 'adult' ? '650001' : '650000';
    const sub = hyrule.subMap.find((s) => s.id === subId) ?? hyrule.subMap[0];
    return sub ? { mapId: hyrule.id, maxZoom: Number(hyrule.maxZoom) || 5, sub, floorLabel: null, floorCount: 1 } : null;
  }

  const gm = maps.find((m) => m.id !== '65000' && areaMarkers.some((x) => x.map === m.id));
  if (!gm || gm.subMap.length === 0) return null;

  const byFloor = new Map<string, SubMap>();
  for (const s of gm.subMap) {
    const label = s.name.split('·')[0].trim();
    const prev = byFloor.get(label);
    if (!prev || s.isDefault === '1') byFloor.set(label, s);
  }
  const floors = [...byFloor.entries()];
  let idx = guideFloorIdx.get(area);
  if (idx == null) {
    const def = gm.subMap.find((s) => s.isDefault === '1') ?? gm.subMap[0];
    const defIdx = floors.findIndex(([, s]) => s.id === def.id);
    idx = defIdx >= 0 ? defIdx : 0;
  }
  const safeIdx = ((idx % floors.length) + floors.length) % floors.length;
  const [floorLabel, sub] = floors[safeIdx];
  return {
    mapId: gm.id,
    maxZoom: Number(gm.maxZoom) || 3,
    sub,
    floorLabel: floors.length > 1 ? floorLabel : null,
    floorCount: floors.length,
  };
}

function positionTransformBox(el: HTMLElement, tf: ZoneTransform) {
  el.style.left = `${(tf.offsetX * 100).toFixed(4)}%`;
  el.style.top = `${(tf.offsetY * 100).toFixed(4)}%`;
  el.style.width = `${(tf.scaleX * 100).toFixed(4)}%`;
  el.style.height = `${(tf.scaleY * 100).toFixed(4)}%`;
}

function renderGuideTiles(
  area: string,
  age: LinkAge | null,
  areaMarkers: Marker[],
  bounds: AreaBounds | null,
  tf: ZoneTransform,
) {
  const guideEl = $('ov-guide');
  const boxEl = $('ov-guide-box');
  const frameEl = $('ov-frame');
  const guideBtn = $('ov-guide-btn');
  const floorBtn = $('ov-floor-btn');
  const opacity = GUIDE_OPACITY_STEPS[guideOpacityIdx];

  guideBtn.classList.toggle('on', opacity > 0);
  guideBtn.textContent = opacity > 0 ? `🗺 ${Math.round(opacity * 100)}%` : t(currentLang, 'ovGuideBtn');

  if (!overlayStatus.calibrating || !bounds) {
    guideEl.hidden = true;
    frameEl.hidden = true;
    floorBtn.hidden = true;
    return;
  }

  frameEl.hidden = false;
  positionTransformBox(frameEl, tf);

  const src = resolveGuideSource(area, age, areaMarkers);
  floorBtn.hidden = !src || src.floorCount <= 1;
  if (src?.floorLabel) floorBtn.textContent = src.floorLabel;

  if (!src || opacity <= 0) {
    guideEl.hidden = true;
    return;
  }

  guideEl.hidden = false;
  positionTransformBox(boxEl, tf);
  boxEl.style.opacity = String(opacity);

  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const z = src.mapId === '65000' ? Math.min(src.maxZoom, spanX < 25 ? 5 : 4) : Math.min(src.maxZoom, 3);
  const key = `${src.sub.tileURL}|${z}|${bounds.minX}|${bounds.maxX}|${bounds.minY}|${bounds.maxY}`;
  if (key === lastGuideKey) return;

  lastGuideKey = key;
  const myGen = ++guideGen;
  const canvas = $<HTMLCanvasElement>('ov-guide-canvas');
  const cw = Math.max(128, Math.round(spanX * (1 << z)));
  const ch = Math.max(128, Math.round(spanY * (1 << z)));
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;

  const { tiles } = getAreaOverlayTiles(bounds, z);
  for (const t of tiles) {
    const img = new Image();
    img.onload = () => {
      if (myGen !== guideGen) return;
      ctx.drawImage(
        img,
        (t.leftPct / 100) * cw,
        (t.topPct / 100) * ch,
        (t.widthPct / 100) * cw,
        (t.heightPct / 100) * ch,
      );
    };
    img.src = `/tiles/${src.sub.tileURL}${z}_${t.tx}_${t.ty}.webp`;
  }
}

let selectedAutoDone = false;

function showDetail(m: Marker, isAutoDone: boolean) {
  selectedMarker = m;
  selectedAutoDone = isAutoDone;
  $('ov-detail-name').textContent = tr.name(m.name);
  $('ov-detail-text').innerHTML = tr.text(m.text) || `<em>${t(currentLang, 'noDescription')}</em>`;
  const markBtn = $('ov-detail-mark');
  markBtn.textContent = t(currentLang, 'markCollected');
  markBtn.hidden = isAutoDone;
  markBtn.onclick = async () => {
    userState = await setMarkerStatus(m.id, 'done');
    $('ov-detail').hidden = true;
    selectedMarker = null;
    render();
  };
  $('ov-detail').hidden = false;
}

function renderAgeChip(age: LinkAge | null, manual: boolean, hasArea: boolean) {
  const chip = $('ov-age');
  if (!hasArea) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  if (age === 'child') {
    chip.textContent = t(currentLang, 'ageChild');
    chip.className = `ov-age child${manual ? ' manual' : ''}`;
  } else if (age === 'adult') {
    chip.textContent = t(currentLang, 'ageAdult');
    chip.className = `ov-age adult${manual ? ' manual' : ''}`;
  } else {
    chip.textContent = t(currentLang, 'ageBoth');
    chip.className = 'ov-age neutral';
  }
  const ageLabel = age === 'child' ? t(currentLang, 'ageChild') : t(currentLang, 'ageAdult');
  chip.title = manual
    ? t(currentLang, 'ovAgeTitleManual', { age: ageLabel })
    : age
      ? t(currentLang, 'ovAgeTitleAuto', { age: ageLabel })
      : t(currentLang, 'ovAgeTitleNone');
}

function activeContext() {
  const area = getActiveArea();
  const { age, manual } = resolveEffectiveAge(progress, userState);
  const areaAll = area ? markers.filter((m) => resolveMarkerArea(m) === area) : [];
  const ageMarkers = area ? filterMarkersByAge(areaAll, age) : [];
  const tfKey = area ? resolveZoneTransformKey(area, age, maps) : null;
  const bounds = area ? getAreaOverlayBounds(markers, maps, area, age) : null;
  return { area, age, manual, areaAll, ageMarkers, tfKey, bounds };
}

function ensureDraft(area: string, tfKey: string, bounds: AreaBounds | null): ZoneTransform {
  if (!draftTransform || draftKey !== tfKey) {
    draftKey = tfKey;
    draftTransform = { ...getSavedOrDefaultTransform(area, tfKey, bounds) };
  }
  return draftTransform;
}

async function commitDraft(bounds: AreaBounds | null) {
  if (!draftTransform || !draftKey) return;
  const key = draftKey;
  const tf = { ...draftTransform };
  draftTransform = null;
  draftKey = null;
  userState = {
    ...userState,
    zoneTransforms: { ...(userState.zoneTransforms ?? {}), [key]: tf },
  };
  userState = await saveZoneTransform(key, tf);
  if (userState.hudStretchX == null && bounds) {
    const stretch = computeTransformStretchX(tf, bounds, canvasBox());
    if (Math.abs(stretch - 1) > 0.03) {
      userState = await setHudStretchX(Number(stretch.toFixed(3)));
    }
  }
}

function renderCalControls(bounds: AreaBounds | null, tf: ZoneTransform) {
  const aspectBtn = $('ov-aspect-btn');
  const baseBtn = $('ov-base-btn');

  if (axisMode === 'width') {
    aspectBtn.textContent = t(currentLang, 'ovAspectWidth');
    aspectBtn.className = 'axis';
  } else if (axisMode === 'height') {
    aspectBtn.textContent = t(currentLang, 'ovAspectHeight');
    aspectBtn.className = 'axis';
  } else {
    aspectBtn.textContent = t(currentLang, 'ovAspectProp');
    aspectBtn.className = 'on';
  }

  const stretch = bounds ? computeTransformStretchX(tf, bounds, canvasBox()) : 1;
  baseBtn.textContent = `📐 ${stretch.toFixed(2)}×`;
  const savedBase = userState.hudStretchX;
  const matchesSaved = savedBase != null && Math.abs(stretch - savedBase) <= 0.02;
  baseBtn.className = matchesSaved ? 'on' : Math.abs(stretch - 1) > 0.02 ? 'axis' : '';
  baseBtn.title = savedBase != null
    ? t(currentLang, 'ovBaseTitleSaved', { saved: savedBase.toFixed(2), stretch: stretch.toFixed(2) })
    : t(currentLang, 'ovBaseTitleDefault', { stretch: stretch.toFixed(2) });
}

function render() {
  const auto = new Set(progress.collected);
  const manualSet = new Set(userState.manualCollected);
  const ignored = new Set(userState.ignored);
  const isAuto = (m: Marker) => !!m.gameId && auto.has(m.gameId);
  const isDone = (m: Marker) => manualSet.has(m.id) || isAuto(m);

  const saveArea = resolveProgressArea(progress);
  const { area, age, manual, areaAll, ageMarkers, tfKey, bounds } = activeContext();

  const ov = $('ov');
  const pillEl = $('ov-pill');
  const areaEl = $('ov-area');
  const sourceEl = $('ov-src');
  const location = describeLocation(progress, saveArea, userState.manualArea, currentLang);
  sourceEl.textContent = location?.label ?? '';
  sourceEl.hidden = !location;
  pillEl.title = location?.detail ?? (waitingForProgress ? t(currentLang, 'searchingLive') : t(currentLang, 'waitingGame'));
  const countEl = $('ov-count');
  const expandBtn = $('ov-expand');
  const calBar = $('ov-calbar');
  const resizeEl = $('ov-resize');
  const canvasEl = $('ov-canvas');
  const listEl = $('ov-list');

  calBar.hidden = !overlayStatus.calibrating;
  resizeEl.hidden = !overlayStatus.calibrating;
  renderAgeChip(age, manual, !!area);

  const isExpanded = overlayStatus.expanded && !overlayStatus.calibrating;
  const stateClasses =
    `${overlayStatus.clickThrough && !overlayStatus.calibrating ? ' click-through' : ''}` +
    `${overlayStatus.calibrating ? ' calibrating' : ''}` +
    `${isExpanded ? ' expanded' : ''}`;

  if (!area || !tfKey) {
    ov.className = `ov gray${stateClasses}`;
    areaEl.textContent = progress.scene ?? (waitingForProgress ? t(currentLang, 'searchingShort') : t(currentLang, 'waitingGame'));
    countEl.textContent = '–';
    expandBtn.textContent = overlayStatus.expanded ? '▴' : '▾';
    $('ov-guide').hidden = true;
    $('ov-frame').hidden = true;
    canvasEl.innerHTML = '';
    listEl.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  const areaValue = ageMarkers.filter((m) => isValueMarker(m) && !ignored.has(m.id));
  const doneCount = areaValue.filter(isDone).length;
  const pending = areaValue.filter((m) => !isDone(m));
  const allUncollected = ageMarkers.filter((m) => !isLabel(m) && !isDone(m) && !ignored.has(m.id));
  const total = areaValue.length;

  const tone = total === 0 ? 'gray' : doneCount === total ? 'green' : 'amber';
  ov.className = `ov ${tone}${stateClasses}`;
  areaEl.textContent = tr.area(area);
  countEl.textContent = total > 0 ? `${doneCount}/${total}` : '–';
  expandBtn.textContent = overlayStatus.expanded ? '▴' : '▾';

  const tf = getTransform(area, tfKey, bounds);
  renderCalControls(bounds, tf);
  renderGuideTiles(area, age, areaAll, bounds, tf);

  const shownPins = userState.overlayOnlyValue && !overlayStatus.calibrating ? pending : allUncollected;

  if (bounds) {
    canvasEl.innerHTML = shownPins
      .map((m) => {
        const pt = projectMarker(m, bounds, tf);
        if (!overlayStatus.calibrating && (pt.x < -0.25 || pt.x > 1.25 || pt.y < -0.25 || pt.y > 1.25)) return '';
        const major = isMajor(m);
        const c = catById.get(m.cat);
        return `<div class="ov-pin ${major ? 'val' : 'ref'}" data-id="${m.id}" style="left:${(pt.x * 100).toFixed(2)}%;top:${(pt.y * 100).toFixed(2)}%" title="${escapeHtml(tr.name(m.name))}">${badge(c, major ? 17 : 14)}</div>`;
      })
      .join('');
    canvasEl.querySelectorAll<HTMLElement>('.ov-pin').forEach((el) => {
      el.onclick = (ev) => {
        if (overlayStatus.calibrating) return;
        ev.stopPropagation();
        const m = markers.find((x) => x.id === el.dataset.id);
        if (m) showDetail(m, isAuto(m));
      };
    });
  } else {
    canvasEl.innerHTML = '';
  }

  if (overlayStatus.expanded && !overlayStatus.calibrating) {
    const onlyVal = Boolean(userState.overlayOnlyValue);
    const listItems = onlyVal ? pending : allUncollected;
    const headHtml = `<div class="ov-list-head">
      <span>${t(currentLang, 'pendingCount', { count: listItems.length })}</span>
      <button id="ov-filter-mode" type="button" title="${t(currentLang, 'ovFilterTitle')}">${onlyVal ? t(currentLang, 'ovFilterValueOnly') : t(currentLang, 'ovFilterAll')}</button>
    </div>`;
    const rowsHtml =
      listItems.length === 0
        ? `<div style="opacity:.7">${t(currentLang, 'ovAreaComplete')}</div>`
        : listItems
            .map((m) => {
              const c = catById.get(m.cat);
              return `<div class="ov-item" data-id="${m.id}">${badge(c, 16)}<span class="ov-name">${escapeHtml(tr.name(m.name))}</span></div>`;
            })
            .join('');
    listEl.innerHTML = headHtml + rowsHtml;
    listEl.hidden = false;
    $('ov-filter-mode').onclick = async (ev) => {
      ev.stopPropagation();
      userState = await setOverlayOnlyValue(!onlyVal);
      render();
    };
    listEl.querySelectorAll<HTMLElement>('.ov-item').forEach((el) => {
      el.onclick = () => {
        const m = markers.find((x) => x.id === el.dataset.id);
        if (m) showDetail(m, isAuto(m));
      };
    });
  } else {
    listEl.hidden = true;
    listEl.innerHTML = '';
  }

  if (selectedMarker && !allUncollected.some((p) => p.id === selectedMarker!.id)) {
    $('ov-detail').hidden = true;
    selectedMarker = null;
  }
}

function nudgeByPx(dxPx: number, dyPx: number) {
  const { area, tfKey, bounds } = activeContext();
  if (!area || !tfKey) return;
  const { width, height } = canvasBox();
  const cur = ensureDraft(area, tfKey, bounds);
  draftTransform = {
    ...cur,
    offsetX: cur.offsetX + dxPx / width,
    offsetY: cur.offsetY + dyPx / height,
  };
  render();
}

function zoomByFactor(factor: number, ax = 0.5, ay = 0.5, axis: 'both' | 'x' | 'y' = 'both') {
  const { area, tfKey, bounds } = activeContext();
  if (!area || !tfKey) return;
  const cur = ensureDraft(area, tfKey, bounds);
  const fx = axis === 'y' ? 1 : factor;
  const fy = axis === 'x' ? 1 : factor;
  draftTransform = scaleZoneTransform(cur, fx, fy, ax, ay, axis === 'both');
  render();
}

function activeAxisForMode(): 'both' | 'x' | 'y' {
  return axisMode === 'width' ? 'x' : axisMode === 'height' ? 'y' : 'both';
}

let dragStart: { x: number; y: number; tf: ZoneTransform; key: string } | null = null;
let handleDrag: { handle: HandleName; x: number; y: number; tf: ZoneTransform; key: string } | null = null;
let resizing: { sx: number; sy: number; sw: number; sh: number } | null = null;
const canvas = $('ov-canvas');

canvas.addEventListener('mousedown', (e) => {
  if (!overlayStatus.calibrating || e.button !== 0) return;
  const { area, tfKey, bounds } = activeContext();
  if (!area || !tfKey) return;
  const tf = ensureDraft(area, tfKey, bounds);
  dragStart = { x: e.clientX, y: e.clientY, tf: { ...tf }, key: tfKey };
});

$('ov-frame').querySelectorAll<HTMLElement>('.ov-handle').forEach((el) => {
  el.addEventListener('mousedown', (e) => {
    if (!overlayStatus.calibrating || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const { area, tfKey, bounds } = activeContext();
    if (!area || !tfKey) return;
    const tf = ensureDraft(area, tfKey, bounds);
    handleDrag = {
      handle: el.dataset.handle as HandleName,
      x: e.clientX,
      y: e.clientY,
      tf: { ...tf },
      key: tfKey,
    };
  });
});

$('ov-resize').addEventListener('mousedown', (e) => {
  if (!overlayStatus.calibrating || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  resizing = { sx: e.screenX, sy: e.screenY, sw: window.innerWidth, sh: window.innerHeight };
});

window.addEventListener('mousemove', (e) => {
  if (resizing && isTauri()) {
    const w = Math.max(160, Math.round(resizing.sw + (e.screenX - resizing.sx)));
    const h = Math.max(140, Math.round(resizing.sh + (e.screenY - resizing.sy)));
    void getCurrentWindow().setSize(new LogicalSize(w, h));
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  if (handleDrag && overlayStatus.calibrating) {
    draftKey = handleDrag.key;
    draftTransform = resizeZoneTransformEdge(
      handleDrag.tf,
      handleDrag.handle,
      (e.clientX - handleDrag.x) / rect.width,
      (e.clientY - handleDrag.y) / rect.height,
      axisMode === 'prop',
    );
    render();
    return;
  }
  if (!dragStart || !overlayStatus.calibrating) return;
  draftKey = dragStart.key;
  draftTransform = {
    ...dragStart.tf,
    offsetX: dragStart.tf.offsetX + (e.clientX - dragStart.x) / rect.width,
    offsetY: dragStart.tf.offsetY + (e.clientY - dragStart.y) / rect.height,
  };
  render();
});

window.addEventListener('mouseup', () => {
  if (resizing && isTauri()) void saveOverlayRect();
  resizing = null;
  dragStart = null;
  handleDrag = null;
});

window.addEventListener('resize', () => render());

canvas.addEventListener('wheel', (e) => {
  if (!overlayStatus.calibrating) return;
  const { area, tfKey } = activeContext();
  if (!area || !tfKey) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
  const cx = (e.clientX - rect.left) / rect.width;
  const cy = (e.clientY - rect.top) / rect.height;
  const axis: 'both' | 'x' | 'y' = e.shiftKey ? 'y' : e.altKey ? 'x' : activeAxisForMode();
  zoomByFactor(factor, cx, cy, axis);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (!overlayStatus.calibrating) return;
  const step = e.shiftKey ? 5 : 1;
  if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeByPx(-step, 0); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeByPx(step, 0); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); nudgeByPx(0, -step); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeByPx(0, step); }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomByFactor(1.03, 0.5, 0.5, activeAxisForMode()); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomByFactor(1 / 1.03, 0.5, 0.5, activeAxisForMode()); }
  else if (e.key === '[') { e.preventDefault(); zoomByFactor(1 / 1.02, 0.5, 0.5, 'x'); }
  else if (e.key === ']') { e.preventDefault(); zoomByFactor(1.02, 0.5, 0.5, 'x'); }
  else if (e.key === 'Enter') { e.preventDefault(); $('ov-done').click(); }
});

$('ov-age').onclick = async (ev) => {
  ev.stopPropagation();
  let next: LinkAge | null;
  if (progress.age) {
    if (userState.manualAge == null) next = progress.age === 'child' ? 'adult' : 'child';
    else next = null;
  } else {
    next = userState.manualAge === 'child' ? 'adult' : userState.manualAge === 'adult' ? null : 'child';
  }
  userState = await setManualAge(next);
  render();
};

$('ov-guide-btn').onclick = () => {
  guideOpacityIdx = (guideOpacityIdx + 1) % GUIDE_OPACITY_STEPS.length;
  render();
};

$('ov-aspect-btn').onclick = () => {
  axisMode = axisMode === 'prop' ? 'width' : axisMode === 'width' ? 'height' : 'prop';
  render();
};

$('ov-base-btn').onclick = async (e) => {
  const { area, tfKey, bounds } = activeContext();
  if (!area || !tfKey || !bounds) return;
  if (e.shiftKey) {
    userState = await setHudStretchX(null);
    render();
    return;
  }
  const tf = getTransform(area, tfKey, bounds);
  const stretch = computeTransformStretchX(tf, bounds, canvasBox());
  userState = await setHudStretchX(Number(stretch.toFixed(3)));
  render();
};

$('ov-floor-btn').onclick = () => {
  const area = getActiveArea();
  if (!area) return;
  guideFloorIdx.set(area, (guideFloorIdx.get(area) ?? 0) + 1);
  render();
};

$('ov-left').onclick = (e) => nudgeByPx(e.shiftKey ? -6 : -2, 0);
$('ov-right').onclick = (e) => nudgeByPx(e.shiftKey ? 6 : 2, 0);
$('ov-up').onclick = (e) => nudgeByPx(0, e.shiftKey ? -6 : -2);
$('ov-down').onclick = (e) => nudgeByPx(0, e.shiftKey ? 6 : 2);
$('ov-zin').onclick = () => zoomByFactor(1.04, 0.5, 0.5, activeAxisForMode());
$('ov-zout').onclick = () => zoomByFactor(1 / 1.04, 0.5, 0.5, activeAxisForMode());

$('ov-cal').onclick = async () => {
  const { area, tfKey, bounds } = activeContext();
  if (!overlayStatus.calibrating && area && tfKey) {
    ensureDraft(area, tfKey, bounds);
  } else if (overlayStatus.calibrating) {
    await commitDraft(bounds);
  }
  if (isTauri()) {
    overlayStatus = await toggleOverlayCalibrating();
  } else {
    overlayStatus = { ...overlayStatus, calibrating: !overlayStatus.calibrating };
  }
  render();
};

$('ov-reset').onclick = async () => {
  const { area, tfKey, bounds } = activeContext();
  if (!area || !tfKey) return;
  axisMode = 'prop';
  draftKey = tfKey;
  draftTransform = computeDefaultZoneTransform(bounds, canvasBox(), 0.82, userState.hudStretchX ?? 1);
  if (userState.zoneTransforms?.[tfKey]) userState = await resetZoneTransform(tfKey);
  if (tfKey !== area && userState.zoneTransforms?.[area]) userState = await resetZoneTransform(area);
  render();
};

$('ov-done').onclick = async () => {
  const { bounds } = activeContext();
  await commitDraft(bounds);
  if (isTauri()) {
    overlayStatus = await toggleOverlayCalibrating();
  } else {
    overlayStatus = { ...overlayStatus, calibrating: false };
  }
  render();
};

$('ov-expand').onclick = async () => {
  if (isTauri()) {
    overlayStatus = await toggleOverlayExpanded();
  } else {
    overlayStatus = { ...overlayStatus, expanded: !overlayStatus.expanded };
  }
  render();
};

$('ov-detail-close').onclick = () => {
  $('ov-detail').hidden = true;
  selectedMarker = null;
};

function applyOverlayLanguage(rerender = true) {
  document.documentElement.lang = currentLang;
  document.title = t(currentLang, 'overlayTitle');
  tr = createTranslator(es, currentLang);
  applyDomTranslations(document, currentLang);
  if (selectedMarker && !$('ov-detail').hidden) {
    showDetail(selectedMarker, selectedAutoDone);
  }
  if (rerender) render();
}

applyOverlayLanguage(false);
render();

await subscribeLangChanged((pref) => {
  currentLang = resolveLang(normalizeLangPref(pref));
  applyOverlayLanguage(true);
});

await subscribeUpdates({
  onProgress: (p: SaveProgress) => { waitingForProgress = false; progress = p; render(); },
  onUserState: (u: UserState) => { userState = u; render(); },
  onOverlayStatus: (o: OverlayStatus) => {
    const { area, tfKey, bounds } = activeContext();
    if (o.calibrating && !overlayStatus.calibrating && area && tfKey) {
      ensureDraft(area, tfKey, bounds);
    } else if (!o.calibrating && overlayStatus.calibrating) {
      void commitDraft(bounds);
    }
    overlayStatus = o;
    render();
  },
});
