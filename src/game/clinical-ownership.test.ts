import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions,currentCard}from './engine';
import {buildAuthoredEvents,eligibleAuthoredEvents}from './director';
import {EVENT_BY_ID,eventToCard}from '../content/events';
import {clinicalAssignment,isPlayerResponsibleForPatient,clinicalTeamLabel}from '../content/events/clinical-ownership';
import {patientPayment}from './costs';
import {makeWardCard,buildDay,createPatient}from './cards';
import {pickPreset}from './presets';
import {encode,decode,emptySave,storageRunIssues}from './storage';
import type {Card,Run}from './types';
function fixture(day=3):Run{const r=startRun('clinical-teams','程医生',[]);r.day=day;r.ap=40;const built=buildAuthoredEvents(r,'交班');return {...r,...built.patch};}
function event(r:Run,id:string){const match=eligibleAuthoredEvents(r,'交班').find(x=>x.event.id===id)!;expect(match).toBeDefined();const c=eventToCard(EVENT_BY_ID[id],match.binding,match.context);r.authored!.published[c.id]=c;r.queue=[c];r.cursor=0;r.shiftPhase='交班';r.phase='play';return c;}
function expense(r:Run,uid:string,amount:number,id:string,budget=false){
 const card:Card={id,kind:'story',scope:{kind:'patient',id:uid},patientId:uid,title:'费用核对',text:'核对本次金额。',...(budget?{}:{billing:'spending' as const}),options:[{id:`${id}:confirm`,label:'确认',ap:0,minutes:0,cost:0,result:'账单已核对。',effects:{bill:amount}}]};
 r={...r,queue:[card],cursor:0,phase:'play'};return act(r,{type:'choose',id:card.options[0].id});
}
describe('actual clinical ownership and separate registration',()=>{
 it.each([0,2])('separates all three original invoices before accepting cover option %i, including B24',choice=>{
  let r=fixture(),card=event(r,'E-043');
  r.debuffs.push('B24');
  const ids=card.eventBinding.patients!.map(p=>p.id),cash=r.cash;
  ids.forEach((uid,i)=>{const p=r.patients.find(p=>p.uid===uid)!;p.spent=p.budget+(i+1)*100;p.charged=0;});
  r=act(r,{type:'choose',id:card.options[choice].id});
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  expect(r.cash).toBe(cash);
  ids.forEach((uid,i)=>{
   const p=r.patients.find(p=>p.uid===uid)!;
   expect(clinicalAssignment(r,p)?.teamCharged).toBe((i+1)*120);
   expect(p.charged).toBe(0);expect(p.budgetSurchargeExempt).toBe(0);
   expect(isPlayerResponsibleForPatient(r,p)).toBe(true);
  });
  expect(storageRunIssues(r)).toEqual([]);
  r=decode(encode({...emptySave(),run:r})).run!;
  for(const [i,uid]of ids.entries()){
   const p=r.patients.find(p=>p.uid===uid)!,before=r.cash;
   const option={id:`covered-${i}:confirm`,label:'新增处置',ap:0,minutes:0,cost:100,result:'',effects:{}};
   expect(patientPayment(r,p,option).personal).toBe(120);
   r=expense(r,uid,100,`covered-${i}`);
   expect(r.cash).toBe(before-120);expect(clinicalAssignment(r,p)?.teamCharged).toBe((i+1)*120);
  }
  expect(storageRunIssues(r)).toEqual([]);
 });
 it('does not settle or assume any of the three other-team invoices on refusal',()=>{
  let r=fixture(),card=event(r,'E-043');
  const ids=card.eventBinding.patients!.map(p=>p.id),cash=r.cash;
  ids.forEach((uid,i)=>{const p=r.patients.find(p=>p.uid===uid)!;p.spent=p.budget+(i+1)*100;});
  r=act(r,{type:'choose',id:card.options[1].id});
  expect(r.cash).toBe(cash);
  for(const uid of ids){const p=r.patients.find(p=>p.uid===uid)!;expect(clinicalAssignment(r,p)?.teamCharged).toBe(0);expect(p.budgetSurchargeExempt).toBeUndefined();expect(isPlayerResponsibleForPatient(r,p)).toBe(false);}
  expect(storageRunIssues(r)).toEqual([]);
 });
 it('creates three real other-team beds without relabelling a player patient, and reloads a refused offer',()=>{
  let r=fixture();const assignments=r.authored!.clinicalAssignments!.filter(a=>a.owner==='peer');expect(assignments).toHaveLength(3);
  const other=assignments.map(a=>r.patients.find(p=>p.uid===a.patientId)!);expect(other.every(p=>p.inpatient&&p.preset&&p.entityId)).toBe(true);
  expect(new Set(r.patients.filter(p=>p.active&&p.inpatient).map(p=>p.bed)).size).toBe(r.patients.filter(p=>p.active&&p.inpatient).length);
  const card=event(r,'E-043');expect(card.eventBinding.patients?.map(p=>p.id)).toEqual(other.map(p=>p.uid));
  r=act(r,{type:'choose',id:card.options[1].id});expect(other.every(p=>!isPlayerResponsibleForPatient(r,p))).toBe(true);
  expect(storageRunIssues(r)).toEqual([]);expect(decode(encode({...emptySave(),run:r})).run?.authored?.clinicalAssignments).toEqual(r.authored!.clinicalAssignments);
  for(const p of other){const ward=makeWardCard(r,p);expect(ward.options).toHaveLength(1);r.queue=[ward];r.cursor=0;r.phase='play';expect(availableOptions(r).some(o=>o.effects.care||o.talentAction==='transfer')).toBe(false);}
  r.day++;expect(buildDay(r).some(c=>other.some(p=>p.uid===c.patientId))).toBe(false);
 });
 it('keeps old team excess with that payer, bills only new covered expense, and never refunds the team contribution to the player',()=>{
  let r=fixture(),card=event(r,'E-043'),p=r.patients.find(p=>p.uid===card.patientId)!;p.spent=p.budget+1000;
  const cash=r.cash;r=act(r,{type:'choose',id:card.options[0].id});p=r.patients.find(x=>x.uid===p.uid)!;
  expect(r.cash).toBe(cash);expect(clinicalAssignment(r,p)?.teamCharged).toBe(1000);expect(isPlayerResponsibleForPatient(r,p)).toBe(true);
  expect(r.queue.filter(c=>c.kind==='ward'&&r.authored!.clinicalAssignments!.some(a=>a.patientId===c.patientId))).toHaveLength(3);
  expect(storageRunIssues(r)).toEqual([]);expect(decode(encode({...emptySave(),run:r})).run).not.toBeNull();
  const quoted={id:'new-care:confirm',label:'新增处置',ap:0,minutes:0,cost:200,result:'',effects:{}};expect(patientPayment(r,p,quoted).personal).toBe(200);
  r=expense(r,p.uid,200,'new-care');p=r.patients.find(x=>x.uid===p.uid)!;expect(p.charged).toBe(200);expect(r.cash).toBe(cash-200);
  r.day++;expect(isPlayerResponsibleForPatient(r,p)).toBe(false);r=expense(r,p.uid,300,'returned-care');p=r.patients.find(x=>x.uid===p.uid)!;expect(r.cash).toBe(cash-200);expect(p.charged).toBe(200);expect(clinicalAssignment(r,p)?.teamCharged).toBe(1300);
  r=expense(r,p.uid,-2000,'budget-appeal',true);p=r.patients.find(x=>x.uid===p.uid)!;expect(r.cash).toBe(cash);expect(p.charged).toBe(0);expect(clinicalAssignment(r,p)?.teamCharged).toBe(0);
  const cashAfter=r.cash;r=act(r,{type:'choose',id:'budget-appeal:confirm'});expect(r.cash).toBe(cashAfter);
 });
 it('binds the chief signature only to a separately generated chief patient',()=>{
  const r=fixture(12),card=event(r,'E-053'),p=r.patients.find(p=>p.uid===card.patientId)!;
  expect(clinicalAssignment(r,p)?.owner).toBe('chief');const signed=act(r,{type:'choose',id:card.options[0].id});
  expect(isPlayerResponsibleForPatient(signed,p)).toBe(false);expect(clinicalTeamLabel(signed,p)).toBe('主任组');expect(signed.hazards.some(h=>h.scope.id===p.uid&&h.type==='F')).toBe(true);expect(storageRunIssues(signed)).toEqual([]);
 });
 it('does not turn a chief signature conversation into the first patient contact',()=>{
  const r=fixture(12),card=event(r,'E-053');r.talents=['T01','T03'];
  const focused=act(r,{type:'focus',id:card.id});
  expect(focused.journal.filter(e=>e.id.startsWith(`contact:${card.patientId}:`))).toEqual([]);
  expect(focused.queue[0].text).toBe(card.text);
  const signed=act(focused,{type:'choose',id:card.options[0].id});
  expect(signed.journal.filter(e=>e.id.startsWith(`contact:${card.patientId}:`))).toEqual([]);
  expect(isPlayerResponsibleForPatient(signed,signed.patients.find(p=>p.uid===card.patientId)!)).toBe(false);
 });
 it('registers a legally matched younger male as a new patient rather than sharing his parent identity',()=>{
  let r=fixture(4);let match=eligibleAuthoredEvents(r,'门诊').find(x=>x.event.id==='E-026');
  for(let i=0;!match&&i<30;i++){const preset=pickPreset(r,'门诊',`son-parent:${i}`);if(!preset)break;r.patients.push(createPatient(r,preset.id,`quick-son-parent-${i}`));match=eligibleAuthoredEvents(r,'门诊').find(x=>x.event.id==='E-026');}
  // No injected patient facts: use a real generated insured outpatient from the source-compatible pool.
  if(!match){throw new Error('Fixture has no adult insured outpatient');}
  const card=eventToCard(match.event,match.binding,match.context);r.authored!.published[card.id]=card;r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='门诊';
  r=act(r,{type:'choose',id:card.options[2].id});const link=r.authored!.familyRegistrations![0],parent=r.patients.find(p=>p.uid===link.parentId)!,son=r.patients.find(p=>p.uid===link.patientId)!;
  expect(son.uid).not.toBe(parent.uid);expect(son.preset?.sex).toBe('男');expect(son.preset!.age).toBeLessThanOrEqual((parent.preset?.age??100)-18);expect(son.preset?.entityId).toBe(son.entityId);expect(r.queue.some(c=>c.patientId===son.uid&&c.presetNode)).toBe(true);
  expect(storageRunIssues(r)).toEqual([]);expect(decode(encode({...emptySave(),run:r})).run?.authored?.familyRegistrations).toEqual([link]);
  const corrupt=structuredClone(r);corrupt.authored!.familyRegistrations![0].patientId=parent.uid;expect(storageRunIssues(corrupt)).toContain('references');
 });
});
