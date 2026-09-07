import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions}from './engine';
import {createPatient}from './cards';
import {eligibleAuthoredEvents}from './director';
import {glucoseTranscriptionCard,pendingGlucoseTranscription,type GlucoseTranscriptionCard}from '../content/events/glucose-transcription';
import {priorGlucoseTranscription,projectHistoricalEvent}from '../content/events/historical-context';
import {ownContemporaneousRecord}from '../content/events/recording-origins';
import {decode,encode,emptySave,storageRunIssues}from './storage';
import type {Run,Card}from './types';

// A completed-care boundary; report reading and transcription use engine transactions.
function fixture(seed=0){
 const r=startRun(`glucose-copy:${seed}`,'程医生',[]);r.day=2;r.ap=30;r.cash=100000;r.shiftPhase='结算';
 const p=createPatient(r,'C010','transcription');p.settled=true;p.caredDay=2;r.patients.push(p);
 return{r,p};
}
function choose(r:Run,c:Card,suffix:string){
 r={...r,queue:[c],cursor:0,phase:'play'};delete r.roll;delete r.feedback;delete r.pendingCheck;r.authored!.published[c.id]=c;
 const o=availableOptions(r).find(o=>o.id.endsWith(suffix))!;expect(o).toBeDefined();
 let n=act(r,{type:'choose',id:o.id});if(n.phase==='roll')n=act(n,{type:'ack-roll'});return n;
}
function read(seed=0){const {r,p}=fixture(seed);return{r:choose(r,glucoseTranscriptionCard(r,p,'report'),':read'),uid:p.uid};}
function failed(){
 for(let seed=0;seed<30;seed++){
  let{r,uid}=read(seed);const card=r.queue.find(c=>(c as Partial<GlucoseTranscriptionCard>).glucoseTranscription?.stage==='write')!;
  r=choose(r,card,':memory');if(r.facts[`glucose-transcription-error:${uid}:2`])return{r,uid};
 }
 throw new Error('No naturally failed transcription check in fixture seeds');
}
describe('a playable source for the copied glucose value',()=>{
 it('reading the new report does not write a chart, finish treatment or alter earlier findings',()=>{
  const {r,p}=fixture(),before=structuredClone(p),n=choose(r,glucoseTranscriptionCard(r,p,'report'),':read');
  expect(n.patients.find(x=>x.uid===p.uid)).toEqual(before);expect(n.hazards).toEqual(r.hazards);
  expect(n.journal.at(-1)!.result).toContain('血糖 16.1 mmol/L');expect(ownContemporaneousRecord(n,p)).toBeUndefined();
  expect(n.queue.filter(c=>(c as Partial<GlucoseTranscriptionCard>).glucoseTranscription?.stage==='write')).toHaveLength(1);
  expect(storageRunIssues(n)).toEqual([]);
 });
 it('checking the source pays the quoted action and never opens the false transcription event',()=>{
  let{r,uid}=read();const before=r.ap,c=r.queue.find(c=>(c as Partial<GlucoseTranscriptionCard>).glucoseTranscription?.stage==='write')!;
  r=choose(r,c,':verify');expect(r.ap).toBe(before-1);expect(r.facts[`glucose-transcribed:${uid}:2`]).toBeDefined();
  r.day=3;expect(priorGlucoseTranscription(r,r.patients.find(p=>p.uid===uid)!)).toBeUndefined();
  expect(eligibleAuthoredEvents(r,'交班').some(x=>x.event.id==='E-056')).toBe(false);
  expect(storageRunIssues(r)).toEqual([]);
 });
 it('only the failed actual roll supplies the error, with the prior report preserved across days and reload',()=>{
  let{r,uid}=failed();r.day=3;let p=r.patients.find(p=>p.uid===uid)!;
  expect(priorGlucoseTranscription(r,p)?.report.result).toContain('16.1 mmol/L');expect(priorGlucoseTranscription(r,p)?.record.result).toContain('写成 6.1');
  expect(eligibleAuthoredEvents(r,'交班').some(x=>x.event.id==='E-056'&&x.binding.patientId===uid)).toBe(true);
  r=decode(encode({...emptySave(),run:r})).run!;r.day=6;p=r.patients.find(p=>p.uid===uid)!;p.active=false;p.inpatient=false;p.bed=0;p.dischargedDay=5;
  const match=eligibleAuthoredEvents(r,'交班').find(x=>x.event.id==='E-056')!;expect(match?.binding.patientId).toBe(uid);
  const source=glucoseTranscriptionCard(r,p,'report',2),text=projectHistoricalEvent(source,'E-056',r,p,match.binding).text;
  expect(text).toContain('第 2 天');expect(text).not.toContain('0床');expect(text).not.toContain('昨天');
  expect(act(r,{type:'choose',id:r.committed.at(-1)!})).toBe(r);
  const other=r.patients.find(x=>x.uid!==uid)!;expect(priorGlucoseTranscription(r,other)).toBeUndefined();
 });
 it('can transcribe the dated report later without changing its measurement date',()=>{
  let observed=false;
  for(let seed=0;seed<30&&!observed;seed++){
   let{r,uid}=read(seed);r.day=3;const c=r.queue.find(c=>(c as Partial<GlucoseTranscriptionCard>).glucoseTranscription?.stage==='write')!;
   r=choose(r,c,':memory');if(!r.facts[`glucose-transcription-error:${uid}:2`])continue;
   r.day=4;const receipt=priorGlucoseTranscription(r,r.patients.find(p=>p.uid===uid)!)!;
   expect(receipt.report.day).toBe(2);expect(receipt.record.day).toBe(3);observed=true;
  }
  expect(observed).toBe(true);
 });
 it('offers only an assessed adult diabetic patient owned by the player, once per run',()=>{
  let offered=false;
  for(let seed=0;seed<30;seed++){
   const {r,p}=fixture(seed),c=pendingGlucoseTranscription(r,'结算');if(!c)continue;
   offered=true;expect(c.patientId).toBe(p.uid);expect(pendingGlucoseTranscription(r,'查房')).toBeUndefined();
   r.authored!.published[c.id]=c;expect(pendingGlucoseTranscription(r,'结算')).toBeUndefined();
   delete r.authored!.published[c.id];p.settled=false;expect(pendingGlucoseTranscription(r,'结算')).toBeUndefined();
   p.settled=true;p.caredDay=1;expect(pendingGlucoseTranscription(r,'结算')).toBeUndefined();break;
  }
  expect(offered).toBe(true);
 });
 it('rejects malformed report dates and scope in a saved card',()=>{
  const {r,p}=fixture(),c=glucoseTranscriptionCard(r,p,'report');r.queue=[c];r.cursor=0;r.phase='play';
  c.glucoseTranscription.reportDay=99;expect(storageRunIssues(r)).not.toEqual([]);
  c.glucoseTranscription.reportDay=2;c.scope={kind:'personal',id:r.id};expect(storageRunIssues(r)).not.toEqual([]);
 });
});
