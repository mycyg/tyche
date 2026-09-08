/** Atlas geometry for the ward cast. Frame rectangles and foot anchors follow
 * `handoff-assets/art/manifest.json` and
 * `handoff-assets/dark-expansion/characters/manifest.json`. */
export type WalkAtlasId = 'staff-walk' | 'ward-life-walk' | 'patient-walk' | 'family-walk' | 'conflict-walk' | 'patient-motion' | 'staff-motion' | 'ward-haul' | 'companion-walk';
export type ActionAtlasId = 'ward-actions' | 'family-actions' | 'conflict-actions' | 'staff-actions' | 'ward-care';
export type AtlasId = WalkAtlasId | ActionAtlasId;

export interface AtlasSpec {
  id: AtlasId;
  file: string;
  rows: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  anchorX: number;
  anchorY: number;
  /** Loaded with the first frame, or fetched only when the cast needs it. */
  core: boolean;
  steps?: number;
}

const walk = (id: WalkAtlasId, rows: number, core: boolean): AtlasSpec =>
  ({ id, file: `${id}-atlas.webp`, rows, columns: 8, cellWidth: 128, cellHeight: 128, anchorX: 64, anchorY: 122, core });
const action = (id: ActionAtlasId, rows: number, core: boolean): AtlasSpec =>
  ({ id, file: `${id}-atlas.webp`, rows, columns: 8, cellWidth: 192, cellHeight: 128, anchorX: 96, anchorY: 122, core });

export const ATLASES: AtlasSpec[] = [
  walk('staff-walk', 5, true), walk('ward-life-walk', 6, true), walk('patient-walk', 6, false),
  walk('family-walk', 4, false), walk('conflict-walk', 3, false),
  action('ward-actions', 4, true), action('family-actions', 4, false), action('conflict-actions', 3, false),
  { ...walk('patient-motion', 28, false), columns: 16, steps: 4 },
  { ...walk('staff-motion', 5, true), columns: 16, steps: 4 },
  { ...walk('ward-haul', 2, true), columns: 16, steps: 4, cellWidth: 256, anchorX: 128 },
  walk('companion-walk', 3, false),
  action('staff-actions', 5, true),
  { ...action('ward-care', 2, true), cellWidth: 256, anchorX: 128 },
];
export const ATLAS_BY_ID = new Map(ATLASES.map(a => [a.id, a]));

/** Facing follows the existing world convention: 0 down, 1 left, 2 up, 3 right.
 * Walking sheets store the pairs as down, left, right, up. */
export const WALK_COLUMN = [0, 2, 6, 4] as const;
/** Height of a drawn character on the map, matched to the existing idle sheet. */
export const SPRITE_SCALE = 72 / 128;
export const WALK_FRAME_MS = 195;

export interface FrameRect { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

function frame(atlas: AtlasSpec, row: number, column: number, x: number, y: number): FrameRect {
  const dw = atlas.cellWidth * SPRITE_SCALE, dh = atlas.cellHeight * SPRITE_SCALE;
  return { sx: column * atlas.cellWidth, sy: row * atlas.cellHeight, sw: atlas.cellWidth, sh: atlas.cellHeight,
    dx: Math.round(x - atlas.anchorX * SPRITE_SCALE), dy: Math.round(y - atlas.anchorY * SPRITE_SCALE), dw, dh };
}

/** A walking pose. `step` alternates the two frames of one direction. */
export function walkFrame(id: WalkAtlasId, row: number, facing: number, step: number, x: number, y: number): FrameRect {
  const atlas = ATLAS_BY_ID.get(id)!;
  const steps = atlas.steps ?? 2;
  return frame(atlas, clampRow(atlas, row), WALK_COLUMN[((facing % 4) + 4) % 4] / 2 * steps + step % steps, x, y);
}
/** A working pose. `group` selects one of the four two-frame actions in a row. */
export function actionFrame(id: ActionAtlasId, row: number, group: number, step: number, x: number, y: number): FrameRect {
  const atlas = ATLAS_BY_ID.get(id)!;
  return frame(atlas, clampRow(atlas, row), Math.min(3, Math.max(0, group)) * 2 + (step & 1), x, y);
}
function clampRow(atlas: AtlasSpec, row: number) { return Math.min(atlas.rows - 1, Math.max(0, row)); }
