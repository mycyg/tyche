import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions}from './engine';
import {createPatient,buildDay}from './cards';
import {beginClinical}from './clinical';
import {captureDeferredWork,deferredPatientOption,resolveDeferredWork}from './deferred-work';

// Local state boundaries, not natural-route coverage.
describe('deferred care keeps one pending obligation per patient',()=>{
 function fixture(){
  const r=startRun('defer-once','程医生',[]);r.day=4;r.ap=0;r.shiftPhase='查房';
  const p=createPatient(r,'C004','defer');r.patients.push(p);
  const card=beginClinical(r,p)!;r.queue=[card];r.cursor=0;r.phase='play';
  return{r,p,card};
 }
 it('does not offer a committed deferral again from a stale card',()=>{
  const {r,p,card}=fixture(),o=deferredPatientOption(r,card)!;
  const next=act(r,{type:'choose',id:o.id});expect(next.committed).toContain(o.id);
  expect(next.deferredWork).toHaveLength(1);expect(next.queue.some(c=>c.patientId===p.uid)).toBe(false);
  next.phase='play';next.queue=[card];next.cursor=0;
  expect(availableOptions(next).some(o=>o.interaction==='defer')).toBe(false);
  expect(act(next,{type:'choose',id:o.id})).toBe(next);
  expect(next.patients.find(p=>p.uid===card.patientId)?.clinical?.choices).toEqual([]);
 });
 it('does not offer a second manual deferral after an acute half-day absence already captured that patient',()=>{
  const {r,p,card}=fixture();
  expect(captureDeferredWork(r,p.uid,'acute-half-leave','half-leave')).toBeDefined();
  r.queue=[card];r.cursor=0;
  expect(deferredPatientOption(r,card)).toBeUndefined();
  expect(captureDeferredWork(r,p.uid,'second','ap-empty')).toBeUndefined();
  expect(r.deferredWork).toHaveLength(1);
 });
 it('resumes the unfinished node tomorrow and permits a distinct later deferral once',()=>{
  const {r,p,card}=fixture(),id=deferredPatientOption(r,card)!.id;
  let next=act(r,{type:'choose',id});next.day=5;next.phase='play';
  const resumed=resolveDeferredWork(next);next.queue=resumed;next.cursor=0;
  expect(resumed[0].clinicalGraph).toEqual(card.clinicalGraph);expect(next.deferredWork).toHaveLength(0);
  const later=deferredPatientOption(next,resumed[0])!;expect(later.id).not.toBe(id);
  next=act(next,{type:'choose',id:later.id});
  expect(next.deferredWork).toHaveLength(1);expect(next.deferredWork![0]).toMatchObject({patientId:p.uid,created:5,due:6});
  expect(next.committed).toEqual(expect.arrayContaining([id,later.id]));
 });
});
it('ongoing census follow-up never restarts an unrequested preset workup',()=>{
 const r=startRun('census-continuity','程医生',[]),census=r.patients.filter(p=>p.uid.includes('census'));
 for(const p of census){expect(p.settled).toBe(true);expect(p.presetNode).toBeUndefined();}
 r.day=2;const cards=buildDay(r);
 for(const p of census){
  const visits=cards.filter(c=>c.patientId===p.uid);
  expect(visits).toHaveLength(1);expect(visits[0].kind).toBe('ward');expect(visits[0].presetNode).toBeUndefined();
  expect(p.presetNode).toBeUndefined();expect(p.settled).toBe(true);
 }
});
