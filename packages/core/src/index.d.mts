export interface NormalizedMarker {
  id: string;
  name: string;
  cat: string;
  map: string;
  submap: string | null;
  x: number;
  y: number;
  area: string | null;
  region: string | null;
  gameId: string | null;
  gameRecord: string | null;
  text: string;
  hasImage: boolean;
}

export interface AreaBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ZoneTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export const VALUE_CATEGORIES: Set<string>;
export const SCENE_TO_AREA: Record<string, string>;
export const DEFAULT_ZONE_TRANSFORM: ZoneTransform;

export function isValueMarker(m: { cat: string }): boolean;
export function sceneToArea(scene: string | null | undefined): string | null;
export function resolveProgressArea(progress: { scene?: string | null; parentScene?: string | null } | null | undefined): string | null;
export function resolveMarkerArea(m: Pick<NormalizedMarker, 'area' | 'map' | 'x' | 'y'> | null | undefined): string | null;
export function computeAreaBounds(markers: Pick<NormalizedMarker, 'area' | 'x' | 'y'>[], area: string): AreaBounds | null;
export function projectMarker(m: Pick<NormalizedMarker, 'x' | 'y'>, bounds: AreaBounds, transform?: ZoneTransform): { x: number; y: number };
export function parseGameData(raw: unknown): Record<string, any>;
export function sanitizeHtml(html: string | null | undefined): string;
export function stripHtml(html: string | null | undefined): string;
export function normalizeMarker(m: Record<string, any>): NormalizedMarker;
export function normalizeMarkers(list: Record<string, any>[]): NormalizedMarker[];
export function countByArea(
  markers: Pick<NormalizedMarker, 'id' | 'cat' | 'area' | 'gameId'>[],
  collected: Set<string>,
  isCounted?: (m: any) => boolean,
): Record<string, { done: number; total: number }>;

export interface CategoryLike {
  id: string;
  name: string;
  marker_category_type_id?: string;
  custom_style?: string | boolean;
  customStyle?: boolean;
  shape?: string | null;
  menu_section?: string | null;
  menu_order?: string | number | null;
}

export type PoiStyle =
  | 'travel'
  | 'heart'
  | 'relic'
  | 'korok'
  | 'memory'
  | 'fairy-thought'
  | 'song'
  | 'silver'
  | 'location'
  | 'interest'
  | 'enemy'
  | 'treasure';

export const POI_SECTION_ORDER: string[];
export function getPoiStyle(category: CategoryLike | undefined): PoiStyle;
export function groupCategoriesForMenu<T extends CategoryLike>(
  categories: T[],
  presentCatIds?: Set<string>,
): { title: string; categories: T[] }[];
export function toggleCategoryFocus(visibleIds: Set<string>, allIds: string[], targetId: string): Set<string>;
export function toggleSectionFocus(visibleIds: Set<string>, allIds: string[], sectionIds: string[]): Set<string>;
export function getMapBounds(
  submap: { bounds?: [[number, number], [number, number]] } | undefined,
  mapMarkers?: Pick<NormalizedMarker, 'x' | 'y'>[],
  margin?: number,
): { fit: [[number, number], [number, number]]; max: [[number, number], [number, number]] };
export function computeFitZoom(
  viewport: { width: number; height: number },
  bounds: [[number, number], [number, number]],
  maxZoom?: number,
  margin?: number,
): number;
export function computeZoomRange(
  viewport: { width: number; height: number },
  bounds: [[number, number], [number, number]],
  maxZoom?: number,
  margin?: number,
): { min: number; initial: number };

export type LinkAge = 'child' | 'adult';

export function resolveMarkerAge(m: Pick<NormalizedMarker, 'map' | 'submap' | 'text'>): LinkAge | null;
export function filterMarkersByAge<T extends Pick<NormalizedMarker, 'map' | 'submap' | 'text'>>(
  markers: T[],
  age: LinkAge | null | undefined,
): T[];
export function getAreaOverlayBounds(
  markers: Pick<NormalizedMarker, 'area' | 'map' | 'submap' | 'text' | 'x' | 'y'>[],
  maps: any[],
  area: string,
  age?: LinkAge | null,
): AreaBounds | null;
export function resolveZoneTransformKey(area: string, age: LinkAge | null | undefined, maps: any[]): string;
export function computeDefaultZoneTransform(
  bounds: AreaBounds | null,
  viewport?: { width: number; height: number },
  fill?: number,
  stretchX?: number,
): ZoneTransform;
export function computeTransformStretchX(
  tf: ZoneTransform,
  bounds: AreaBounds | null,
  viewport?: { width: number; height: number },
): number;
export function resizeZoneTransformEdge(
  startTf: ZoneTransform,
  handle: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se',
  dxNorm: number,
  dyNorm: number,
  keepAspect?: boolean,
): ZoneTransform;
export function scaleZoneTransform(
  tf: ZoneTransform,
  factorX: number,
  factorY?: number,
  ax?: number,
  ay?: number,
  lockAspect?: boolean,
): ZoneTransform;
export function getAreaOverlayTiles(
  bounds: AreaBounds,
  z?: number,
): {
  z: number;
  tileSpan: number;
  tiles: { tx: number; ty: number; leftPct: number; topPct: number; widthPct: number; heightPct: number }[];
};
