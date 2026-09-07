import type {Run}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import type {ButterflyFact,ButterflyState}from './butterfly';
import {priorUnperformedPeerExam}from './historical-context';
import {departmentStatementSource}from './statement-requests';

export interface PatientReviewEvidence {
 kind:'peer-exam';statementChainId:string;workDay:number;
 absenceEntryId:string;recordEntryId:string;signatureEntryId:string;reportEntryId:string;
}
export const PATIENT_REVIEW_RECEIPT='医务科把那天的查体记录和你的签字说明转给唐济。你当时听见李恂说没做查体，这次也写进了材料。';
const submissions=['BTF-003:N05a','BTF-003:N05b'];

/** These are two actual, contradictory statements about one examination,
 * not an inference about what an unrelated recording might contain. */
export function patientReviewMaterial(r:Run,s:AuthoredDirectorState,chain:ButterflyState,includeClosed=false,sourceChainId?:string):PatientReviewEvidence|undefined{
 if(chain.chain!=='BTF-003'||!chain.subjects.patientId)return;
 const patient=r.patients.find(p=>p.uid===chain.subjects.patientId);if(!patient)return;
 const original=priorUnperformedPeerExam(r,patient);if(!original)return;
 if(![original.meeting,original.absence,original.record].every(e=>r.committed.includes(e.id)))return;
 const candidates=s.chains.filter(c=>c.chain==='BTF-001'&&c.subjects.patientId===patient.uid&&(includeClosed||c.status!=='closed')&&(!sourceChainId||c.id===sourceChainId));
 for(const source of candidates){
  const signature=source.facts.find(f=>f.type==='false_exam_entry'&&f.sourceChoiceId==='BTF-001:N03d'&&f.scope.kind==='patient'&&f.scope.id===patient.uid&&f.subjects.patientId===patient.uid);
  if(!signature)continue;
  const signatureEntry=r.journal.find(j=>j.id===`${source.id}:${signature.sourceChoiceId}`&&j.day===signature.day&&j.scope.kind==='patient'&&j.scope.id===patient.uid&&r.committed.includes(j.id));
  const report=departmentStatementSource(r,{...source,status:'active'});
  if(!signatureEntry||!report||signature.day>r.day||r.journal.indexOf(original.record)>=r.journal.indexOf(signatureEntry))continue;
  return{kind:'peer-exam',statementChainId:source.id,workDay:original.absence.day,absenceEntryId:original.absence.id,recordEntryId:original.record.id,signatureEntryId:signatureEntry.id,reportEntryId:`${source.id}:${report.sourceChoiceId}`};
 }
}

export function recordPatientReview(r:Run,s:AuthoredDirectorState,chain:ButterflyState,localChoice:string):void{
 if(!submissions.includes(localChoice))return;
 const evidence=patientReviewMaterial(r,s,chain);if(!evidence)return;
 const sourceChoiceId=`${chain.id}:${localChoice}`,id=`${sourceChoiceId}:patient-review`;
 if(chain.facts.some(f=>f.id===id))return;
 chain.facts.push({id,type:'patient_review_received',scope:{...chain.scope},subjects:{...chain.subjects,recipientIds:['player','records-office','tang']},
  sourceChoiceId,day:r.day,knownBy:['player','records-office','tang'],reviewEvidence:evidence,
  observations:['records-office','tang'].map(actorId=>({actorId,source:sourceChoiceId,day:r.day,channel:'delivered-record' as const})),
 });
}

/** Validate the saved receipt against its immutable operation history. Closed
 * cases retain history; only the scheduler decides whether work remains. */
export function patientReviewReceiptValid(r:Run,s:AuthoredDirectorState,chain:ButterflyState,fact:ButterflyFact):boolean{
 const e=fact.reviewEvidence;if(!e||fact.type!=='patient_review_received'||fact.day>r.day)return false;
 if(!submissions.some(choice=>fact.sourceChoiceId===`${chain.id}:${choice}`)||fact.id!==`${fact.sourceChoiceId}:patient-review`)return false;
 const actual=patientReviewMaterial(r,s,chain,true,e.statementChainId);if(!actual||Object.entries(actual).some(([key,value])=>e[key as keyof PatientReviewEvidence]!==value))return false;
 const submission=r.journal.find(j=>j.id===fact.sourceChoiceId&&j.day===fact.day&&j.scope.kind==='patient'&&j.scope.id===chain.subjects.patientId&&r.committed.includes(j.id));
 if(!submission||fact.scope.kind!=='patient'||fact.scope.id!==chain.subjects.patientId||fact.subjects.patientId!==chain.subjects.patientId)return false;
 if(!['records-office','tang'].every(actor=>fact.knownBy.includes(actor)&&fact.observations?.some(o=>o.actorId===actor&&o.day===fact.day&&o.source===fact.sourceChoiceId&&o.channel==='delivered-record')))return false;
 return[e.absenceEntryId,e.recordEntryId,e.signatureEntryId,e.reportEntryId].every(id=>r.journal.findIndex(j=>j.id===id)<r.journal.indexOf(submission));
}

export function patientReviewPairs(r:Run,s:AuthoredDirectorState){
 return s.chains.flatMap(chain=>chain.facts.flatMap(fact=>{
  if(!fact.reviewEvidence||!patientReviewReceiptValid(r,s,chain,fact))return[];
  const source=s.chains.find(c=>c.id===fact.reviewEvidence!.statementChainId)!;
  return[{chains:[source,chain] as [ButterflyState,ButterflyState],receipt:fact}];
 }));
}
