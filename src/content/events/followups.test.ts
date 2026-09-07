import {describe,it,expect}from 'vitest';
import {startRun,act}from '../../game/engine';
import {makeWardCard}from '../../game/cards';
import {buildAuthoredEvents,afterAuthoredChoice}from '../../game/director';
import {buildSourceFollowups}from './followups';
import {endingEligibility}from './ending-adapter';
function fixture(){const r=startRun('followup-test','程医生',['T06','T11','T16']);r.authored=buildAuthoredEvents(r,'交班').patch.authored;r.authored.published={};r.authored.scheduled=[];return r;}
describe('source branch closure producers',()=>{
 it('offers the T11/T13 private settlement at the second encounter, without rewriting the first',()=>{
  let r=fixture();r.talents=['T11','T13','T16'];r.day=7;const uid=r.patients[0].uid;r.authored!.dispute={patientId:uid,stage:2,first:false,second:false};
  const card=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!,option=card.options.find(o=>o.id.endsWith(':settle'))!;expect(option).toBeDefined();
  r={...r,...afterAuthoredChoice(r,card,option,true).patch};expect(r.authored!.dispute!.first).toBe(false);r.day=13;
  const third=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;expect(third.options[0].effects.hazards).toBeUndefined();
 });
 it('consumes a same-patient suppression once and leaves the unresolved third encounter due tomorrow',()=>{
  let r=fixture();r.day=13;const uid=r.patients[0].uid;r.authored!.dispute={patientId:uid,stage:3,first:false,second:false};r.authored!.activeFacts[`complaint-suppressed:${uid}`]={day:12,source:'actual-lie'};
  const first=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;expect(first.options[0].effects.clear).toContain(`complaint-suppressed:${uid}`);
  r={...r,...afterAuthoredChoice(r,first,first.options[0],true).patch};r.authored!.published[first.id]=first;expect(buildSourceFollowups(r,'结算').some(c=>c.sourceFollowup.kind==='dispute')).toBe(false);
  r.day=14;const next=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;expect(next.id).not.toBe(first.id);expect(next.options[0].effects.hazards?.[0].weight).toBe(20);
 });
 it('uses the T27/T30 threshold only for the paired talent and actual transfer facts',()=>{
  const r=fixture();r.day=15;for(let i=0;i<4;i++)r.facts[`defensive-transfer:p${i}`]={day:i+1,source:'actual-transfer',sequence:i};
  expect(endingEligibility(r,'X37').eligible).toBe(false);r.talents=['T27','T30','T16'];expect(endingEligibility(r,'X37').eligible).toBe(true);
 });
 it('plays all three actual same-patient recording encounters to unlock X39',()=>{
  let r=fixture();r.day=2;const first=buildSourceFollowups(r,'查房').find(c=>c.sourceFollowup.kind==='dispute')!,uid=first.patientId;
  r={...r,...afterAuthoredChoice(r,first,first.options[0],true).patch};r.authored!.published[first.id]=first;r.day=7;
  const second=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;expect(second.patientId).toBe(uid);
  r={...r,...afterAuthoredChoice(r,second,second.options[0],true).patch};r.authored!.published[second.id]=second;r.day=13;
  const third=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;expect(third.patientId).toBe(uid);
  r={...r,...afterAuthoredChoice(r,third,third.options[0],true).patch};expect(endingEligibility(r,'X39').eligible).toBe(true);
 });
 it.each([true,false])('uses the second response outcome (%s) without rewriting the failed first explanation',secondSucceeded=>{
  let r=fixture();r.day=2;const first=buildSourceFollowups(r,'查房')[0];r={...r,...afterAuthoredChoice(r,first,first.options[0],false).patch};r.day=7;
  const second=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;r={...r,...afterAuthoredChoice(r,second,second.options[0],secondSucceeded).patch};r.day=13;
  const third=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='dispute')!;
  expect(third.options[0].effects.hazards?.[0].weight).toBe(secondSucceeded?undefined:20);expect(third.scope.id).toBe(first.scope.id);
  r={...r,...afterAuthoredChoice(r,third,third.options[0],true).patch};expect(endingEligibility(r,'X39').eligible).toBe(false);
 });
 it('records a denial only after a real writing action, without inventing concealed-history causation',()=>{
  let r=fixture();const p=r.patients[0];r.authored!.ledger.facts.push({id:'隐瞒-被抓',scope:{kind:'patient',id:p.uid},source:'actual-question',day:1,knownBy:['player',p.uid]});
  const card=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='denial-record')!;const done=afterAuthoredChoice(r,card,card.options[0],true);
  expect(done.patch.authored.activeFacts[`clinical:${p.uid}:1224_recorded`]).toBeDefined();expect(done.patch.authored.activeFacts[`clinical:${p.uid}:hidden_history_causal`]).toBeUndefined();
 });
 it('requires actual compensation commitment before asking for independent written forgiveness',()=>{
  let r=fixture();const original=r.patients.find(p=>p.inpatient)!;original.stability=0;const ward=makeWardCard(r,original);r.queue=[ward];r.cursor=0;r.phase='play';r.shiftPhase='查房';r=act(r,{type:'choose',id:ward.options.find(o=>o.id.endsWith(':discharge'))!.id});r.day=10;const p=r.patients.find(p=>p.uid===original.uid)!;p.damage=3;
  expect(buildSourceFollowups(r,'结算').some(c=>c.sourceFollowup.kind==='forgiveness')).toBe(false);
  const settlement=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='settlement')!,paid=afterAuthoredChoice(r,settlement,settlement.options[0],true);r={...r,...paid.patch};
  const forgiveness=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.kind==='forgiveness')!;expect(forgiveness.patientId).toBe(p.uid);
  const declined=afterAuthoredChoice(r,forgiveness,forgiveness.options[1],true);expect(declined.patch.authored.activeFacts[`clinical:${p.uid}:forgiven`]).toBeUndefined();
  const answer=afterAuthoredChoice(r,forgiveness,forgiveness.options[0],true);expect(answer.effects[0].scope).toEqual({kind:'patient',id:p.uid});expect(answer.effects[0].effects.flags?.[0]).toMatch(/forgiven|forgiveness_declined/);
 });
});
