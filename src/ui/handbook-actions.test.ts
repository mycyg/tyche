import { describe, expect, it } from 'vitest';
import { act, availableOptions, startRun } from '../game/engine';
import { restCard } from '../game/cards';
import { nextShiftForecast } from '../game/schedule-preview';
import { RULES } from '../game/rules';
import { HANDBOOK } from './handbook';
import type { Card, Run } from '../game/types';
function run(): Run {
  const r = startRun('handbook-actions', '程医生', []);
  r.queue = [restCard(1)]; r.cursor = 0; r.phase = 'play'; r.shiftPhase = '日终';
  r.ap = 10; r.cash = 10000; r.vitals = { stamina: 60, san: 60, emotion: 60 };
  return r;
}
const chapter = (id: string) => HANDBOOK.find(c => c.id === id)!.paragraphs.join('\n');
const choose = (r: Run, id: string) => { const result = act(r, { type: 'choose', id }); return result.phase === 'roll' ? act(result, { type: 'ack-roll' }) : result; };
describe('handbook instructions against actual button actions', () => {
  it('explains the real first-run balance and starting state', () => {
    const r = startRun('handbook-start', '程医生', []);
    expect(r.cash).toBe(RULES.cash - RULES.rent); expect(chapter('route')).toContain(`¥${r.cash}`);
    expect(r.ap).toBe(RULES.ap); expect(r.vitals).toEqual({ stamina: 100, san: 100, emotion: 100 });
    expect(r.reputation).toBe(50); expect(r.relations).toEqual({ chief: 2, nurse: 2, peer: 2, family: 2 });
  });
  it('borrowing has the exact current cost and real next-day repayment', () => {
    const r = run(), borrowed = act(r, { type: 'borrow' });
    expect(borrowed.ap).toBe(11); expect(borrowed.borrowed).toBe(1);
    expect(borrowed.caps).toEqual({ stamina: 99, san: 99, emotion: 99 });
    const forecast = nextShiftForecast(borrowed);
    borrowed.phase = 'feedback'; borrowed.feedback = { title: '换日', text: '核对换日', next: 'day', changes: [] };
    const tomorrow = act(borrowed, { type: 'continue' });
    expect(tomorrow.ap).toBe(forecast.ap); expect(tomorrow.vitals.stamina).toBe(forecast.stamina);
    expect(tomorrow.vitals.san).toBe(65); expect(tomorrow.vitals.emotion).toBe(60);
    expect(tomorrow.borrowed).toBe(0);
  });
  it('ordinary night-shift work consumes minutes, not AP or overtime', () => {
    const r = run(); r.ap = 0; r.nightMinutes = 20; r.shiftPhase = '夜班';
    r.queue = [{ id: 'handbook-night', kind: 'night', last: false, shiftPhase: '夜班', title: '夜班记录', text: '处理待办', scope: { kind: 'personal', id: r.id }, options: [{ id: 'handbook-night:do', label: '核对已有记录', ap: 2, minutes: 5, cost: 0, effects: { stamina: -3 }, result: '记录已核对。' }] } as Card];
    const result = choose(r, 'handbook-night:do');
    expect(result.ap).toBe(0); expect(result.overtime).toBe(0); expect(result.nightMinutes).toBe(15);
    expect(result.vitals.stamina).toBe(57); expect(chapter('schedule')).toContain('不再扣白班行动值');
  });
  it('coffee and naps follow actual limits and do not restore AP', () => {
    let r = run(); r.vitals.stamina = 30;
    for (const [index, gain] of [15, 8, 3].entries()) {
      const before = r.vitals.stamina, cash = r.cash; r = act(r, { type: 'coffee' });
      expect(r.vitals.stamina - before).toBe(gain); expect(r.cash).toBe(cash - RULES.coffeeCost);
      expect(r.ap).toBe(10); expect(r.coffee).toBe(index + 1); r.phase = 'play';
    }
    expect(act(r, { type: 'coffee' })).toBe(r);
    expect(act(r, { type: 'nap' })).toBe(r); // Day-end sleep is not the nap window.
    r.shiftPhase='结算';
    const napped = act(r, { type: 'nap' }); expect(napped.ap).toBe(9); expect(napped.vitals.stamina).toBe(r.vitals.stamina + 10);
    const insufficient = run(); insufficient.shiftPhase='结算';insufficient.ap = 0; expect(act(insufficient, { type: 'nap' })).toBe(insufficient);
  });
  it('separates the ordinary sleep, family call and paid rest outcomes', () => {
    const sleep = choose(run(), 'rest:1:sleep'); expect(sleep.vitals.san).toBe(68); expect(sleep.vitals.emotion).toBe(68); expect(sleep.ap).toBe(10);
    const family = choose(run(), 'rest:1:family'); expect(family.vitals.san).toBe(65); expect(family.vitals.emotion).toBe(70); expect(family.ap).toBe(9); expect(family.relations.family).toBe(3);
    const paid = choose(run(), 'rest:1:care'); expect(paid.cash).toBe(9400); expect(paid.vitals.san).toBe(72); expect(paid.vitals.emotion).toBe(72); expect(paid.ap).toBe(10);
  });
  it('does not confuse clinical psychology with gastroscopy or ordinary paid rest', () => {
    const r = run(); r.debuffs = ['B01', 'B06', 'B03'];
    const counselling = availableOptions(r).find(o => o.talentAction === 'counselling')!;
    const result = choose(r, counselling.id); expect(result.ap).toBe(8); expect(result.cash).toBe(9700); expect(result.vitals.san).toBe(75); expect(result.debuffs).toEqual(['B03']); expect(result.reputation).toBe(45);
    const gastric = availableOptions(r).find(o => o.talentAction === 'gastroscopy')!;
    const examined = choose(r, gastric.id); expect(examined.ap).toBe(8); expect(examined.cash).toBe(9400); expect(examined.debuffs).toEqual(['B01', 'B06']);
    r.talentMemory!.permanentStomach = true; expect(availableOptions(r).some(o => o.talentAction === 'gastroscopy')).toBe(false);
  });
  it('a day-off request leads to a real no-work day and blocks borrowing', () => {
    const r = run(); r.debuffs = ['B02', 'B23'];
    const request = availableOptions(r).find(o => o.talentAction === 'day-off')!;
    const requested = choose(r, request.id); expect(requested.skipNextDay).toBe(true); expect(requested.depression).toBe(5);
    requested.phase = 'feedback'; requested.feedback = { title: '次日', text: '交接已完成', next: 'day', changes: [] };
    const leave = act(requested, { type: 'continue' });
    expect(leave.ap).toBe(0); expect(leave.facts['leave:2']).toBeDefined(); expect(leave.debuffs).toEqual([]);
    expect(leave.relations.peer).toBe(1); expect(act(leave, { type: 'borrow' })).toBe(leave);
  });
  it('credit only covers the shortfall, while family and asset funding have separate costs', () => {
    const r = run(); r.phase = 'funding'; r.cash = -400; r.pendingResume = 'feedback';
    const credit = act(r, { type: 'fund', method: 'credit' }); expect(credit.cash).toBe(0); expect(credit.debt).toBe(400); expect(credit.income).toBe(0);
    const family = act(r, { type: 'fund', method: 'family' }); expect(family.cash).toBe(RULES.familyFunding - 400); expect(family.relations.family).toBe(0); expect(family.vitals.emotion).toBe(50);
    const sale = act(r, { type: 'fund', method: 'asset' }); expect(sale.cash).toBe(RULES.assetSale - 400); expect(sale.vitals.emotion).toBe(55);
  });
});
