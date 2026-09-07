import type {Card,Patient,Run}from '../../game/types';
import type {EventPhase}from './types';
import {RULES}from '../../game/rules';
import {runRandom}from '../../game/run-random';

export interface PeerExamObservationCard extends Card {peerExamObservation:{stage:'meeting'|'record';workDay:number};}
export function peerExamObservationCard(r:Run,p:Patient,stage:'meeting'|'record',workDay=r.day):PeerExamObservationCard{
 const id=`${r.id}:peer-exam:${stage}:${workDay}:${p.uid}`;
 const meeting=stage==='meeting';
 return{id,kind:'story',chain:'PEER-EXAM',actor:'peer',patientId:p.uid,scope:{kind:'patient',id:p.uid},
  shiftPhase:meeting?'结算':'交班',peerExamObservation:{stage,workDay},
  title:meeting?'会后交班':'病程里的查体',
  text:meeting?`你去会议室送材料，李恂还在里面。散会后，他来交班，翻到${p.name}那一页。`
   :`李恂打开${p.name}第 ${workDay} 天的病程。查体栏写着「双肺呼吸音清」，他把病历推向你。`,
  options:[{id:`${id}:read`,label:meeting?'听完这位患者的交班':'核对病程日期和查体内容',ap:0,minutes:0,cost:0,
   effects:{flags:meeting?[`peer-meeting-observed:li:${workDay}`,`peer-exam-not-performed:li:${p.uid}:${workDay}`]:[`peer-retrospective-exam:li:${workDay}`]},
   result:meeting?'李恂说：“下午都在开会，那张床我没去，查体还没做。明早补看。”'
    :`这份病程记的是第 ${workDay} 天的查体，写着「双肺呼吸音清」。李恂说：“那天我没进去，这一栏已经写了。”`}],
 };
}
/** First the player hears the missed examination, then sees the later note.
 * Neither acknowledgement certifies a clinical finding or transfers care. */
export function pendingPeerExamObservations(r:Run,phase:EventPhase):PeerExamObservationCard[]{
 const s=r.authored;if(!s||s.seen['E-054']!==undefined||s.actor.liAwayDays.includes(r.day))return[];
 const published=Object.values(s.published),origins=published.filter((c):c is PeerExamObservationCard=>
  (c as Partial<PeerExamObservationCard>).peerExamObservation?.stage==='meeting');
 if(phase==='交班')return origins.flatMap(origin=>{
  const p=r.patients.find(p=>p.uid===origin.patientId),day=origin.peerExamObservation.workDay;
  if(!p||r.day<=day||r.day>RULES.butterfly.peerExamPreludeEnd+1||!origin.options.some(o=>r.committed.includes(o.id)))return[];
  const card=peerExamObservationCard(r,p,'record',day);
  return s.published[card.id]?[]:[card];
 });
 if(phase!=='结算'||origins.length||r.day<RULES.butterfly.peerExamPreludeStart||r.day>RULES.butterfly.peerExamPreludeEnd
  ||runRandom(r,`peer-exam:meeting:${r.day}`)>=RULES.butterfly.peerExamPreludeChance)return[];
 const p=r.patients.find(p=>p.active&&p.inpatient&&p.damage<3&&s.clinicalAssignments?.some(a=>a.patientId===p.uid&&a.owner==='peer'&&a.cover?.day!==r.day));
 return p?[peerExamObservationCard(r,p,'meeting')]:[];
}
