import { RULES } from './rules';
import type { Patient, Run } from './types';

export type PerformanceQuality = 'good' | 'ordinary' | 'none';
/** Prefer an authored performance amount. Otherwise use the explicitly sourced
 * fictional budget weighting, always from the initial—not appealed—budget. */
export function performanceForBudget(initialBudget: number, authoredAmount?: number): number {
  if (authoredAmount !== undefined && Number.isFinite(authoredAmount)) return Math.max(0, Math.round(authoredAmount));
  const p = RULES.performance;
  return Math.max(p.goodMin, Math.min(p.goodMax, Math.round(Math.max(0, initialBudget) * p.budgetRate / p.roundTo) * p.roundTo));
}

/** The engine supplies quality from the committed outcome and actual harm.
 * This function does not invent successful care or infer it from action labels. */
export function patientPerformance(r: Pick<Run, 'facts'>, patient: Patient, context: { period: 'day' | 'night'; quality: PerformanceQuality; authoredAmount?: number }) {
  if (context.quality === 'none') return { amount: 0, quality: 'none' as const, reason: '尚未完成接诊，或本次结果不符合绩效发放条件。' };
  const payment = patient.preset?.entityProfile?.payment ?? patient.preset?.payment ?? '';
  const arrearsApproved = payment.includes('欠费') && !!r.facts[`patient:${patient.uid}:arrears-assessment-approved`];
  const quality = arrearsApproved ? 'ordinary' as const : context.quality;
  if (context.period === 'night') return { amount: RULES.nightPay, quality, reason: '已完成夜班接诊，按每起夜诊标准结算。' };
  if (quality === 'ordinary') return { amount: RULES.performance.ordinary, quality, reason: arrearsApproved ? '欠费患者同意必要检查，本次绩效按处置一般结算。' : '本次接诊绩效按处置一般结算。' };
  return { amount: performanceForBudget(patient.initialBudget, context.authoredAmount ?? patient.preset?.performanceGood), quality, reason: '按病例原始病组权重结算，后续预算申诉不增加绩效。' };
}
