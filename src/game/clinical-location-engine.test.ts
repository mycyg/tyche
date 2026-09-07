import {describe,it,expect} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {beginClinical} from './clinical';
import {createPatient,buildDay,makeWardCard} from './cards';
import {clinicalDisposition} from './clinical-disposition';
import {repairLegacyClinicalLocations} from './clinical-location-repair';
import {emptySave,encode,decode} from './storage';
import {nightTelephoneRequired} from './night-overflow';
import {getClinicalGraph,initialGraphState,getAvailableGraphOptions,canContinueGraph,advanceClinicalGraph} from '../content/clinical';
import type {Run} from './types';

const path=['s1_bp_both','s2_ecg_ddimer','s3_cta','s4_control','s5_transfer','s6_record'];
function fixture(){
 const r=startRun('actual-vascular-transfer','程医生',[]),p=createPatient(r,'C013','transfer-proof');
 p.inpatient=true;p.bed=8;p.damage=1;p.spent=800;p.budget=500;p.initialBudget=500;p.charged=300;
 r.patients.push(p);r.queue=[beginClinical(r,p)!];r.queue[0].shiftPhase='查房';r.cursor=0;r.phase='play';r.shiftPhase='查房';
 r.ap=100;r.cash=100000;r.vitals={stamina:90,san:90,emotion:90};return{r,uid:p.uid};
}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
function choose(run:Run,id:string):Run {
 let r=run;
 for(let guard=0;guard<15;guard++){
  if(r.phase==='feedback')r=act(r,{type:'continue'});
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  const options=availableOptions(r),wanted=options.find(o=>o.clinicalChoice===id);
  if(wanted){r=act(r,{type:'choose',id:wanted.id});return r.phase==='roll'?act(r,{type:'ack-roll'}):r;}
  const next=options.find(o=>o.clinicalChoice==='continue');
  expect(next,`${currentCard(r)?.title} must continue to ${id}; choices=${options.map(o=>o.clinicalChoice??o.id).join('/')}`).toBeDefined();
  r=act(r,{type:'choose',id:next!.id});
 }
 throw new Error(`Could not reach ${id}`);
}
function completed(partial=false){
 const {r:initial,uid}=fixture();let r=initial;
 for(const id of path)r=reload(choose(r,partial&&id==='s4_control'?'s4_nitro_only':id));
 for(let guard=0;!r.patients.find(p=>p.uid===uid)!.clinical!.outcomeId&&guard<10;guard++){
  if(r.phase==='feedback')r=act(r,{type:'continue'});
  const option=availableOptions(r).find(o=>o.clinicalChoice==='continue'||o.clinicalChoice==='s7_end');expect(option).toBeDefined();
  r=act(r,{type:'choose',id:option!.id});if(r.phase==='roll')r=act(r,{type:'ack-roll'});
 }
 return{r,uid};
}

describe('actual source-proven transfer and saved bed ownership',()=>{
 it.each([false,true])('finishes C013 actual CTA/monitoring/transfer/record path, retaining prior harm and charges (partial=%s)',partial=>{
  const {r,uid}=completed(partial),p=r.patients.find(p=>p.uid===uid)!;
  expect(p.clinical!.outcomeId).toBe(partial?'o_partial':'o_good');expect(clinicalDisposition(p).kind).toBe('transfer');
  expect(p.active).toBe(false);expect(p.inpatient).toBe(false);expect(p.bed).toBe(0);expect(p.dischargedDay).toBeUndefined();
  expect(p.damage).toBeGreaterThanOrEqual(1);expect(p.spent).toBeGreaterThan(800);expect(p.charged).toBeGreaterThan(300);
  expect(r.journal.filter(j=>j.scope.id===uid&&j.clinicalChoice==='s5_transfer')).toHaveLength(1);
  expect(r.journal.filter(j=>j.scope.id===uid&&j.clinicalChoice==='s6_record')).toHaveLength(1);
  if(partial)expect(r.hazards.some(h=>h.scope.id===uid&&h.choiceId.includes('s4_nitro_only'))).toBe(true);
  expect(reload(r)).toEqual(r);
 });
 it('does not assign next-day ward work or daily bed costs after transfer',()=>{
  const {r:done,uid}=completed(),p=done.patients.find(p=>p.uid===uid)!,before={spent:p.spent,charged:p.charged,damage:p.damage};
  let r=structuredClone(done);r.queue=[];r.cursor=0;r.shiftPhase='日终';r.phase='feedback';r.feedback={title:'交班完成',text:'当班结束。',changes:[],next:'check'};
  r=act(r,{type:'continue'});const after=r.patients.find(p=>p.uid===uid)!;
  expect({spent:after.spent,charged:after.charged,damage:after.damage}).toEqual(before);
  expect(r.budgetCharges?.some(c=>c.patientId===uid&&c.source===`ward-billing:${r.day}:${uid}`)).toBeFalsy();
  r.day++;const cards=buildDay(r);expect(cards.some(c=>c.patientId===uid&&c.kind==='ward')).toBe(false);expect(after.readmitted).toBeUndefined();
 });
 it('repairs a real old completed transfer without changing transactions or dropping the pending ward card',()=>{
  const {r,uid}=completed(),p=r.patients.find(p=>p.uid===uid)!;p.active=true;p.inpatient=true;p.bed=8;
  r.facts[`awaiting-bed:${uid}`]={day:r.day,source:'old-bed-state',sequence:0};
  const ward=makeWardCard(r,p);r.queue=[ward];r.cursor=0;r.phase='play';r.shiftPhase='查房';delete r.pendingCheck;
  const before=JSON.stringify({journal:r.journal,queue:r.queue,roll:r.roll,budget:p.budget,spent:p.spent,charged:p.charged,damage:p.damage,clinical:p.clinical,cash:r.cash,income:r.income,committed:r.committed,budgetCharges:r.budgetCharges});
  const fixed=reload(r),patient=fixed.patients.find(p=>p.uid===uid)!;
  expect({active:patient.active,inpatient:patient.inpatient,bed:patient.bed}).toEqual({active:false,inpatient:false,bed:0});
  expect(fixed.facts[`awaiting-bed:${uid}`]).toBeUndefined();expect(patient.dischargedDay).toBeUndefined();expect(fixed.cursor).toBe(0);
  expect(JSON.stringify({journal:fixed.journal,queue:fixed.queue,roll:fixed.roll,budget:patient.budget,spent:patient.spent,charged:patient.charged,damage:patient.damage,clinical:patient.clinical,cash:fixed.cash,income:fixed.income,committed:fixed.committed,budgetCharges:fixed.budgetCharges})).toBe(before);
  const option=availableOptions(fixed)[0];expect(option.id).toContain('closed-bed-handoff');expect([option.ap,option.cost,option.minutes]).toEqual([0,0,0]);
  const advanced=act(fixed,{type:'choose',id:option.id});expect(advanced.cursor).toBe(1);expect(advanced.cash).toBe(fixed.cash);expect(advanced.income).toBe(fixed.income);expect(advanced.patients.find(p=>p.uid===uid)!.spent).toBe(patient.spent);
 });
 it('preserves an old displayed ward appeal die across repair and archives once without performing the obsolete action',()=>{
  const {r,uid}=completed(),p=r.patients.find(p=>p.uid===uid)!;p.active=true;p.inpatient=true;p.bed=8;p.admitted=-12;
  const ward=makeWardCard(r,p);r.queue=[ward];r.cursor=0;r.phase='play';r.shiftPhase='查房';delete r.pendingCheck;
  const appeal=availableOptions(r).find(o=>o.check&&o.id.includes(':appeal'))!;expect(appeal).toBeDefined();
  const rolling=act(r,{type:'choose',id:appeal.id});expect(rolling.phase).toBe('roll');expect(rolling.pendingCheck!.optionId).toBe(appeal.id);
  const shown=structuredClone(rolling.roll),history=structuredClone(rolling.journal),clinical=structuredClone(rolling.patients.find(p=>p.uid===uid)!.clinical);
  const fixed=reload(reload(rolling));expect(fixed.roll).toEqual(shown);expect(fixed.patients.find(p=>p.uid===uid)!.active).toBe(false);
  const before={ap:fixed.ap,cash:fixed.cash,income:fixed.income,stamina:fixed.vitals.stamina,spent:fixed.patients.find(p=>p.uid===uid)!.spent};
  const done=act(fixed,{type:'ack-roll'}),patient=done.patients.find(p=>p.uid===uid)!;
  expect(done.pendingCheck).toBeUndefined();expect(done.cursor).toBe(1);expect(done.roll).toEqual(shown);
  expect({ap:done.ap,cash:done.cash,income:done.income,stamina:done.vitals.stamina,spent:patient.spent}).toEqual(before);
  expect(patient.clinical).toEqual(clinical);expect(done.journal.slice(0,history.length)).toEqual(history);
  expect(done.journal.filter(j=>j.id===appeal.id)).toHaveLength(0);expect(done.journal.at(-1)!.id).toContain('closed-bed-handoff');
  expect(act(done,{type:'ack-roll'})).toBe(done);expect(reload(done)).toEqual(done);
 });
 it('does not release a bed for an unfinished graph, a transfer flag alone, or a completed stay case',()=>{
  const {r,uid}=completed(),p=r.patients.find(p=>p.uid===uid)!;
  for(const missing of ['terminal','choice','flag']){
   const copy=structuredClone(r),patient=copy.patients.find(p=>p.uid===uid)!;patient.active=true;patient.inpatient=true;patient.bed=8;
   if(missing==='terminal')delete patient.clinical!.outcomeId;
   if(missing==='choice')patient.clinical!.choices=patient.clinical!.choices.filter(c=>c!=='s5_transfer');
   if(missing==='flag')patient.clinical!.flags=patient.clinical!.flags.filter(f=>f!=='transferred');
   repairLegacyClinicalLocations(copy);expect(patient.active,missing).toBe(true);expect(patient.bed,missing).toBe(8);
  }
  const copy=structuredClone(r),patient=copy.patients.find(p=>p.uid===uid)!;patient.clinical!.outcomeId='o_review';patient.clinical!.choices=patient.clinical!.choices.filter(c=>c!=='s5_transfer');patient.active=true;patient.inpatient=true;patient.bed=8;
  repairLegacyClinicalLocations(copy);expect(patient.active).toBe(true);expect(p.clinical!.outcomeId).toBe('o_good');
 });
 it('repairs the distinct C006 observed-and-signed home disposition from real source actions',()=>{
  const r=startRun('legacy-observed-home','程医生',[]),p=createPatient(r,'C006','completed-home'),graph=getClinicalGraph('C006')!;
  let state=initialGraphState(graph,'home-proof');
  for(const id of 's1_glucose s2_d50 s3_history s3_infusion s4_observe s5_endo_referral s6_note'.split(' ')){
   let guard=0;while(!getAvailableGraphOptions(graph,state).some(o=>o.id===id)&&canContinueGraph(graph,state)&&guard++<15)state=advanceClinicalGraph(graph,state,'continue').state;
   expect(getAvailableGraphOptions(graph,state).some(o=>o.id===id),id).toBe(true);state=advanceClinicalGraph(graph,state,id,true).state;
  }
  let guard=0;while(!state.outcomeId&&canContinueGraph(graph,state)&&guard++<15)state=advanceClinicalGraph(graph,state,'continue').state;
  p.clinical=state;p.active=true;p.inpatient=true;p.bed=8;r.patients.push(p);
  r.facts[`awaiting-bed:${p.uid}`]={day:r.day,source:'old-home-state',sequence:0};
  expect(clinicalDisposition(p).kind).toBe('home');
  const fixed=reload(r),after=fixed.patients.find(x=>x.uid===p.uid)!;
  expect([after.active,after.inpatient,after.bed]).toEqual([false,false,0]);expect(after.clinical).toEqual(state);expect(after.dischargedDay).toBeUndefined();
  expect(fixed.facts[`awaiting-bed:${p.uid}`]).toBeUndefined();
 });
 it('does not replace C020 death investigation with a generic overflow telephone response',()=>{
  const r=startRun('death-night-overflow','程医生',[]),p=createPatient(r,'C020','night-death-proof');r.patients.push(p);
  const card=beginClinical(r,p)!;card.kind='night';card.shiftPhase='夜班';r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='夜班';r.nightMinutes=0;
  expect(nightTelephoneRequired(r,card)).toBe(false);expect(availableOptions(r).some(o=>o.clinicalChoice==='s1_resuscitate')).toBe(true);expect(availableOptions(r).some(o=>o.id.endsWith(':night-telephone'))).toBe(false);
  const after=choose(r,'s1_resuscitate');expect(after.patients.find(x=>x.uid===p.uid)!.clinical!.choices).toContain('s1_resuscitate');
  expect(after.hazards.some(h=>h.choiceId.endsWith(':night-telephone'))).toBe(false);
 });
});
