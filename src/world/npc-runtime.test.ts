import { describe, expect, it } from 'vitest';
import { walkable, type Point } from './navigation';
import { CORRIDOR_BED_OBSTACLE } from './scene';
import { actorAction, actorStep, createWardLife } from './npc-runtime';
import { SPOTS, staffRoutes, type NpcDefinition } from './npc-schedule';

const FRAME = 1 / 60;
function advance(life: ReturnType<typeof createWardLife>, seconds: number, motion = true, extra: Point[] = []) {
  const frames = Math.round(seconds / FRAME);
  for (let i = 0; i < frames; i++) life.step(FRAME, { motion, extra: [] });
  return extra;
}

describe('ward life runtime', () => {
  it('never leaves a walking character off the floor', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    for (let i = 0; i < 60 * 120; i++) {
      life.step(FRAME, { motion: true });
      for (const actor of life.actors) expect(walkable(actor), `${actor.id} ${actor.x},${actor.y}`).toBe(true);
    }
  }, 30000);

  it('keeps someone moving and someone stopped once the shift is running', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    advance(life, 25);
    let walkingSamples = 0, allStillSamples = 0;
    const positions = life.actors.map(a => ({ x: a.x, y: a.y }));
    for (let sample = 0; sample < 60; sample++) {
      advance(life, 0.5);
      const walking = life.actors.filter(a => a.state === 'walk').length;
      if (walking > 0) walkingSamples++;
      if (walking === 0) allStillSamples++;
    }
    expect(walkingSamples).toBeGreaterThan(40);
    expect(allStillSamples).toBeLessThan(20);
    const moved = life.actors.filter((a, i) => Math.hypot(a.x - positions[i].x, a.y - positions[i].y) > 30);
    expect(moved.length).toBeGreaterThan(2);
  });

  it('staggers departures so the floor never starts in unison', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    const starts = new Map<string, number>();
    for (let i = 0; i < 60 * 40; i++) {
      life.step(FRAME, { motion: true });
      for (const actor of life.actors) if (actor.state === 'walk' && !starts.has(actor.id)) starts.set(actor.id, i);
    }
    expect(starts.size).toBe(life.actors.length);
    expect(new Set(starts.values()).size).toBe(starts.size);
  });

  it('stands everyone on a stop and plays no walking frame with motion off', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    advance(life, 20, false);
    for (const actor of life.actors) {
      expect(actor.state).toBe('dwell');
      expect(actor.def.stops.some(s => s.x === actor.x && s.y === actor.y), actor.id).toBe(true);
      expect(actorStep(actor)).toBe(0);
    }
  });

  it('stops the person being talked to and turns them to the player', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    advance(life, 30);
    const actor = life.byId.get('nurse')!;
    const at = { x: actor.x + 40, y: actor.y };
    for (let i = 0; i < 120; i++) life.step(FRAME, { motion: true, hold: { id: 'nurse', at } });
    const held = { x: actor.x, y: actor.y };
    expect(actor.state).toBe('dwell');
    expect(actor.facing).toBe(3);
    for (let i = 0; i < 120; i++) life.step(FRAME, { motion: true, hold: { id: 'nurse', at } });
    expect({ x: actor.x, y: actor.y }).toEqual(held);
    for (let i = 0; i < 60 * 30; i++) life.step(FRAME, { motion: true });
    expect(Math.hypot(actor.x - held.x, actor.y - held.y)).toBeGreaterThan(20);
  }, 20000);

  it('adds and drops people without disturbing the ones already working', () => {
    const life = createWardLife();
    const staff = staffRoutes(false);
    life.sync(staff);
    advance(life, 18);
    const nurse = life.byId.get('nurse')!, before = { x: nurse.x, y: nurse.y, index: nurse.index };
    const extra: NpcDefinition = { id: 'visitor', speed: 30, offset: 0,
      stops: [{ ...SPOTS.waitCentre, dwell: 2000 }, { ...SPOTS.hallCentre, dwell: 2000 }] };
    life.sync([...staff, extra]);
    expect(life.byId.get('nurse')).toMatchObject(before);
    expect(life.byId.has('visitor')).toBe(true);
    life.sync(staff);
    expect(life.byId.has('visitor')).toBe(false);
    expect(life.actors).toHaveLength(staff.length);
  });

  it('keeps clear of the corridor bed when one has been opened', () => {
    const life = createWardLife();
    life.sync([{ id: 'porter', speed: 60, offset: 0,
      stops: [{ ...SPOTS.hallEast, dwell: 500 }, { ...SPOTS.hallStation, dwell: 500 }] }]);
    for (let i = 0; i < 60 * 90; i++) {
      life.step(FRAME, { motion: true, extra: [CORRIDOR_BED_OBSTACLE] });
      const actor = life.actors[0];
      expect(walkable(actor, [CORRIDOR_BED_OBSTACLE]), `${actor.x},${actor.y}`).toBe(true);
    }
  }, 20000);

  it('shows the cart while a route leg hauls, and the working pose at the stop', () => {
    const life = createWardLife();
    life.sync(staffRoutes(false));
    let sawCart = false, sawChart = false;
    for (let i = 0; i < 60 * 60; i++) {
      life.step(FRAME, { motion: true });
      const nurse = life.byId.get('nurse')!, action = actorAction(nurse);
      if (nurse.state === 'walk' && action && (action.group === 0 || action.group === 1)) sawCart = true;
      if (nurse.state === 'dwell' && action?.group === 2) sawChart = true;
    }
    expect(sawCart).toBe(true);
    expect(sawChart).toBe(true);
  }, 20000);

  it('alternates the two frames of a pose', () => {
    const life = createWardLife();
    life.sync([{ id: 'x', speed: 40, offset: 0, stops: [{ ...SPOTS.hallCentre, dwell: 4000 }, { ...SPOTS.hallEast, dwell: 4000 }] }]);
    const actor = life.actors[0];
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) { life.step(FRAME, { motion: true }); seen.add(actorStep(actor)); }
    expect([...seen].sort()).toEqual([0, 1]);
  });
});
