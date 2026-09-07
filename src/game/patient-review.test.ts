import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions,availableEncounters}from './engine';
import {authoredGraphWorld,buildAuthoredEvents,type ButterflyCard,type ButterflyMergeCard}from './director';
import {buildSourceFollowups}from '../content/events/followups';
import {peerExamObservationCard}from '../content/events/peer-exam-observation';
import {patientReviewPairs,patientReviewMaterial,PATIENT_REVIEW_RECEIPT}from '../content/events/patient-review';
import {storageRunIssues,emptySave,encode,decode}from './storage';
import type {Card,Run}from './types';
import {worldTargets}from '../world/WorldStage';

// Boundary fixture: dates/resources are supplied here. Every piece of evidence
// below is produced by an actual engine choice, not an injected fact or journal.
function answer(r:Run,card:Card,suffix:string){
 r={...r,queue:[card],cursor:0,phase:'play'};delete r.feedback;delete r.roll;delete r.pendingCheck;
 r.authored!.published[card.id]=card;
 const option=availableOptions(r).find(o=>o.id.endsWith(suffix));expect(option,`${card.title}: ${suffix}`).toBeDefined();
 let next=act(r,{type:'choose',id:option!.id});if(next.phase==='roll')next=act(next,{type:'ack-roll'});return next;
}
function scene(r:Run,node:string){
 const built=buildAuthoredEvents({...r,phase:'play'},'结算');r={...r,...built.patch,phase:'play'};
 const card=Object.values(r.authored!.published).find(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId===node)!;
 expect(card,node).toBeDefined();return{r,card};
}
function ready(signature='N03d',report='N04a'){
 let r=startRun('patient-review','程医生',[]);r.ap=100;r.cash=100000;r.relations.peer=4;r.day=2;r.shiftPhase='查房';
 const opening=buildSourceFollowups(r,'查房').find(c=>c.sourceFollowup.stage===1)!;
 expect(opening).toBeDefined();const p=r.patients.find(p=>p.uid===opening.patientId)!;
 r=answer(r,opening,':ignore');r.day=3;r.shiftPhase='结算';r.authored!.actor.liAwayDays=[];
 r=answer(r,peerExamObservationCard(r,p,'meeting'),':read');r.day=4;r.shiftPhase='交班';
 r=answer(r,peerExamObservationCard(r,p,'record',3),':read');
 const n03=Object.values(r.authored!.published).find(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-001:N03')!;
 r=answer(r,n03,signature);
 let next=scene(r,'BTF-001:N04');r=answer(next.r,next.card,report);
 r.day=7;r.shiftPhase='结算';
 const complaint=buildSourceFollowups(r,'结算').find(c=>c.sourceFollowup.stage===2)!;expect(complaint.patientId).toBe(p.uid);
 r=answer(r,complaint,':file');next=scene(r,'BTF-003:N03');r=answer(next.r,next.card,'N03c');
 r.day=8;next=scene(r,'BTF-003:N05');return{...next,patientId:p.uid};
}
function submitted(choice='N05a'){
 const before=ready();const r=answer(before.r,before.card,choice);
 return{r,patientId:before.patientId};
}
describe('two submitted patient records enter the same review',()=>{
 it('lets the player prepare the other file while the same patient department reply is pending',()=>{
  const {r,card}=ready();
  const department=Object.values(r.authored!.published).find(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-001:N06')!;
  expect(department).toBeDefined();
  const pending={...r,queue:[department,card],cursor:0,phase:'play' as const,shiftPhase:'结算' as const};
  expect(availableEncounters(pending).map(c=>c.id)).toEqual([department.id,card.id]);
  expect(worldTargets(pending).flatMap(t=>t.cards??[]).map(c=>c.id)).toContain(card.id);
  let next=act(pending,{type:'focus',id:card.id});expect(next).not.toBe(pending);
  next=act(next,{type:'choose',id:availableOptions(next).find(o=>o.id.endsWith('N05a'))!.id});
  expect(patientReviewPairs(next,next.authored!)).toHaveLength(1);
  expect(next.committed.some(id=>department.options.some(o=>o.id===id))).toBe(false);
 });
 it.each(['N05a','N05b'])('%s records the actual discrepancy and enables XJ03 without invented audio',choice=>{
  const {r,patientId}=submitted(choice),pair=patientReviewPairs(r,r.authored!)[0];expect(pair).toBeDefined();
  expect(pair.receipt.reviewEvidence).toMatchObject({workDay:3,kind:'peer-exam'});
  expect(pair.receipt.knownBy).toEqual(['player','records-office','tang']);
  expect(pair.chains.every(c=>c.subjects.patientId===patientId)).toBe(true);
  expect(pair.chains[1].facts.some(f=>f.type==='record_received')).toBe(false);
  expect(r.journal.at(-1)!.result).toContain(PATIENT_REVIEW_RECEIPT);
  expect(pair.chains[0].facts.find(f=>f.type==='false_exam_entry')?.knownBy).not.toContain('tang');
  r.day=9;const built=buildAuthoredEvents({...r,phase:'play'},'结算');
  const merge=Object.values(built.patch.authored!.published).find(c=>(c as Partial<ButterflyMergeCard>).butterflyMerge?.mergeId==='XJ-03') as ButterflyMergeCard;
  expect(merge).toBeDefined();expect(merge.butterflyMerge.chainStateIds).toEqual(pair.chains.map(c=>c.id));
  expect(merge.options.some(o=>o.id.endsWith('XJ03a'))).toBe(true);
  const before={...r,...built.patch,phase:'play' as const};const result=answer(before,merge,'XJ03a');
  expect(result.ap).toBe(before.ap-2);expect(storageRunIssues(result)).toEqual([]);
  const loaded=decode(encode({...emptySave(),run:result})).run!;expect(loaded).toBeDefined();
  expect(act(loaded,{type:'choose',id:merge.options.find(o=>o.id.endsWith('XJ03a'))!.id})).toBe(loaded);
 });
 it('does not turn a true statement or an unsubmitted draft into a second received record',()=>{
  for(const [signature,report]of [['N03a','N04a'],['N03d','N04c']]){
   const {r,card}=ready(signature,report),next=answer(r,card,'N05a');
   expect(patientReviewPairs(next,next.authored!)).toEqual([]);
   expect(next.journal.at(-1)!.result).not.toContain(PATIENT_REVIEW_RECEIPT);
  }
 });
 it('never obtains a common review from an unrelated title, a phone or an unsigned choice',()=>{
  const {r,card}=ready(),chain=r.authored!.chains.find(c=>c.chain==='BTF-003')!;
  expect(patientReviewMaterial(r,r.authored!,chain)).toBeDefined();
  r.journal.at(-1)!.title='复核与质控';expect(authoredGraphWorld(r,r.authored!,chain,'结算').facts).not.toContain('same_review_received');
  expect(card.options.find(o=>o.id.endsWith('N05a'))!.result).toContain(PATIENT_REVIEW_RECEIPT);
  expect(patientReviewPairs(r,r.authored!)).toEqual([]);
 });
 it.each(['workDay','recordEntryId','statementChainId','sourceChoiceId'])('rejects a saved receipt with a changed %s',key=>{
  const {r}=submitted(),receipt=patientReviewPairs(r,r.authored!)[0].receipt;
  if(key==='sourceChoiceId')receipt.sourceChoiceId='unsubmitted';
  else if(key==='workDay')receipt.reviewEvidence!.workDay=2;
  else (receipt.reviewEvidence as unknown as Record<string,unknown>)[key]='unrelated-record';
  expect(patientReviewPairs(r,r.authored!)).toEqual([]);expect(storageRunIssues(r)).not.toEqual([]);
 });
 it('does not attach another same-patient file to the matched pair',()=>{
  const {r}=submitted(),pair=patientReviewPairs(r,r.authored!)[0];
  const extra=structuredClone(pair.chains[0]);extra.id+=':unrelated';extra.facts=[];r.authored!.chains.unshift(extra);
  expect(patientReviewPairs(r,r.authored!)[0].chains.map(c=>c.id)).toEqual(pair.chains.map(c=>c.id));
 });
});
