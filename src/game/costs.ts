import { RULES } from './rules';
import type { Card, Option, Patient, Run, Skill } from './types';

const has = (r: Run, id: string) => r.talents.includes(id) || r.debuffs.includes(id);
export function skillModifier(r: Run, skill: Skill): number {
  let n = r.skills[skill];
  if (skill === "observe")
    n +=
      (has(r, "T04") ? 1 : 0) -
      (has(r, "B02") ? 2 : 0) -
      (has(r, "B05") ? 1 : 0);
  if (skill === "comfort")
    n += (has(r, "T11") ? 2 : 0) - (r.vitals.san < 50 ? 2 : 0);
  if (skill === "persuade")
    n +=
      (has(r, "T14") ? 2 : 0) -
      (has(r, "B13") ? 2 : 0) -
      (has(r, "B21") ? 1 : 0);
  if (skill === "endure")
    n +=
      (r.relations.family >= 4 ? 2 : r.relations.family >= 3 ? 1 : 0) -
      (has(r, "B07") ? 1 : 0) -
      (has(r, "B16") ? 1 : 0) -
      (r.debt >= 15000 ? 2 : r.debt >= 5000 ? 1 : 0);
  return n - Math.floor(r.depression / 25) - (r.overtime > 0 ? 1 : 0);
}

/** Modifier at the instant the die is rolled, after upfront AP/night costs. */
export function previewCheckModifier(r: Run, o: Option, card: Card | undefined): number {
  if (!o.check) return 0;
  const state = { ...r, caps: { ...r.caps }, vitals: { ...r.vitals } };
  const over = Math.max(0, o.ap - r.ap);
  if (over) {
    state.overtime += over;
    for (const vital of ['san', 'stamina', 'emotion'] as const) {
      state.caps[vital] = Math.max(1, state.caps[vital] - RULES.overtimeCapLoss * over);
      state.vitals[vital] = Math.min(state.vitals[vital], state.caps[vital]);
    }
  }
  if (card?.kind === 'night') {
    if (has(r, 'B06')) state.vitals.san -= 3;
    if (r.nightMinutes - actionMinutes(r, o, card) < 0) state.vitals.san -= 3;
  }
  return skillModifier(state, o.check.skill);
}
/** One calculation for both the choice preview and the posted patient ledger. */
export function treatmentCost(r: Run, o: Option): number {
  return Math.round(o.cost * (has(r, 'T26') ? 1.2 : 1) * (has(r, 'B20') ? 1.15 : 1));
}
export function personalLiability(r: Run, spent: number, budget: number): number {
  return Math.round(Math.max(0, spent - budget) * RULES.budgetShare * (has(r, 'B24') ? 1.2 : 1));
}
export function actionMinutes(r: Run, o: Option, card: Card | undefined): number {
  let minutes = o.minutes + (has(r, 'T06') ? 1 : 0);
  if (has(r, 'B08')) minutes = Math.ceil(minutes * 1.15);
  if (has(r, 'B22')) minutes = Math.ceil(minutes * (o.effects.hazards?.some(h => h.type === 'R') ? .8 : 1.2));
  return card ? minutes : o.minutes;
}
export function patientPayment(r: Run, p: Patient, o: Option) {
  const treatment = treatmentCost(r, o);
  const spent = p.spent + treatment;
  const budget = p.budget + Math.max(0, -(o.effects.bill ?? 0));
  const liability = personalLiability(r, spent, budget);
  return {
    treatment, spent, budget,
    personal: Math.max(0, liability - p.charged),
    refund: o.effects.bill && o.effects.bill < 0 ? Math.max(0, p.charged - liability) : 0,
  };
}
