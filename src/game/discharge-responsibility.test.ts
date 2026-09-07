import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions,currentCard}from './engine';
import {makeWardCard,readmissionCard,buildDay}from './cards';
import {playerEarlyDischargeSource}from './discharge-responsibility';
import {buildAuthoredEvents}from './director';
import {decode,encode,emptySave,storageRunIssues}from './storage';
import {buildSourceFollowups,type SourceFollowup}from '../content/events/followups';
import {assessEnding}from '../content/events/ending-adapter';
describe('readmission responsibility',()=>{
 it('neither creates personal compensation from another team damage nor makes an old unsubmitted proposal payable',()=>{
   let r=startRun('old-wrong-compensation','程医生',[]);r.day=8;r={...r,...buildAuthoredEvents(r,'交班').patch};const assignment=r.authored!.clinicalAssignments!.find(a=>a.owner==='peer')!,p=r.patients.find(p=>p.uid===assignment.patientId)!;p.damage=2;
   r.committed.push(`return:${p.uid}:explain`);r.journal.push({id:`return:${p.uid}:explain`,day:7,title:'出院之后的急诊',choice:'说明经过',result:'旧通知的答复',operation:'persuade',scope:{kind:'patient',id:p.uid},flags:[]});
   expect(buildSourceFollowups(r,'结算').some(c=>c.sourceFollowup.kind==='settlement'&&c.patientId===p.uid)).toBe(false);
   expect(assessEnding(r).seeds.some(seed=>seed.uid===p.uid)).toBe(false);
   const old:SourceFollowup={id:`${p.uid}:source-compensation`,title:'书面调解方案',text:'旧通知',kind:'story',patientId:p.uid,scope:{kind:'patient',id:p.uid},sourceFollowup:{kind:'settlement',patientId:p.uid},options:[{id:`${p.uid}:source-compensation:pay`,label:'同意付款',result:'旧方案',ap:2,minutes:24,cost:0,effects:{cash:-30000}},{id:`${p.uid}:source-compensation:review`,label:'申请复核',result:'旧方案',ap:1,minutes:12,cost:0,effects:{emotion:-5}}]};
   r.authored!.published[old.id]=old;r.queue=[old];r.cursor=0;r.phase='play';r.shiftPhase='结算';const before=structuredClone(r),options=availableOptions(r);expect(options).toHaveLength(1);expect(options[0].ap).toBe(0);
   r=act(r,{type:'choose',id:options[0].id});expect(r.vitals).toEqual(before.vitals);expect(r.cash).toBe(before.cash);expect(r.patients).toEqual(before.patients);expect(r.journal.slice(0,before.journal.length)).toEqual(before.journal);expect(r.authored!.ledger.commits).not.toContain(old.options[0].id);
   expect(decode(encode({...emptySave(),run:r})).run?.committed).toContain(options[0].id);
 });
 it('does not turn another team discharge or self-departure into a player decision on the following morning',()=>{
   for(const kind of ['team','self']){
     let r=startRun(`readmission-${kind}`,'程医生',[]);r.day=6;r={...r,...buildAuthoredEvents(r,'日终').patch};const p=r.patients.find(p=>p.inpatient)!;
     p.active=false;p.inpatient=false;p.bed=0;p.planned=false;p.dischargedDay=6;
     if(kind==='team')(r.authored!.clinicalAssignments??=[]).push({patientId:p.uid,owner:'peer',source:'E-043',day:3,teamCharged:0});
     r.phase='feedback';r.feedback={title:'天亮',text:'',changes:[],next:'day'};
     const next=act(r,{type:'continue'}),saved=next.patients.find(x=>x.uid===p.uid)!;
     expect(playerEarlyDischargeSource(next,saved)).toBeUndefined();expect(saved.readmitted).not.toBe(true);expect(next.queue.some(c=>c.id===`return:${p.uid}`)).toBe(false);expect(next.facts[`readmitted:${p.uid}`]).toBeUndefined();
   }
 });
 it('recognizes an actually committed unsafe ward discharge, not another patient flag',()=>{
   let r=startRun('actual-unsafe-departure','程医生',[]);const p=r.patients.find(p=>p.inpatient)!;p.stability=0;const card=makeWardCard(r,p);r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';
   const chosen=card.options.find(o=>o.id.endsWith(':discharge'))!;r=act(r,{type:'choose',id:chosen.id});const departed=r.patients.find(x=>x.uid===p.uid)!;
   expect(playerEarlyDischargeSource(r,departed)).toBe(chosen.id);expect(playerEarlyDischargeSource(r,r.patients.find(x=>x.uid!==p.uid)!)).toBeUndefined();expect(storageRunIssues(r)).toEqual([]);
 });
 it('safely closes an unsubmitted old unsupported allegation without costs, care, confession or rewritten history',()=>{
   let r=startRun('old-wrong-return','程医生',[]);const p=r.patients.find(p=>p.inpatient)!;p.readmitted=true;const old=readmissionCard(r,p);r.queue=[old];r.cursor=0;r.phase='play';r.shiftPhase='交班';
   const before=structuredClone(r),options=availableOptions(r);expect(options).toHaveLength(1);expect(options[0].id).toContain('return-to-responsible-team');expect(currentCard(r).text).not.toContain('出院后病情恶化');
   r=act(r,{type:'choose',id:options[0].id});expect(r.ap).toBe(before.ap);expect(r.cash).toBe(before.cash);expect(r.vitals).toEqual(before.vitals);expect(r.patients).toEqual(before.patients);expect(r.hazards).toEqual(before.hazards);expect(r.journal.slice(0,before.journal.length)).toEqual(before.journal);expect(r.cursor).toBe(1);
   expect(decode(encode({...emptySave(),run:r})).run!.committed).toContain(options[0].id);
   const nextDay={...r,day:2};expect(buildDay(nextDay).some(c=>c.id===old.id)).toBe(false);
 });
});
