import type { Point, Rect } from './navigation';
import { CORRIDOR, ROOMS, SOURCE_SIZE, placeRect, type RoomKind } from './layout';

// Every surface has a source crop and a world destination. Only furniture
// silhouettes and low walls enter the foot-depth pass; floor stays underneath.
export interface Prop extends Rect { id: string; depth: number; source: Rect; polygon?: Point[] }
interface SourceProp extends Rect { id: string; depth: number; polygon?: Point[] }
const ROOM_PROPS: Record<RoomKind, SourceProp[]> = {
  ward: [
    { id: 'left-top-bed', x: 35, y: 30, w: 52, h: 75, depth: 104 },
    { id: 'right-top-bed', x: 192, y: 30, w: 55, h: 75, depth: 104 },
    { id: 'left-bottom-bed', x: 34, y: 117, w: 53, h: 72, depth: 187 },
    { id: 'right-bottom-bed', x: 192, y: 117, w: 55, h: 72, depth: 187 },
    { id: 'sill-left', x: 10, y: 177, w: 90, h: 22, depth: 198 },
    { id: 'sill-right', x: 169, y: 177, w: 87, h: 22, depth: 198 },
  ],
  station: [
    { id: 'counter', x: 312, y: 106, w: 128, h: 65, depth: 169, polygon: [
      { x: 313, y: 107 }, { x: 336, y: 107 }, { x: 336, y: 131 }, { x: 419, y: 131 },
      { x: 419, y: 106 }, { x: 438, y: 106 }, { x: 438, y: 167 }, { x: 331, y: 169 }, { x: 313, y: 157 },
    ] },
    { id: 'sill-left', x: 266, y: 178, w: 56, h: 20, depth: 198 },
    { id: 'sill-right', x: 447, y: 176, w: 65, h: 23, depth: 198 },
  ],
  director: [
    { id: 'bookcase', x: 516, y: 23, w: 51, h: 59, depth: 82 },
    { id: 'desk', x: 591, y: 66, w: 80, h: 49, depth: 113 },
    { id: 'cabinet', x: 712, y: 30, w: 36, h: 50, depth: 80 },
    { id: 'sill-left', x: 512, y: 177, w: 25, h: 22, depth: 198 },
    { id: 'sill-right', x: 676, y: 177, w: 83, h: 22, depth: 198 },
  ],
  er: [
    { id: 'left-bed', x: 46, y: 337, w: 42, h: 75, depth: 410 },
    { id: 'right-bed', x: 177, y: 337, w: 40, h: 75, depth: 410 },
    { id: 'left-cart', x: 18, y: 433, w: 48, h: 49, depth: 478 },
    { id: 'right-cart', x: 221, y: 431, w: 25, h: 45, depth: 473 },
    { id: 'monitor-cart', x: 226, y: 315, w: 20, h: 44, depth: 359 },
    { id: 'sill-left', x: 8, y: 483, w: 92, h: 20, depth: 502 },
    { id: 'sill-right', x: 170, y: 483, w: 85, h: 20, depth: 502 },
  ],
  archive: [
    { id: 'side-shelf', x: 274, y: 299, w: 39, h: 133, depth: 430 },
    { id: 'desk', x: 279, y: 443, w: 198, h: 44, depth: 484 },
    { id: 'cabinet', x: 437, y: 300, w: 32, h: 49, depth: 347 },
    { id: 'sill', x: 264, y: 483, w: 234, h: 13, depth: 496 },
  ],
  duty: [
    { id: 'coffee-table', x: 519, y: 401, w: 25, h: 73, depth: 473 },
    { id: 'table', x: 588, y: 385, w: 51, h: 49, depth: 430 },
    { id: 'sofa', x: 688, y: 402, w: 57, h: 42, depth: 441 },
    { id: 'side-table', x: 726, y: 443, w: 24, h: 29, depth: 470 },
    { id: 'lockers', x: 693, y: 312, w: 46, h: 54, depth: 365 },
    { id: 'sill-left', x: 509, y: 483, w: 63, h: 13, depth: 496 },
    { id: 'sill-right', x: 639, y: 483, w: 117, h: 13, depth: 496 },
  ],
};
const corridorProps: SourceProp[] = [
  { id: 'water-dispenser', x: 14, y: 211, w: 23, h: 51, depth: 260 },
  { id: 'telephone', x: 42, y: 228, w: 19, h: 27, depth: 255 },
];
export const PROPS: Prop[] = [
  ...ROOMS.flatMap(room => ROOM_PROPS[room.kind].map(prop => {
    // A crop never borrows pixels from the neighbouring source room.
    const x = Math.max(prop.x, room.source.x), right = Math.min(prop.x + prop.w, room.source.x + room.source.w);
    const source = { x, y: prop.y, w: right - x, h: prop.h };
    const dx = room.target.x - room.source.x, dy = room.target.y - room.source.y;
    return { ...placeRect(source, room), id: `${room.id}-${prop.id}`, source, depth: prop.depth + dy,
      polygon: prop.polygon?.map(p => ({ x: p.x + dx, y: p.y + dy })) };
  })),
  ...corridorProps.map(prop => ({ ...prop, source: { x: prop.x, y: prop.y, w: prop.w, h: prop.h } })),
];
const wardBeds = [
  { x: 28, y: 33, width: 64, height: 64, target: { x: 96, y: 104 }, depth: 105 },
  { x: 185, y: 33, width: 64, height: 64, target: { x: 179, y: 104 }, depth: 105 },
  { x: 28, y: 120, width: 64, height: 64, target: { x: 96, y: 166 }, depth: 188 },
  { x: 185, y: 120, width: 64, height: 64, target: { x: 179, y: 166 }, depth: 188 },
];
export const BED_PLACES = ROOMS.filter(room => room.kind === 'ward').flatMap((room, index) =>
  wardBeds.map((bed, slot) => ({ ...bed, bed: 5 + index * 4 + slot, x: bed.x + room.target.x,
    target: { x: bed.target.x + room.target.x, y: bed.target.y } })));

// Only a documented corridor admission creates this bed. It is not included
// in the twelve routine bed slots, and absent furniture has no collision.
export const CORRIDOR_BED_PLACE = {bed:17,x:994,y:208,width:64,height:64,depth:281,target:{x:1064,y:268}};
export const CORRIDOR_BED_OBSTACLE = {x:1004,y:222,w:43,h:55};
export const CORRIDOR_BED_PROP:Prop = {id:'corridor-admission-bed',x:1000,y:205,w:52,h:75,depth:280,
  source:{x:35,y:30,w:52,h:75}};

// Observation and emergency beds are not counted as inpatient capacity.
export const TEMPORARY_BEDS = ROOMS.filter(room => room.kind === 'er').flatMap(room =>
  [39, 169].map((x, slot) => ({ room: room.id, x: x + room.target.x, y: 341,
    width: 56, height: 56, depth: 411,
    target: { x: room.target.x + (slot === 0 ? 109 : 158), y: 380 } })));

function drawCrop(ctx: CanvasRenderingContext2D, map: HTMLImageElement, source: Rect, target: Rect) {
  const sx = (map.naturalWidth || map.width) / SOURCE_SIZE.width;
  const sy = (map.naturalHeight || map.height) / SOURCE_SIZE.height;
  ctx.drawImage(map, source.x * sx, source.y * sy, source.w * sx, source.h * sy,
    target.x, target.y, target.w, target.h);
}

export function paintWorldMap(ctx: CanvasRenderingContext2D, map: HTMLImageElement) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const room of ROOMS) drawCrop(ctx, map, room.source, room.target);
  // Sample only empty corridor tiles. The source stairwell at x=720 is never
  // included, and partial edge tiles retain the same pixel scale.
  const tile = { x: 184, y: 208, w: 64, h: 64 };
  for (let y = CORRIDOR.y; y < CORRIDOR.y + CORRIDOR.h; y += tile.h) {
    for (let x = 0; x < CORRIDOR.w; x += tile.w) {
      const w = Math.min(tile.w, CORRIDOR.w - x), h = Math.min(tile.h, CORRIDOR.y + CORRIDOR.h - y);
      drawCrop(ctx, map, { ...tile, w, h }, { x, y, w, h });
    }
  }
  for (const prop of PROPS.filter(p => corridorProps.some(c => c.id === p.id))) paintProp(ctx, map, prop);
  ctx.restore();
}

export function paintProp(ctx: CanvasRenderingContext2D, map: HTMLImageElement, prop: Prop) {
  ctx.save();
  ctx.beginPath();
  if (prop.polygon) {
    prop.polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  } else ctx.rect(prop.x, prop.y, prop.w, prop.h);
  ctx.clip();
  drawCrop(ctx, map, prop.source, prop);
  ctx.restore();
}
