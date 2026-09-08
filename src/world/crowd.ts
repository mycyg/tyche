import { distance, roomName, walkable, type Point, type Rect } from './navigation';

/** Preferred spacing for stationary poses, never a movement collision radius.
 * The doctor and all NPCs can pass through one another. */
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
