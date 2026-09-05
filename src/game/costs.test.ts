import { describe, expect, it } from 'vitest';
import { act, availableOptions, startRun } from './engine';
import { actionMinutes, patientPayment, previewCheckModifier } from './costs';
import { decode, emptySave, encode } from './storage';
import type { Card, Option } from './types';

function fixture() {
  const r = startRun('cost-contract', '程医生', []);
  const p = r.patients[0];
  p.spent = 900; p.budget = 1000; p.charged = 0;
  const option: Option = { id:'cost-test', label:'核查', ap:1, minutes:10, cost:144, result:'完成', effects:{} };
  const card: Card = { id:'cost-card', kind:'clinical', title:'核查', text:'', patientId:p.uid, scope:{kind:'patient', id:p.uid}, options:[option] };
  r.queue = [card]; r.cursor = 0;
  return { r, p, option, card };
}
describe('player-visible cost contract', () => {
  it('uses the patient budget before charging the doctor', () => {
    const {r,p,option} = fixture(); p.budget = 2000;
    expect(patientPayment(r,p,option)).toMatchObject({treatment:144,personal:0,spent:1044});
    const next = act(r,{type:'choose',id:option.id});
    expect(next.cash).toBe(r.cash); expect(next.patients[0].spent).toBe(1044);
  });
  it('previews and posts only the new excess, including fee modifiers', () => {
    const {r,p,option} = fixture(); r.talents = ['T26']; r.debuffs = ['B20','B24'];
    const preview = patientPayment(r,p,option);
    const next = act(r,{type:'choose',id:option.id});
    expect(r.cash-next.cash).toBe(preview.personal);
    expect(next.patients[0].spent-p.spent).toBe(preview.treatment);
    expect(next.feedback?.changes.some(x=>x.startsWith('诊疗记账'))).toBe(true);
  });
  it('does not charge already-paid excess again', () => {
    const {r,p,option} = fixture(); p.spent = 1200; p.charged = 200;
    expect(patientPayment(r,p,option).personal).toBe(144);
    expect(act(r,{type:'choose',id:option.id}).cash).toBe(r.cash-144);
  });
  it('refund preview matches the posted budget exception', () => {
    const {r,p,option} = fixture(); p.spent = 1200; p.charged = 200; option.cost=0; option.effects={bill:-300};
    expect(patientPayment(r,p,option).refund).toBe(200);
    expect(act(r,{type:'choose',id:option.id}).cash).toBe(r.cash+200);
  });
  it('shows the time actually removed from night duty', () => {
    const {r,option,card} = fixture(); r.talents=['T06'];r.debuffs=['B08']; card.kind='night';r.nightMinutes=240;
    expect(r.nightMinutes-act(r,{type:'choose',id:option.id}).nightMinutes).toBe(actionMinutes(r,option,card));
  });
  it('a zero-action skip from an older save no longer triggers observation dice', () => {
    const {r,option} = fixture(); option.ap=0;option.cost=0;option.label='跳过评估';option.check={skill:'observe',dc:30,failure:{ap:-1},failureText:'补核'};
    expect(availableOptions(r)[0].check).toBeUndefined();
    const next = act(r,{type:'choose',id:option.id});
    expect(next.phase).toBe('feedback');expect(next.ap).toBe(r.ap);
  });
  it('a failed information check adds the announced work without inventing injury', () => {
    const {r,p,option} = fixture();r.ap=1;
    option.check={skill:'observe',dc:100,failure:{ap:-1,stamina:-3},failureText:'补核完成'};
    const next=act(r,{type:'choose',id:option.id});
    expect(next.roll?.success).toBe(false);expect(next.overtime).toBe(1);
    expect(next.caps.san).toBe(r.caps.san-2);expect(next.patients[0].damage).toBe(p.damage);
  });
  it('previews the actual die modifier after upfront AP overdraw', () => {
    const {r, option, card} = fixture(); r.ap = 0;
    option.check = { skill: 'observe', dc: 10, failure: {}, failureText: '未过' };
    const snapshot = JSON.stringify(r), preview = previewCheckModifier(r, option, card);
    expect(preview).toBe(-1); expect(JSON.stringify(r)).toBe(snapshot);
    expect(act(r, { type: 'choose', id: option.id }).roll?.modifier).toBe(preview);
  });
  it('includes night SAN costs that cross the comfort penalty threshold', () => {
    const {r, option, card} = fixture(); card.kind = 'night'; r.nightMinutes = 0;
    r.vitals.san = 52; r.debuffs = ['B06'];
    option.check = { skill: 'comfort', dc: 10, failure: {}, failureText: '未过' };
    expect(previewCheckModifier(r, option, card)).toBe(-2);
    expect(act(r, { type: 'choose', id: option.id }).roll?.modifier).toBe(-2);
  });
  it('reloads a committed refund without paying or rolling a second time', () => {
    const {r,p,option} = fixture(); p.spent=1200; p.charged=200; option.cost=0; option.effects={bill:-300};
    const chosen=act(r,{type:'choose',id:option.id});
    const loaded=decode(encode({...emptySave(),run:chosen})).run!;
    expect(loaded.cash).toBe(r.cash+200);
    expect(act(loaded,{type:'choose',id:option.id})).toBe(loaded);
    expect(loaded.patients[0].charged).toBe(0);
  });
});
