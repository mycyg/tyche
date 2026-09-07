import {describe,expect,it} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {buildDay,createPatient,patientCase,awaitingBed,nextFreeBed} from './cards';
import {RULES} from './rules';
import {decode,encode,emptySave,storageRunIssues} from './storage';
import type {Run} from './types';

function schedule(day:number,seed='night-c020'){
 const r=startRun(seed,'程医生',[]);r.day=day;r.phase='play';r.cursor=0;r.vitals={stamina:80,san:80,emotion:80};r.cash=100000;r.ap=10;
 delete r.roll;delete r.feedback;delete r.pendingCheck;r.queue=buildDay(r);return r;
}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
describe('C020 occupies the original sixth-night schedule slot',()=>{
 it.each(RULES.nightDays)('keeps the exact documented number of patients and minutes on night %s',day=>{
  const r=schedule(day),night=RULES.nightDays.indexOf(day),cards=r.queue.filter(c=>c.kind==='night'),ids=new Set(cards.map(c=>c.patientId));
  expect(ids.size).toBe(RULES.nightCases[night]);expect(cards.length).toBe(RULES.nightCases[night]);expect(r.nightBudget).toBe(RULES.nightBudget[night]);expect(r.nightMinutes).toBe(r.nightBudget);
  expect(cards.filter(c=>c.caseId==='C020')).toHaveLength(day===6?1:0);
 });
 it('uses a complete graph for an independent 74-year-old ninth-day inpatient with a real bedside',()=>{
  const r=schedule(6),c=r.queue.find(c=>c.caseId==='C020')!,p=r.patients.find(p=>p.uid===c.patientId)!;
  expect(c).toMatchObject({kind:'night',shiftPhase:'夜班',clinicalGraph:{caseId:'C020',nodeId:'s1'}});expect(c.presetNode).toBeUndefined();expect(c.last).not.toBe(true);
  expect(c.options.map(o=>o.clinicalChoice)).toEqual(expect.arrayContaining(['s1_resuscitate','s1_confirm','s1_handover']));
  expect(p.admitted).toBe(-2);expect(r.day-p.admitted+1).toBe(9);expect(patientCase(p)).toMatchObject({age:74,sex:'男'});
  expect(p.bed).toBeGreaterThan(0);expect(p.inpatient).toBe(true);expect(c.text).toContain(`${p.bed} 床`);expect(c.text).toContain('住院第 9 天');
  expect(patientCase(p).complaint).not.toMatch(/37\s*床/);expect(c.text).not.toMatch(/37\s*床/);expect(p.damage).toBe(0);expect(p.clinical?.choices).toEqual([]);
  expect(r.journal.some(e=>e.scope.id===p.uid)).toBe(false);expect(storageRunIssues(r)).toEqual([]);expect(reload(r)).toEqual(r);
 });
 it('does not overwrite an occupied ward or forge a numbered bed when full',()=>{
  const r=startRun('full-night-c020','程医生',[]);r.day=6;
  for(let i=0;i<RULES.ward.capacity&&nextFreeBed(r);i++){
   const p=createPatient(r,'C004',`occupied-${r.patients.length}`);r.patients.push(p);
   expect(p.inpatient).toBe(true);expect(p.bed).toBeGreaterThan(0);
  }
  expect(nextFreeBed(r)).toBe(0);
  const original=r.patients.filter(p=>p.active&&p.inpatient).map(p=>({uid:p.uid,bed:p.bed,damage:p.damage}));
  r.queue=buildDay(r);const c=r.queue.find(c=>c.caseId==='C020')!,p=r.patients.find(p=>p.uid===c.patientId)!;
  expect(p.bed).toBe(0);expect(p.inpatient).toBe(false);expect(awaitingBed(r,p)).toBe(true);expect(c.text).toContain('留观区');expect(c.text).toContain('尚未分配正式床号');
  for(const before of original)expect(r.patients.find(p=>p.uid===before.uid)).toMatchObject(before);
  const beds=r.patients.filter(p=>p.active&&p.inpatient).map(p=>p.bed);expect(new Set(beds).size).toBe(beds.length);
 });
 it('never transforms a different deceased patient, and resumes the original unfinished C020 without a new admission',()=>{
  const r=startRun('prior-death-c020','程医生',[]),deceased=r.patients[0];deceased.damage=3;deceased.active=false;deceased.bed=0;
  r.hazards.push({id:'old-harm',choiceId:'prior-choice',choice:'既往处置',day:1,type:'R',weight:30,reason:'既往患者的实际损害',norm:'原处置规范',causal:true,scope:{kind:'patient',id:deceased.uid}});
  const before=structuredClone(deceased),hazards=structuredClone(r.hazards);r.day=6;r.queue=buildDay(r);
  const c020=r.patients.find(p=>p.caseId==='C020')!;expect(c020.uid).not.toBe(deceased.uid);expect(r.patients.find(p=>p.uid===deceased.uid)).toEqual(before);expect(r.hazards).toEqual(hazards);
  const savedNode=c020.clinical!.nodeId;
  r.day=14;r.queue=buildDay(r);
  const resumed=r.queue.filter(c=>c.caseId==='C020'&&c.clinicalGraph);
  expect(resumed).toHaveLength(1);expect(resumed[0].patientId).toBe(c020.uid);
  expect(resumed[0].clinicalGraph?.nodeId).toBe(savedNode);expect(resumed[0].kind).toBe('clinical');
  expect(r.patients.filter(p=>p.caseId==='C020')).toHaveLength(1);
 });
 it('keeps identity, variants, bedside and original starting options stable for the same seed',()=>{
  const first=schedule(6,'same-night'),second=schedule(6,'same-night');
  const snapshot=(r:Run)=>{const c=r.queue.find(c=>c.caseId==='C020')!;return {card:c,patient:r.patients.find(p=>p.uid===c.patientId),minutes:r.nightMinutes};};
  expect(snapshot(first)).toEqual(snapshot(second));expect(snapshot(reload(first))).toEqual(snapshot(first));
 });
 it('executes the scheduled full graph at night without charging daytime AP, preserving save/resume between original nodes',()=>{
  let r=schedule(6,'actual-c020-night');const id=r.queue.find(c=>c.caseId==='C020')!.patientId!;r.cursor=r.queue.findIndex(c=>c.patientId===id);r.shiftPhase='夜班';const initialAP=r.ap;
  const path='s1_resuscitate s1_confirm s2_scene s2_timeline s3_family s3_rights s4_autopsy s4_morgue s5_report s6_discuss s6_quality s7_record s7_handoff'.split(' ');
  for(const wanted of path){
   for(let guard=0;guard<10;guard++){
    if(r.phase==='feedback')r=act(r,{type:'continue'});if(r.phase==='roll')r=act(r,{type:'ack-roll'});
    const options=availableOptions(r);if(options.some(o=>o.clinicalChoice===wanted))break;
    const next=options.find(o=>o.clinicalChoice==='continue');expect(next,`${currentCard(r)?.title}: ${wanted}`).toBeDefined();r=act(r,{type:'choose',id:next!.id});
   }
   const o=availableOptions(r).find(o=>o.clinicalChoice===wanted)!;expect(o,wanted).toBeDefined();r=act(r,{type:'choose',id:o.id});if(r.phase==='roll')r=act(r,{type:'ack-roll'});r=reload(r);
   expect(r.ap).toBe(initialAP);
  }
  const p=r.patients.find(p=>p.uid===id)!;expect(p.clinical!.outcomeId).toMatch(/^o_/);expect(p.clinical!.choices).toEqual(expect.arrayContaining(path));expect(p.damage).toBe(3);expect(p.bed).toBe(0);expect(r.nightMinutes).toBeLessThan(RULES.nightBudget[1]);
 });
});
