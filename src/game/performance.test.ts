import { describe, expect, it } from 'vitest';
import { patientPerformance, performanceForBudget } from './performance';
import { CASE_PRESETS, compatibleEntities, instantiatePreset } from '../content/patients';
import { CASES } from './catalog';
import { startRun } from './engine';
import { createPatient } from './cards';
import { skillModifier } from './costs';
describe('authored case-weighted performance', () => {
  it('uses explicit overrides or the bounded, rounded original-budget mapping', () => {
    expect(performanceForBudget(300)).toBe(80); expect(performanceForBudget(3500)).toBe(180);
    expect(performanceForBudget(5800)).toBe(290); expect(performanceForBudget(60000)).toBe(300);
    expect(performanceForBudget(60000, 125)).toBe(125);
    expect(new Set(CASE_PRESETS.map(p => p.performanceGood)).size).toBeGreaterThan(5);
    for (const p of CASE_PRESETS) expect(instantiatePreset(p, compatibleEntities(p)[0]).performanceGood).toBe(p.performanceGood);
    expect(CASES).toHaveLength(20);
    for (const c of CASES) expect(performanceForBudget(c.budget)).toBeGreaterThanOrEqual(80);
  });
  it('uses the original budget, never an appeal-inflated budget', () => {
    const r = startRun('performance', '程医生', []), p = createPatient(r, 'C001', 'test');
    p.initialBudget = 3500; p.budget = 100000;
    const before = structuredClone({ r, p });
    expect(patientPerformance(r, p, { period: 'day', quality: 'good' }).amount).toBe(180);
    expect(patientPerformance(r, p, { period: 'day', quality: 'ordinary' }).amount).toBe(40);
    expect(patientPerformance(r, p, { period: 'night', quality: 'good' }).amount).toBe(100);
    expect(patientPerformance(r, p, { period: 'night', quality: 'none' }).amount).toBe(0);
    expect({ r, p }).toEqual(before);
  });
  it('downgrades only this arrears patient after an actual assessment agreement', () => {
    const r = startRun('performance-arrears', '程医生', []), p = createPatient(r, 'C001', 'test');
    const preset = CASE_PRESETS.find(p => compatibleEntities(p).some(e => e.payment.includes('欠费')))!;
    const entity = compatibleEntities(preset).find(e => e.payment.includes('欠费'))!;
    p.preset = instantiatePreset(preset, entity, p.uid); p.initialBudget = preset.budget;
    r.facts['patient:someone-else:arrears-assessment-approved'] = { day: 1, source: 'agreement', sequence: 0 };
    expect(patientPerformance(r, p, { period: 'day', quality: 'good' }).quality).toBe('good');
    r.facts[`patient:${p.uid}:arrears-assessment-approved`] = { day: 1, source: 'agreement', sequence: 1 };
    expect(patientPerformance(r, p, { period: 'day', quality: 'good' })).toMatchObject({ amount: 40, quality: 'ordinary' });
    expect(patientPerformance(r, p, { period: 'night', quality: 'good' }).amount).toBe(100);
  });
});
describe('source debt endurance thresholds', () => {
  it.each([[0, 0], [10000, 0], [10001, -1], [30000, -1], [30001, -2]])('debt %s gives modifier %s', (debt, penalty) => {
    const r = startRun(`debt-${debt}`, '程医生', []); r.debt = debt; r.depression = 0;
    expect(skillModifier(r, 'endure')).toBe(penalty);
  });
});
