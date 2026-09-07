import { distance, findPath, followPath, nearestFloor, type Point, type Rect } from './navigation';
import type { NpcAction, NpcDefinition, NpcStop } from './npc-schedule';
import { WALK_FRAME_MS } from './npc-art';

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
  /** Set while the player is talking to this character. */
  held: boolean;
  hauling: boolean;
}
export interface StepOptions {
  /** False for reduced motion: everyone stands on a stop, no walking frames. */
  motion: boolean;
  extra?: readonly Rect[];
  /** The character the player is talking to, and where the player stands. */
  hold?: { id: string; at: Point } | null;
}
const ACTION_FRAME_MS = 340;
/** Route searches are spread over frames so a crowded floor never stalls one. */
const PATHS_PER_STEP = 2;

export interface WardLife {
  actors: NpcActor[];
  byId: Map<string, NpcActor>;
  sync(definitions: NpcDefinition[]): void;
  step(dt: number, options: StepOptions): void;
}

const same = (a: NpcStop[], b: NpcStop[]) =>
  a.length === b.length && a.every((s, i) => s.x === b[i].x && s.y === b[i].y && s.dwell === b[i].dwell
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
          const actor: NpcActor = { id: def.id, def, x: start.x, y: start.y, facing: start.facing ?? 0,
            state: 'dwell', index: 0, timer: start.dwell + def.offset, path: [], clock: def.offset, held: false, hauling: false };
          actors.push(actor); byId.set(def.id, actor);
          continue;
        }
        const changed = !same(existing.def.stops, def.stops);
        existing.def = def;
        if (changed) { existing.index = 0; existing.path.length = 0; existing.state = 'dwell'; existing.timer = def.stops[0].dwell; }
      }
    },
    step(dt, options) {
      const extra = options.extra ?? [];
      let searches = PATHS_PER_STEP;
      for (const actor of actors) {
        const stops = actor.def.stops;
        actor.held = options.hold?.id === actor.id;
        if (!options.motion) {
          const stop = stops[Math.min(actor.index, stops.length - 1)];
          const point = place(stop, extra);
          actor.x = point.x; actor.y = point.y; actor.state = 'dwell'; actor.path.length = 0;
          actor.hauling = false; actor.facing = stop.facing ?? actor.facing; actor.clock = 0;
          continue;
        }
        actor.clock += dt * 1000;
        if (actor.held) {
          const at = options.hold!.at;
          actor.path.length = 0; actor.state = 'dwell';
          const dx = at.x - actor.x, dy = at.y - actor.y;
          actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
          continue;
        }
        if (actor.state === 'dwell') {
          actor.timer -= dt * 1000;
          const stop = stops[actor.index];
          if (stop.facing !== undefined) actor.facing = stop.facing;
          if (actor.timer > 0) continue;
          const next = (actor.index + 1) % stops.length;
          if (searches <= 0) { actor.timer = 120; continue; }
          searches--;
          const target = place(stops[next], extra);
          const path = findPath(actor, target, extra);
          actor.index = next;
          actor.hauling = !!stops[next].haul;
          if (!path.length) { actor.x = target.x; actor.y = target.y; actor.state = 'dwell'; actor.timer = stops[next].dwell; continue; }
          actor.path = path; actor.state = 'walk';
          continue;
        }
        const before = { x: actor.x, y: actor.y };
        const moved = followPath(actor, actor.path, actor.def.speed * dt, extra);
        const dx = moved.x - before.x, dy = moved.y - before.y;
        actor.x = moved.x; actor.y = moved.y;
        if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
        const stop = stops[actor.index];
        if (!actor.path.length || distance(actor, stop) < 1.5) {
          actor.path.length = 0; actor.state = 'dwell'; actor.timer = stop.dwell; actor.hauling = false;
          if (stop.facing !== undefined) actor.facing = stop.facing;
        } else if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
          // A leg that cannot advance is finished at the stop rather than left
          // standing in a doorway.
          const target = place(stop, extra);
          actor.x = target.x; actor.y = target.y; actor.path.length = 0; actor.state = 'dwell'; actor.timer = stop.dwell; actor.hauling = false;
        }
      }
    },
  };
  return life;
}

/** The action played right now, if the character is working rather than walking. */
export function actorAction(actor: NpcActor): NpcAction | undefined {
  const stop = actor.def.stops[Math.min(actor.index, actor.def.stops.length - 1)];
  if (actor.state === 'walk') {
    const haul = actor.def.haul;
    if (!actor.hauling || !haul) return undefined;
    return { atlas: haul.atlas, row: haul.row, group: actor.facing === 1 ? haul.left : haul.right };
  }
  return stop.action;
}
/** True while an ambulatory patient is back on the mattress, so the bed art
 * takes over and the two are never drawn at once. */
export function restingInBed(actor: NpcActor): boolean {
  return actor.state === 'dwell' && !!actor.def.stops[Math.min(actor.index, actor.def.stops.length - 1)].bed;
}
/** Alternates the two frames of the current pose. */
export function actorStep(actor: NpcActor): number {
  const period = actor.state === 'walk' && !actor.hauling ? WALK_FRAME_MS : ACTION_FRAME_MS;
  return Math.floor(actor.clock / period) & 1;
}
