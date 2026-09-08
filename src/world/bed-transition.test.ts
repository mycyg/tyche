import { describe, expect, it } from 'vitest';
import { BED_TRANSITION_MS, createWardLife, restingInBed } from './npc-runtime';
import { bedTransitionFrame } from './bed-transition';
import { BED_PLACES } from './scene';
import { walkFrame } from './npc-art';
describe('getting into and out of bed', () => {
  it('plays authored postures before walking and before becoming bed art', () => {
    const life = createWardLife(), bed = { x: 96, y: 104 };
    life.sync([{ id: 'patient', patientId: 'p', walk: { atlas: 'patient-motion', row: 15 }, speed: 28, offset: 0,
      stops: [{ ...bed, dwell: 10, bed: true }, { x: 110, y: 132, dwell: 10 }] }]);
    life.step(.02, { motion: true }); const actor = life.actors[0];
    expect(actor.transition?.kind).toBe('rise'); expect(restingInBed(actor)).toBe(false);
    const seen = new Set<string>();
    for (let f = 0; f < 60 * 12; f++) {
      life.step(1 / 60, { motion: true });
      if (actor.transition) seen.add(`${actor.transition.kind}:${Math.min(3, Math.floor(actor.transition.elapsed / BED_TRANSITION_MS * 4))}`);
    }
    for (const kind of ['rise', 'lie']) for (let pose = 0; pose < 4; pose++) expect(seen.has(`${kind}:${pose}`)).toBe(true);
  });
  it('registers the first pose exactly to the mattress and the last to standing feet', () => {
    const life = createWardLife(), bed = BED_PLACES[0];
    life.sync([{ id: 'p', patientId: 'p', walk: { atlas: 'patient-motion', row: 15 }, speed: 28, offset: 0,
      stops: [{ ...bed.target, dwell: 10, bed: true }] }]);
    const a = life.actors[0]; a.transition = { kind: 'rise', elapsed: 0, bedIndex: 0 };
    expect(bedTransitionFrame(a, bed)).toMatchObject({ dx: bed.x, dy: bed.y, dw: bed.width, dh: bed.height, sy: 15 * 128 });
    a.transition.elapsed = BED_TRANSITION_MS;
    const final = bedTransitionFrame(a, bed), standing = walkFrame('patient-motion', 15, 0, 0, a.x, a.y);
    expect(final.dw).toBe(standing.dw); expect(final.dx).toBeCloseTo(a.x - 36); expect(final.dy).toBeCloseTo(a.y - 122 * 72 / 128);
  });
  it('does not begin a hidden walk before its matching sprite sheets are ready', () => {
    const life = createWardLife(); life.sync([{ id: 'p', patientId: 'p', walk: { atlas: 'patient-motion', row: 3 }, speed: 28, offset: 0,
      stops: [{ x: 96, y: 104, dwell: 10, bed: true }, { x: 110, y: 132, dwell: 10 }] }]);
    for (let f = 0; f < 300; f++) life.step(1 / 60, { motion: true, ready: () => false });
    expect(restingInBed(life.actors[0])).toBe(true);
    expect(life.actors[0]).toMatchObject({ x: 96, y: 104 });
  });
});
