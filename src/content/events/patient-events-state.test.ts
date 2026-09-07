import {describe,it,expect}from 'vitest';
import {startRun,act}from '../../game/engine';
import {createPatient,assignBed,nextFreeBed}from '../../game/cards';
import {buildAuthoredEvents,eligibleAuthoredEvents,pendingClinicalEvent}from '../../game/director';
import {AUTHORED_EVENTS as EVENTS,EVENT_BY_ID,eventToCard}from './catalog';
import {encode,decode,emptySave,storageRunIssues}from '../../game/storage';
import {beginClinical}from '../../game/clinical';
import type {Run,Card}from '../../game/types';
import type {EventCard}from './types';
import {patientCanSpeak,projectPatientSpeaker}from './patient-requirements';
function fullWard(){
 let r=startRun('capacity-event','程医生',[]);r.day=4;r={...r,...buildAuthoredEvents(r,'日终').patch};r.authored!.scheduled=[];r.authored!.chains=[];r.authored!.published={};r.authored!.seen=Object.fromEntries(EVENTS.filter(e=>e.id!=='E-048').map(e=>[e.id,1]));r.patients=[];
 for(let i=0;i<12;i++){const p=createPatient(r,'C009',`ward:${i}`);p.bed=5+i;p.inpatient=true;p.admitted=3;p.stability=0;r.patients.push(p);}
 const incoming=createPatient(r,'C010','ward-waiting');r.patients.push(incoming);assignBed(r,incoming);r.queue=[];r.cursor=0;r.phase='play';r.shiftPhase='交班';return{r,incoming};
}
describe('patient events preserve real identity and disposition',()=>{
 it('lets an actual companion ask for another doctor without giving fluent speech back to a stroke patient',()=>{
   let r=startRun('stroke-companion','程医生',[]);r.day=6;r={...r,...buildAuthoredEvents(r,'日终').patch};r.authored!.scheduled=[];r.authored!.published={};r.authored!.chains=[];r.authored!.seen=Object.fromEntries(EVENTS.filter(e=>e.id!=='E-019').map(e=>[e.id,1]));
   r.patients=[];const p=createPatient(r,'C-090','night-language');p.inpatient=true;p.bed=5;p.admitted=5;r.patients=[p];
   expect(patientCanSpeak(p)).toBe(false);const e=eligibleAuthoredEvents(r,'查房').find(e=>e.event.id==='E-019');expect(e).toBeDefined();
   const card=projectPatientSpeaker(eventToCard(e!.event,e!.binding,e!.context),p);expect(card.text).toContain('陪同的家属');expect(card.text).toContain('目前不能清楚表达');expect(p.preset!.complaint).toContain('说话不清');
 });
 it('critical values bind an established inpatient, never an untouched new outpatient',()=>{
   let r=startRun('critical-existing','程医生',[]);r.day=3;r={...r,...buildAuthoredEvents(r,'日终').patch};r.authored!.scheduled=[];r.authored!.published={};
   const old=r.patients.find(p=>p.inpatient)!;old.admitted=1;old.settled=true;
   const newcomer=createPatient(r,'C002','quick-critical');newcomer.inpatient=false;newcomer.bed=0;r.patients=[old,newcomer];
   const event=eligibleAuthoredEvents(r,'门诊').find(e=>e.event.id==='E-046')!;expect(event.binding.patientId).toBe(old.uid);expect(event.binding.bed).toBeGreaterThan(0);
   r.patients=[newcomer];expect(eligibleAuthoredEvents(r,'交班').some(e=>e.event.id==='E-046')).toBe(false);
 });
 it('uses the physical four-bed room, not a synthetic three-bed room, for same-room conversations',()=>{
   const {r}=fullWard();r.authored!.seen={};
   const anchor=r.patients.find(p=>p.bed===8)!;r.patients=r.patients.filter(p=>[5,6,8,9].includes(p.bed));
   const matching=eligibleAuthoredEvents(r,'查房').find(e=>e.event.id==='E-022');expect(matching).toBeDefined();
   r.patients=r.patients.filter(p=>[8,9].includes(p.bed));expect(eligibleAuthoredEvents(r,'查房').some(e=>e.event.id==='E-022')).toBe(false);
   expect(anchor.bed).toBe(8);
 });
 it('requires an actually full ward and a waiting new admission, never the existing occupant',()=>{
   const {r,incoming}=fullWard();expect(nextFreeBed(r)).toBe(0);
   const bound=eligibleAuthoredEvents(r,'交班').find(e=>e.event.id==='E-048')!;expect(bound.binding.patientId).toBe(incoming.uid);expect(bound.binding.patients?.[0].id).not.toBe(incoming.uid);
   r.patients[0].active=false;r.patients[0].bed=0;expect(eligibleAuthoredEvents(r,'交班').some(e=>e.event.id==='E-048')).toBe(false);
 });
 it('uses the one explicit corridor bed only after consent, charges a normal ward action and reloads with source proof',()=>{
   const {r,incoming}=fullWard(),built=buildAuthoredEvents(r,'交班'),card=built.cards.find(c=>'authoredEventId'in c&&c.authoredEventId==='E-048')as EventCard;expect(card).toBeDefined();
   const next=act({...r,...built.patch,queue:[card],cursor:0,phase:'play'},{type:'choose',id:card.options[0].id}),p=next.patients.find(p=>p.uid===incoming.uid)!;
   expect(p.bed).toBe(17);expect(p.inpatient).toBe(true);expect(nextFreeBed(next)).toBe(0);expect(next.queue.some(c=>c.kind==='ward'&&c.patientId===p.uid)).toBe(true);expect(next.authored!.ledger.modifiers.some(m=>m.id.includes('E-048-a'))).toBe(false);
   expect(storageRunIssues(next)).toEqual([]);expect(decode(encode({...emptySave(),run:next})).run!.patients.find(saved=>saved.uid===p.uid)!.bed).toBe(17);
   const corrupt=structuredClone(next);delete corrupt.facts[`corridor-bed:${p.uid}`];expect(storageRunIssues(corrupt)).toContain('references');
 });
 it('frees a different unsafe-discharge patient, then admits the waiting patient without moving their risk',()=>{
   const {r,incoming}=fullWard(),built=buildAuthoredEvents(r,'交班'),card=built.cards.find(c=>'authoredEventId'in c&&c.authoredEventId==='E-048')as EventCard,outgoing=card.eventBinding!.patients![0];
   const next=act({...r,...built.patch,queue:[card],cursor:0,phase:'play'},{type:'choose',id:card.options[2].id});
   expect(next.patients.find(p=>p.uid===outgoing.id)!.active).toBe(false);expect(next.patients.find(p=>p.uid===incoming.uid)!.bed).toBe(outgoing.bed);
   expect(next.hazards.filter(h=>h.reason.includes('未达出院标准')).every(h=>h.scope.id===outgoing.id)).toBe(true);expect(storageRunIssues(next)).toEqual([]);
 });
 it('does not give a baby an adult daughter or a private self-reported allergy conversation mid-treatment',()=>{
   let r=startRun('baby-allergy','程医生',[]);r.day=3;r={...r,...buildAuthoredEvents(r,'日终').patch};r.authored!.scheduled=[];r.authored!.published={};r.authored!.seen=Object.fromEntries(EVENTS.filter(e=>e.id!=='E-001').map(e=>[e.id,1]));
   const p=createPatient(r,'C008','baby');r.patients=[p];const card=beginClinical(r,p)!;card.shiftPhase='查房';p.inpatient=true;p.bed=5;
   const option={id:'dose',clinicalChoice:'s4_empiric',label:'开始经验性抗菌治疗',ap:1,minutes:12,cost:0,result:'',effects:{}};p.clinical!.choices.push('s4_empiric');
   expect(pendingClinicalEvent(r,card,option).cards).toHaveLength(0);expect(eligibleAuthoredEvents(r,'查房').some(e=>e.event.id==='E-001')).toBe(false);
 });
 it('a failed recall does not keep an absent patient occupying their bed',()=>{
   for(const index of [1,2]){let r=startRun('departed-patient','程医生',[]);r.day=4;r={...r,...buildAuthoredEvents(r,'日终').patch};const p=r.patients.find(p=>p.inpatient)!;
    const card=eventToCard(EVENT_BY_ID['E-014'],{instanceId:`${r.id}:leave-test`,scope:{kind:'patient',id:p.uid},patientId:p.uid,bed:p.bed,day:4,phase:'查房'});r.authored!.published[card.id]=card;r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';
    r=act(r,{type:'choose',id:card.options[index].id});expect(r.patients.find(x=>x.uid===p.uid)!.active).toBe(false);expect(r.patients.find(x=>x.uid===p.uid)!.bed).toBe(0);expect(storageRunIssues(r)).toEqual([]);
   }
 });
 it('keeps the ten one-hundred notes equal to the amount actually accepted',()=>expect(EVENT_BY_ID['E-017'].options[0].effects.cash).toBe(1000));
});
