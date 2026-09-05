import { describe, expect, it } from 'vitest';
import { createPatient, makeNightCard, makeWardCard } from '../game/cards';
import { startRun } from '../game/engine';
import { TEMPORARY_BEDS } from './scene';
import { walkable, findPath, SPAWN } from './navigation';
import { worldOccupants } from './occupants';

describe('visible patient occupancy', () => {
  function fullWard() {
    const r = startRun('occupancy', '程医生', []);
    r.patients = []; r.queue = []; r.cursor = 0;
    for (let i = 0; i < 12; i++) r.patients.push(createPatient(r, 'C015', `bed${i}`));
    return r;
  }
  it('keeps twelve inpatient beds and two distinct observation places', () => {
    const r = fullWard();
    for (let i = 0; i < 3; i++) r.patients.push(createPatient(r, 'C015', `overflow${i}`));
    const before = JSON.stringify(r);
    const occupants = worldOccupants(r, r.patients.map(p => makeWardCard(r, p)));
    expect(occupants).toHaveLength(14);
    expect(new Set(occupants.map(o => `${o.place.x},${o.place.y}`)).size).toBe(14);
    expect(occupants.filter(o => o.place.x >= 1280)).toHaveLength(2);
    expect(r.patients.filter(p => p.inpatient)).toHaveLength(12);
    expect(JSON.stringify(r)).toBe(before);
  });
  it('shows an emergency only when its actual encounter opens and clears it on departure', () => {
    const r = fullWard(), p = createPatient(r, 'C015', 'night0');
    r.patients.push(p);
    const card = makeNightCard(r, 0, p);
    expect(worldOccupants(r, []).some(o => o.patient.uid === p.uid)).toBe(false);
    const shown = worldOccupants(r, [card]).find(o => o.patient.uid === p.uid)!;
    expect(shown.place.x).toBeLessThan(256);
    p.active = false;
    expect(worldOccupants(r, [card]).some(o => o.patient.uid === p.uid)).toBe(false);
  });
  it('clears an inpatient sprite when the patient leaves', () => {
    const r = fullWard(), patient = r.patients[0];
    patient.active = false; patient.inpatient = false; patient.bed = 0;
    expect(worldOccupants(r, [])).toHaveLength(11);
    expect(worldOccupants(r, []).some(o => o.patient.uid === patient.uid)).toBe(false);
  });
  it('lets the doctor reach both sides of each temporary bed', () => {
    for (const bed of TEMPORARY_BEDS) {
      expect(walkable(bed.target)).toBe(true);
      expect(findPath(SPAWN, bed.target).length).toBeGreaterThan(0);
    }
  });
});
