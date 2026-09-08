import { distance, move, roomName, walkable, type Point, type Rect } from './navigation';

/** Feet occupy space; the tall sprites may naturally occlude each other in
 * depth, but two people must never share the same patch of floor. */
export const PERSON_SPACE = 18;
export function clearOfPeople(at: Point, people: readonly Point[], space = PERSON_SPACE): boolean {
  return people.every(p => distance(at, p) >= space - .01);
}

export function parkingPlace(stop: Point, people: readonly Point[], extra: readonly Rect[] = []): Point | null {
  if (walkable(stop, extra) && clearOfPeople(stop, people)) return { x: stop.x, y: stop.y };
  for (const radius of [20, 28, 36, 44]) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const at = { x: stop.x + dx * radius, y: stop.y + dy * radius };
    if (roomName(at) === roomName(stop) && walkable(at, extra) && clearOfPeople(at, people)) return at;
  }
  return null;
}

/** Continuous local steering with a consistent right-hand passing preference.
 * It never changes a path endpoint or places a person on the other side of an
 * obstacle. Even an initial overlap may only be resolved by moving away. */
export function moveThroughCrowd(from: Point, intended: Point, people: readonly Point[], extra: readonly Rect[] = []): Point {
  const safe = (at: Point) => walkable(at, extra) && people.every(p => {
    const before = distance(from, p), after = distance(at, p);
    return after >= PERSON_SPACE - .01 || before < PERSON_SPACE && after > before + .001;
  });
  if (safe(intended)) return intended;
  const dx = intended.x - from.x, dy = intended.y - from.y;
  for (const angle of [Math.PI / 3, Math.PI / 2, -Math.PI / 3, -Math.PI / 2, 2 * Math.PI / 3, -2 * Math.PI / 3]) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const at = move(from, dx * cos - dy * sin, dx * sin + dy * cos, extra);
    if (distance(from, at) > .01 && safe(at)) return at;
  }
  return { x: from.x, y: from.y };
}

/** Used only when a local route is stuck; ordinary moving crowds are handled
 * by steering, so path searches remain bounded. */
export function personObstacles(people: readonly Point[], from: Point): Rect[] {
  return people.filter(p => distance(p, from) >= PERSON_SPACE - .1)
    .map(p => ({ x: p.x - 12, y: p.y - 12, w: 24, h: 24 }));
}
