import { describe, expect, it } from 'vitest';
import { act, availableEncounters, availableOptions, currentCard, startRun } from './engine';
import { decode, emptySave, encode } from './storage';
import type { Card, Effects, Run } from './types';
import type { EventPhase } from '../content/events/types';
import {runDie} from './run-random';

function task(id: string, phase: EventPhase, effects: Effects = {}): Card {
  return { id, kind: phase === '夜班' ? 'night' : 'story', shiftPhase: phase,
    scope: { kind: 'personal', id: 'self' }, title: '交班电话', text: '同事打来电话。',
    options: [{ id: `${id}:answer`, label: '接听电话', ap: 0, minutes: 0, cost: 0,
      result: '你把尚未交接的事项告诉同事。', effects }] };
}
function fixture(phase: EventPhase, effects: Effects, seed = 'acute-review'): Run {
  const r = startRun(seed, '程医生', []);
  r.day = 3; r.shiftPhase = phase; r.phase = 'play'; r.ap = 10;
  r.cash = 20000; r.patients = []; r.vitals = { stamina: 80, san: 80, emotion: 80 };
  r.queue = [task('trigger', phase, effects), task('remaining', phase), task('later', phase === '夜班' ? '日终' : '夜班')];
  r.cursor = 0; delete r.feedback; delete r.roll; delete r.pendingCheck;
  return r;
}
const reload = (r: Run) => decode(encode({ ...emptySave(), run: r })).run!;
const trigger = (r: Run) => act(r, { type: 'choose', id: 'trigger:answer' });
function chooseAcute(r: Run, suffix: string): Run {
  const o = availableOptions(r).find(o => o.id.endsWith(suffix));
  expect(o, suffix).toBeDefined();
  let result = act(r, { type: 'choose', id: o!.id });
  if (result.phase === 'roll') result = act(reload(result), { type: 'ack-roll' });
  return result;
}

describe('review: acute events use the actual interruption, never the next task', () => {
  it.each([3, 6, 9, 12, 14])('keeps a daytime SAN ending on night-duty day %i', day => {
    const r = fixture('结算', { san: -200 }); r.day = day;
    r.queue.splice(1, 1);
    const acute = trigger(r), restored = reload(acute);
    expect(currentCard(restored)?.id).toContain('acute:san');
    const result = chooseAcute(restored, 'E-200-a');
    expect(result.ending?.id).toBe('END-33'); expect(result.ending?.annexIds).toContain('X21'); expect(result.ending?.annexIds).not.toContain('X22');
    expect(result.phase).toBe('ending');
    expect(result.committed.filter(id => id === 'trigger:answer')).toHaveLength(1);
    expect(reload(result).ending).toEqual(result.ending);
  });
  it('retains the night origin when the following task is daytime or rest', () => {
    const result = chooseAcute(reload(trigger(fixture('夜班', { san: -200 }))), 'E-201-a');
    expect(result.ending?.id).toBe('END-33'); expect(result.ending?.annexIds).toContain('X22'); expect(result.ending?.annexIds).not.toContain('X21');
  });
  it.each([['结算', 'X17', 'X20'], ['夜班', 'X20', 'X17']] as const)('routes repeated stamina loss in %s to the %s record', (phase, record, other) => {
    const r = fixture(phase, { stamina: -200 }); r.exhausted = 1; r.queue.splice(1, 1);
    const ending = trigger(r).ending!;
    expect(ending.id).toBe('END-33'); expect(ending.annexIds).toContain(record); expect(ending.annexIds).not.toContain(other);
  });
  it('ends the second emotional breakdown without inventing an escalated complaint', () => {
    const r = fixture('查房', { emotion: -200 }); r.emotionalBreaks = 1;
    const result = trigger(r);
    expect(result.ending?.id).toBe('END-33'); expect(result.ending?.annexIds).toContain('X25'); expect(result.emotionalBreaks).toBe(2);
    expect(result.ending?.decision).not.toContain('投诉已升级');
    expect(Object.keys(result.facts).some(k => /complaint-escalated|医闹升级|视频上网/.test(k))).toBe(false);
  });
});

describe('review: interruption controls and exact resume points', () => {
  it('offers only the acute event and refuses other focus/choices without touching state', () => {
    const r = trigger(fixture('查房', { stamina: -200 })), snapshot = structuredClone(r);
    expect(availableEncounters(r).map(c => c.id)).toEqual([r.emergency!.cardId]);
    expect(act(r, { type: 'focus', id: 'remaining' })).toBe(r);
    expect(act(r, { type: 'choose', id: 'remaining:answer' })).toBe(r);
    for (const type of ['borrow', 'coffee', 'nap'] as const) expect(act(r, { type })).toBe(r);
    expect(r).toEqual(snapshot);
  });
  it('resumes exploration after an interruption on focus, without replaying stale feedback', () => {
    const r = fixture('查房', {}, 'emergency-storage'); r.vitals.stamina = 0;
    r.feedback = { title: '昨天的电话', text: '昨天的通话已经结束。', changes: [], next: 'day' };
    const acute = act(r, { type: 'focus', id: 'trigger' });
    expect(acute.emergency?.resume.phase).toBe('play');
    expect(acute.emergency?.resume.feedback).toBeUndefined();
    const option = availableOptions(acute).find(o => !o.check)!;
    const cared = act(reload(acute), { type: 'choose', id: option.id });
    const resumed = act(reload(cared), { type: 'continue' });
    expect(resumed.phase).toBe('play'); expect(resumed.feedback).toBeUndefined();
    expect(resumed.day).toBe(3); expect(currentCard(resumed)?.id).toBe('trigger');
  });
  it('resumes exploration after funding and clears the old resume marker', () => {
    const r = fixture('查房', {}); r.cash = -100;
    r.feedback = { title: '昨天的电话', text: '昨天的通话已经结束。', changes: [], next: 'day' };
    const suspended = act(r, { type: 'focus', id: 'trigger' });
    expect(suspended.phase).toBe('funding'); expect(suspended.pendingResume).toBe('play');
    const resumed = act(reload(suspended), { type: 'fund', method: 'credit' });
    expect(resumed.phase).toBe('play'); expect(resumed.feedback).toBeUndefined();
    expect(resumed.pendingResume).toBeUndefined(); expect(resumed.debt).toBe(100);
    expect(act(resumed, { type: 'fund', method: 'credit' })).toBe(resumed);
  });
  it('processes two acute resources in order and retains the original feedback once', () => {
    let r = trigger(fixture('查房', { stamina: -200, emotion: -200 }, 'emergency-storage'));
    const original = structuredClone(r.emergency!.resume);
    expect(r.emergency?.vital).toBe('stamina');
    r = act(reload(r), { type: 'choose', id: availableOptions(r).find(o => !o.check)!.id });
    r = act(reload(r), { type: 'continue' });
    expect(r.emergency?.vital).toBe('emotion'); expect(r.emergency?.resume).toEqual(original);
    r = chooseAcute(reload(r), 'E-203-b');
    r = act(reload(r), { type: 'continue' });
    expect(r.emergency).toBeUndefined(); expect(r.feedback).toEqual(original.feedback);
    expect(r.vitals.stamina).toBeGreaterThan(0); expect(r.vitals.emotion).toBeGreaterThan(0);
    expect(r.committed.filter(id => id === 'trigger:answer')).toHaveLength(1);
  });
});

describe('one SAN rescue for the entire run',()=>{
  function rescued(phase:EventPhase):Run {
    const r=trigger(fixture(phase,{san:-200}));
    const option=availableOptions(r).find(o=>o.id.endsWith(phase==='夜班'?'E-201-b':'E-200-b'))!;
    for(let i=0;i<1000;i++){
      r.seed=`san-rescue-${i}`;
      if(runDie(r,`check:${option.id}`)===20)break;
    }
    const result=chooseAcute(reload(r),phase==='夜班'?'E-201-b':'E-200-b');
    expect(result.ending).toBeUndefined();expect(result.sanBreaks).toBe(1);
    expect(result.vitals.san).toBe(phase==='夜班'?10:15);
    return act(reload(result),{type:'continue'});
  }
  it.each([['查房','夜班','X22'],['夜班','查房','X21']] as const)('does not renew the rescue from %s to %s', (first,next,id)=>{
    const r=rescued(first);r.day++;r.phase='play';r.shiftPhase=next;
    r.queue=[task('second-zero',next,{san:-200})];r.cursor=0;
    const result=act(reload(r),{type:'choose',id:'second-zero:answer'});
    expect(result.ending?.id).toBe('END-33');expect(result.ending?.annexIds).toContain(id);expect(result.sanBreaks).toBe(2);
    expect(result.emergency).toBeUndefined();expect(result.pendingCheck).toBeUndefined();
  });
  it('uses existing choices and zero-state records when an old save lacks the new counter',()=>{
    const r=rescued('查房');delete r.sanBreaks;
    delete r.facts['san-ever-zero']; // older saves still have their real E-200-b commitment
    r.phase='play';r.queue=[task('old-save-zero','查房',{san:-200})];r.cursor=0;
    const result=act(reload(r),{type:'choose',id:'old-save-zero:answer'});
    expect(result.ending?.id).toBe('END-33');expect(result.ending?.annexIds).toContain('X21');expect(result.sanBreaks).toBe(2);
  });
  it('counts a first T23 protection and never grants it on a later SAN zero',()=>{
    const r=fixture('查房',{san:-200});r.talents=['T23'];
    const first=trigger(r);expect(first.sanBreaks).toBe(1);expect(first.vitals.san).toBeGreaterThan(0);
    expect(first.talentMemory?.survivalUsed).toBe(true);
    first.phase='play';first.queue=[task('protected-second','查房',{san:-200})];first.cursor=0;
    const result=act(reload(first),{type:'choose',id:'protected-second:answer'});
    expect(result.ending?.id).toBe('END-33');expect(result.ending?.annexIds).toContain('X21');
  });
  it('rejects non-integer counters and future-dated interruption origins',()=>{
    const r=trigger(fixture('查房',{stamina:-200}));
    expect(()=>reload({...r,sanBreaks:-1})).toThrow();expect(()=>reload({...r,sanBreaks:.5})).toThrow();
    expect(()=>reload({...r,emergency:{...r.emergency!,occurred:{day:r.day+1,phase:'夜班'}}})).toThrow();
  });
});
