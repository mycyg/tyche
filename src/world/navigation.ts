import { CORRIDOR, ROOMS, ROOM_FLOORS, ROOM_OBSTACLES, placeRect } from './layout';
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export const WORLD = { width: 1536, height: 512, speed: 105, radius: 5, cell: 8 };
export const SPAWN = { x: 406, y: 273, facing: 0 };
// Coordinates describe the floor, not the visible upper faces of walls.
export const FLOORS: Rect[] = [
  { ...CORRIDOR, x: 12, w: CORRIDOR.w - 24 },
  ...ROOMS.flatMap(room => ROOM_FLOORS[room.kind].map(rect => placeRect(rect, room))),
];
export const OBSTACLES: Rect[] = [
  ...ROOMS.flatMap(room => ROOM_OBSTACLES[room.kind].map(rect => placeRect(rect, room))),
  { x: 19, y: 212, w: 20, h: 45 }, { x: 42, y: 228, w: 19, h: 26 },
];
const inside = (p: Point, r: Rect, pad = 0) => p.x >= r.x - pad && p.y >= r.y - pad && p.x <= r.x + r.w + pad && p.y <= r.y + r.h + pad;
export function walkable(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) &&
    FLOORS.some(r => inside(p, r)) && !OBSTACLES.some(r => inside(p, r, WORLD.radius));
}
export function move(p: Point, dx: number, dy: number): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  let next = { ...p };
  for (let i = 0; i < steps; i++) {
    if (walkable({ x: next.x + dx / steps, y: next.y })) next.x += dx / steps;
    if (walkable({ x: next.x, y: next.y + dy / steps })) next.y += dy / steps;
  }
  return next;
}
export function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function nearestFloor(p: Point, limit = 64): Point | null {
  if (walkable(p)) return p;
  let result: Point | null = null, best = limit;
  for (let y = 4; y < WORLD.height; y += WORLD.cell) for (let x = 4; x < WORLD.width; x += WORLD.cell) {
    const test = { x, y }, d = distance(p, test);
    if (d < best && walkable(test)) { result = test; best = d; }
  }
  return result;
}
export function findPath(from: Point, to: Point): Point[] {
  const size = WORLD.cell, cols = WORLD.width / size;
  const cell = (p: Point) => Math.floor(p.y / size) * cols + Math.floor(p.x / size);
  const point = (i: number) => ({ x: i % cols * size + size / 2, y: Math.floor(i / cols) * size + size / 2 });
  const a = nearestFloor(from), b = nearestFloor(to);
  if (!a || !b) return [];
  const start = cell(a), goal = cell(b), queue = [start], previous = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (cur === goal) break;
    const cp = point(cur);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: cp.x + dx * size, y: cp.y + dy * size }, key = cell(next);
      if (!previous.has(key) && walkable(next) && walkable({ x: (cp.x + next.x) / 2, y: (cp.y + next.y) / 2 })) {
        previous.set(key, cur); queue.push(key);
      }
    }
  }
  if (!previous.has(goal)) return [];
  const path: Point[] = [b];
  for (let i = goal; i !== start; i = previous.get(i)!) path.push(point(i));
  return path.reverse();
}
export function roomName(p: Point): string {
  const room = ROOMS.find(r => p.x >= r.target.x && p.x < r.target.x + r.target.w &&
    p.y >= r.target.y && p.y < r.target.y + r.target.h);
  if (room) return room.name;
  return "南屏医院 · 住院部";
}
