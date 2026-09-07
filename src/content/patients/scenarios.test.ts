import { describe, expect, it } from 'vitest';
import { CASE_PRESETS, PATIENT_ENTITIES, compatibleEntities, instantiatePreset, isCompatible } from './index';
import { entityScenario, PRESET_SCENARIOS } from './scenarios';
import { patientArt, patientArtFile } from '../../world/patients';
const preset = (id: string) => CASE_PRESETS.find(p => p.id === id)!;
const entity = (id: string) => PATIENT_ENTITIES.find(e => e.id === id)!;
const matches = (p: string, e: string) => isCompatible(entity(e), preset(p));

describe('patient identity and authored scenario compatibility', () => {
  it('has a declared context for every original preset, without replacing any original person', () => {
    expect(Object.keys(PRESET_SCENARIOS)).toHaveLength(208);
    expect(PATIENT_ENTITIES.filter(e => e.original)).toHaveLength(222);
    for (const p of CASE_PRESETS) expect(p.constraints.scenario).toBe(PRESET_SCENARIOS[p.id]);
    expect(PATIENT_ENTITIES.filter(e => !e.original)).toHaveLength(29);
  });
  it('does not invent mothers, parents, sons or daughters from another companion', () => {
    expect(entityScenario(entity('P-019')).roles.has('mother')).toBe(false);
    expect(entityScenario(entity('P-020')).roles.has('mother')).toBe(false);
    expect(matches('C-147', 'P-019')).toBe(false);
    expect(matches('C-162', 'P-020')).toBe(false);
    expect(entityScenario(entity('P-229')).roles.has('daughter')).toBe(false);
    expect(entityScenario(entity('P-235')).roles.has('son')).toBe(false);
    expect(entityScenario(entity('P-241')).roles.has('grandfather')).toBe(false);
    expect(matches('C-010', 'P-229')).toBe(true);
  });
  it('keeps the separated-parent and safeguarding stories intact', () => {
    expect(matches('C-135', 'P-240')).toBe(true);
    for (const e of compatibleEntities(preset('C-135'))) {
      expect(e.companion).toBe('父亲');
      expect(e.occupation).toContain('父母离异');
      expect(e.ageYears).toBeGreaterThanOrEqual(1 / 12);
    }
    expect(matches('C-161', 'P-243')).toBe(true);
    expect(instantiatePreset(preset('C-161'), entity('P-243')).steps.map(s => s.text).join('\n')).toContain('母亲与母亲的男友');
    expect(matches('C-134', 'P-239')).toBe(true);
    expect(matches('C-153', 'P-242')).toBe(true);
    expect(matches('C-134', 'P-001')).toBe(false);
  });
  it('rejects late pregnancy and postpartum identities in early-pregnancy scenes', () => {
    for (const e of ['P-189', 'P-190', 'P-191', 'P-193']) expect(matches('C-162', e)).toBe(false);
    expect(matches('C-162', 'P-244')).toBe(true);
    expect(matches('C-174', 'P-193')).toBe(false);
    expect(matches('C-174', 'P-250')).toBe(true);
    expect(instantiatePreset(preset('C-174'), entity('P-250')).steps.map(s => s.text).join('\n')).toContain('独自就诊');
    expect(matches('C-166', 'P-246')).toBe(true);
    expect(matches('C-172', 'P-249')).toBe(true);
    expect(matches('C-172', 'P-246')).toBe(false);
  });
  it('renders explicitly authored gestational and postpartum variants accurately', () => {
    const early = instantiatePreset(preset('C-164'), entity('P-190'));
    expect(early.complaint).toContain('孕 32 周');
    expect(early.complaint).not.toContain('孕 34 周');
    expect(preset('C-164').presentation).toContain('孕 34 周');
    expect(instantiatePreset(preset('C-170'), entity('P-191')).complaint).toContain('产后 20 天');
    expect(preset('C-170').presentation).toContain('产后 3 周');
  });
  it('keeps original children reachable through age-appropriate variants with real authorization steps', () => {
    for (const id of ['P-003', 'P-008', 'P-017', 'P-019', 'P-020', 'P-027', 'P-029'])
      expect(CASE_PRESETS.some(p => matches(p.id, id)), id).toBe(true);
    const child = instantiatePreset(preset('C-047'), entity('P-019'));
    expect(child.companion).toBe('老师');
    expect(child.age).toBe(14);
    expect(child.steps.flatMap(s => s.options).some(o => o.label.includes('监护人'))).toBe(true);
    expect(child.steps.flatMap(s => s.options).find(o => o.id.endsWith(':tailored'))!.label).toContain('儿科');
    expect(instantiatePreset(preset('C-152'), entity('P-029')).complaint).toContain('32 kg');
  });
  it('does not reuse scenario-specific people in unrelated cases or permit absent patients', () => {
    for (const e of PATIENT_ENTITIES.filter(e => Number(e.id.slice(2)) >= 229)) {
      const ids = CASE_PRESETS.filter(p => isCompatible(e, p)).map(p => p.id);
      expect(ids).toEqual(entityScenario(e).dedicated);
    }
    const absent = { ...entity('P-244'), occupation: '本人未到，由母亲代诊' };
    expect(isCompatible(absent, preset('C-162'))).toBe(false);
  });
  it('maps every entity to age- and sex-appropriate portrait, bedside and lying-bed assets', () => {
    const femaleOriginal = new Set([3, 4, 6, 9, 10, 13, 17, 18]);
    const femaleExtended = new Set([1, 4, 5, 6, 7]);
    for (const e of PATIENT_ENTITIES) {
      const art = patientArt({ caseId: 'C-001', entityId: e.id });
      expect((art.atlas === 'original' ? femaleOriginal : femaleExtended).has(art.index), e.id).toBe(e.sex === '女');
      if (e.ageYears < 1) expect(art).toMatchObject({ atlas: 'extended', index: e.sex === '男' ? 0 : 1 });
      else if (e.ageYears >= 6 && e.ageYears < 18) expect(art).toMatchObject({ atlas: 'extended', index: e.sex === '男' ? e.ageYears < 13 ? 2 : 3 : e.ageYears < 13 ? 4 : 5 });
      if (e.flags.includes('孕晚期')) expect(art).toMatchObject({ atlas: 'extended', index: e.ageYears < 38 ? 6 : 7 });
      expect(patientArtFile(art, 'world')).toContain('bed-patients.webp');
    }
  });
});
