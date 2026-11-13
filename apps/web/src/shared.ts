import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getPoiStyle, type LinkAge, type ZoneTransform } from '../../../packages/core/src/index.mjs';
import {
  LANG_STORAGE_KEY,
  getStoredLangPref,
  normalizeLangPref,
  t,
  type AppLang,
  type I18nKey,
  type LangPref,
} from './i18n.ts';

export interface Marker {
  id: string;
  name: string;
  cat: string;
  map: string;
  submap: string | null;
  x: number;
  y: number;
  area: string | null;
  region?: string | null;
  gameId: string | null;
  gameRecord?: string | null;
  text: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  color: string;
  img: string;
  marker_category_type_id: string;
  custom_style?: string;
  shape?: string | null;
  glyph_color?: string | null;
  menu_section?: string | null;
  menu_order?: string | null;
}

export interface SubMap {
  id: string;
  name: string;
  tileURL: string;
  tileVersion: string;
  isDefault: string;
  bounds?: [[number, number], [number, number]];
  regions?: { name?: string; connectionKey?: string; polygon?: unknown }[];
}

export interface GameMap {
  id: string;
  name: string;
  maxZoom: string;
  kind?: 'world' | 'dungeon';
  subMap: SubMap[];
}

export interface SaveProgress {
  found: boolean;
  ok: boolean;
  source?: string;
  sceneSource?: 'memory' | 'save' | 'none';
  emulator: string;
  slot: string;
  dir?: string;
  mtimeMs: number;
  collected: string[];
  scene: string | null;
  parentScene?: string | null;
  pos: [number, number, number] | null;
  age?: LinkAge | null;
  errors: string[];
}

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayRelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UserState {
  manualCollected: string[];
  ignored: string[];
  manualArea: string | null;
  manualAge?: LinkAge | null;
  hudStretchX?: number | null;
  overlayOnlyValue?: boolean;
  overlayRect?: OverlayRect | null;
  overlayRelRect?: OverlayRelativeRect | null;
  zoneTransforms?: Record<string, ZoneTransform>;
}

export function resolveEffectiveAge(
  progress: Pick<SaveProgress, 'age'>,
  userState: Pick<UserState, 'manualAge'>,
): { age: LinkAge | null; manual: boolean } {
  if (userState.manualAge === 'child' || userState.manualAge === 'adult') {
    return { age: userState.manualAge, manual: true };
  }
  if (progress.age === 'child' || progress.age === 'adult') {
    return { age: progress.age, manual: false };
  }
  return { age: null, manual: false };
}

export interface OverlayStatus {
  visible: boolean;
  expanded: boolean;
  clickThrough: boolean;
  calibrating: boolean;
}

export interface Translations {
  categories: Record<string, string>;
  maps: Record<string, string>;
  submaps: Record<string, string>;
  areas: Record<string, string>;
  names: Record<string, string>;
  texts: Record<string, string>;
}

// Mismos glyph que usa Zelda Maps (getPOIGlyph) para estas categorías.
export const GLYPH_OVERRIDE: Record<string, string> = {
  '64061': 'OoT_Weapons',
  '64064': 'BotW_Food-n-Materials',
  '64052': 'BotW_Shrine-of-Resurrection',
  '64002': 'General_HeartPiece',
};

export const glyph = (c: Category | undefined) => (c ? GLYPH_OVERRIDE[c.id] ?? c.img : '');

export function badge(c: Category | undefined, size = 22) {
  const style = getPoiStyle(c);
  const custom = c?.custom_style == '1' && /^#[0-9a-f]{6}$/i.test(c.color || '');
  const vars: string[] = [];
  if (custom) {
    vars.push(style === 'treasure' ? `--poi-outline:${c.color}` : `--poi-fill:${c.color}`);
  }
  if (c?.custom_style == '1' && c.glyph_color && /^#[0-9a-f]{6}$/i.test(c.glyph_color)) {
    vars.push(`color:${c.glyph_color}`);
  }
  const extraStyle = vars.length ? `${vars.join(';')};` : '';
  return `<span class="poi-badge poi-${style}" style="${extraStyle}width:${size}px;height:${size}px;font-size:${Math.round(size * 0.56)}px"><span class="glyph icon-${glyph(c)}"></span></span>`;
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const getJson = <T,>(u: string) => fetch(u).then((r) => r.json() as Promise<T>);

export async function loadStaticData() {
  const [markers, categories, maps, es] = await Promise.all([
    getJson<Marker[]>('/markers.json'),
    getJson<Category[]>('/categories.json'),
    getJson<GameMap[]>('/maps.json'),
    getJson<Translations>('/es.json').catch(
      () => ({ categories: {}, maps: {}, submaps: {}, areas: {}, names: {}, texts: {} }) as Translations,
    ),
  ]);
  return { markers, categories, maps, es };
}

export function createTranslator(es: Translations, lang: AppLang = 'es') {
  if (lang === 'en') {
    return {
      cat: (s: string) => s,
      map: (s: string) => s,
      submap: (s: string) => s,
      area: (s: string) => s,
      name: (s: string) => s,
      text: (html: string) => html.replace(/src="uploads\//g, 'src="/uploads/'),
    };
  }
  return {
    cat: (s: string) => (s === 'Other' ? (es.categories[s] ?? 'Otros') : (es.categories[s] ?? s)),
    map: (s: string) => es.maps[s] ?? s,
    submap: (s: string) => es.submaps[s] ?? s,
    area: (s: string) => es.areas[s] ?? s,
    name: (s: string) => es.names[s] ?? s,
    text: (html: string) => (es.texts[html] ?? html).replace(/src="uploads\//g, 'src="/uploads/'),
  };
}

export function applyDomTranslations(root: ParentNode, lang: AppLang) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as I18nKey | undefined;
    if (key) el.textContent = t(lang, key);
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder as I18nKey | undefined;
    if (key) el.placeholder = t(lang, key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle as I18nKey | undefined;
    if (key) el.setAttribute('title', t(lang, key));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria as I18nKey | undefined;
    if (key) el.setAttribute('aria-label', t(lang, key));
  });
}

const LS_KEY = 'zelda-notes.userState';
const LS_LEGACY = 'zelda-notes.collected';

function loadLocalUserState(): UserState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserState;
      return {
        manualCollected: parsed.manualCollected ?? [],
        ignored: parsed.ignored ?? [],
        manualArea: parsed.manualArea ?? null,
        manualAge: parsed.manualAge ?? null,
        hudStretchX: typeof parsed.hudStretchX === 'number' ? parsed.hudStretchX : null,
        overlayOnlyValue: Boolean(parsed.overlayOnlyValue),
        overlayRect: parsed.overlayRect ?? null,
        zoneTransforms: parsed.zoneTransforms ?? {},
      };
    }
    const legacy = localStorage.getItem(LS_LEGACY);
    if (legacy) {
      return { manualCollected: JSON.parse(legacy) as string[], ignored: [], manualArea: null, manualAge: null, hudStretchX: null, overlayOnlyValue: false, zoneTransforms: {} };
    }
  } catch { /* ignore */ }
  return { manualCollected: [], ignored: [], manualArea: null, manualAge: null, hudStretchX: null, overlayOnlyValue: false, zoneTransforms: {} };
}

function saveLocalUserState(state: UserState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function emptyProgress(): SaveProgress {
  return {
    found: false, ok: false, source: 'none', sceneSource: 'none', emulator: '', slot: '',
    mtimeMs: 0, collected: [], scene: null, parentScene: null, pos: null, errors: [],
  };
}

export function describeLocation(
  progress: SaveProgress,
  automatic: string | null,
  manual: string | null,
  lang: AppLang = 'es',
) {
  if (!automatic && manual) {
    const label = t(lang, 'locManual');
    return { label, detail: label };
  }
  if (!automatic && !progress.scene) return null;
  if (progress.sceneSource === 'memory') {
    const label = t(lang, 'locLive');
    return { label, detail: [label, progress.emulator].filter(Boolean).join(' · ') };
  }
  const label = t(lang, 'locSave');
  return { label, detail: [label, progress.slot].filter(Boolean).join(' · ') };
}

export async function initBackend(knownIds: string[]): Promise<{
  userState: UserState;
  overlayStatus: OverlayStatus;
}> {
  if (isTauri()) {
    const [userState, overlayStatus] = await Promise.all([
      invoke<UserState>('get_user_state'),
      invoke<OverlayStatus>('get_overlay_status'),
      invoke('register_known_ids', { ids: knownIds }),
    ]);
    return { userState, overlayStatus };
  }
  return {
    userState: loadLocalUserState(),
    overlayStatus: { visible: true, expanded: false, clickThrough: false, calibrating: false },
  };
}

export async function setMarkerStatus(id: string, status: 'done' | 'pending' | 'ignored'): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('set_marker_status', { id, status });
  }
  const u = loadLocalUserState();
  u.manualCollected = u.manualCollected.filter((x) => x !== id);
  u.ignored = u.ignored.filter((x) => x !== id);
  if (status === 'done') u.manualCollected.push(id);
  else if (status === 'ignored') u.ignored.push(id);
  saveLocalUserState(u);
  return u;
}

export async function setManualArea(area: string | null): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('set_manual_area', { area });
  }
  const u = loadLocalUserState();
  u.manualArea = area || null;
  saveLocalUserState(u);
  return u;
}

export async function setManualAge(age: LinkAge | null): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('set_manual_age', { age });
  }
  const u = loadLocalUserState();
  u.manualAge = age || null;
  saveLocalUserState(u);
  return u;
}

export async function setHudStretchX(stretchX: number | null): Promise<UserState> {
  const clean = stretchX != null && Number.isFinite(stretchX) ? Math.max(0.5, Math.min(2.5, stretchX)) : null;
  if (isTauri()) {
    return invoke<UserState>('set_hud_stretch_x', { stretchX: clean });
  }
  const u = loadLocalUserState();
  u.hudStretchX = clean;
  saveLocalUserState(u);
  return u;
}

export async function setOverlayOnlyValue(onlyValue: boolean): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('set_overlay_only_value', { onlyValue });
  }
  const u = loadLocalUserState();
  u.overlayOnlyValue = onlyValue;
  saveLocalUserState(u);
  return u;
}

export async function saveZoneTransform(area: string, transform: ZoneTransform): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('save_zone_transform', { area, transform });
  }
  const u = loadLocalUserState();
  u.zoneTransforms = { ...(u.zoneTransforms ?? {}), [area]: transform };
  saveLocalUserState(u);
  return u;
}

export async function resetZoneTransform(area: string): Promise<UserState> {
  if (isTauri()) {
    return invoke<UserState>('reset_zone_transform', { area });
  }
  const u = loadLocalUserState();
  const zt = { ...(u.zoneTransforms ?? {}) };
  delete zt[area];
  u.zoneTransforms = zt;
  saveLocalUserState(u);
  return u;
}

export async function saveOverlayRect(): Promise<void> {
  if (isTauri()) await invoke('save_overlay_rect');
}

export async function toggleOverlayVisible(): Promise<OverlayStatus> {
  return invoke<OverlayStatus>('toggle_overlay_visible');
}

export async function toggleOverlayExpanded(): Promise<OverlayStatus> {
  return invoke<OverlayStatus>('toggle_overlay_expanded');
}

export async function toggleOverlayClickThrough(): Promise<OverlayStatus> {
  return invoke<OverlayStatus>('toggle_overlay_click_through');
}

export async function toggleOverlayCalibrating(): Promise<OverlayStatus> {
  return invoke<OverlayStatus>('toggle_overlay_calibrating');
}

export async function subscribeUpdates(handlers: {
  onProgress?: (p: SaveProgress) => void;
  onUserState?: (u: UserState) => void;
  onOverlayStatus?: (o: OverlayStatus) => void;
}): Promise<() => void> {
  if (isTauri()) {
    let receivedProgress = false;
    const unsubs = await Promise.all([
      handlers.onProgress ? listen<SaveProgress>('save-progress', (e) => {
        receivedProgress = true;
        handlers.onProgress?.(e.payload);
      }) : Promise.resolve(() => {}),
      handlers.onUserState ? listen<UserState>('user-state-changed', (e) => handlers.onUserState!(e.payload)) : Promise.resolve(() => {}),
      handlers.onOverlayStatus ? listen<OverlayStatus>('overlay-status-changed', (e) => handlers.onOverlayStatus!(e.payload)) : Promise.resolve(() => {}),
    ]);
    if (handlers.onProgress && !receivedProgress) {
      const cached = await invoke<SaveProgress | null>('get_progress').catch(() => null);
      if (cached && !receivedProgress) handlers.onProgress(cached);
    }
    return () => unsubs.forEach((fn) => fn());
  }
  let lastKey = '';
  let reading = false;
  const poll = async () => {
    if (!handlers.onProgress || reading) return;
    reading = true;
    try {
      const result = await getJson<Partial<SaveProgress>>('/api/progress');
      const p = { ...emptyProgress(), ...result };
      const key = JSON.stringify(p);
      if (key !== lastKey) {
        lastKey = key;
        handlers.onProgress(p);
      }
    } catch { /* Static preview without a backend. */ }
    finally { reading = false; }
  };
  void poll();
  const timer = setInterval(poll, 2000);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY && handlers.onUserState) handlers.onUserState(loadLocalUserState());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    clearInterval(timer);
    window.removeEventListener('storage', onStorage);
  };
}

export async function broadcastLangPref(pref: LangPref): Promise<void> {
  if (isTauri()) {
    try {
      await emit('lang-changed', { pref });
    } catch {
      /* ignore if no other window is listening */
    }
  }
}

export async function subscribeLangChanged(onChange: (pref: LangPref) => void): Promise<() => void> {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANG_STORAGE_KEY) onChange(normalizeLangPref(e.newValue));
  };
  window.addEventListener('storage', onStorage);
  let unlisten: (() => void) | undefined;
  if (isTauri()) {
    unlisten = await listen<{ pref?: string }>('lang-changed', (e) => {
      const pref = normalizeLangPref(e.payload?.pref ?? getStoredLangPref());
      onChange(pref);
    });
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    unlisten?.();
  };
}
