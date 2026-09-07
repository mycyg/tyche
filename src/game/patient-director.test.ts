import { describe, expect, it } from 'vitest';
import { PATIENT_ENTITIES, CASE_PRESETS, instantiatePreset, compatibleEntities } from '../content/patients';
import { presetProbes } from '../content/patients/checks';
import { afterPatientChoice, patientCheckAdjustment, patientComplaintReliefFlag, patientProfile, patientRefusalFlag, patientVisibleOptions, preflightPatientChoice } from './patient-director';
import { instantiatePatientPreset, pickPreset } from './presets';
import type { Card, Option, Patient, Run } from './types';

function fixture(flag?: string) {
  const entity = PATIENT_ENTITIES.find(e => flag ? e.flags.includes(flag) : e.payment.includes('欠费'))!;
  const preset = CASE_PRESETS.find(c => compatibleEntities(c).some(e => e.id === entity.id))!;
  const p = { uid: 'visit-a', entityId: entity.id, name: entity.name, caseId: preset.id, damage: 0, mitigated: 0,
    preset: instantiatePreset(preset, entity, 'visit-a') } as Patient;
  const r = { seed: 'patient-rule', day: 3, patients: [p], facts: {}, hazards: [], reputation: 50, shiftPhase: '夜班' } as unknown as Run;
  const o: Option = { id: 'necessary-exam', label: '完成当前必要检查', ap: 1, minutes: 10, cost: 200, result: '取得检查结果', effects: { flags: ['completed-exam'] }, mechanics: { operation: 'exam', quality: 'correct' } };
  const card = { id: 'clinical-pending', title: '必要检查', text: '检查尚未完成', kind: 'night', shiftPhase: '夜班', patientId: p.uid, scope: { kind: 'patient', id: p.uid }, options: [o] } as Card;
  return { r, p, o, card, entity };
}
describe('patient-specific decisions use facts from the actual encounter', () => {
  it('uses completed T12 examinations to lower only this encounter’s complaint tendency', () => {
    const { r, p, o } = fixture('自媒体'); const before = patientProfile(r, p)!.complaintTendency;
    o.check = { skill: 'comfort', dc: 11, failure: {}, failureText: '沟通未成' };
    const beforeDc = patientCheckAdjustment(r, p, o).dcDelta;
    const key = patientComplaintReliefFlag(p, o);
    r.facts[key] = { day: r.day, source: o.id, sequence: 1 };
    expect(patientProfile(r, p)!.complaintTendency).toBe(Math.max(0, before - 1));
    expect(patientCheckAdjustment(r, p, o).dcDelta).toBe(beforeDc - 1);
    r.facts[key] = { day: r.day, source: o.id, sequence: 2 };
    expect(patientProfile(r, p)!.complaintTendency).toBe(Math.max(0, before - 1));
    const nextVisit = { ...p, uid: 'visit-b' }; r.patients.push(nextVisit);
    // This previous visit has no successful outcome: the revisit rule still
    // raises the baseline, and the previous encounter's relief is not inherited.
    expect(patientProfile(r, nextVisit)!.complaintTendency).toBe(Math.min(3, before + 1));
    for (let i = 0; i < 5; i++) r.facts[patientComplaintReliefFlag(p, { ...o, id: `exam-${i}` })] = { day: r.day, source: `exam-${i}`, sequence: i + 3 };
    expect(patientProfile(r, p)!.complaintTendency).toBe(0);
  });
  it('defers a billed examination until consent and does not mutate pending care', () => {
    const { r, p, card, o } = fixture(); const before = structuredClone({ r, p, card, o });
    const gate = preflightPatientChoice(r, p, card, o).card!;
    expect(gate.last).toBe(false); expect(gate.shiftPhase).toBe('夜班');
    expect(gate.options.every(choice => choice.cost === 0 && !choice.effects.flags?.includes('completed-exam'))).toBe(true);
    expect(gate.options[0].check!.failure.flags).toContain(patientRefusalFlag(p, o));
    expect({ r, p, card, o }).toEqual(before);
    r.facts[patientRefusalFlag(p, o)] = { day: 3, source: 'signed-refusal', sequence: 1 };
    const replacement = patientVisibleOptions(r, p, card);
    expect(replacement).toHaveLength(1); expect(replacement[0].interaction).toBe('transfer');
    expect(replacement[0].next).toBeUndefined(); expect(replacement[0].effects.flags).not.toContain('completed-exam');
  });
  it('does not demand examination consent for a conversation that merely mentions a test', () => {
    const { r, p, card, o } = fixture(); o.label = '讨论可接受的 CT 检查'; o.mechanics!.operation = 'comfort';
    expect(preflightPatientChoice(r, p, card, o).card).toBeUndefined();
  });
  it('makes unaccompanied cognitive-history checks impossible without falsifying observations', () => {
    const { r, p, o, entity } = fixture('认知障碍');
    p.preset!.entityProfile = { ...entity, companion: '无' };
    o.check = { skill: 'clinical', dc: 11, failure: {}, failureText: '未核实' }; o.mechanics!.operation = 'history';
    expect(patientCheckAdjustment(r, p, o).automaticFailure).toBe(true);
    o.mechanics!.operation = 'observe'; o.check.skill = 'observe';
    expect(patientCheckAdjustment(r, p, o).automaticFailure).toBe(false);
  });
  it('privacy changes only the companion penalty and not concealment difficulty', () => {
    const { r, p, o, entity } = fixture(); p.preset!.entityProfile = { ...entity, companion: '配偶', flags: [], concealment: 2 };
    o.check = { skill: 'clinical', dc: 11, failure: {}, failureText: '未核实' }; o.mechanics!.operation = 'history';
    expect(patientCheckAdjustment(r, p, o).dcDelta).toBe(4);
    o.id += ':private'; expect(patientCheckAdjustment(r, p, o).dcDelta).toBe(2);
  });
  it('records self-media once without manufacturing a complaint or ending a night patient', () => {
    const { r, p, card, o } = fixture('自媒体'); o.mechanics!.operation = 'history';
    const result = afterPatientChoice(r, p, card, o);
    expect(result.effects!.flags).toContain(`patient:${p.uid}:recorded`);
    expect(result.effects!.flags).not.toContain(`patient:${p.uid}:complaint`);
    expect(result.effects!.emotion).toBe(-5); expect(result.cards!.every(c => c.last === false && c.shiftPhase === card.shiftPhase)).toBe(true);
    result.effects!.flags!.forEach(f => r.facts[f] = { day: 3, source: 'recording', sequence: 1 });
    expect(afterPatientChoice(r, p, card, o).effects!.emotion).toBeUndefined();
  });
  it('consumes T30 only when this same patient’s complaint would escalate', () => {
    const { r, p, card, o } = fixture('自媒体'); r.reputation = 10; p.damage = 2;
    const own = `complaint-suppressed:${p.uid}`, other = 'complaint-suppressed:another-patient';
    r.facts[own] = r.facts[other] = { day: r.day, source: 'conceal', sequence: 1 };
    let result: ReturnType<typeof afterPatientChoice> | undefined;
    for (let i = 0; i < 100; i++) { r.seed = `suppression-${i}`; const found = afterPatientChoice(r, p, card, o, true, true); if (found.effects?.flags?.includes(`patient:${p.uid}:complaint`)) { result = found; break; } }
    expect(result).toBeDefined(); expect(result!.effects!.flags).not.toContain(`patient:${p.uid}:complaint-escalated`);
    expect(result!.effects!.flags).toContain(`patient:${p.uid}:complaint-escalation-postponed`);
    expect(result!.effects!.clear).toEqual([own]); expect(r.facts[other]).toBeDefined();
    expect(p.damage).toBe(2); expect(result!.effects!.reputation).toBeLessThan(0);
    delete r.facts[own];
    expect(afterPatientChoice(r, p, card, o, true, true).effects!.flags).toContain(`patient:${p.uid}:complaint-escalated`);
  });
  it('uses actual graph outcome effects, not the unexecuted success effects', () => {
    const { r, p, card, o } = fixture('自媒体');
    const actual = { hazards: [{ type: 'R' as const, weight: 10, reason: '实际失败遗漏', norm: '核对必要项目', causal: false }] };
    const result = afterPatientChoice(r, p, card, o, false, true, actual);
    expect(result.effects!.flags).toContain(`patient:${p.uid}:video-posted`);
    expect(result.effects!.reputation).toBeLessThanOrEqual(-15);
  });
  it('leaves unfinished care unfinished when failed comfort leads to departure', () => {
    const { r, p, card, o } = fixture('精神障碍史'); o.check = { skill: 'comfort', dc: 11, failure: {}, failureText: '沟通未成' }; o.mechanics!.operation = 'comfort';
    expect(afterPatientChoice(r, p, card, o, true).stopLocalCare).toBe(false);
    let departures = 0;
    for (let i = 0; i < 100; i++) {
      r.seed = `departure-${i}`; const result = afterPatientChoice(r, p, card, o, false);
      if (!result.stopLocalCare) continue; departures++;
      expect(result.effects!.hazards).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'R', weight: 10 })]));
      expect(result.effects!.discharge).toBeUndefined();
      expect(result.effects!.flags).not.toContain('completed-exam');
      expect(result.cards!.some(c => c.text.includes('不是同意转院'))).toBe(true);
    }
    expect(departures).toBeGreaterThan(0); expect(departures).toBeLessThan(50);
  });
  it('keeps every original source DC as a playable check, including retries', () => {
    for (const preset of CASE_PRESETS) for (const [index, probe] of presetProbes(preset).entries()) {
      const found = preset.scenes.flatMap(s => s.options).find(o => o.id.includes(`source-probe-${index + 1}`));
      expect(found?.check?.dc, `${preset.id} check ${index + 1}`).toBe(probe.dc);
      if (probe.retry) expect(found?.when?.all).toContain(`preset:${preset.id}:probe-${index}-failed`);
    }
  });
  it('never confuses a later encounter with a prior visit', () => {
    const { r, p } = fixture(); r.patients.push({ ...p, uid: 'later-visit' });
    expect(patientProfile(r, p)!.visit).toBe(1);
    expect(patientProfile(r, r.patients[1])!.visit).toBe(2);
  });
  it('uses the daily baseline for general explanations and preserves explicit source DCs', () => {
    const r = { seed: 'late-baseline', day: 14, patients: [], facts: {}, reputation: 50 } as unknown as Run;
    const preset = pickPreset(r, '门诊', 'baseline')!, found = instantiatePatientPreset(r, preset.id, 'late', '门诊')!;
    const explanation = found.definition.steps.flatMap(s => s.options).find(o => o.id.endsWith(':communication:explain'))!;
    expect(explanation.check?.dc).toBe(15);
    for (const option of found.definition.steps.flatMap(s => s.options).filter(o => o.id.includes('source-probe-'))) {
      const source = preset.scenes.flatMap(s => s.options).find(o => option.id.endsWith(o.id.split(`preset:${preset.id}:`)[1]));
      expect(option.check?.dc).toBe(source?.check?.dc);
    }
  });
  it('starts the ward with two elderly entities including a transferred patient', () => {
    const r = { seed: 'opening-ward', day: 1, patients: [], facts: {}, reputation: 50 } as unknown as Run;
    for (let i = 0; i < 2; i++) {
      const preset = pickPreset(r, '病区', `ward-${i}`)!;
      const found = instantiatePatientPreset(r, preset.id, `ward-${i}`, '病区')!;
      expect(found.entity.ageYears).toBeGreaterThanOrEqual(60);
      if (!i) expect(found.entity.transferred).toBe(true);
      r.patients.push({ uid: `ward-${i}`, entityId: found.entity.id, caseId: preset.id, admitted: 1, active: true, preset: found.definition } as Patient);
    }
  });
});
