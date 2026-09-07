import {it,expect}from 'vitest';
import {compileClauses,eventToCard,EVENT_BY_ID}from './catalog';
import {createEventLedger,recordEventChoice,scheduleEventClauses,settleEventLedger}from './ledger';
import {eventTuning}from './modifiers';
it('half-day leave reduces today only rather than every remaining shift',()=>{
 const card=eventToCard(EVENT_BY_ID['E-197'],{instanceId:'half-day',scope:{kind:'patient',id:'current-patient'},patientId:'current-patient',day:5,phase:'门诊'});
 const o=card.options.find(o=>o.id.endsWith('E-197-c'))!;
 const ledger=recordEventChoice(createEventLedger(),card,o.id,true);
 const leave=ledger.modifiers.find(m=>m.kind==='leave')!;
 expect(leave.starts).toBe(5);expect(leave.expires).toBe(5);
 expect(eventTuning(ledger,6).leave).toBe(0);
});
it('dated per-case workload is not also a flat day-start AP deduction',()=>{
 const compiled=compileClauses('次日每病例 AP +1','boundary');
 expect(compiled.deferred.every(d=>!d.effects.apAllowance)).toBe(true);
 expect(compiled.modifiers[0]).toMatchObject({kind:'workload',startsAfter:1,days:1});
});
it('dated skill and sleep effects are not empty permanent formulas',()=>{
 expect(compileClauses('次日文书检定 −2','check').modifiers[0]).toMatchObject({kind:'skill',target:'record',value:-2,startsAfter:1,days:1});
 expect(compileClauses('次日睡眠恢复 ×0.5','sleep').modifiers[0]).toMatchObject({kind:'sleep',value:.5,startsAfter:1,days:1});
});
it('a fixed round day does not shift when the choice happens later',()=>{
 const fixed=compileClauses('D9 文书检定 −2','fixed'),relative=compileClauses('D+3 结算文书检定 −2','relative');
 const binding={scope:{kind:'personal' as const,id:'player'},instanceId:'date-choice',day:4};
 const a=scheduleEventClauses(createEventLedger(),fixed,binding,'fixed-choice');
 const b=scheduleEventClauses(createEventLedger(),relative,binding,'relative-choice');
 expect(a.modifiers[0]).toMatchObject({starts:9,expires:9});expect(b.modifiers[0]).toMatchObject({starts:7,expires:7});
 expect(eventTuning(a,8).skills.record).toBeUndefined();expect(eventTuning(a,9).skills.record).toBe(-2);expect(eventTuning(a,10).skills.record).toBeUndefined();
 expect(scheduleEventClauses(a,fixed,binding,'fixed-choice')).toEqual(a);expect(a.outcomes).toBeUndefined();
});
it('until discharge belongs to one patient, and a finished modifier cannot revive on return',()=>{
 const clauses=compileClauses('该床问诊检定 −1 至出院','patient-condition');
 const ledger=scheduleEventClauses(createEventLedger(),clauses,{scope:{kind:'patient',id:'patient-a'},instanceId:'bound',day:3},'patient-choice');
 expect(ledger.modifiers[0].until).toEqual(['patient-discharged:patient-a']);
 expect(eventTuning(ledger,4,{kind:'patient',id:'patient-a'},['patient-discharged:patient-b']).skills.clinical).toBe(-1);
 expect(eventTuning(ledger,4,{kind:'patient',id:'patient-a'},['patient-discharged:patient-a']).skills.clinical).toBeUndefined();
 const closed=settleEventLedger(ledger,4,'结算',['patient-discharged:patient-a'],()=>0).ledger;
 expect(closed.modifiers).toHaveLength(0);expect(eventTuning(closed,5,{kind:'patient',id:'patient-a'}).skills.clinical).toBeUndefined();
});
it('family discharge markers are not rewritten into patient-discharge markers',()=>{
 const clauses=compileClauses('每日余额 −¥1,200 至出院','family-charge');
 const ledger=scheduleEventClauses(createEventLedger(),clauses,{scope:{kind:'patient',id:'unrelated-patient'},instanceId:'family-charge',day:3},'family-choice');
 expect(ledger.pending[0].until).toContain('家庭-出院');
 expect(settleEventLedger(ledger,4,'结算',['家庭-出院'],()=>0).effects).toHaveLength(0);
});
it('daily patient treatment charges stop at that patient discharge, not a family discharge',()=>{
 const clauses=compileClauses('每日 DIP 费用 +¥600 至出院','patient-charge');
 const ledger=scheduleEventClauses(createEventLedger(),clauses,{scope:{kind:'patient',id:'patient-a'},instanceId:'patient-charge',day:3},'patient-choice');
 expect(ledger.pending[0].until).toEqual(['patient-discharged:patient-a']);
 expect(settleEventLedger(ledger,4,'结算',['patient-discharged:patient-b','家庭-出院'],()=>0).effects[0].effects.bill).toBe(600);
 expect(settleEventLedger(ledger,4,'结算',['patient-discharged:patient-a'],()=>0).effects).toHaveLength(0);
});
