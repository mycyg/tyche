import { act, availableOptions, currentCard, newMeta, startRun } from '../src/game/engine';
import { random } from '../src/game/random';
import type { Action, Option, Run } from '../src/game/types';
export function select(r: Run, policy: 'random' | 'careful' | 'reckless'): Option {
  const opts = availableOptions(r);
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
    return value;
  };
  return [...opts].sort((a, b) => score(a) - score(b))[0];
}
export function runSimulation(seed: string, policy: 'random' | 'careful' | 'reckless', veteran = false) {
  const meta = newMeta();
  if (veteran) { meta.caps = { stamina: 3, san: 3, emotion: 3 }; meta.cashRank = 3; for (const key of Object.keys(meta.skills)) (meta.skills as Record<string, number>)[key] = 3; }
  let r = startRun(seed, '模拟医生', veteran ? ['T11', 'T16', 'T17'] : ['T06', 'T16', 'T24'], meta), steps = 0;
  while (r.phase !== 'ending' && steps++ < 900) {
    let a: Action;
    if (r.phase === 'play') {
      if (policy === 'careful' && r.vitals.stamina < Math.min(32, r.caps.stamina - 12) && r.coffee < 2) a = { type: 'coffee' };
      else a = { type: 'choose', id: select(r, policy).id };
    } else if (r.phase === 'feedback') a = { type: 'continue' };
    else if (r.phase === 'roll') a = { type: 'ack-roll' };
    else if (r.phase === 'debuff') {
      const avoid = ['B12', 'B09', 'B10', 'B03', 'B17', 'B24', 'B01', 'B23'];
      const ranked = [...r.offered].sort((x, y) => (avoid.includes(x) ? 1 : 0) - (avoid.includes(y) ? 1 : 0)); a = { type: 'debuff', id: policy === 'careful' ? ranked[0] : r.offered[0] };
    } else if (r.phase === 'collapse') a = { type: 'collapse', method: 'report' };
    else if (r.phase === 'funding') a = { type: 'fund', method: !r.facts['asset-sold'] ? 'asset' : !r.facts['family-funding'] ? 'family' : 'credit' };
    else a = { type: 'testify', response: 'facts' };
    const next = act(r, a); if (next === r) throw new Error(`Stuck ${seed} ${r.phase}: ${JSON.stringify(a)}`); r = next;
    if (Object.values(r.vitals).some(n => !Number.isFinite(n)) || r.ap < 0 || r.debt < 0) throw new Error(`Invalid resources: ${seed}`);
  }
  if (steps >= 900) throw new Error(`Run did not terminate: ${seed}`);
  return { r, steps };
}
if (process.argv[1]?.endsWith('simulate.ts')) {
  const count = Number(process.argv[2] ?? 100), summary: unknown[] = [];
  for (const [policy, veteran] of [['random', false], ['careful', false], ['careful', true], ['reckless', false]] as const) {
    const ends: Record<string, number> = {}; let court = 0, firstThree = 0, totalDays = 0, steps = 0;
    for (let i = 0; i < count; i++) { const x = runSimulation(`qa-${i}`, policy, veteran); ends[x.r.ending!.id] = (ends[x.r.ending!.id] ?? 0) + 1; court += +(x.r.day >= 15); firstThree += +(x.r.day > 3); totalDays += x.r.day; steps += x.steps; }
    summary.push({ policy, veteran, runs: count, reachedDay4: `${firstThree / count * 100}%`, reachedCourt: `${court / count * 100}%`, averageEndDay: +(totalDays / count).toFixed(2), actions: steps, endings: ends });
  }
  console.log(JSON.stringify(summary, null, 2));
}
