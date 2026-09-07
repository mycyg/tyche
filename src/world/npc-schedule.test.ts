import { describe, expect, it } from 'vitest';
import type { Patient, Run } from '../game/types';
import { findPath, walkable, WORLD, type Point } from './navigation';
import { BED_PLACES } from './scene';
import { ATLASES, ATLAS_BY_ID, actionFrame, walkFrame } from './npc-art';
import type { Occupant } from './occupants';
import {
  ambulatoryRoutes, ambulatoryRow, backgroundRoutes, companionRoutes, conflictRoutes, familyRoutes,
  familyVisitsStopped, isNightShift, partnerRow, SPOTS, staffRoutes, wardCast, type NpcDefinition,
} from './npc-schedule';

function patient(over: Partial<Patient> = {}): Patient {
  return { uid: 'p1', caseId: 'C001', name: '患者', bed: 5, admitted: 1, expectedDays: 5, budget: 1000, initialBudget: 1000,
    spent: 0, charged: 0, stability: 5, patience: 50, damage: 0, mitigated: 0, active: true, inpatient: true,
    caredDay: 0, explainedDay: 0, planned: false, preset: { age: 44, sex: '男' } as Patient['preset'], ...over } as Patient;
}
function run(over: Partial<Run> = {}): Run {
  return { schema: 1, id: 'r', seed: 's', name: '医生', day: 3, difficulty: 'rotation', phase: 'play',
    vitals: { stamina: 50, san: 50, emotion: 50 }, caps: { stamina: 100, san: 100, emotion: 100 },
    relations: { chief: 0, nurse: 0, peer: 0, family: 0 }, ap: 6, borrowed: 0, overtime: 0, cash: 100, debt: 0,
    privateDebt: 0, receivable: 0, income: 0, interest: 0, uncoveredDays: 0, reputation: 50, depression: 0,
    talents: [], debuffs: [], skills: { observe: 1, clinical: 1, record: 1, persuade: 1, comfort: 1, endure: 1 },
    coffee: 0, nap: false, exhausted: 0, emotionalBreaks: 0, skipNextDay: false, nightMinutes: 0, nightBudget: 0,
    patients: [], queue: [], cursor: 0, facts: {}, journal: [], hazards: [], committed: [], offered: [],
    debuffPicks: 0, streak: 0, ...over } as Run;
}
const occupant = (p: Patient): Occupant => ({ patient: p, place: BED_PLACES.find(b => b.bed === p.bed) ?? BED_PLACES[0] });
const facts = (...keys: string[]): Run['facts'] =>
  Object.fromEntries(keys.map(key => [key, { day: 1, source: 'test', sequence: 1 }]));

function everyStop(definitions: NpcDefinition[], visit: (point: Point, id: string) => void) {
  for (const def of definitions) for (const stop of def.stops) visit(stop, def.id);
}

describe('ward npc routes', () => {
  it('places every named spot on real floor, clear of walls, beds and counters', () => {
    for (const [name, value] of Object.entries(SPOTS)) {
      for (const point of Array.isArray(value) ? value : [value]) {
        expect(walkable(point), `${name} ${JSON.stringify(point)}`).toBe(true);
      }
    }
  });

  it('keeps every scheduled stop walkable and reachable from the one before it', () => {
    const patients = [patient(), patient({ uid: 'p2', bed: 9, preset: { age: 71, sex: '女' } as Patient['preset'] })];
    const occupants = patients.map(occupant);
    const state = run({ patients, facts: facts('家庭-车祸-ICU中', '伴侣-矛盾', '飞检-进驻', '医闹升级') });
    for (const night of [false, true]) {
      const cast = [...staffRoutes(night), ...backgroundRoutes(night, 4), ...companionRoutes(state, occupants),
        ...conflictRoutes(state), ...familyRoutes(state)];
      everyStop(cast, (point, id) => expect(walkable(point), `${id} ${JSON.stringify(point)}`).toBe(true));
      for (const def of cast) {
        for (let i = 0; i < def.stops.length; i++) {
          const from = def.stops[i], to = def.stops[(i + 1) % def.stops.length];
          if (from.x === to.x && from.y === to.y) continue;
          const path = findPath(from, to);
          expect(path.length, `${def.id} ${i}`).toBeGreaterThan(0);
          for (const node of path) expect(walkable(node), `${def.id} ${i} ${JSON.stringify(node)}`).toBe(true);
          expect(path.at(-1)).toMatchObject({ x: to.x, y: to.y });
        }
      }
    }
  });

  it('never parks a route on a doorway strip that is the only way into a room', () => {
    const doors = [{ x: 132, y: 192 }, { x: 900, y: 192 }, { x: 1156, y: 192 }, { x: 384, y: 192 }];
    everyStop(staffRoutes(false), point => {
      for (const door of doors) expect(Math.hypot(point.x - door.x, point.y - door.y) > 12).toBe(true);
    });
  });

  it('thins the floor at night and keeps every card carrier on the map', () => {
    const day = backgroundRoutes(false, 6), night = backgroundRoutes(true, 6);
    expect(night.length).toBeLessThan(day.length);
    for (const shift of [false, true]) {
      expect(staffRoutes(shift).map(d => d.actor)).toEqual(['chief', 'nurse', 'peer', 'research', 'rep']);
      for (const def of staffRoutes(shift)) expect(def.stops.length).toBeGreaterThan(1);
    }
    expect(isNightShift(run({ shiftPhase: '夜班' }))).toBe(true);
    expect(isNightShift(run({ shiftPhase: '查房' }))).toBe(false);
  });

  it('gives every route more than one stop, so nobody stands still all shift', () => {
    for (const def of wardCast(run({ patients: [patient()] }), [occupant(patient())])) {
      expect(def.stops.length, def.id).toBeGreaterThan(1);
      expect(new Set(def.stops.map(s => `${s.x},${s.y}`)).size, def.id).toBeGreaterThan(1);
    }
  });
});

describe('companions and patients out of bed', () => {
  it('drops the companion when the patient leaves the ward', () => {
    const staying = patient({ uid: 'stay' }), leaving = patient({ uid: 'gone' });
    const state = run({ patients: [staying, leaving] });
    const before = companionRoutes(state, [occupant(staying), occupant(leaving)]).map(d => d.id);
    const after = companionRoutes(state, [occupant(staying)]).map(d => d.id);
    for (const id of after) expect(before).toContain(id);
    expect(after.some(id => id.endsWith('gone'))).toBe(false);
  });

  it('raises a phone only where a recording exists', () => {
    const p = patient({ uid: 'rec' });
    const quiet = companionRoutes(run({ patients: [p] }), [occupant(p)]);
    const recorded = companionRoutes(run({ patients: [p], facts: facts('clinical:rec:recording-exists') }), [occupant(p)]);
    const groups = (list: NpcDefinition[]) => list.flatMap(d => d.stops.map(s => s.action?.group));
    if (quiet.length) {
      expect(groups(quiet)).not.toContain(1);
      expect(groups(recorded)).toContain(1);
    }
  });

  it('keeps infants and the worst cases in bed, and matches the body to the row', () => {
    // A case id outside the fixed clinical identities, so the preset decides.
    const body = (age: number, sex: '男' | '女') => ({ caseId: 'P900', preset: { age, sex } } as Partial<Patient>);
    expect(ambulatoryRow(patient(body(0, '女')))).toBeUndefined();
    expect(ambulatoryRow(patient({ ...body(44, '男'), damage: 3 }))).toBeUndefined();
    expect(ambulatoryRow(patient({ ...body(44, '男'), caseId: 'C020' }))).toBeUndefined();
    expect(ambulatoryRow(patient(body(9, '男')))).toBe(4);
    expect(ambulatoryRow(patient(body(31, '女')))).toBe(1);
    expect(ambulatoryRow(patient(body(74, '男')))).toBe(2);
  });

  it('walks a patient inside their own room and returns them to the bedside', () => {
    const beds = [5, 9, 13];
    for (const bed of beds) {
      const p = patient({ uid: `walk-${bed}`, bed });
      const routes = ambulatoryRoutes(run({ patients: [p], day: 4 }), [occupant(p)], false)
        .concat(ambulatoryRoutes(run({ patients: [p], day: 7 }), [occupant(p)], false));
      for (const def of routes) {
        const room = bed >= 13 ? 1024 : bed >= 9 ? 768 : 0;
        for (const s of def.stops) { expect(s.x).toBeGreaterThan(room); expect(s.x).toBeLessThan(room + 256); expect(walkable(s)).toBe(true); }
        expect(def.stops[0]).toMatchObject({ x: def.stops.at(-1)!.x, y: def.stops.at(-1)!.y });
        expect(def.patientId).toBe(`walk-${bed}`);
      }
    }
  });
});

describe('family and conflict attendance', () => {
  it('brings nobody in when no family or dispute event has happened', () => {
    const state = run();
    expect(familyRoutes(state)).toHaveLength(0);
    expect(conflictRoutes(state)).toHaveLength(0);
  });

  it('reads the visit from the facts of this run', () => {
    expect(familyRoutes(run({ facts: facts('家庭-车祸-ICU中') })).map(d => d.id)).toContain('family-mother');
    expect(familyRoutes(run({ facts: facts('伴侣-矛盾') })).map(d => d.id)).toContain('family-partner');
    const bereaved = familyRoutes(run({ facts: facts('家庭-婚事', 'father-deceased') }));
    expect(bereaved.map(d => d.id)).not.toContain('family-father');
  });

  it('stops the visits once the relationship has broken', () => {
    const broken = run({ relations: { chief: 0, nurse: 0, peer: 0, family: -4 }, facts: facts('家庭-车祸-ICU中', '伴侣-矛盾') });
    expect(familyVisitsStopped(broken)).toBe(true);
    expect(familyRoutes(broken)).toHaveLength(0);
  });

  it('follows the partner setting, and keeps the written partner by default', () => {
    expect(partnerRow(run())).toBe(3);
    expect(partnerRow(run({ facts: facts('伴侣-男') }))).toBe(2);
  });

  it('sends security and the inspector only on their own events', () => {
    const p = patient({ uid: 'd1' });
    const escalated = run({ patients: [p], facts: facts('clinical:d1:unrest_escalated') });
    expect(conflictRoutes(escalated).map(d => d.id)).toContain('security');
    expect(conflictRoutes(escalated).map(d => d.id)).toContain('conflict-relative');
    expect(conflictRoutes(run({ facts: facts('飞检-进驻') })).map(d => d.id)).toEqual(['investigator']);
  });

  it('takes the disputing relative away with the patient', () => {
    const p = patient({ uid: 'd2' });
    const state = run({ patients: [p], facts: facts('clinical:d2:recording-exists') });
    expect(conflictRoutes(state).map(d => d.id)).toContain('conflict-relative');
    expect(conflictRoutes({ ...state, patients: [{ ...p, active: false }] }).map(d => d.id)).not.toContain('conflict-relative');
  });
});

describe('atlas frames', () => {
  it('reads each direction from the two columns the manifest gives it', () => {
    const down = walkFrame('staff-walk', 1, 0, 0, 100, 100), left = walkFrame('staff-walk', 1, 1, 1, 100, 100);
    const up = walkFrame('staff-walk', 1, 2, 0, 100, 100), right = walkFrame('staff-walk', 1, 3, 0, 100, 100);
    expect([down.sx, left.sx, up.sx, right.sx]).toEqual([0, 384, 768, 512]);
    expect(down.sy).toBe(128);
    expect(down.sw).toBe(128);
  });

  it('anchors sprites on the feet and keeps them the size of the existing cast', () => {
    const frame = walkFrame('ward-life-walk', 0, 0, 0, 200, 300);
    expect(frame.dw).toBe(72);
    expect(frame.dh).toBe(72);
    expect(frame.dx).toBe(164);
    expect(300 - frame.dy).toBeCloseTo(69, 0);
    const work = actionFrame('ward-actions', 0, 2, 1, 200, 300);
    expect(work.sx).toBe(5 * 192);
    expect(work.dw).toBe(108);
    expect(200 - work.dx).toBeCloseTo(54, 0);
  });

  it('never reads past the last row of an atlas', () => {
    for (const atlas of ATLASES) {
      const spec = ATLAS_BY_ID.get(atlas.id)!;
      const last = atlas.cellWidth === 128
        ? walkFrame(atlas.id as 'staff-walk', 99, 3, 1, 0, 0)
        : actionFrame(atlas.id as 'ward-actions', 99, 9, 1, 0, 0);
      expect(last.sy).toBe((spec.rows - 1) * spec.cellHeight);
      expect(last.sx + last.sw).toBeLessThanOrEqual(spec.columns * spec.cellWidth);
    }
  });

  it('keeps sprites inside the map when a stop sits near an edge', () => {
    everyStop(staffRoutes(false), point => {
      expect(point.x).toBeGreaterThan(36);
      expect(point.x).toBeLessThan(WORLD.width - 36);
    });
  });
});
