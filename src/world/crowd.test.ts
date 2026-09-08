import { describe, expect, it } from 'vitest';
import { createWardLife, restingInBed } from './npc-runtime';
import { distance, walkable } from './navigation';
import { clearOfPeople, PERSON_SPACE } from './crowd';
import { staffRoutes } from './npc-schedule';
describe('people sharing ward floor', () => {
  it('passes a head-on pedestrian without overlapping feet or becoming stuck', () => {
    const life = createWardLife(), ends = [{ x: 420, y: 250 }, { x: 580, y: 250 }];
    life.sync(ends.map((from, i) => ({ id: `person-${i}`, speed: 40, offset: 0,
      stops: [{ ...from, dwell: 10 }, { ...ends[1 - i], dwell: 5000 }] })));
    const arrived = new Set<string>();
    for (let f = 0; f < 60 * 20; f++) {
      life.step(1 / 60, { motion: true });
      expect(distance(life.actors[0], life.actors[1])).toBeGreaterThanOrEqual(PERSON_SPACE - .02);
      for (const a of life.actors) if (a.index === 1 && a.state === 'dwell') arrived.add(a.id);
    }
    expect(arrived.size).toBe(2);
  });
  it('walks around the doctor rather than through them', () => {
    const life = createWardLife(), player = { x: 500, y: 250 };
    life.sync([{ id: 'nurse', speed: 44, offset: 0, stops: [{ x: 420, y: 250, dwell: 10 }, { x: 580, y: 250, dwell: 30000 }] }]);
    for (let f = 0; f < 60 * 15; f++) {
      life.step(1 / 60, { motion: true, player });
      expect(clearOfPeople(life.actors[0], [player])).toBe(true);
      expect(walkable(life.actors[0])).toBe(true);
    }
    expect(life.actors[0].x).toBeGreaterThan(550);
  });
  it('keeps the five core characters separated through their actual routes', () => {
    const life = createWardLife(); life.sync(staffRoutes(false));
    for (let f = 0; f < 60 * 80; f++) {
      life.step(1 / 60, { motion: true });
      const visible = life.actors.filter(a => !restingInBed(a));
      for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++)
        expect(distance(visible[i], visible[j]), `${visible[i].id}/${visible[j].id}`).toBeGreaterThanOrEqual(PERSON_SPACE - .02);
    }
  }, 20000);
});
