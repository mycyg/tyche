export interface LayoutRect { x: number; y: number; w: number; h: number }
export type RoomKind = 'ward' | 'station' | 'director' | 'er' | 'archive' | 'duty';
export interface RoomPlacement {
  id: string;
  name: string;
  kind: RoomKind;
  source: LayoutRect;
  target: LayoutRect;
  entrance: { x: number; y: number };
  interaction: { x: number; y: number };
}

export const SOURCE_SIZE = { width: 768, height: 512 };
export const CORRIDOR = { x: 0, y: 199, w: 1536, h: 94 };
const sourceColumn: Record<RoomKind, number> = { ward: 0, station: 256, director: 512, er: 0, archive: 256, duty: 512 };
const entranceX: Record<RoomKind, number> = { ward: 132, station: 128, director: 92, er: 140, archive: 120, duty: 96 };
const interaction: Record<RoomKind, { x: number; y: number }> = {
  ward: { x: 132, y: 148 }, station: { x: 120, y: 180 }, director: { x: 120, y: 132 },
  er: { x: 132, y: 428 }, archive: { x: 120, y: 436 }, duty: { x: 100, y: 460 },
};
function room(id: string, name: string, kind: RoomKind, column: number, bottom = false): RoomPlacement {
  const y = bottom ? 293 : 0, h = bottom ? 219 : 199;
  return { id, name, kind, source: { x: sourceColumn[kind], y, w: 256, h },
    target: { x: column * 256, y, w: 256, h },
    entrance: { x: column * 256 + entranceX[kind], y: bottom ? 316 : 192 },
    interaction: { x: column * 256 + interaction[kind].x, y: interaction[kind].y } };
}

export const ROOMS: RoomPlacement[] = [
  room('ward-a', 'A病房', 'ward', 0), room('station', '护士站', 'station', 1),
  room('director', '主任办公室', 'director', 2), room('ward-b', 'B病房', 'ward', 3),
  room('ward-c', 'C病房', 'ward', 4), room('pharmacy', '药房', 'station', 5),
  room('er', '急救室', 'er', 0, true), room('archive', '档案室', 'archive', 1, true),
  room('duty', '值班室', 'duty', 2, true), room('family', '家属谈话室', 'duty', 3, true),
  room('research', '科研室', 'archive', 4, true), room('observation', '留观室', 'er', 5, true),
];

// Source-map coordinates: the same translation places paint, feet and collisions.
export const ROOM_FLOORS: Record<RoomKind, LayoutRect[]> = {
  ward: [{ x: 18, y: 60, w: 228, h: 126 }, { x: 103, y: 180, w: 63, h: 24 }],
  station: [{ x: 275, y: 70, w: 213, h: 116 }, { x: 324, y: 182, w: 120, h: 22 }],
  director: [{ x: 519, y: 69, w: 230, h: 107 }, { x: 537, y: 171, w: 138, h: 33 }],
  er: [{ x: 19, y: 337, w: 226, h: 145 }, { x: 107, y: 283, w: 69, h: 58 }],
  archive: [{ x: 275, y: 337, w: 211, h: 145 }, { x: 318, y: 283, w: 117, h: 58 }],
  duty: [{ x: 519, y: 339, w: 230, h: 144 }, { x: 568, y: 283, w: 83, h: 62 }],
};
export const ROOM_OBSTACLES: Record<RoomKind, LayoutRect[]> = {
  ward: [
    { x: 39, y: 48, w: 43, h: 55 }, { x: 194, y: 48, w: 45, h: 55 },
    { x: 39, y: 124, w: 43, h: 62 }, { x: 194, y: 124, w: 45, h: 62 },
    { x: 70, y: 47, w: 15, h: 24 }, { x: 192, y: 47, w: 15, h: 24 },
  ],
  station: [{ x: 314, y: 130, w: 123, h: 38 }, { x: 314, y: 109, w: 22, h: 23 }, { x: 418, y: 109, w: 20, h: 23 }],
  director: [{ x: 519, y: 52, w: 46, h: 30 }, { x: 592, y: 73, w: 78, h: 41 }, { x: 713, y: 48, w: 34, h: 31 }],
  er: [{ x: 44, y: 342, w: 48, h: 69 }, { x: 178, y: 342, w: 38, h: 69 },
    { x: 22, y: 437, w: 47, h: 42 }, { x: 223, y: 435, w: 20, h: 44 }, { x: 227, y: 329, w: 17, h: 30 }],
  archive: [{ x: 276, y: 315, w: 35, h: 117 }, { x: 280, y: 444, w: 196, h: 39 }, { x: 437, y: 319, w: 31, h: 27 }],
  duty: [{ x: 520, y: 403, w: 25, h: 71 }, { x: 575, y: 389, w: 76, h: 48 },
    { x: 590, y: 379, w: 43, h: 61 }, { x: 690, y: 405, w: 54, h: 35 },
    { x: 727, y: 447, w: 21, h: 20 }, { x: 695, y: 327, w: 43, h: 37 }],
};
export function placeRect(rect: LayoutRect, room: RoomPlacement): LayoutRect {
  return { ...rect, x: rect.x + room.target.x - room.source.x, y: rect.y + room.target.y - room.source.y };
}
