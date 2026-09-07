import {describe,expect,it}from 'vitest';
import {startRun,act}from '../../game/engine';
import {afterAuthoredChoice,buildAuthoredEvents,settleAuthoredEvents,eligibleAuthoredEvents}from '../../game/director';
import {EVENT_BY_ID,eventToCard}from './catalog';
import {recordEventChoice,createEventLedger}from './ledger';
import {eventTuning}from './modifiers';
import {buildSourceFollowups}from './followups';
import {authoredCashPressure,changeCashPressure,pressureFinancialBasis,type PressureState}from './pressure';
const fresh=()=>{const r=startRun('actual-pressure','程医生',['T06','T16','T11']);r.day=5;r.debt=0;r.authored=buildAuthoredEvents(r,'交班').patch.authored;return r;};
describe('cash pressure from actual financial facts',()=>{
 it('raises only the same patient dispute DC without helping unrelated checks',()=>{
  const r=fresh(),p=r.patients[0];p.inpatient=true;p.active=true;
  const card=eventToCard(EVENT_BY_ID['E-035'],{instanceId:'posted-argument',scope:{kind:'patient',id:p.uid},patientId:p.uid,day:5,phase:'门诊'}),done=afterAuthoredChoice(r,card,card.options[1],true),next={...r,...done.patch};
  next.authored.dispute={patientId:p.uid,stage:1,first:false,second:false};
  expect(eventTuning(next.authored.ledger,5,{kind:'patient',id:p.uid}).allChecks).toBe(0);
  expect(buildSourceFollowups(next,'查房').find(c=>c.sourceFollowup.kind==='dispute')?.options[0].check?.dc).toBe(13);
  next.authored.dispute.patientId=r.patients[1].uid;
  expect(buildSourceFollowups(next,'查房').find(c=>c.sourceFollowup.kind==='dispute')?.options[0].check?.dc).toBe(12);
 });
 it('limits medication drowsiness to tomorrow and treats a raised auditor DC as a penalty',()=>{
  const r=fresh(),card=eventToCard(EVENT_BY_ID['E-075'],{instanceId:'sleep-medicine',scope:{kind:'personal',id:r.id},day:5,phase:'日终'}),ledger=recordEventChoice(createEventLedger(),card,card.options[0].id,true);
  expect(eventTuning(ledger,5).allChecks).toBe(0);expect(eventTuning(ledger,6).allChecks).toBe(-1);expect(eventTuning(ledger,7).allChecks).toBe(0);
  expect(EVENT_BY_ID['E-153'].options[2].modifiers.find(m=>m.target==='persuade')?.value).toBe(-1);
  expect(EVENT_BY_ID['E-155'].options[1].modifiers.find(m=>m.target==='persuade')?.value).toBe(1);
 });
 it('charges the stated extra workload for careful recorded questioning and three covered beds',()=>{
  expect(EVENT_BY_ID['E-025'].options[1]).toMatchObject({ap:1,minutes:12,modifiers:[]});
  expect(EVENT_BY_ID['E-043'].options[0]).toMatchObject({ap:3,minutes:36,modifiers:[]});
 });
 it('keeps ICU payment separate from discharge and honours next-day reduced fees',()=>{
  const r=fresh();r.authored!.activeFacts['家庭-车祸-ICU中']={day:1,source:'icu-admission'};
  const match=eligibleAuthoredEvents(r,'结算').find(e=>e.event.id==='E-100')!,card=eventToCard(match.event,match.binding,match.context),paid=afterAuthoredChoice(r,card,card.options[0],true);
  expect(paid.patch.authored.activeFacts['家庭-出院']).toBeUndefined();expect(paid.patch.authored.activeFacts['家庭-车祸-ICU中']).toBeDefined();
  const negotiated=afterAuthoredChoice(r,card,card.options[2],true),tomorrow={...r,...negotiated.patch,day:6},next=eligibleAuthoredEvents(tomorrow,'结算').find(e=>e.event.id==='E-100')!;
  expect(eventToCard(next.event,next.binding,next.context).options[0].effects.cash).toBe(-4000);
  const normal=eligibleAuthoredEvents({...tomorrow,day:7},'结算').find(e=>e.event.id==='E-100')!;expect(eventToCard(normal.event,normal.binding,normal.context).options[0].effects.cash).toBe(-8000);
  const transfer=eventToCard(EVENT_BY_ID['E-102'],{instanceId:'icu-transferred',scope:{kind:'personal',id:r.id},day:6,phase:'结算'}),out=afterAuthoredChoice(tomorrow,transfer,transfer.options[1],true);
  expect(out.patch.authored.activeFacts['家庭-出院']).toBeDefined();expect(out.patch.authored.activeFacts['家庭-车祸-ICU中']).toBeUndefined();expect(eligibleAuthoredEvents({...tomorrow,...out.patch},'结算').some(e=>e.event.id==='E-100')).toBe(false);
 });
 it('charges only unpaid patient excess then adds six hundred per inpatient day',()=>{
  const r=fresh(),p=r.patients[0];p.inpatient=true;p.active=true;p.spent=p.budget+3000;p.charged=3000;r.cash=10000;
  const card=eventToCard(EVENT_BY_ID['E-171'],{instanceId:'continuing-care',scope:{kind:'patient',id:p.uid},patientId:p.uid,day:5,phase:'结算'});r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='结算';
  const next=act(r,{type:'choose',id:card.options[0].id});expect(next.cash).toBe(10000);expect(next.patients[0].charged).toBe(3000);
  const day6=settleAuthoredEvents({...next,day:6},'结算'),extra=day6.effects.find(e=>e.id.includes('E-171-a:cost:1'))!;expect(extra.effects).toEqual({bill:600});expect(extra.scope.id).toBe(p.uid);expect(day6.patch.authored.pressureCharges).toBeUndefined();
  const discharged=structuredClone(next);discharged.day=6;discharged.patients[0].active=false;
  expect(settleAuthoredEvents(discharged,'结算').effects.some(e=>e.id.includes('E-171-a:cost:1'))).toBe(false);
 });
 it('reserves the documented next-day action for medical-record verification',()=>{
  const r=fresh(),p=r.patients[0],card=eventToCard(EVENT_BY_ID['E-009'],{instanceId:'record-query',scope:{kind:'patient',id:p.uid},patientId:p.uid,day:5,phase:'查房'}),chosen=afterAuthoredChoice(r,card,card.options[2],true);
  expect(settleAuthoredEvents({...r,...chosen.patch,day:6},'交班').effects.find(e=>e.id.includes('E-009-c'))?.effects.ap).toBe(-1);
 });
 it('counts debt and gross real deductions on the actual last three days, not balance changes',()=>{
  const r=fresh();r.debt=10000;r.budgetCharges=[{day:2,amount:9999,patientId:r.patients[0].uid,source:'old'},{day:3,amount:600,patientId:r.patients[0].uid,source:'bill'},{day:5,amount:400,patientId:r.patients[0].uid,source:'bill'}];
  const s:PressureState={pressure:10,pressureCharges:[{day:5,amount:1200,source:'actual-fine'},{day:6,amount:9000,source:'future'}]};
  expect(pressureFinancialBasis(r,s)).toBe(31);expect(authoredCashPressure(r,s)).toBe(41);
  r.cash+=10000;expect(authoredCashPressure(r,s)).toBe(41);
  r.day=6;expect(pressureFinancialBasis(r,{...s,pressureCharges:s.pressureCharges!.slice(0,1)})).toBe(28);
 });
 it('decays existing pressure without banking reductions against future debt or charges',()=>{
  const r=fresh();let s:PressureState={pressure:0};s={...s,...changeCashPressure(r,s,-3)};
  r.debt=10000;expect(authoredCashPressure(r,s)).toBe(20);
  s={...s,...changeCashPressure(r,s,-3)};expect(authoredCashPressure(r,s)).toBe(17);
  s.pressureCharges=[{day:5,amount:1000,source:'fine'}];expect(authoredCashPressure(r,s)).toBe(22);
  s={...s,...changeCashPressure(r,s,-30)};expect(authoredCashPressure(r,s)).toBe(0);
  s.pressureCharges=[...s.pressureCharges??[],{day:5,amount:400,source:'second-fine'}];expect(authoredCashPressure(r,s)).toBe(2);
  r.debt=0;expect(authoredCashPressure(r,s)).toBe(0);
 });
 it('records the actual failed audit total once and excludes ordinary food purchases',()=>{
  const r=fresh(),card=eventToCard(EVENT_BY_ID['E-156'],{instanceId:'real-audit',scope:{kind:'project',id:'audit'},day:5,phase:'结算'});
  const done=afterAuthoredChoice(r,card,card.options[0],false);expect(done.patch.authored.pressureCharges).toEqual([{day:5,amount:2400,source:card.options[0].id}]);
  const replay=afterAuthoredChoice({...r,...done.patch},card,card.options[0],false);expect(replay.patch.authored.pressureCharges).toHaveLength(1);
  const meal=eventToCard(EVENT_BY_ID['E-069'],{instanceId:'meal',scope:{kind:'personal',id:r.id},day:5,phase:'日终'});
  expect(afterAuthoredChoice(r,meal,meal.options[0],true).patch.authored.pressureCharges).toBeUndefined();
 });
 it('charges an approved deferred mortgage on day fourteen only once',()=>{
  const r=fresh(),card=eventToCard(EVENT_BY_ID['E-111'],{instanceId:'mortgage',scope:{kind:'personal',id:r.id},day:5,phase:'结算'}),promised=afterAuthoredChoice(r,card,card.options[1],true);
  expect(promised.patch.authored.pressureCharges).toBeUndefined();
  const due=settleAuthoredEvents({...r,...promised.patch,day:14},'结算');expect(due.effects.find(e=>e.effects.cash===-6500)).toBeDefined();
  expect(due.patch.authored.pressureCharges?.filter(c=>c.amount===6500)).toHaveLength(1);
  const again=settleAuthoredEvents({...r,...due.patch,day:14},'结算');expect(again.patch.authored.pressureCharges?.filter(c=>c.amount===6500)).toHaveLength(1);
  const failed=afterAuthoredChoice(r,card,card.options[1],false);expect(settleAuthoredEvents({...r,...failed.patch,day:14},'结算').effects.some(e=>e.effects.cash===-6500)).toBe(false);
 });
});
