import type {Card,Entry,Patient,Run}from '../../game/types';
import {visibleClinicalReports}from '../../game/clinical';
import {ENTITY_BY_ID}from '../patients';
import type {EventBinding}from './types';

const entries=(r:Run,p:Patient)=>r.journal.filter(e=>e.scope.kind==='patient'&&e.scope.id===p.uid);
const registeredName=(p:Patient)=>p.preset?.entityProfile?.name??(p.entityId?ENTITY_BY_ID.get(p.entityId)?.name:undefined)??p.name;
export function sameNameWardPatient(r:Run,p:Patient):Patient|undefined{
 if(!p.active||!p.inpatient||p.bed<5||p.damage>=3)return;
 return r.patients.find(other=>other.uid!==p.uid&&other.active&&other.inpatient&&other.bed>=5&&other.bed!==p.bed&&other.damage<3&&registeredName(other)===registeredName(p));
}
export function previousNightBloodGas(r:Run,p:Patient):{source:Entry;ph:string;reportId:string}|undefined{
 const night=r.facts[`night-started:${p.uid}`];if(!night||night.day!==r.day-1)return;
 for(const report of visibleClinicalReports(r,p)){
  const values=[...report.full.matchAll(/pH\s*[=:：]?\s*(\d+\.\d+)/gi)];
  // A family report with three pH values cannot be assigned to its index patient.
  if(values.length!==1)continue;
  const source=entries(r,p).find(e=>e.day===r.day-1&&r.committed.includes(e.id)&&e.result.includes(report.full));
  if(source)return{source,ph:values[0][1],reportId:report.id};
 }
}
/** These receipts must reference the observed actor/date/patient, not a global
 * E054 seen flag or the fact that a colleague was somewhere else at some time. */
function witnessed(r:Run,key:string,day:number,patientId?:string):Entry|undefined{
 const f=r.facts[key];if(!f||f.day!==day)return;
 return r.journal.find(e=>e.id===f.source&&e.day===day&&e.flags.includes(key)&&(!patientId||e.scope.kind==='patient'&&e.scope.id===patientId));
}
export function priorUnperformedPeerExam(r:Run,p:Patient):{meeting:Entry;absence:Entry;record:Entry}|undefined{
 for(const record of entries(r,p).filter(e=>e.day<=r.day&&e.result.includes('双肺呼吸音清'))){
  const label=record.flags.find(f=>/^peer-retrospective-exam:li:\d+$/.test(f));if(!label)continue;
  const day=Number(label.split(':').at(-1));if(record.day<=day)continue;
  const meeting=witnessed(r,`peer-meeting-observed:li:${day}`,day),absence=witnessed(r,`peer-exam-not-performed:li:${p.uid}:${day}`,day,p.uid);
  if(meeting&&absence)return{meeting,absence,record};
 }
}
export function priorGlucoseTranscription(r:Run,p:Patient):{report:Entry;record:Entry}|undefined{
 const previous=entries(r,p).filter(e=>e.day<r.day&&r.committed.includes(e.id));
 for(const record of previous.filter(e=>e.operation==='record'&&/交班本/.test(e.choice+' '+e.result)&&/(?:写成|填成|记成|误写为|写为)\s*[「“]?6\.1/.test(e.result))){
  const receipt=record.flags.find(f=>f.startsWith(`glucose-transcription-error:${p.uid}:`)),reportDay=receipt?Number(receipt.split(':').at(-1)):record.day;
  const report=previous.find(e=>e.day===reportDay&&e.day<=record.day&&r.journal.indexOf(e)<r.journal.indexOf(record)&&/(?:血糖|葡萄糖)\s*[=:：]?\s*16\.1(?:\s|mmol|[，。；])/i.test(e.result));
  if(report)return{report,record};
 }
}
export function historicalEventEligible(id:string,r:Run,p:Patient):boolean{
 if(id==='E-010')return !!sameNameWardPatient(r,p);
 if(id==='E-041')return !!previousNightBloodGas(r,p);
 if(id==='E-054')return !!priorUnperformedPeerExam(r,p);
 if(id==='E-056')return !!priorGlucoseTranscription(r,p);
 return true;
}
export function projectHistoricalEvent(card:Card,id:string,r:Run,p:Patient,binding:EventBinding):Card{
 if(id==='E-010'){
  const other=binding.patients?.find(x=>x.id!==p.uid);if(!other)return card;
  card.text=`护士拿来两份检查单，患者都叫「${registeredName(p)}」，一位住 ${p.bed} 床，一位住 ${other.bed} 床。`;
 }else if(id==='E-041'){
  const gas=previousNightBloodGas(r,p);if(!gas)return card;
  card.text=`主任走到${p.bed}床${p.name}身旁，转过身问你昨晚的血气 pH 是多少。你没有记住。`;
  card.options=card.options.map(o=>o.id.endsWith('E-041-b')?{...o,result:`你翻出昨晚的原始报告，报出 pH ${gas.ph}。主任看了一眼报告，继续往下一床走。`}:o);
 }else if(id==='E-054'){
  const found=priorUnperformedPeerExam(r,p);if(!found)return card;
  card.text=`你翻到${p.name}第 ${found.absence.day} 天的病程，查体栏写着「双肺呼吸音清」。那天下午李恂在开会，交班时说过没做这位患者的查体。`;
 }
 else if(id==='E-056'){
  const found=priorGlucoseTranscription(r,p);if(!found)return card;
  card.text=`主任翻到第 ${found.record.day} 天的交班本，问${p.name}的血糖怎么写成了 6.1 mmol/L。那张复测原单写的是 16.1 mmol/L，字迹是你的。`;
 }
 return card;
}
