import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions}from './engine';
import {afterAuthoredChoice,authoredGraphWorld}from './director';
import {createPatient,buildDay}from './cards';
import {beginClinical}from './clinical';
import {currentClinicalHandoff}from './clinical-handoff';
import {isPlayerResponsibleForPatient}from '../content/events/clinical-ownership';
import {startButterfly}from '../content/events/butterfly';
import {butterflyCommitmentCard,commitmentDelivery}from '../content/events/butterfly-commitments';
import {storageRunIssues,emptySave,encode,decode}from './storage';

// Boundary fixtures only. Natural reachability is recorded by audit-routes.
describe('a signed clinical handoff transfers work, not clinical results',()=>{
 function fixture(){
  const r=startRun('handoff-boundary','程医生',[]);r.day=4;
  const p=createPatient(r,'C004','handoff-pending');r.patients.push(p);
  const chain=startButterfly('BTF-001','handoff-chain',{actorId:'li',patientId:p.uid});
  chain.commitments.push({id:'real-handoff',type:'handoff_requested',source:'BTF-001:N02a',task:'交班',actorId:'li',due:5,status:'accepted'});
  r.authored!.chains.push(chain);r.authored!.actor.liAwayDays=[];
  const clinical=beginClinical(r,p)!;expect(clinical).toBeDefined();r.queue=[clinical];r.cursor=0;
  return{r,p,chain,clinical};
 }
 it('requires receipt and preserves an unfinished chart and its bill',()=>{
  const {r,p,chain,clinical}=fixture(),before=structuredClone(p);
  const c=chain.commitments[0],w=authoredGraphWorld(r,r.authored!,chain,'结算');
  const receipt=butterflyCommitmentCard(r,r.authored!,chain,c,w,'结算')!;
  expect(receipt).toBeDefined();expect(isPlayerResponsibleForPatient(r,p)).toBe(true);
  const result=afterAuthoredChoice(r,receipt,receipt.options[0],true);
  const next={...r,...result.patch},patient=next.patients.find(x=>x.uid===p.uid)!;
  expect(currentClinicalHandoff(next,patient)?.recipient).toBe('li');
  expect(isPlayerResponsibleForPatient(next,patient)).toBe(false);
  expect(patient.clinical).toEqual(before.clinical);expect(patient.spent).toBe(before.spent);
  expect(patient.settled).toBe(before.settled);expect(patient.damage).toBe(before.damage);
  expect(result.removeCardIds).toContain(clinical.id);
  expect(commitmentDelivery(next,next.authored!,chain,c,w)).toBeUndefined();
  next.day++;
  expect(isPlayerResponsibleForPatient(next,patient)).toBe(true);
  const resumed=buildDay(next).find(x=>x.patientId===patient.uid&&x.clinicalGraph);
  expect(resumed?.clinicalGraph?.nodeId).toBe(before.clinical?.nodeId);
 });
 it('does not charge or diagnose from an obsolete bedside card after receipt',()=>{
  const {r,p,chain,clinical}=fixture(),w=authoredGraphWorld(r,r.authored!,chain,'结算');
  const receipt=butterflyCommitmentCard(r,r.authored!,chain,chain.commitments[0],w,'结算')!;
  const result=afterAuthoredChoice(r,receipt,receipt.options[0],true);
  const ready={...r,...result.patch,queue:[clinical],cursor:0,phase:'play' as const};
  const options=availableOptions(ready);expect(options).toHaveLength(1);
  const done=act(ready,{type:'choose',id:options[0].id});
  expect(done.cash).toBe(ready.cash);expect(done.ap).toBe(ready.ap);
  expect(done.patients.find(x=>x.uid===p.uid)?.clinical).toEqual(p.clinical);
  expect(done.patients.find(x=>x.uid===p.uid)?.spent).toBe(p.spent);
 });
 it('will not use a single-review favour to transfer unfinished assessment',()=>{
  const {r,chain}=fixture();
  chain.facts.push({id:'limited',type:'favor_one_ward_review',scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'BTF-001:N01d',day:3,knownBy:['player','li']});
  expect(commitmentDelivery(r,r.authored!,chain,chain.commitments[0],authoredGraphWorld(r,r.authored!,chain,'结算'))).toBeUndefined();
 });
 it('allows the promised single review of an already-assessed census patient',()=>{
  const {r,chain}=fixture(),p=r.patients.find(p=>p.uid.includes('census'))!;
  expect(p.settled).toBe(true);expect(p.presetNode).toBeUndefined();
  chain.subjects.patientId=p.uid;chain.scope={kind:'patient',id:p.uid};
  for(const type of ['favor_one_ward_review','favor_available'])chain.facts.push({id:type,type,scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'BTF-001:N01d',day:3,knownBy:['player','li']});
  const world=authoredGraphWorld(r,r.authored!,chain,'结算');
  expect(world.conditions?.['BTF-001:N02a']).toBe(true);
  expect(commitmentDelivery(r,r.authored!,chain,chain.commitments[0],world)?.title).toBe('交清床旁待办');
  p.settled=false;expect(commitmentDelivery(r,r.authored!,chain,chain.commitments[0],authoredGraphWorld(r,r.authored!,chain,'结算'))).toBeUndefined();
 });
 it('rejects an invented handoff receipt in a save',()=>{
  const r=startRun('false-handoff','程医生',[]);
  expect(storageRunIssues(r)).toEqual([]);
  r.authored!.clinicalHandoffs=[{patientId:r.patients[0].uid,day:1,source:'imaginary-signature',commitmentId:'imaginary-request',recipient:'li',scope:'remaining-care'}];
  expect(storageRunIssues(r)).toContain('references');
 });
 it.each(['remaining-care','ward-review']as const)('persists a signed %s handoff without confusing work scope with evidence scope',scope=>{
  const {r,chain}=fixture();
  if(scope==='ward-review'){
   const p=r.patients.find(p=>p.uid.includes('census'))!;
   chain.subjects.patientId=p.uid;chain.scope={kind:'patient',id:p.uid};
   chain.facts.push({id:'limited',type:'favor_one_ward_review',scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'BTF-001:N01d',day:3,knownBy:['player','li']});
  }
  const receipt=butterflyCommitmentCard(r,r.authored!,chain,chain.commitments[0],authoredGraphWorld(r,r.authored!,chain,'结算'),'结算')!;
  r.authored!.published[receipt.id]=receipt;r.queue=[receipt];r.cursor=0;r.phase='play';
  const done=act(r,{type:'choose',id:receipt.options[0].id});
  expect(done.authored!.clinicalHandoffs?.[0].scope).toBe(scope);
  expect(storageRunIssues(done)).toEqual([]);
  const restored=decode(encode({...emptySave(),run:done})).run!;
  expect(restored).toEqual(done);
  expect(act(restored,{type:'choose',id:receipt.options[0].id})).toBe(restored);
  const malformed=structuredClone(done);
  (malformed.journal.at(-1)!as unknown as Record<string,unknown>).scope=scope;
  expect(storageRunIssues(malformed).length).toBeGreaterThan(0);
  const unrelated=structuredClone(done);
  unrelated.journal.at(-1)!.scope={kind:'patient',id:'not-this-patient'};
  expect(storageRunIssues(unrelated)).toContain('references');
 });
});
