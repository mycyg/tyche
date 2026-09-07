/** Fourteen-day authored-event scan.
 *
 * Repeats the audit of 2026-09-06: start a run, walk every (day × phase),
 * call buildAuthoredEvents and record which authored events were offered.
 * No option is chosen, so chain state (representative ladder, inspection,
 * family line, collapse) does not advance. The result is a floor, not a
 * measured playthrough. Usage: npx tsx scripts/scan-events.ts [seeds]
 */
import { startRun } from '../src/game/engine';
import { buildAuthoredEvents, eligibleAuthoredEvents } from '../src/game/director';
import { AUTHORED_EVENTS } from '../src/content/events/catalog';
import { RULES } from '../src/game/rules';
import type { EventPhase } from '../src/content/events/types';
import type { Card, Run } from '../src/game/types';

const phases: EventPhase[] = ['交班', '查房', '门诊', '结算', '夜班', '日终'];
const seedCount = Number(process.argv[2] ?? 12);

export interface ScanResult {
  perRun: number[];
  byDay: Record<number, number>;
  nightByDay: Record<number, string[]>;
  distinct: Set<string>;
  nightDistinct: Set<string>;
}

function scanOne(seed: number): { ids: Set<string>; byDay: Record<number, number>; night: Record<number, string[]>; nightPool: Record<number, number> } {
  let run = startRun(`event-scan-${seed}`, '程医生', []) as Run;
  const ids = new Set<string>(), byDay: Record<number, number> = {}, night: Record<number, string[]> = {}, nightPool: Record<number, number> = {};
  for (let day = 1; day <= RULES.days; day++) {
    const nightBudget = RULES.nightDays.includes(day as never) ? 200 : 0;
    let working = { ...run, day, nightBudget } as Run;
    for (const phase of phases) {
      if (phase === '夜班' && nightBudget > 0) nightPool[day] = eligibleAuthoredEvents(working as never, '夜班').filter(x => x.event.weight > 0).length;
      const result = buildAuthoredEvents(working as never, phase);
      run = { ...run, ...result.patch } as Run;
      working = { ...working, ...result.patch, day, nightBudget } as Run;
      for (const card of result.cards as Card[]) {
        const id = (card as Card & { authoredEventId?: string }).authoredEventId;
        if (!id) continue;
        ids.add(id);
        byDay[day] = (byDay[day] ?? 0) + 1;
        run.authored!.seen[id] = day;
        if (phase === '夜班') (night[day] ??= []).push(id);
      }
    }
  }
  return { ids, byDay, night, nightPool };
}

const runs = Array.from({ length: seedCount }, (_, i) => scanOne(i));
const totals = runs.map(r => r.ids.size);
const union = new Set(runs.flatMap(r => [...r.ids]));
const dayTotals: Record<number, number[]> = {};
for (const r of runs) for (let day = 1; day <= RULES.days; day++) (dayTotals[day] ??= []).push(r.byDay[day] ?? 0);
const nightCards: Record<number, string[]> = {};
for (const r of runs) for (const [day, list] of Object.entries(r.night)) (nightCards[+day] ??= []).push(...list);
const nightPools: Record<number, number[]> = {};
for (const r of runs) for (const [day, size] of Object.entries(r.nightPool)) (nightPools[+day] ??= []).push(size);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`seeds ${seedCount}  library ${AUTHORED_EVENTS.length}`);
console.log(`per-run distinct events: min ${Math.min(...totals)}  max ${Math.max(...totals)}  mean ${mean(totals).toFixed(1)}`);
console.log(`union across seeds: ${union.size}`);
console.log('day | mean cards | night pool | night cards (distinct ids across seeds)');
for (let day = 1; day <= RULES.days; day++) {
  const list = [...new Set(nightCards[day] ?? [])].sort();
  const pool = nightPools[day] ? `${Math.min(...nightPools[day])}-${Math.max(...nightPools[day])}` : '-';
  console.log(`D${String(day).padStart(2)} | ${mean(dayTotals[day]).toFixed(1).padStart(5)} | ${pool.padStart(9)} | ${list.join(' ') || '-'}`);
}
// Structural supply: how much weight each day's time windows leave open,
// independent of run state. This is the curve 01 §7 asks to rise to D14.
console.log('day | events in window | weight in window');
for (let day = 1; day <= RULES.days; day++) {
  const open = AUTHORED_EVENTS.filter(e => {
    if (e.weight <= 0) return false;
    const range = e.trigger.match(/D(\d+)[–-]D(\d+)/), exact = e.trigger.match(/D(\d+)(?![\d–-])/);
    if (range) return day >= +range[1] && day <= +range[2];
    if (exact && !/任意日/.test(e.trigger)) return day === +exact[1];
    return true;
  });
  console.log(`D${String(day).padStart(2)} | ${String(open.length).padStart(17)} | ${String(open.reduce((n, e) => n + e.weight, 0)).padStart(16)}`);
}
const never = AUTHORED_EVENTS.filter(e => !union.has(e.id));
console.log(`never offered in any seed: ${never.length}`);
console.log(never.map(e => `${e.id}(w${e.weight})`).join(' '));
