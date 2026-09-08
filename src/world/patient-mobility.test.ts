import { describe, expect, it } from 'vitest';
import { CASE_PRESETS, PATIENT_ENTITIES } from '../content/patients';
import type { Patient } from '../game/types';
import { patientCanWalk } from './patient-mobility';

const reviewed = (over: Partial<Patient> = {}): Patient => ({
  uid: 'reviewed', caseId: 'C-131', active: true, inpatient: true, damage: 0,
  stability: 2, caredDay: 3, settled: true,
  preset: { age: 69, sex: '男', critical: false } as Patient['preset'], ...over,
} as Patient);
const today = { day: 3 };

describe('patient mobility follows the clinical situation', () => {
  it('allows a reviewed, stable recovery case to take a short ward walk', () => {
    expect(patientCanWalk(today, reviewed())).toBe(true);
  });
  it('keeps every moderate/severe preset and every acute full case in bed even at zero damage', () => {
    for (const preset of CASE_PRESETS.filter(p => p.severity >= 2)) {
      expect(patientCanWalk(today, reviewed({ caseId: preset.id })), preset.id).toBe(false);
    }
    for (let n = 1; n <= 20; n++) {
      const caseId = `C${String(n).padStart(3, '0')}`;
      expect(patientCanWalk(today, reviewed({ caseId })), caseId).toBe(false);
    }
  });
  it('requires an assessment today, stability and a completed acute encounter', () => {
    for (const over of [
      { caredDay: 2 }, { stability: 1 }, { stability: Number.NaN }, { damage: 1 },
      { settled: false }, { active: false }, { inpatient: false }, { caseId: 'unknown' },
      { presetNode: 'investigate', presetResolved: false },
    ]) expect(patientCanWalk(today, reviewed(over)), JSON.stringify(over)).toBe(false);
  });
  it('does not send a child, a long-term bedridden person or someone needing supervision out alone', () => {
    const entity = PATIENT_ENTITIES[0];
    for (const profile of [
      { ...entity, occupation: '长期卧床', ageYears: 69, sex: '男' as const },
      { ...entity, flags: ['认知障碍'], ageYears: 69, sex: '男' as const },
      { ...entity, flags: ['被押送'], ageYears: 69, sex: '男' as const },
    ]) expect(patientCanWalk(today, reviewed({ preset: { age: 69, sex: '男', entityProfile: profile } as Patient['preset'] }))).toBe(false);
    expect(patientCanWalk(today, reviewed({ preset: { age: 9, sex: '女' } as Patient['preset'] }))).toBe(false);
    for (const caseId of ['C-043', 'C-103', 'C-139', 'C-175', 'C-196'])
      expect(patientCanWalk(today, reviewed({ caseId })), caseId).toBe(false);
  });
});
