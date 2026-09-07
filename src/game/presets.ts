import { CASE_PRESETS, PRESET_BY_ID, ENTITY_BY_ID, compatibleEntities, instantiatePreset, PRESET_END } from '../content/patients';
import tuning from '../content/patients/tuning.json';
import { runRandom } from './run-random';
import { RULES } from './rules';
import type { Card, Patient, Run } from './types';
import type { CasePreset, PatientEntity, PatientPeriod } from '../content/patients';
import {PRESET_ENTRY_COPY,applyEntryEvidence}from '../content/patients/entry-copy';
import {projectParticipantScene}from '../content/patients/participant-copy';
import {projectPresetAgeBranches}from '../content/patients/age-branches';
import {projectInvestigationCopy}from '../content/patients/middle-copy';

const group = (e: PatientEntity) => {
  const sourceGroup = Number(e.source.match(/\/(\d+)_/)?.[1] ?? 0);
  return sourceGroup <= 5 ? sourceGroup : e.ageYears < 18 ? 1 : e.ageYears < 40 ? 2 : e.ageYears < 60 ? 3 : 4;
};
const complaint = (e: PatientEntity) => e.flags.includes('律师') ? 3 : Math.max(e.complaintTendency, e.flags.includes('自媒体') ? 2 : 0);
const paymentGroup = (e: PatientEntity) => e.payment.includes('欠费') ? '欠费' : e.payment.startsWith('自费') ? '自费' : e.payment.startsWith('商保') ? '商保' : e.payment.startsWith('工伤') ? '工伤' : '医保';
const paymentInventory = Object.fromEntries(['医保', '自费', '商保', '欠费', '工伤'].map(key => [key, [...ENTITY_BY_ID.values()].filter(e => paymentGroup(e) === key).length]));
const dayOf = (r: Run) => Math.max(1, Math.min(14, r.day ?? 1));
const priorEntities = (r: Run) => r.patients.map(p => ({ patient: p, entity: p.entityId ? ENTITY_BY_ID.get(p.entityId) : undefined }));
const previousGood = (r: Run, p: Patient) => !!r.facts?.[`preset:${p.caseId}:${p.uid}:success`] && p.damage <= p.mitigated;
const compatibilityCache = new Map<string, PatientEntity[]>();
function compatiblePool(preset: CasePreset, period?: PatientPeriod) {
  const key = `${preset.id}:${period ?? 'any'}`;
  if (!compatibilityCache.has(key)) compatibilityCache.set(key, compatibleEntities(preset, period));
  return compatibilityCache.get(key)!;
}
function hiddenItems(text: string) {
  return ['饮酒|酒精|白酒', '药|处方|吸入剂', '过敏|药疹', '自伤|不想活|伤害自己', '收入|欠费|经济', '妊娠|孕|停经', '性史|性生活', '宗教|信仰'].filter(pattern => new RegExp(pattern).test(text));
}
function legalPool(r: Run, preset: CasePreset, period?: PatientPeriod) {
  const prior = priorEntities(r), day = dayOf(r);
  return compatiblePool(preset, period).filter(entity => {
    const appearances = prior.filter(x => x.entity?.id === entity.id);
    if (appearances.length >= 2 || appearances.some(x => x.patient.active)) return false;
    if (group(entity) === 5 && (day === 1 || prior.some(x => x.patient.admitted === day && x.entity && group(x.entity) === 5))) return false;
    return ['关系户', '律师', '自媒体'].every(flag => !entity.flags.includes(flag) || prior.filter(x => x.entity?.flags.includes(flag)).length < 2);
  });
}
const needsRecorder = (r: Run) => [2, 7].includes(dayOf(r)) && !priorEntities(r).some(x => x.patient.admitted === dayOf(r) && x.entity && complaint(x.entity) >= 2);

/** Weights affect ordering only. Age, sex, fixed flags and period are never relaxed. */
export function patientEntityWeight(r: Run, preset: CasePreset, entity: PatientEntity, period?: PatientPeriod): number {
  const day = dayOf(r), g = group(entity), c = complaint(entity);
  let weight = preset.hasHidden ? entity.concealment : entity.concealment === 3 ? .5 : 1;
  if (preset.hasHidden && hiddenItems(preset.hidden).some(item => hiddenItems(entity.concealedFact).includes(item))) weight *= 2;
  if (c >= 2) weight *= day <= 3 ? .5 : day >= 10 ? 1.5 : 1;
  if (c >= 2 && r.reputation < 20) weight *= 1.5;
  if (period === '门诊') weight *= ({ 1: .8, 2: 1, 3: 1.2, 4: 1.2, 5: .6 } as Record<number, number>)[g] ?? 1;
  if (period === '夜班') { if (g === 4) weight *= 1.5; if (entity.categories.some(c => ['中毒', '创伤', '心血管'].includes(c))) weight *= 1.5; }
  if (day >= 5 && /欠费|自费/.test(entity.payment)) weight *= 1.3;
  const payment = paymentGroup(entity);
  // Targets are normalized against the source inventory, then legality narrows the pool.
  weight *= ({ 医保: .60, 自费: .20, 商保: .08, 欠费: .07, 工伤: .05 })[payment] / paymentInventory[payment];
  const earlier = priorEntities(r).find(x => x.entity?.id === entity.id);
  const previousPreset = earlier && PRESET_BY_ID.get(earlier.patient.caseId);
  if (previousPreset && preset.constraints.categories.some(c => previousPreset.constraints.categories.includes(c))) weight *= 2;
  return weight;
}
const ranked = <T>(items: T[], r: Run, key: string, weight: (item: T) => number) => items
  .map((value, i) => ({ value, score: -Math.log(Math.max(Number.EPSILON, runRandom(r, `${key}:${i}`))) / weight(value) }))
  .filter(x => Number.isFinite(x.score)).sort((a, b) => a.score - b.score).map(x => x.value);

export function pickPreset(r: Run, period: PatientPeriod, key: string) {
  let pool = CASE_PRESETS.filter(preset => preset.constraints.periods.includes(period) && legalPool(r, preset, period).some(e => patientEntityWeight(r, preset, e, period) > 0));
  const seen = new Set(r.patients.map(p => p.caseId));
  pool = pool.filter(preset => !seen.has(preset.id));
  if (needsRecorder(r)) {
    const eligible = pool.filter(preset => legalPool(r, preset, period).some(e => complaint(e) >= 2 && patientEntityWeight(r, preset, e, period) > 0));
    if (eligible.length) pool = eligible;
  }
  if (period === '门诊' && dayOf(r) >= 11 && dayOf(r) <= 13) {
    const prior = priorEntities(r);
    const missing = [
      { seen: prior.some(x => x.entity && x.entity.ageYears < 18), fits: (p: CasePreset) => p.department === '儿科' },
      { seen: prior.some(x => x.entity && x.entity.ageYears >= 60), fits: (p: CasePreset) => p.constraints.ageMin >= 60 },
      { seen: prior.some(x => x.patient.preset?.department === '妇产'), fits: (p: CasePreset) => p.department === '妇产' },
    ].find(group => !group.seen && pool.some(group.fits));
    if (missing) return ranked(pool.filter(missing.fits), r, `preset-guarantee:${key}`, () => 1)[0];
  }
  if (period === '病区' && !priorEntities(r).some(x => x.entity?.transferred)) {
    const transfer = pool.filter(p => legalPool(r, p, period).some(e => e.transferred));
    if (transfer.length) pool = transfer;
  }
  if (period === '病区' && dayOf(r) === 1 && priorEntities(r).filter(x => x.entity && group(x.entity) === 4).length < 2) {
    const elderly = pool.filter(p => legalPool(r, p, period).some(e => group(e) === 4 && patientEntityWeight(r, p, e, period) > 0));
    if (elderly.length) pool = elderly;
  }
  if (period === '门诊') {
    const day = dayOf(r), total = RULES.patientCount[day - 1];
    const target = day === 1 ? Number(runRandom(r, 'day-one-hidden') < tuning.hiddenRates[0]) : Math.ceil(total * tuning.hiddenRates[day - 1]);
    const todays = r.patients.filter(p => p.admitted === day && p.preset?.period === '门诊');
    const hiddenSoFar = todays.filter(p => PRESET_BY_ID.get(p.caseId)?.hasHidden).length;
    const preferred = pool.filter(p => p.hasHidden === (hiddenSoFar < target));
    if (preferred.length) pool = preferred;
  }
  return ranked(pool, r, `preset-deck:${period}:${key}`, () => 1)[0];
}
export function instantiatePatientPreset(r: Run, caseId: string, uid: string, period?:PatientPeriod) {
  const preset = PRESET_BY_ID.get(caseId);
  if (!preset) return;
  let candidates = legalPool(r, preset, period);
  if (needsRecorder(r) && candidates.some(e => complaint(e) >= 2 && patientEntityWeight(r, preset, e, period) > 0)) candidates = candidates.filter(e => complaint(e) >= 2);
  if (period === '病区' && !priorEntities(r).some(x => x.entity?.transferred) && candidates.some(e => e.transferred)) candidates = candidates.filter(e => e.transferred);
  if (period === '病区' && dayOf(r) === 1 && priorEntities(r).filter(x => x.entity && group(x.entity) === 4).length < 2 && candidates.some(e => group(e) === 4)) candidates = candidates.filter(e => group(e) === 4);
  const order = ranked(candidates, r, `entity:${uid}`, e => patientEntityWeight(r, preset, e, period));
  const entity = order[0];
  if (!entity) throw new Error(`No compatible patient for ${caseId}`);
  const previous = r.patients.find(p => p.entityId === entity.id);
  const priorGood = !!previous && previousGood(r, previous);
  const profile = { ...entity, concealment: Math.max(0, entity.concealment - Number(!!previous)), complaintTendency: Math.min(3, complaint(entity) + Number(!!previous && !priorGood)) };
  if (needsRecorder(r) && complaint(entity) >= 2) profile.companion = `${entity.companion === '无' ? '本人' : entity.companion}（录音者）`;
  // The person's fixed history is not replaced by the preset's diagnosis or
  // unperformed test findings. Case evidence comes from its own clinical steps.
  const definition = instantiatePreset(preset, profile, uid, period);
  // Authored DC probes retain their own number. Newly added general questions
  // and explanations use design 01's daily baseline, then entity modifiers apply.
  for (const scene of definition.steps) for (const option of scene.options) {
    if (option.check && (option.id.endsWith(':communication:explain') || option.id.endsWith(':entity-needs:address') && option.check.skill === 'clinical')) option.check.dc = tuning.clinicalDc[dayOf(r) - 1];
  }
  definition.entityProfile = profile;
  if (previous) {
    definition.revisit = { previousPatientId: previous.uid, priorGood, nonAdherent: entity.adherence === '低' };
    definition.steps[0].text = `你见过${entity.name}。这是本轮第二次接诊。\n${definition.steps[0].text}`;
    const prefix = `preset:${caseId}:${uid}`;
    if (entity.adherence === '高') {
      definition.steps[0].text += '\n患者带来了完整的用药清单，药名与实际使用情况可以直接核对。';
      const address = definition.steps.find(s => s.id.endsWith(':entity-needs'))?.options.find(o => o.id.endsWith(':address'));
      if (address && entity.flags.includes('多重用药')) { address.ap = Math.max(0, address.ap - 1); address.minutes = Math.max(0, address.minutes - 5); }
    }
    if (entity.adherence === '低') {
      const next = definition.steps[0].id, node = `${prefix}:revisit`;
      definition.steps.unshift({ id: node, title: `${entity.name} · 上次回去之后`, text: '患者没有完全执行上次的安排。病历上的“已交代”不能证明回家后已经做到，需要确认实际情况与困难。', options: [
        { id: `${node}:verify`, label: '核对实际执行情况，重新安排能做到的计划', ap: 0, minutes: 3, cost: 0, next, mechanics: { operation: 'history', actor: 'patient', quality: 'correct' }, effects: { flags: [`${prefix}:nonadherence-reviewed`] }, result: '你记下患者实际做了什么、哪些要求还没做到，也问清了暂时做不到的原因，再继续评估病情。' },
        { id: `${node}:repeat`, label: '沿用“已经交代”的记录，不再核对实际执行', ap: 0, minutes: 0, cost: 0, next, mechanics: { operation: 'other', actor: 'patient', quality: 'incorrect' }, effects: { flags: [`${prefix}:nonadherence-unresolved`] }, result: '原说明仍在，但执行情况尚未核实。旧告知不会免除本次遗漏的风险。' },
      ] });
      const tailored = definition.steps.find(s => s.id.endsWith(':decision'))?.options.find(o => o.id.endsWith(':tailored'));
      if (tailored) tailored.when = { ...tailored.when, none: [...tailored.when?.none ?? [], `${prefix}:nonadherence-unresolved`] };
      const consult = definition.steps.find(s => s.id.endsWith(':decision'))?.options.find(o => o.id.endsWith(':consult'));
      if (consult) { consult.effects.clear = [...consult.effects.clear ?? [], `${prefix}:nonadherence-unresolved`]; consult.effects.flags = [...consult.effects.flags ?? [], `${prefix}:nonadherence-reviewed`]; }
    }
  }
  return { entity: profile, definition };
}
export function presetCard(r: Run, p: Patient, nodeId?: string, kind: Card['kind'] = 'quick'): Card | undefined {
  const definition = p.preset;
  if (!definition || nodeId === PRESET_END || p.presetResolved) return;
  const node = definition.steps.find(scene => scene.id === (nodeId ?? p.presetNode ?? definition.steps[0].id));
  if (!node) throw new Error(`Missing preset node ${definition.id}:${nodeId}`);
  p.presetNode = node.id;
  return refreshPresetEntryCopy(r,{ ...structuredClone(node), kind,
    id: `${node.id}:visit:${r.journal.length}`, presetNode: node.id,
    scope: {kind:'patient',id:p.uid}, patientId:p.uid, caseId:p.caseId,
  });
}
export function isPresetEnd(next: string | undefined) { return next === PRESET_END; }

/** Update only an unperformed entry in an older saved case. Old journal results
 * and a check already on screen are history, not a chance to change its die/DC. */
export function refreshPresetEntryCopy(r:Run,card:Card):Card {
  if(!card.presetNode||!card.patientId)return card;
  const patient=r.patients.find(p=>p.uid===card.patientId),id=patient?.preset?.presetId;
  const copy=id&&PRESET_ENTRY_COPY[id];if(!copy||!id)return card;
  const entity=patient.preset?.entityProfile??(patient.entityId?ENTITY_BY_ID.get(patient.entityId):undefined);
  const projected=entity?projectParticipantScene(card,entity):card;
  const refreshed={...projected,options:card.options.map((saved,index)=>{
    if(r.committed.includes(saved.id))return saved;
    if(r.pendingCheck?.kind==='choice'&&r.pendingCheck.cardId===card.id&&r.pendingCheck.optionId===saved.id)return saved;
    if(!saved.id.endsWith(':entry:history'))return projected.options[index];
    const current=projected.options[index];
    const option={...current,result:copy.result,mechanics:{...current.mechanics,operation:copy.operation,actor:current.mechanics?.actor??'patient' as const,quality:current.mechanics?.quality??'correct' as const}};
    applyEntryEvidence(id,option);
    if(option.check?.skill==='observe')option.mechanics.checkOperation='observe';
    return option;
  })};
  const middle=projectInvestigationCopy(refreshed,id,option=>!r.committed.includes(option.id)&&!(r.pendingCheck?.kind==='choice'&&r.pendingCheck.cardId===card.id&&r.pendingCheck.optionId===option.id));
  return projectPresetAgeBranches(middle,id,patient.preset!.age);
}
