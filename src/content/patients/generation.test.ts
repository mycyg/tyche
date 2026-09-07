import { afterAll, describe, expect, it } from 'vitest';
import { CASE_PRESETS, PATIENT_ENTITIES, isCompatible } from './index';
import { pickPreset, instantiatePatientPreset } from '../../game/presets';
import type { Patient, Run } from '../../game/types';

describe.sequential('the real seeded generator covers every entity and all 208 presets in legal scenarios',()=>{
  const entities = new Set<string>(); const presets = new Set<string>();
  let draws = 0;
  // Same seeds, order, draw count and early-completion condition as the full
  // sweep. A test boundary per seed lets workers report progress under load.
  it.each(Array.from({length:240},(_,seed)=>seed))('seed %i retains all per-draw legality checks',async(seed)=>{
    if(entities.size===PATIENT_ENTITIES.length&&presets.size===CASE_PRESETS.length)return;
    await new Promise(resolve=>setTimeout(resolve,0));
    for (const period of ['门诊', '病区', '夜班'] as const) {
      const r = { seed: `full-library-${seed}`, patients: [], day: seed % 14 + 1, reputation: 50, facts: {} } as unknown as Run;
      const size = CASE_PRESETS.filter(p => p.constraints.periods.includes(period)).length;
      for (let i = 0; i < size; i++) {
        const preset = pickPreset(r, period, String(i));
        if (!preset) break;
        const found = instantiatePatientPreset(r, preset.id, `generated-${seed}-${period}-${i}`, period)!;
        expect(isCompatible(found.entity, preset, period)).toBe(true);
        expect(found.definition.period).toBe(period);
        entities.add(found.entity.id); presets.add(preset.id); draws++;
        r.patients.push({ uid: `generated-${seed}-${period}-${i}`, admitted: r.day, active: false, damage: 0, mitigated: 0, preset: found.definition, caseId: preset.id, entityId: found.entity.id, name: found.entity.name } as Patient);
      }
    }
  },30000);
  afterAll(()=>{
    expect(PATIENT_ENTITIES.filter(e => !entities.has(e.id)).map(e => e.id)).toEqual([]);
    expect(presets.size).toBe(208);
    console.info(`Seeded runtime coverage: ${entities.size} entities, ${presets.size} presets, ${draws} draws.`);
  });
});
