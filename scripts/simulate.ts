import { act, availableOptions, currentCard, newMeta, startRun } from '../src/game/engine';
import { random } from '../src/game/random';
import { worldCoffeeOffering } from '../src/world/refreshments';
import type { Action, Option, Run } from '../src/game/types';
export type Policy = 'random' | 'careful' | 'reckless';
export function select(r: Run, policy: Policy): Option {
  const opts = availableOptions(r);
  if (!opts.length) throw new Error(`No available choice: ${JSON.stringify({seed:r.seed,day:r.day,card:currentCard(r),patient:r.patients.find(p=>p.uid===currentCard(r)?.patientId)?.clinical})}`);
  if (policy === 'random') return opts[Math.floor(random(r.seed, `policy:${r.cursor}:${r.day}`) * opts.length)];
  const score = (o: Option) => {
    const e = o.effects, h = e.hazards?.reduce((n, x) => n + x.weight * (x.type === 'R' ? 5 : 2), 0) ?? 0;
    if (policy === 'reckless') return o.ap * 30 + (e.cash ?? 0) * -.003 - h * .1;
    let value = h + (e.damage ?? 0) * 300 + o.ap * (r.ap < 3 ? 23 : 7) - (e.cash ?? 0) / 200 + (e.privateDebt ?? 0) / 160
      + Math.max(0, o.ap - r.ap) * 15 - (e.income ?? 0) / 50 - (e.mitigate ?? 0) * 12
      - (e.san ?? 0) * (r.vitals.san < 30 ? 5 : 1) - (e.emotion ?? 0) * (r.vitals.emotion < 30 ? 4 : 1)
      - (e.stamina ?? 0) * (r.vitals.stamina < 30 ? 4 : 1) - (e.stability ?? 0) * 14;
    if (e.plannedDischarge) value -= 100;
    if (e.discharge && !e.plannedDischarge) value += 300;
    for (const [key, n] of Object.entries(e.relations ?? {})) value -= n * ((r.relations as Record<string, number>)[key] <= 1 ? 10 : 3);
    const p = r.patients.find(x => x.uid === currentCard(r)?.patientId);
    if (p && p.spent + o.cost > p.budget) value += (p.spent + o.cost - p.budget) / 150;
    if (o.id.endsWith(':wait')) value += 35;
    // Leaving a patient for tomorrow is the last resort, after overtime.
    if (o.interaction === 'defer') value += 60;
    return value;
  };
  return [...opts].sort((a, b) => score(a) - score(b))[0];
}
export function runSimulation(seed: string, policy: Policy, veteran = false) {
  const meta = newMeta();
  if (veteran) { meta.caps = { stamina: 3, san: 3, emotion: 3 }; meta.cashRank = 3; for (const key of Object.keys(meta.skills)) (meta.skills as Record<string, number>)[key] = 3; }
  let r = startRun(seed, '模拟医生', veteran ? ['T11', 'T16', 'T17'] : ['T06', 'T16', 'T24'], meta), steps = 0;
  while (r.phase !== 'ending' && steps++ < 2400) {
    let a: Action;
    if (r.phase === 'play') {
      if (policy === 'careful' && r.vitals.stamina < Math.min(32, r.caps.stamina - 12) && r.coffee < 2 && worldCoffeeOffering(r).allowed&&!r.facts[`leave:${r.day}`]) a = { type: 'coffee' };
      else a = { type: 'choose', id: select(r, policy).id };
    } else if (r.phase === 'feedback') a = { type: 'continue' };
    else if (r.phase === 'roll') a = { type: 'ack-roll' };
    else if (r.phase === 'debuff') {
      const avoid = ['B12', 'B09', 'B10', 'B03', 'B17', 'B24', 'B01', 'B23'];
      const ranked = [...r.offered].sort((x, y) => (avoid.includes(x) ? 1 : 0) - (avoid.includes(y) ? 1 : 0)); a = { type: 'debuff', id: policy === 'careful' ? ranked[0] : r.offered[0] };
    } else if (r.phase === 'funding') a = { type: 'fund', method: !r.facts['asset-sold'] ? 'asset' : !r.facts['family-funding'] ? 'family' : 'credit' };
    else a = { type: 'testify', response: 'facts' };
    const next = act(r, a); if (next === r) throw new Error(`Stuck ${seed} ${r.phase}: ${JSON.stringify(a)}`); r = next;
    if (Object.values(r.vitals).some(n => !Number.isFinite(n)) || r.ap < 0 || r.debt < 0) throw new Error(`Invalid resources: ${seed}`);
  }
  if (steps >= 2400) throw new Error(`Run did not terminate: ${JSON.stringify({seed,day:r.day,phase:r.phase,card:currentCard(r),last:r.journal.slice(-8)})}`);
  return { r, steps };
}
export interface PolicySummary {
  policy: Policy; veteran: boolean; runs: number;
  reachedDay4: number; reachedCourt: number; averageEndDay: number; actions: number;
  endings: Record<string, number>; staminaEndings: number; topEndingShare: number;
}
/** Deterministic seeds `${prefix}-${i}`; every policy sees the same seed list. */
export function summarize(policy: Policy, veteran: boolean, count: number, prefix = 'qa'): PolicySummary {
  const endings: Record<string, number> = {}; let court = 0, day4 = 0, totalDays = 0, actions = 0;
  for (let i = 0; i < count; i++) {
    const x = runSimulation(`${prefix}-${i}`, policy, veteran), id = x.r.ending!.id;
    endings[id] = (endings[id] ?? 0) + 1; court += +(x.r.day >= 15); day4 += +(x.r.day > 3); totalDays += x.r.day; actions += x.steps;
  }
  const staminaEndings = (endings.X17 ?? 0) + (endings.X20 ?? 0);
  return { policy, veteran, runs: count, reachedDay4: day4 / count, reachedCourt: court / count, averageEndDay: totalDays / count, actions, endings,
    staminaEndings: staminaEndings / count, topEndingShare: Math.max(0, ...Object.values(endings)) / count };
}
/** Balance targets from docs/design/01 §12 (default difficulty, no permanent growth). */
export const BALANCE_TARGETS = {
  carefulCourt: [.35, .6] as const, randomCourt: [.1, .3] as const,
  carefulTopEndingMax: .35, carefulStaminaMax: .25, day4SurvivalMin: .9, carefulAverageEndDayMin: 11,
};
export function balanceFailures(summaries: PolicySummary[]): string[] {
  const failures: string[] = [], pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  for (const s of summaries) {
    const label = `${s.policy}${s.veteran ? '(veteran)' : ''}`;
    if (s.reachedDay4 < BALANCE_TARGETS.day4SurvivalMin) failures.push(`${label}: D1–D3 survival ${pct(s.reachedDay4)} < ${pct(BALANCE_TARGETS.day4SurvivalMin)}`);
    if (s.veteran) continue;
    if (s.policy === 'careful') {
      const [lo, hi] = BALANCE_TARGETS.carefulCourt;
      if (s.reachedCourt < lo || s.reachedCourt > hi) failures.push(`careful: reached day 15 ${pct(s.reachedCourt)} outside ${pct(lo)}–${pct(hi)}`);
      if (s.topEndingShare > BALANCE_TARGETS.carefulTopEndingMax) failures.push(`careful: top ending share ${pct(s.topEndingShare)} > ${pct(BALANCE_TARGETS.carefulTopEndingMax)}`);
      if (s.staminaEndings > BALANCE_TARGETS.carefulStaminaMax) failures.push(`careful: stamina endings ${pct(s.staminaEndings)} > ${pct(BALANCE_TARGETS.carefulStaminaMax)}`);
      if (s.averageEndDay < BALANCE_TARGETS.carefulAverageEndDayMin) failures.push(`careful: average end day ${s.averageEndDay.toFixed(2)} < ${BALANCE_TARGETS.carefulAverageEndDayMin}`);
    }
    if (s.policy === 'random') {
      const [lo, hi] = BALANCE_TARGETS.randomCourt;
      if (s.reachedCourt < lo || s.reachedCourt > hi) failures.push(`random: reached day 15 ${pct(s.reachedCourt)} outside ${pct(lo)}–${pct(hi)}`);
    }
  }
  return failures;
}
if (process.argv[1]?.endsWith('simulate.ts')) {
  const args = process.argv.slice(2), flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const count = Number(args.find(a => /^\d+$/.test(a)) ?? 100), only = flag('policy'), prefix = flag('seed') ?? 'qa';
  const plans = ([['random', false], ['careful', false], ['careful', true], ['reckless', false]] as const)
    .filter(([policy, veteran]) => !only || only === (veteran ? 'veteran' : policy));
  const summaries = plans.map(([policy, veteran]) => summarize(policy, veteran, count, prefix));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(JSON.stringify(summaries.map(s => ({ ...s, reachedDay4: pct(s.reachedDay4), reachedCourt: pct(s.reachedCourt), averageEndDay: +s.averageEndDay.toFixed(2), staminaEndings: pct(s.staminaEndings), topEndingShare: pct(s.topEndingShare) })), null, 2));
  if (args.includes('--assert')) {
    const failures = balanceFailures(summaries);
    if (failures.length) { console.error(`Balance targets missed:\n${failures.map(f => `- ${f}`).join('\n')}`); process.exit(1); }
    console.log('Balance targets met.');
  }
}
