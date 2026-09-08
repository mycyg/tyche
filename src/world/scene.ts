import type { Point, Rect } from './navigation';
import { CORRIDOR, ROOMS, SOURCE_SIZE, placeRect, type RoomKind } from './layout';

// Every surface has a source crop and a world destination. Only furniture
// silhouettes and low walls enter the foot-depth pass; floor stays underneath.
export interface Prop extends Rect { id: string; depth: number; source: Rect; polygon?: Point[]; silhouettes?: Point[][] }
interface SourceProp extends Rect { id: string; depth: number; polygon?: Point[]; silhouettes?: Point[][] }
const outline = (...pairs: [number, number][]): Point[] => pairs.map(([x, y]) => ({ x, y }));
// Disconnected bed/cabinet outlines leave every floor pixel underneath people.
// Coordinates are measured on the 768 × 512 source map, before room translation.
const BED_OUTLINES = [
  [outline([40,43],[68,43],[71,48],[71,100],[68,105],[41,105],[39,100],[39,51]), outline([72,45],[85,45],[85,66],[72,67])],
  [outline([203,43],[230,43],[234,49],[234,101],[231,105],[204,105],[201,101],[201,50]), outline([193,45],[201,45],[201,66],[193,66]), outline([235,45],[245,45],[245,66],[235,66])],
  [outline([40,119],[69,119],[71,123],[71,181],[68,187],[41,187],[39,181],[39,124]), outline([72,126],[85,126],[85,147],[72,148])],
  [outline([203,119],[231,119],[234,124],[234,181],[231,187],[204,187],[201,181],[201,125]), outline([235,126],[245,126],[245,147],[235,148])],
];
const ROOM_PROPS: Record<RoomKind, SourceProp[]> = {
  ward: [
    { id: 'left-top-bed', x: 35, y: 30, w: 52, h: 75, depth: 104, silhouettes: BED_OUTLINES[0] },
    { id: 'right-top-bed', x: 192, y: 30, w: 55, h: 75, depth: 104, silhouettes: BED_OUTLINES[1] },
    { id: 'left-bottom-bed', x: 34, y: 117, w: 53, h: 72, depth: 187, silhouettes: BED_OUTLINES[2] },
    { id: 'right-bottom-bed', x: 192, y: 117, w: 55, h: 72, depth: 187, silhouettes: BED_OUTLINES[3] },
    { id: 'left-top-footboard', x: 39, y: 89, w: 32, h: 16, depth: 106,
      polygon: outline([40,90],[70,90],[71,100],[68,105],[41,105],[39,100]) },
    { id: 'right-top-footboard', x: 201, y: 89, w: 33, h: 16, depth: 106,
      polygon: outline([202,90],[233,90],[234,101],[231,105],[204,105],[201,101]) },
    { id: 'left-bottom-footboard', x: 39, y: 169, w: 32, h: 18, depth: 189,
      polygon: outline([40,170],[70,170],[71,181],[68,187],[41,187],[39,181]) },
    { id: 'right-bottom-footboard', x: 201, y: 169, w: 33, h: 18, depth: 189,
      polygon: outline([202,170],[233,170],[234,181],[231,187],[204,187],[201,181]) },
    { id: 'sill-left', x: 10, y: 177, w: 90, h: 22, depth: 198, polygon: outline([10,177],[35,177],[35,189],[100,189],[100,198],[10,198]) },
    { id: 'sill-right', x: 169, y: 177, w: 87, h: 22, depth: 198, polygon: outline([234,177],[254,177],[254,198],[169,198],[169,189],[234,189]) },
  ],
  station: [
    { id: 'counter', x: 312, y: 106, w: 128, h: 65, depth: 169, polygon: [
      { x: 313, y: 107 }, { x: 336, y: 107 }, { x: 336, y: 131 }, { x: 419, y: 131 },
      { x: 419, y: 106 }, { x: 438, y: 106 }, { x: 438, y: 167 }, { x: 331, y: 169 }, { x: 313, y: 157 },
    ] },
    { id: 'sill-left', x: 266, y: 178, w: 56, h: 20, depth: 198, polygon: outline([266,178],[277,178],[277,189],[322,189],[322,198],[266,198]) },
    { id: 'sill-right', x: 447, y: 176, w: 65, h: 23, depth: 198, polygon: outline([486,176],[497,176],[497,189],[512,189],[512,198],[447,198],[447,189],[486,189]) },
  ],
  director: [
    { id: 'bookcase', x: 516, y: 23, w: 51, h: 59, depth: 79, polygon: outline([516,23],[564,23],[565,26],[565,77],[562,79],[516,79]) },
    { id: 'desk', x: 591, y: 55, w: 80, h: 60, depth: 113, silhouettes: [
      outline([592,75],[670,75],[670,112],[650,112],[650,107],[614,107],[614,112],[593,112]),
      outline([624,55],[637,55],[640,59],[640,75],[621,75],[621,59]),
      outline([602,64],[608,64],[611,67],[609,73],[607,74],[607,84],[601,84],[601,81],[604,79],[604,74],[600,73],[600,67]),
    ] },
    { id: 'cabinet', x: 712, y: 30, w: 36, h: 50, depth: 79, polygon: outline([713,31],[745,31],[745,79],[713,79]) },
    { id: 'sill-left', x: 512, y: 177, w: 25, h: 22, depth: 198, polygon: outline([512,177],[523,177],[523,189],[537,189],[537,198],[512,198]) },
    { id: 'sill-right', x: 676, y: 177, w: 83, h: 22, depth: 198, polygon: outline([702,177],[759,177],[759,198],[676,198],[676,189],[702,189]) },
  ],
  er: [
    { id: 'left-bed', x: 46, y: 337, w: 45, h: 75, depth: 410, polygon: outline([57,337],[81,337],[87,347],[90,386],[87,406],[83,411],[57,411],[54,406],[49,398],[47,384],[47,354],[53,345]) },
    { id: 'right-bed', x: 177, y: 337, w: 43, h: 75, depth: 410, polygon: outline([183,337],[205,337],[211,343],[217,355],[219,387],[216,405],[210,411],[182,411],[179,405],[177,393],[177,350]) },
    { id: 'left-cart', x: 18, y: 433, w: 54, h: 49, depth: 478, silhouettes: [
      outline([21,439],[25,439],[25,436],[29,436],[30,442],[42,442],[42,434],[46,434],[48,442],[49,442],[50,436],[54,436],[55,442],[58,442],[58,478],[21,478]),
      outline([61,449],[69,449],[71,451],[71,476],[61,476]),
    ] },
    { id: 'right-cart', x: 221, y: 431, w: 25, h: 48, depth: 479, polygon: outline([234,431],[239,431],[240,438],[244,438],[245,473],[242,479],[224,479],[222,474],[222,438],[233,438]) },
    { id: 'monitor-cart', x: 226, y: 307, w: 20, h: 52, depth: 350, polygon: outline([231,308],[234,308],[235,322],[243,322],[244,345],[242,349],[228,349],[227,345],[227,322],[231,322]) },
    { id: 'sill-left', x: 8, y: 483, w: 92, h: 20, depth: 502, polygon: outline([10,485],[100,485],[100,502],[10,502]) },
    { id: 'sill-right', x: 170, y: 483, w: 85, h: 20, depth: 502, polygon: outline([170,485],[254,485],[254,502],[170,502]) },
  ],
  archive: [
    { id: 'side-shelf', x: 274, y: 299, w: 39, h: 143, depth: 441, polygon: outline([276,302],[310,302],[310,402],[292,402],[292,441],[275,441],[275,402],[276,402]) },
    { id: 'desk', x: 279, y: 435, w: 198, h: 52, depth: 486, silhouettes: [
      outline([281,446],[476,446],[476,486],[410,486],[409,483],[364,483],[364,475],[286,475],[286,486],[281,486]),
      outline([337,437],[340,435],[351,435],[354,438],[354,446],[337,446]),
      outline([296,439],[301,439],[303,442],[301,447],[301,457],[296,458],[294,456],[298,452],[298,447],[294,445],[294,442]),
    ] },
    { id: 'cabinet', x: 437, y: 300, w: 32, h: 49, depth: 349, polygon: outline([438,302],[461,302],[462,347],[459,349],[438,349]) },
    { id: 'sill', x: 264, y: 483, w: 234, h: 13, depth: 496, polygon: outline([266,487],[498,487],[498,496],[266,496]) },
  ],
  duty: [
    { id: 'coffee-table', x: 519, y: 401, w: 25, h: 73, depth: 473, polygon: outline([519,401],[535,401],[536,422],[542,422],[542,471],[539,473],[537,470],[523,470],[522,473],[519,472]) },
    { id: 'table', x: 588, y: 385, w: 51, h: 49, depth: 430, polygon: outline([591,387],[634,387],[634,423],[631,427],[591,427],[589,423],[589,389]) },
    { id: 'back-chairs', x: 593, y: 378, w: 36, h: 13, depth: 388, silhouettes: [outline([596,382],[599,379],[606,379],[609,382],[609,388],[595,388]),outline([617,382],[620,379],[626,380],[628,383],[628,388],[615,388])] },
    { id: 'side-chairs', x: 571, y: 395, w: 84, h: 24, depth: 417, silhouettes: [outline([573,399],[575,396],[581,396],[585,399],[585,405],[583,417],[580,417],[580,409],[576,409],[575,417],[572,416],[573,407],[571,403]),outline([640,399],[643,396],[648,396],[652,399],[653,406],[651,416],[649,417],[648,409],[644,409],[643,417],[641,417],[640,408])] },
    { id: 'front-chairs', x: 593, y: 422, w: 39, h: 22, depth: 444, silhouettes: [outline([596,426],[600,424],[606,424],[609,427],[609,434],[607,443],[604,443],[604,437],[600,437],[599,443],[596,442],[595,434]),outline([618,426],[622,424],[628,425],[631,428],[631,434],[629,443],[626,443],[626,437],[621,437],[620,443],[618,443],[617,435])] },
    { id: 'sofa', x: 688, y: 402, w: 57, h: 42, depth: 441, polygon: outline([694,403],[738,403],[741,407],[744,414],[744,440],[690,440],[690,414],[691,410],[691,405]) },
    { id: 'side-table', x: 726, y: 438, w: 24, h: 34, depth: 470, polygon: outline([736,439],[741,441],[744,440],[746,446],[749,447],[749,468],[746,470],[745,467],[729,467],[728,470],[727,469],[727,447],[735,447],[733,442]) },
    { id: 'lockers', x: 693, y: 312, w: 46, h: 54, depth: 365, polygon: outline([695,314],[735,314],[736,363],[734,365],[695,364]) },
    { id: 'sill-left', x: 509, y: 483, w: 63, h: 13, depth: 496, polygon: outline([510,486],[572,486],[572,496],[510,496]) },
    { id: 'sill-right', x: 639, y: 483, w: 117, h: 13, depth: 496, polygon: outline([660,486],[756,486],[756,496],[660,496]) },
  ],
};
const corridorProps: SourceProp[] = [
  { id: 'water-dispenser', x: 14, y: 211, w: 23, h: 51, depth: 260, polygon: outline([21,212],[27,212],[31,216],[31,231],[34,233],[33,259],[16,259],[16,233],[19,231],[18,217]) },
  { id: 'telephone', x: 42, y: 228, w: 19, h: 27, depth: 255, polygon: outline([44,229],[58,229],[60,231],[60,247],[55,248],[54,253],[46,254],[45,248],[43,247]) },
];
export const PROPS: Prop[] = [
  ...ROOMS.flatMap(room => ROOM_PROPS[room.kind].map(prop => {
    // A crop never borrows pixels from the neighbouring source room.
    const x = Math.max(prop.x, room.source.x), right = Math.min(prop.x + prop.w, room.source.x + room.source.w);
    const source = { x, y: prop.y, w: right - x, h: prop.h };
    const dx = room.target.x - room.source.x, dy = room.target.y - room.source.y;
    return { ...placeRect(source, room), id: `${room.id}-${prop.id}`, source, depth: prop.depth + dy,
      polygon: prop.polygon?.map(p => ({ x: p.x + dx, y: p.y + dy })),
      silhouettes: prop.silhouettes?.map(shape => shape.map(p => ({ x: p.x + dx, y: p.y + dy }))) };
  })),
  ...corridorProps.map(prop => ({ ...prop, source: { x: prop.x, y: prop.y, w: prop.w, h: prop.h } })),
];
const wardBeds = [
  { x: 28, y: 42, width: 54, height: 54, target: { x: 96, y: 104 }, depth: 105 },
  { x: 190.5, y: 42, width: 54, height: 54, target: { x: 179, y: 104 }, depth: 105 },
  { x: 26, y: 119, width: 58, height: 58, target: { x: 96, y: 166 }, depth: 188 },
  { x: 188.5, y: 119, width: 58, height: 58, target: { x: 179, y: 166 }, depth: 188 },
];
export const BED_PLACES = ROOMS.filter(room => room.kind === 'ward').flatMap((room, index) =>
  wardBeds.map((bed, slot) => ({ ...bed, bed: 5 + index * 4 + slot, x: bed.x + room.target.x,
    target: { x: bed.target.x + room.target.x, y: bed.target.y } })));

// Only a documented corridor admission creates this bed. It is not included
// in the twelve routine bed slots, and absent furniture has no collision.
export const CORRIDOR_BED_PLACE = {bed:17,x:993,y:217,width:54,height:54,depth:281,target:{x:1064,y:268}};
export const CORRIDOR_BED_OBSTACLE = {x:1004,y:222,w:43,h:55};
export const CORRIDOR_BED_PROP:Prop = {id:'corridor-admission-bed',x:1000,y:205,w:52,h:75,depth:280,
  source:{x:35,y:30,w:52,h:75},
  silhouettes: BED_OUTLINES[0].slice(0, 1).map(shape => shape.map(p => ({ x: p.x + 965, y: p.y + 175 })))};
export const CORRIDOR_BED_FOOT_PROP:Prop = {id:'corridor-bed-footboard',x:1004,y:264,w:32,h:16,depth:282,
  source:{x:39,y:89,w:32,h:16},
  polygon:outline([1005,265],[1035,265],[1036,275],[1033,280],[1006,280],[1004,275])};

// Observation and emergency beds are not counted as inpatient capacity.
export const TEMPORARY_BEDS = ROOMS.filter(room => room.kind === 'er').flatMap(room =>
  [40.5, 171].map((x, slot) => ({ room: room.id, x: x + room.target.x, y: 342,
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
  const shapes = prop.silhouettes ?? (prop.polygon ? [prop.polygon] : undefined);
  if (shapes) {
    for (const shape of shapes) {
      shape.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
    }
  } else ctx.rect(prop.x, prop.y, prop.w, prop.h);
  ctx.clip();
  drawCrop(ctx, map, prop.source, prop);
  ctx.restore();
}
