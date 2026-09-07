import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions,currentCard}from './engine';
import {createPatient}from './cards';
import {beginClinical}from './clinical';
import {authoredGraphWorld,buildAuthoredEvents}from './director';
import {buildSourceFollowups}from '../content/events/followups';
import {openComplaintRecordingChains,recordingOrigin,recordingSceneText,ownContemporaneousRecord,RECORDING_PROSE}from '../content/events/recording-origins';
import {butterflyChoices,commitButterflyChoice,routeButterfly,startButterfly}from '../content/events/butterfly';
import {decode,encode,emptySave,storageRunIssues}from './storage';
import type {Run,Card}from './types';

// Boundary fixtures execute real choices; campaign audits alone prove title-to-ending reachability.
function fixture(caseId='C013'){
 const r=startRun('record-origin','程医生',[]);r.day=2;r.ap=100;r.cash=100000;
 const p=caseId==='C013'?r.patients.find(p=>p.active&&p.inpatient)!:createPatient(r,caseId,'origin');if(!r.patients.includes(p))r.patients.push(p);r.shiftPhase='查房';
 return{r,p};
}
function choose(r:Run,c:Card,suffix:string){
 r={...r,queue:[c],cursor:0,phase:'play'};delete r.feedback;delete r.roll;delete r.pendingCheck;
 r.authored!.published[c.id]=c;
 const o=availableOptions(r).find(o=>o.id.endsWith(suffix));expect(o).toBeDefined();
 let next=act(r,{type:'choose',id:o!.id});if(next.phase==='roll')next=act(next,{type:'ack-roll'});
 return next;
}
function filed(){
 let{r,p}=fixture();r=choose(r,buildSourceFollowups(r,'查房').find(c=>c.sourceFollowup.stage===1)!,':ignore');
 r.day=7;r=choose(r,buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.stage===2)!,':file');
 return{r,p:r.patients.find(x=>x.uid===p.uid)!};
}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
describe('documented recording-chain complaint entrances',()=>{
 it.each([
  ['复核既往记录',false],['查看护士填写的病历',false],['核对护理记录',false],
  ['填写病程记录',true],['翻出原单核对，写入交班本',true],['完成死亡记录、抢救记录和证据清单',true],
  ['由规定资质医师核验并记录死亡时间',true],['把未完成记录补成事发前时间',true],
 ]as const)('distinguishes writing from received or read material: %s',(label,owns)=>{
  const {r,p}=filed(),index=r.journal.findIndex(j=>j.id.startsWith(`${r.id}:source-unrest:2:`));
  r.committed.push('record-boundary');r.journal.splice(index,0,{id:'record-boundary',day:2,title:'原病程',scope:{kind:'patient',id:p.uid},choice:label,result:'原记录内容',flags:[],operation:'record'});
  expect(!!ownContemporaneousRecord(r,p)).toBe(owns);
  const prior=r.journal.splice(index,1)[0];r.journal.push(prior);expect(ownContemporaneousRecord(r,p)).toBeUndefined();
 });
 it('does not offer someone else’s complaint as a contemporaneous player note',()=>{
  const {r,p}=filed();openComplaintRecordingChains(r,r.authored!);const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;
  expect(ownContemporaneousRecord(r,p)).toBeUndefined();expect(authoredGraphWorld(r,r.authored!,chain,'交班').conditions!['BTF-003:N03b']).toBe(false);
 });
 it('opens N03 from the actual unresolved ward complaint, not from the phone alone',()=>{
  const f=fixture();let r=choose(f.r,buildSourceFollowups(f.r,'查房').find(c=>c.sourceFollowup.stage===1)!,':ignore');
  openComplaintRecordingChains(r,r.authored!);expect(r.authored!.chains.filter(c=>c.chain==='BTF-003')).toHaveLength(0);
  r.day=7;r=choose(r,buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.stage===2)!,':file');
  const result=buildAuthoredEvents(r,'结算');r={...r,...result.patch};
  const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;expect(chain).toBeDefined();expect(chain.cursor).toBe('BTF-003:N03');
  expect(chain.subjects.patientId).toBe(f.p.uid);expect(chain.consumed).not.toContain('BTF-003:N01');
  expect(chain.facts.map(f=>f.type)).toContain('record_excerpt_received');expect(chain.facts.map(f=>f.type)).not.toContain('record_received');
  expect(Object.values(r.authored!.published).find(c=>c.chain==='BTF-003'&&c.title==='一段被转来的声音')?.text).toBe(RECORDING_PROSE.excerpt);
  expect(storageRunIssues(r)).toEqual([]);expect(reload(r).authored!.chains).toEqual(r.authored!.chains);
 });
 it('keeps each patient separate and does not reopen the same resolved or closed chain',()=>{
  const {r,p}=filed(),other=createPatient(r,'C014','other');r.patients.push(other);
  expect(recordingOrigin(r,r.authored!,other)).toBeUndefined();openComplaintRecordingChains(r,r.authored!);
  const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;chain.status='closed';chain.resolution='BTF-003:R03';
  openComplaintRecordingChains(r,r.authored!);expect(r.authored!.chains.filter(c=>c.chain==='BTF-003')).toHaveLength(1);
  r.authored!.chains=[];r.authored!.dispute!.second=true;
  openComplaintRecordingChains(r,r.authored!);expect(recordingOrigin(r,r.authored!,p)).toBeUndefined();expect(r.authored!.chains).toHaveLength(0);
  r.day=13;expect(buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.stage===3)?.options[0].result).toContain('投诉已经结束');
 });
 it('a missing original offers a neutral response, never a forced lie or invented matching record',()=>{
  const {r}=filed();openComplaintRecordingChains(r,r.authored!);let chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;
  chain=commitButterflyChoice(chain,'BTF-003:N03c',authoredGraphWorld(r,r.authored!,chain,'结算')).state;
  chain=routeButterfly(chain,authoredGraphWorld(r,r.authored!,chain,'交班'));
  const world=authoredGraphWorld(r,r.authored!,chain,'结算');expect(chain.cursor).toBe('BTF-003:N05');
  expect(recordingSceneText(chain,world.facts,'')).toBe(RECORDING_PROSE.missing);
  const offered=butterflyChoices(chain,world).find(o=>o.choice.id==='BTF-003:N05c')!;expect(offered.available).toBe(true);expect(offered.choice.label).toBe(RECORDING_PROSE.reserve);
  const response=commitButterflyChoice(chain,offered.choice.id,world);
  expect(response.effects.hazards??[]).toHaveLength(0);expect(response.effects.emotion).toBe(-5);
  expect(response.state.facts.some(f=>f.type==='false_patient_statement'||f.type==='record_received')).toBe(false);
 });
 it('preserves the accusation choice only for known adverse material',()=>{
  const {r}=filed();openComplaintRecordingChains(r,r.authored!);const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;chain.cursor='BTF-003:N05';
  const world=authoredGraphWorld(r,r.authored!,chain,'结算');world.conditions={...world.conditions,'BTF-003:N05c':true};world.facts=[...world.facts,'record_received'];
  const response=commitButterflyChoice(chain,'BTF-003:N05c',world);expect(response.state.facts.some(f=>f.type==='false_patient_statement')).toBe(true);
 });
 it('the neutral option pays its shown cost once through the engine and survives reload',()=>{
  let{r}=filed();let result=buildAuthoredEvents(r,'结算');r={...r,...result.patch};
  const scene=Object.values(r.authored!.published).find(c=>c.chain==='BTF-003'&&c.id.endsWith(':N03'))!;
  r=choose(r,scene,'BTF-003:N03c');r.day++;
  result=buildAuthoredEvents(r,'交班');r={...r,...result.patch};
  const review=Object.values(r.authored!.published).find(c=>c.chain==='BTF-003'&&c.id.endsWith(':N05'))!;
  expect(review.text).toBe(RECORDING_PROSE.missing);const before=structuredClone(r);
  r=choose(r,review,'BTF-003:N05c');expect(r.vitals.emotion).toBe(before.vitals.emotion-5);expect(r.vitals.san).toBe(before.vitals.san);expect(r.hazards).toEqual(before.hazards);
  expect(r.journal.at(-1)!.result).toContain(RECORDING_PROSE.reserveResult);expect(storageRunIssues(r)).toEqual([]);
  r=reload(r);expect(act(r,{type:'choose',id:r.committed.at(-1)!})).toBe(r);
 });
 it('the complaint also wakes an existing recording instance without repeating its entrance',()=>{
  const {r,p}=filed(),chain=startButterfly('BTF-003','prior-recording',{actorId:'family',patientId:p.uid,recordId:'prior-file'});
  chain.consumed=['BTF-003:N01'];chain.status='dormant';r.authored!.chains.push(chain);
  openComplaintRecordingChains(r,r.authored!);expect(r.authored!.chains.filter(c=>c.chain==='BTF-003')).toHaveLength(1);
  const world=authoredGraphWorld(r,r.authored!,chain,'交班');expect(world.facts).toContain('record_excerpt_received');expect(routeButterfly(chain,world).cursor).toBe('BTF-003:N03');
  chain.entrySource='existing-complaint';world.facts=[...world.facts,'patient_can_express','private_request'];expect(routeButterfly(chain,world).cursor).toBe('BTF-003:N03');
 });
 it('a completed C020 report enters with its own paperwork, without making the dead patient speak or inventing audio',()=>{
  let{r,p}=fixture('C020');const first=beginClinical(r,p)!;r={...r,queue:[first],cursor:0,phase:'play'};
  for(const wanted of 's1_resuscitate s1_confirm s2_scene s2_timeline s3_family s3_rights s4_autopsy s4_morgue s5_report'.split(' ')){
   for(let guard=0;guard<12;guard++){
    if(r.phase==='feedback')r=act(r,{type:'continue'});if(r.phase==='roll')r=act(r,{type:'ack-roll'});
    const opts=availableOptions(r),o=opts.find(o=>o.clinicalChoice===wanted)??opts.find(o=>o.clinicalChoice==='continue');expect(o,`${currentCard(r)?.title}: ${wanted}`).toBeDefined();
    r=act(r,{type:'choose',id:o!.id});if(r.phase==='roll')r=act(r,{type:'ack-roll'});if(o!.clinicalChoice===wanted)break;
   }
  }
  openComplaintRecordingChains(r,r.authored!);const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;expect(chain).toBeDefined();
  const world=authoredGraphWorld(r,r.authored!,chain,'结算');expect(chain.subjects.recordId).toBeUndefined();expect(world.facts).not.toContain('patient_can_express');expect(world.conditions!['BTF-003:N03a']).toBe(false);
  expect(recordingSceneText(chain,world.facts,'')).toBe(RECORDING_PROSE.absent);expect(storageRunIssues(r)).toEqual([]);reload(r);
 });
 it('a ward complaint does not grant player possession, even after asking for the full file',()=>{
  const {r}=filed();openComplaintRecordingChains(r,r.authored!);const chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;
  const request=commitButterflyChoice(chain,'BTF-003:N03a',authoredGraphWorld(r,r.authored!,chain,'结算')).state;
  r.day++;const world=authoredGraphWorld(r,r.authored!,request,'交班');expect(world.facts).toContain('holder_contacted');expect(world.facts).not.toContain('record_received');
 });
});
