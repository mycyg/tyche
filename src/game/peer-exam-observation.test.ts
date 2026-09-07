import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions,currentCard}from './engine';
import {buildAuthoredEvents,authoredGraphWorld}from './director';
import {pendingPeerExamObservations,type PeerExamObservationCard}from '../content/events/peer-exam-observation';
import {priorUnperformedPeerExam}from '../content/events/historical-context';
import {storageRunIssues,emptySave,encode,decode}from './storage';
import type {Run,Card}from './types';

// State-boundary tests. A separate campaign witness must start from the title deal.
function fixture(){
 for(let seed=0;seed<100;seed++){
  let r=startRun(`peer-exam-${seed}`,'程医生',[]);r.day=3;r.phase='play';r.shiftPhase='交班';
  const built=buildAuthoredEvents(r,'交班');r={...r,...built.patch};
  const card=pendingPeerExamObservations(r,'结算')[0];
  if(card)return{r,card};
 }
 throw new Error('No seeded meeting fixture');
}
function answer(r:Run,card:Card,suffix='read'){
 r={...r,queue:[card],cursor:0,phase:'play'};
 r.authored!.published[card.id]=card;
 const option=availableOptions(r).find(o=>o.id.endsWith(suffix))!;expect(option).toBeDefined();
 return act(r,{type:'choose',id:option.id});
}
function discovered(){
 const {r,card}=fixture(),first=answer(r,card);
 const next={...first,day:4,phase:'play' as const,shiftPhase:'交班' as const};next.authored!.actor.liAwayDays=[];
 const record=pendingPeerExamObservations(next,'交班')[0];expect(record).toBeDefined();
 return{r:answer(next,record),card,record};
}
describe('the peer examination has a playable origin and a lasting dated discovery',()=>{
 it('hearing the missed examination creates no diagnosis, player misconduct or completed care',()=>{
  const {r,card}=fixture(),before=structuredClone(r.patients),next=answer(r,card);
  expect(next.patients).toEqual(before);expect(next.hazards).toEqual(r.hazards);
  expect(next.authored!.chains.some(c=>c.facts.some(f=>f.type==='false_exam_entry'))).toBe(false);
  expect(priorUnperformedPeerExam(next,next.patients.find(p=>p.uid===card.patientId)!)).toBeUndefined();
  expect(pendingPeerExamObservations(next,'结算')).toEqual([]);
  expect(storageRunIssues(next)).toEqual([]);
 });
 it('shows the next-day record, then the real E054 decision without forging a player signature',()=>{
  const {r,card}=discovered(),p=r.patients.find(p=>p.uid===card.patientId)!;
  expect(priorUnperformedPeerExam(r,p)).toBeDefined();
  const scene=r.queue.find(c=>(c as {authoredEventId?:string}).authoredEventId==='E-054')!;
  expect(scene).toBeDefined();
  const decision={...r,queue:[scene],cursor:0,phase:'play' as const};
  expect(availableOptions(decision).some(o=>o.id.endsWith('BTF-001:N03d'))).toBe(true);
  expect(r.hazards).toHaveLength(0);
  const refused=answer(decision,scene,'BTF-001:N03c');
  expect(refused.authored!.chains.some(c=>c.facts.some(f=>f.type==='false_exam_entry'))).toBe(false);
  expect(storageRunIssues(refused)).toEqual([]);
 });
 it('retains discovery after another day and reload, and never attaches it to a different patient',()=>{
  const {r,card}=discovered(),loaded=decode(encode({...emptySave(),run:r})).run!;loaded.day=6;
  const p=loaded.patients.find(p=>p.uid===card.patientId)!,other=loaded.patients.find(p=>p.uid!==card.patientId)!;
  expect(priorUnperformedPeerExam(loaded,p)?.absence.day).toBe(3);
  expect(priorUnperformedPeerExam(loaded,other)).toBeUndefined();
  const chain=loaded.authored!.chains.find(c=>c.subjects.patientId===p.uid)!;
  expect(authoredGraphWorld(loaded,loaded.authored!,chain,'结算').facts).toContain('false_exam_discovered');
  const unchanged=act(loaded,{type:'choose',id:r.committed.at(-1)!});expect(unchanged).toBe(loaded);
 });
 it('does not invent attendance while the colleague is away or transfer the player own bed',()=>{
  const {r}=fixture();r.authored!.actor.liAwayDays=[3];expect(pendingPeerExamObservations(r,'结算')).toEqual([]);
  r.authored!.actor.liAwayDays=[];r.authored!.clinicalAssignments=[];expect(pendingPeerExamObservations(r,'结算')).toEqual([]);
 });
 it('does not show an unacknowledged prelude as remembered history',()=>{
  const {r,card}=fixture();r.authored!.published[card.id]=card;r.day=4;r.authored!.actor.liAwayDays=[];
  expect(pendingPeerExamObservations(r,'交班')).toEqual([]);
  expect(priorUnperformedPeerExam(r,r.patients.find(p=>p.uid===card.patientId)!)).toBeUndefined();
 });
});
