import { describe, expect, it } from 'vitest';
import { HANDBOOK, contextualHelp, searchHandbook, handbookTopicForHint } from './handbook';
import { nextShiftForecast, scheduleTuning } from '../game/schedule-preview';
import type { Run } from '../game/types';
import type { EventLedger } from '../content/events/types';
import { talentCopy } from './talent-copy';
import { startRun } from '../game/engine';

function run(patch: Partial<Run> = {}): Run {
  return { id: 'guide', day: 1, phase: 'play', shiftPhase: '交班', talents: [], debuffs: [], borrowed: 0, depression: 10,
    caps: { stamina: 100, san: 100, emotion: 100 }, vitals: { stamina: 100, san: 100, emotion: 100 },
    facts: {}, skipNextDay: false, ap: 10, patients: [], debt: 0, nightMinutes: 0, ...patch } as Run;
}
function withModifiers(r: Run, modifiers: EventLedger['modifiers']): Run {
  const authored=structuredClone(startRun('handbook-events','程医生',[]).authored!);
  authored.ledger={...authored.ledger,modifiers};
  return { ...r, authored };
}

describe('searchable, actionable handbook', () => {
  it('opens a relevant chapter from every context reminder',()=>{
    for(const [id,chapter]of [['leave:3','recovery'],['night-active:3','schedule'],['ap:2','actions'],['fatigue','stamina'],['san','mental'],['overstay','stay'],['debt','debt'],['night:3','schedule']]){
      expect(searchHandbook(handbookTopicForHint(id)).some(c=>c.id===chapter),id).toBe(true);
    }
    expect(handbookTopicForHint('unknown')).toBe('');
  });
  it('keeps all sixteen complete chapters available without requiring a tutorial restart', () => {
    expect(HANDBOOK.map(c => c.id)).toEqual(['route', 'schedule', 'actions', 'stamina', 'mental', 'recovery', 'chart', 'dice', 'patient-decisions', 'budget', 'stay', 'debt', 'consequences', 'ending', 'growth', 'audio']);
    for (const chapter of HANDBOOK) {
      expect(chapter.paragraphs.length, chapter.id).toBeGreaterThanOrEqual(3);
      expect(searchHandbook(chapter.title).some(c => c.id === chapter.id), chapter.id).toBe(true);
      expect(chapter.paragraphs.every(text => text.length > 20), chapter.id).toBe(true);
    }
    expect(HANDBOOK[0].paragraphs.join('')).toContain('没有待办的阶段会自动跳过');
  });
  it('covers every requested operational topic, including save and audio controls', () => {
    for (const term of ['排班', '体力', '精神', '情绪', '预支', '透支', '夜班', '多选', '自付', '录音', '举报', '存档', '声音', '临床心理科', '胃镜', '请假', '退出科室群', '悟性', '令牌', '拒检', '复诊']) {
      expect(searchHandbook(term).length, term).toBeGreaterThan(0);
    }
    expect(new Set(HANDBOOK.map(c => c.id)).size).toBe(HANDBOOK.length);
    expect(searchHandbook(' ap ').some(c => c.id === 'actions')).toBe(true);
    expect(searchHandbook(' SAN ').some(c => c.id === 'mental')).toBe(true);
    expect(searchHandbook('  ')).toHaveLength(HANDBOOK.length);
    expect(searchHandbook('不存在的操作')).toEqual([]);
    expect(searchHandbook('悟性')[0].id).toBe('growth');
    expect(searchHandbook('拒检')[0].id).toBe('patient-decisions');
  });
  it('distinguishes actual emergency choices and per-day/per-run rerolls', () => {
    const text = HANDBOOK.flatMap(c => c.paragraphs).join('\n');
    expect(text).toContain('1 和 2 都是大失败');
    expect(text).toContain('每个新局额外一枚');
    expect(text).toContain('2 行动、个人余额 ¥300');
    expect(text).toContain('2 行动和个人余额 ¥600');
    expect(text).toContain('选择决定恢复多少');
    expect(text).toContain('精神再次归零必定结束');
    expect(text).toContain('每局只有这一次自救机会');
    expect(text).not.toContain('首次归零会中断工作并安排次日停诊');
  });
  it('explains consequences without exposing authoring instructions', () => {
    const text = HANDBOOK.flatMap(c => c.paragraphs).join('\n');
    expect(text).toContain('逐项确认、逐项记账');
    expect(text).toContain('当前阶段的待办处理完');
    expect(text).toContain('导入存档会替换');
    expect(text).toContain('字幕始终保留');
    expect(text).not.toMatch(/待实现|TODO|此页面用于|我们可以|午睡大师/);
  });
  it('shows night time guidance instead of recommending unnecessary AP borrowing', () => {
    const r = run({ day: 3, ap: 0, shiftPhase: '夜班', nightMinutes: 30 });
    expect(contextualHelp(r)?.id).toBe('night-active:3:working');
    expect(contextualHelp({ ...r, nightMinutes: -2 })?.title).toBe('夜班时间已用完');
    expect(contextualHelp({ ...r, phase: 'feedback' })).toBeUndefined();
  });
  it('does not call a full leave day a night shift or suggest borrowing its zero AP',()=>{
    const r=run({day:3,ap:0,facts:{'leave:3':{day:2,source:'approved',sequence:0}}});
    expect(contextualHelp(r)?.id).toBe('leave:3');expect(contextualHelp(r)?.text).toContain('不能预支');
    expect(nextShiftForecast(r)).toMatchObject({afterNight:false,ap:10,stamina:100});
  });
  it('dismissed warnings do not hide unrelated risks or a new day or severity',()=>{
    const r=run({day:4,vitals:{stamina:40,san:40,emotion:100}}),first=contextualHelp(r)!;
    expect(first.id).toBe('fatigue:4:low');const second=contextualHelp(r,[first.id])!;expect(second.id).toBe('san:4:low');
    expect(contextualHelp(r,[first.id,second.id])).toBeUndefined();
    expect(contextualHelp({...r,day:5},[first.id,second.id])?.id).toBe('fatigue:5:low');
    expect(contextualHelp({...r,vitals:{...r.vitals,stamina:20}},[first.id,second.id])?.id).toBe('fatigue:4:severe');
  });
  it('states conditional costs and separates capability rolls from pure chance',()=>{
    const text=HANDBOOK.flatMap(c=>c.paragraphs).join('\n');
    expect(text).toContain('白班临床接诊步骤');expect(text).toContain('概率判定');
    expect(text).toContain('每 1 点行动折为 12 分钟');expect(text).toContain('再进行日终检定');
    expect(text).toContain('不因见过两次就结束');expect(text).toContain('休假不替你处理私人事务');
    expect(text).toContain('旧超支记在原账上');expect(text).toContain('复核前先核对已有卷宗');
    expect(talentCopy.T12.price).toContain('额外消耗 1 点');expect(talentCopy.T12.price).not.toContain('消耗 4 点');
    expect(talentCopy.T17.detail).toContain('额外代价仍另算');
  });
});

describe('schedule projection shares talent and event rules', () => {
  it('is read-only and includes tomorrow repayment without changing current AP', () => {
    const r = run({ borrowed: 2 }); const before = structuredClone(r);
    expect(nextShiftForecast(r)).toMatchObject({ day: 2, ap: 8, stamina: 100, liveCap: 100 });
    expect(nextShiftForecast(r, 1)).toMatchObject({ ap: 7, stamina: 99, liveCap: 99 });
    expect(r).toEqual(before);
  });
  it('combines night fatigue, night-running synergy and insomnia without double penalties', () => {
    expect(nextShiftForecast(run({ day: 3 }))).toMatchObject({ ap: 8, stamina: 70 });
    expect(nextShiftForecast(run({ day: 3, talents: ['T16', 'T17'], caps: { stamina: 120, san: 100, emotion: 100 } }))).toMatchObject({ ap: 10, liveCap: 105, stamina: 90 });
    expect(nextShiftForecast(run({ day: 3, debuffs: ['B01'] }))).toMatchObject({ stamina: 70 });
    expect(nextShiftForecast(run({ talents: ['T04'], debuffs: ['B03'], depression: 50 }))).toMatchObject({ ap: 7 });
  });
  it('applies only active, personally scoped event sleep and leave modifiers', () => {
    const scope = { kind: 'personal', id: 'guide' } as const;
    const r = withModifiers(run(), [
      { id: 'sleep', kind: 'sleep', value: .5, starts: 2, expires: 2, scope, description: '睡眠被打断' },
      { id: 'leave', kind: 'leave', value: 1, starts: 3, expires: 3, scope, description: '已批准休假' },
      { id: 'other', kind: 'sleep', value: .1, starts: 2, expires: 2, scope: { kind: 'patient', id: 'someone' }, description: '患者作用域不改变医生睡眠' },
    ]);
    expect(nextShiftForecast(r)).toMatchObject({ ap: 10, stamina: 50, leave: false });
    expect(nextShiftForecast({ ...r, day: 2 })).toMatchObject({ ap: 0, leave: true });
    expect(scheduleTuning(r, 4).sleep).toBe(1);
  });
  it('includes temporary night shifts in the next-morning projection', () => {
    const r = withModifiers(run({ day: 2 }), [{ id: 'night', kind: 'night-shift', value: 180, starts: 2, expires: 2, scope: { kind: 'personal', id: 'guide' }, description: '临时夜班' }]);
    expect(nextShiftForecast(r)).toMatchObject({ afterNight: true, ap: 8, stamina: 70 });
    expect(nextShiftForecast({...r,day:4})).toMatchObject({afterNight:false,ap:10,stamina:100});
  });
  it('distinguishes a half-day absence from full leave', () => {
    const r = withModifiers(run(), [{ id: 'half', kind: 'leave', value: .5, starts: 2, expires: 2, scope: { kind: 'personal', id: 'guide' }, description: '半天离岗' }]);
    expect(nextShiftForecast(r)).toMatchObject({ leave: false, ap: 6 });
  });
  it('includes an actual added night budget and the eighth-day iron-stomach consequence', () => {
    expect(nextShiftForecast(run({ day: 2, nightBudget: 180 }))).toMatchObject({ afterNight: true, ap: 8 });
    expect(nextShiftForecast(run({ day: 7, talents: ['T20'] }))).toMatchObject({ ap: 9 });
  });
});
