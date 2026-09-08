import { describe, expect, it } from 'vitest';
import { createWardLife } from './npc-runtime';
import { distance, move, walkable } from './navigation';
import { parkingPlace } from './crowd';

describe('people sharing ward floor', () => {
  it('passes directly through head-on traffic and completes both routes', () => {
    const life = createWardLife(), ends = [{ x: 420, y: 250 }, { x: 580, y: 250 }];
    life.sync(ends.map((from, i) => ({ id: `person-${i}`, speed: 40, offset: 0,
      stops: [{ ...from, dwell: 10 }, { ...ends[1 - i], dwell: 30000 }] })));
    const alone = life.actors.map(actor => { const solo = createWardLife(); solo.sync([actor.def]); return solo; });
    let closest = Infinity;
    for (let f = 0; f < 60 * 8; f++) {
      life.step(1 / 60, { motion: true });
      for (const solo of alone) solo.step(1 / 60, { motion: true });
      closest = Math.min(closest, distance(life.actors[0], life.actors[1]));
      for (const [i,actor] of life.actors.entries()) {
        expect(actor.x).toBeCloseTo(alone[i].actors[0].x);
        expect(actor.y).toBeCloseTo(alone[i].actors[0].y);
        expect(walkable(actor)).toBe(true);
      }
    }
    expect(closest).toBeLessThan(5);
    for (const actor of life.actors) { expect(actor.index).toBe(1); expect(actor.state).toBe('dwell'); }
  });

  it('crosses a stationary person at a doorway without detouring or stalling', () => {
    const life = createWardLife(), doorway = { x: 132, y: 194 };
    life.sync([
      { id: 'waiting', speed: 0, offset: 0, stops: [{ ...doorway, dwell: 60000 }] },
      { id: 'nurse', speed: 44, offset: 0, stops: [{ x: 132, y: 148, dwell: 10 }, { x: 132, y: 260, dwell: 60000 }] },
    ]);
    let closest = Infinity;
    for (let f = 0; f < 60 * 5; f++) {
      life.step(1 / 60, { motion: true });
      const actor = life.byId.get('nurse')!;
      closest = Math.min(closest, distance(actor, doorway));
      expect(actor.x).toBeCloseTo(132);
      expect(walkable(actor)).toBe(true);
    }
    expect(closest).toBeLessThan(1);
    expect(life.byId.get('nurse')).toMatchObject({ x: 132, state: 'dwell' });
    expect(distance(life.byId.get('nurse')!, { x: 132, y: 260 })).toBeLessThan(1.5);
  });

  it('allows the doctor to cross the same occupied floor while furniture stays solid', () => {
    const life = createWardLife();
    life.sync([{ id: 'waiting', speed: 0, offset: 0, stops: [{ x: 132, y: 194, dwell: 60000 }] }]);
    let player = { x: 132, y: 148 }, closest = Infinity;
    for (let f = 0; f < 60; f++) {
      player = move(player, 0, 105 / 60);
      closest = Math.min(closest, distance(player, life.actors[0]));
    }
    expect(closest).toBeLessThan(1);
    expect(player.y).toBeCloseTo(253);
    expect(move({ x: 100, y: 145 }, -85, 0).x).toBeGreaterThan(87);
  });

  it('prefers separate resting places without changing collision geometry', () => {
    const at = { x: 500, y: 250 }, occupied = [at];
    const alternate = parkingPlace(at, occupied)!;
    expect(distance(at, alternate)).toBeGreaterThanOrEqual(18);
    expect(walkable(at)).toBe(true); expect(walkable(alternate)).toBe(true);
  });
});
