import { distance, findPath, followPath, nearestFloor, type Point, type Rect } from './navigation';
import type { NpcAction, NpcDefinition, NpcStop } from './npc-schedule';
import { WALK_FRAME_MS } from './npc-art';
import { clearOfPeople, moveThroughCrowd, parkingPlace, personObstacles } from './crowd';

export interface NpcActor {
  id: string;
  def: NpcDefinition;
  x: number; y: number;
  facing: number;
  state: 'walk' | 'dwell';
  /** Stop the character is heading to, or resting at. */
  index: number;
  /** Milliseconds left of the current dwell, or of the head start. */
  timer: number;
  path: Point[];
  /** Milliseconds accumulated for the two-frame animation. */
  clock: number;
  travel: number;
  reroute: boolean;
  paused: boolean;
  /** Set while the player is talking to this character. */
  held: boolean;
  hauling: boolean;
  target: Point;
  stalled: number;
  moving: boolean;
  transition?: { kind: 'rise' | 'lie'; elapsed: number; bedIndex: number };
}
export interface StepOptions {
  /** False for reduced motion: everyone stands on a stop, no walking frames. */
  motion: boolean;
  extra?: readonly Rect[];
  /** The character the player is talking to, and where the player stands. */
  hold?: { id: string; at: Point } | null;
  player?: Point;
  ready?: (actor: NpcActor) => boolean;
  freeze?: boolean;
}
const ACTION_FRAME_MS = 340;
/** Route searches are spread over frames so a crowded floor never stalls one. */
const PATHS_PER_STEP = 2;
export const BED_TRANSITION_MS = 1800;

export interface WardLife {
  actors: NpcActor[];
  byId: Map<string, NpcActor>;
  sync(definitions: NpcDefinition[]): void;
  step(dt: number, options: StepOptions): void;
}

const same = (a: NpcStop[], b: NpcStop[]) =>
  a.length === b.length && a.every((s, i) => s.x === b[i].x && s.y === b[i].y && s.dwell === b[i].dwell
    && s.bed === b[i].bed && s.facing === b[i].facing && s.haul === b[i].haul
    && s.action?.atlas === b[i].action?.atlas && s.action?.row === b[i].action?.row && s.action?.group === b[i].action?.group);

function place(stop: NpcStop, extra: readonly Rect[]): Point {
  return nearestFloor({ x: stop.x, y: stop.y }, 96, extra) ?? { x: stop.x, y: stop.y };
}

export function createWardLife(): WardLife {
  const actors: NpcActor[] = [];
  const byId = new Map<string, NpcActor>();
  const life: WardLife = {
    actors, byId,
    sync(definitions) {
      const wanted = new Set(definitions.map(d => d.id));
      for (let i = actors.length - 1; i >= 0; i--) if (!wanted.has(actors[i].id)) { byId.delete(actors[i].id); actors.splice(i, 1); }
      for (const def of definitions) {
        const existing = byId.get(def.id);
        if (!existing) {
          const start = def.stops[0];
          const at = start.bed ? start : parkingPlace(start, actors.filter(a => !restingInBed(a))) ?? start;
          const actor: NpcActor = { id: def.id, def, x: at.x, y: at.y, facing: start.facing ?? 0,
            state: 'dwell', index: 0, timer: start.dwell + def.offset, path: [], clock: def.offset, travel: 0, reroute: false, paused: false, held: false, hauling: false,
            target: { x: at.x, y: at.y }, stalled: 0, moving: false };
          actors.push(actor); byId.set(def.id, actor);
          continue;
        }
        const changed = !same(existing.def.stops, def.stops);
        existing.def = def;
        if (changed) {
          // A new shift or bed assignment changes the destination, not the
          // person's current position or their visible resting pose.
          existing.index = 0; existing.path.length = 0; existing.state = 'walk';
          existing.reroute = true; existing.timer = 0; existing.hauling = false;
          existing.transition = undefined;
        }
      }
    },
    step(dt, options) {
      const extra = options.extra ?? [];
      let searches = PATHS_PER_STEP;
      for (const actor of actors) {
        const stops = actor.def.stops;
        actor.moving = false;
        actor.held = options.hold?.id === actor.id;
        actor.paused = !options.motion || options.ready?.(actor) === false;
        if (actor.paused || dt <= 0) continue;
        if (options.freeze && !actor.held) continue;
        if (actor.held) {
          actor.clock += dt * 1000;
          const at = options.hold!.at;
          const dx = at.x - actor.x, dy = at.y - actor.y;
          actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
          continue;
        }
        const people = actors.filter(a => a !== actor && !restingInBed(a));
        const occupied: Point[] = options.player ? [...people, options.player] : people;
        if (actor.transition) {
          // A patient gets up only when the landing is clear. During the
          // authored sequence the feet stay reserved at the bedside.
          if (actor.transition.kind === 'rise' && !clearOfPeople(actor, occupied)) continue;
          actor.transition.elapsed += dt * 1000;
          if (actor.transition.elapsed < BED_TRANSITION_MS) continue;
          const kind = actor.transition.kind; actor.transition = undefined;
          if (kind === 'lie') { actor.state = 'dwell'; actor.timer = stops[actor.index].dwell; }
          continue;
        }
        if (actor.state === 'dwell') {
          actor.clock += dt * 1000;
          actor.timer -= dt * 1000;
          const stop = stops[actor.index];
          if (stop.facing !== undefined) actor.facing = stop.facing;
          if (actor.timer > 0) continue;
          const next = (actor.index + 1) % stops.length;
          if (searches <= 0) { actor.timer = 120; continue; }
          searches--;
          const desired = place(stops[next], extra);
          const reserved = [...occupied, ...people.filter(a => a.state === 'walk').map(a => a.target)];
          const target = stops[next].bed ? (clearOfPeople(desired, occupied) ? desired : null) : parkingPlace(desired, reserved, extra);
          if (!target) { actor.timer = 500; continue; }
          // Consecutive work poses at one bedside do not move the stool.
          if (distance(actor, target) < 1.5 || stop.x === stops[next].x && stop.y === stops[next].y) {
            actor.index = next; actor.timer = stops[next].dwell; actor.clock = 0;
            continue;
          }
          const path = findPath(actor, target, extra);
          if (!path.length) { actor.timer = 1000; continue; }
          actor.index = next;
          actor.hauling = !!stops[next].haul;
          actor.path = path; actor.state = 'walk'; actor.travel = 0;
          actor.target = target;
          if (stop.bed && actor.def.walk?.atlas === 'patient-motion') actor.transition = { kind: 'rise', elapsed: 0, bedIndex: (next + stops.length - 1) % stops.length };
          continue;
        }
        if (actor.reroute) {
          actor.timer -= dt * 1000;
          if (actor.timer > 0 || searches <= 0) continue;
          searches--;
          const desired = place(stops[actor.index], extra);
          const target = stops[actor.index].bed ? (clearOfPeople(desired, occupied) ? desired : null) : parkingPlace(desired, occupied, extra);
          if (!target) { actor.timer = 500; continue; }
          actor.target = target;
          actor.path = findPath(actor, target, [...extra, ...personObstacles(occupied, actor)]);
          if (!actor.path.length) { actor.timer = 1000; continue; }
          actor.reroute = false;
        }
        const before = { x: actor.x, y: actor.y };
        const path = [...actor.path];
        const intended = followPath(actor, path, actor.def.speed * dt, extra);
        const moved = moveThroughCrowd(actor, intended, occupied, extra);
        if (distance(moved, intended) < .01) { actor.path = path; actor.stalled = 0; }
        else actor.stalled += dt * 1000;
        const dx = moved.x - before.x, dy = moved.y - before.y;
        actor.x = moved.x; actor.y = moved.y;
        actor.moving = distance(before, moved) > .01;
        actor.travel += distance(before, moved);
        if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
        const stop = stops[actor.index];
        if (distance(actor, actor.target) < 1.5) {
          actor.path.length = 0; actor.state = 'dwell'; actor.timer = stop.dwell; actor.hauling = false; actor.clock = 0;
          if (stop.facing !== undefined) actor.facing = stop.facing;
          if (stop.bed && actor.def.walk?.atlas === 'patient-motion') actor.transition = { kind: 'lie', elapsed: 0, bedIndex: actor.index };
        } else if (actor.stalled > 650 || Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
          // Retry from the actual feet. A blocked route must never teleport
          // someone through furniture or mark a distant patient as in bed.
          actor.path.length = 0; actor.reroute = true; actor.timer = 500;
          actor.stalled = 0;
        }
      }
    },
  };
  return life;
}

/** The action played right now, if the character is working rather than walking. */
export function actorAction(actor: NpcActor): NpcAction | undefined {
  const stop = actor.def.stops[Math.min(actor.index, actor.def.stops.length - 1)];
  if (actor.held && actor.def.walk) return actor.facing === 0 ? actor.def.talk : undefined;
  if (actor.state === 'walk') {
    const haul = actor.def.haul;
    if (actor.hauling && haul) return { atlas: haul.atlas, row: haul.row, group: actor.facing === 1 ? haul.left : haul.right };
    // People drawn only from a work sheet keep their pose while they shift
    // position, rather than dropping to an empty frame.
    return actor.def.walk ? undefined : stop.action;
  }
  return stop.action;
}
/** True while an ambulatory patient is back on the mattress, so the bed art
 * takes over and the two are never drawn at once. */
export function restingInBed(actor: NpcActor): boolean {
  const stop = actor.def.stops[Math.min(actor.index, actor.def.stops.length - 1)];
  return !actor.transition && actor.state === 'dwell' && !!stop.bed && distance(actor, stop) < 2;
}
/** Alternates the two frames of the current pose. */
export function actorStep(actor: NpcActor): number {
  if (actor.paused || actor.reroute) return 0;
  if (actor.held) return actor.clock % 3600 >= 2800 ? 1 : 0;
  if (actor.def.companionOf && actor.def.walk?.atlas === 'companion-walk') return actor.clock % 3400 >= 3280 ? 1 : 0;
  if (actor.state === 'dwell' && ['staff-actions', 'ward-care'].includes(actorAction(actor)?.atlas ?? '')) return Math.floor(actor.clock / 650) & 1;
  // Ward work pairs are open-eye/closed-eye variants, not two equal-duration
  // work strokes. Keep the gesture and make the blink brief.
  if (actor.state === 'dwell' && actorAction(actor)?.atlas === 'ward-actions')
    return actor.clock % 3400 >= 3280 ? 1 : 0;
  return actor.state === 'walk' ? Math.floor(actor.travel / (46 * WALK_FRAME_MS / 1000)) % 4
    : Math.floor(actor.clock / ACTION_FRAME_MS) & 1;
}
