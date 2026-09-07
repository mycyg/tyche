import type { Scope, Skill, Vital } from '../../game/types';
import type { EventLedger, EventModifier } from './types';

export interface EventTuning {
  sleep: number;
  skills: Partial<Record<Skill, number>>;
  allChecks: number;
  arrestDC: number;
  cashPressure: number;
  leave: number;
  addedNightBudget: number;
  coffeePrice?: number;
  coffeeFirst?: number;
  coffeeLimit?: number;
  extraNightMinutes: number;
  outpatientAP: number;
  wardAP: number;
  outpatientHazardR: number;
  nightSanPenalty: number;
  patientDailyCost: number;
  drugEventWeight: number;
}
export const emptyEventTuning = (): EventTuning => ({ sleep: 1, skills: {}, allChecks: 0, arrestDC: 0, cashPressure: 0, leave: 0, addedNightBudget: 0, extraNightMinutes: 0, outpatientAP: 0, wardAP: 0, outpatientHazardR: 0, nightSanPenalty:0, patientDailyCost: 0, drugEventWeight: 1 });
/** Effective content rules for one day/scope. Called by existing cost/roll functions. */
export function eventTuning(ledger: EventLedger, day: number, scope?: Scope, facts: readonly string[] = []): EventTuning {
  const t = emptyEventTuning();
  for (const m of ledger.modifiers) {
    if (m.starts > day || m.expires < day || m.until?.some(f => facts.includes(f))) continue;
    if (scope && m.scope.kind !== 'personal' && (m.scope.kind !== scope.kind || m.scope.id !== scope.id)) continue;
    if (m.kind === 'sleep') t.sleep *= m.value ?? 1;
    if (m.kind === 'skill') {
      if (m.target === 'arrestDC') t.arrestDC += m.value ?? 0;
      else if (m.target === 'all') t.allChecks += m.value ?? 0;
      else if (m.target) t.skills[m.target as Skill] = (t.skills[m.target as Skill] ?? 0) + (m.value ?? 0);
    }
    if (m.kind === 'cash-pressure') t.cashPressure += m.value ?? 0;
    if (m.kind === 'leave') t.leave = Math.max(t.leave, m.value ?? 1);
    if (m.kind === 'night-shift' && day === m.starts) t.addedNightBudget = m.value && m.value > 1 ? m.value : 200;
    if (m.kind === 'formula' && /药代事件|下一阶/.test(m.description)) t.drugEventWeight *= m.factor ?? 1;
    const eventId = m.id.match(/E-\d{3}-[abc]/)?.[0];
    if (eventId === 'E-081-a') t.coffeePrice = 25;
    if (eventId === 'E-081-b') { t.coffeeFirst = 5; t.coffeeLimit = 1; }
    if (/夜班每起急诊\s*\+10\s*分钟/.test(m.description)) t.extraNightMinutes = Math.max(t.extraNightMinutes, 10);
    if (/门诊每病例 AP\s*\+1/.test(m.description)) t.outpatientAP = Math.max(t.outpatientAP, 1);
    if (m.kind==='workload'&&/每病例 AP\s*\+1/.test(m.description)&&!/门诊|查房/.test(m.description)) {t.outpatientAP=Math.max(t.outpatientAP,1);t.wardAP=Math.max(t.wardAP,1);}
    if (/查房 AP\s*\+1/.test(m.description)) t.wardAP = Math.max(t.wardAP, 1);
    if (m.target==='outpatientHazardR') t.outpatientHazardR = Math.max(t.outpatientHazardR, m.value??0);
    if (m.target==='nightSanPenalty') t.nightSanPenalty = Math.max(t.nightSanPenalty, m.value??0);
    if(m.target==='patientDailyCost')t.patientDailyCost+=m.value??0;
  }
  return t;
}
/** Recovery is a set-to value after any cap reduction, never an additive heal. */
export function eventRecovery(modifiers: EventModifier[], vitals: Record<Vital, number>, caps: Record<Vital, number>): Record<Vital, number> {
  const result = { ...vitals };
  for (const m of modifiers) if (m.kind === 'recover' && ['stamina', 'san', 'emotion'].includes(m.target ?? '')) {
    const key = m.target as Vital;
    result[key] = Math.max(0, Math.min(caps[key], m.factor === undefined ? m.value ?? 0 : Math.floor(caps[key] * m.factor)));
  }
  return result;
}
