import type {Run,Patient}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import {startButterfly,type ButterflyState}from './butterfly';

export const RECORDING_PROSE={
 excerpt:'医务科转来家属提交的录音节选：“你听听，前后还有什么？”附件没写结束时间。',
 absent:'医务科转来这位患者的争议材料，问你那天做过什么。你手头有病历，还没有收到谈话录音。',
 received:'医务科拿出已签收的录音和病历：“请你指出自己经手的部分。哪些能对上，哪些还缺，分开说。”',
 holder:'家属回复，文件还在：“明天找谁交？我不想再从头讲一遍了。”',
 missing:'清单上，录音原件一栏还空着。你把已有病历和家属的说法分开放，准备注明哪些能核实，哪些还缺材料。',
 compare:'录音和病历摆在一起。医务科让你从自己经手的那一段开始核对，记下两份材料的相同处和差别。',
 reserve:'保留意见，请继续核对',
 reserveResult:'你把还有疑问的地方列出来，交给医务科继续核对。没有否认已经发生的事，尚未收到的材料也留在清单上。',
};

/** Receiving a complaint or reading someone else's chart is not writing a
 * contemporaneous note. Keep the source entry, including any actual error. */
export function ownContemporaneousRecord(r:Run,p:Patient,s=r.authored){
 const origin=s?recordingOrigin(r,s,p):undefined;
 const cutoff=origin?r.journal.indexOf(origin.source):r.journal.length;
 return r.journal.slice(0,cutoff).find(j=>j.scope.kind==='patient'&&j.scope.id===p.uid&&r.committed.includes(j.id)&&(
  (j.operation==='record'||j.operation==='rescue-record')&&/(?:^|[，、；。后]|并)(?:(?:凭印象|凭记忆)?填写|写入|写明|记入|补记|补写|誊写|誊录|完成.*记录|记录(?:死亡|抢救|病程|查体))|^(?:将|把).*(?:写成|改成|补成|记入)/.test(j.choice)
  ||j.id===`${r.id}:source-unrest:1:explain`
 ));
}

/** A phone, a complaint and an original file are three different things.
 * Only completed, patient-scoped interactions supply these entry receipts. */
export function recordingOrigin(r:Run,s:AuthoredDirectorState,p:Patient){
 const entries=r.journal.filter(j=>j.scope.kind==='patient'&&j.scope.id===p.uid&&j.day<=r.day);
 const resolved=s.dispute?.patientId===p.uid&&s.dispute.second;
 const source=[...entries].reverse().find(j=>
  !resolved&&j.id.startsWith(`${r.id}:source-unrest:2:`)&&!!r.facts[`clinical:${p.uid}:unrest_filed`]
  ||j.id===`complaint:${p.uid}`
  ||j.id.startsWith(`return:${p.uid}:`)&&r.committed.includes(j.id)
  ||p.caseId==='C020'&&j.clinicalChoice==='s5_report'&&p.clinical?.flags.includes('report_started')
 );
 if(!source)return;
 const recording=entries.find(j=>j.flags.some(f=>f===`clinical:${p.uid}:recording-exists`||f===`family-record:${p.uid}`));
 const excerpt=source.id.startsWith(`${r.id}:source-unrest:2:`);
 const received=source.id.startsWith(`return:${p.uid}:`)&&!!recording;
 return{source,recording,excerpt,received};
}

export function openComplaintRecordingChains(r:Run,s:AuthoredDirectorState):void{
 for(const p of r.patients){
  // A continuing complaint belongs to its existing instance, including a
  // closed one. Do not revoke a resolution to manufacture another climax.
  if(s.chains.some(c=>c.chain==='BTF-003'&&c.subjects.patientId===p.uid))continue;
  const origin=recordingOrigin(r,s,p);if(!origin)continue;
  const chain=startButterfly('BTF-003',`${r.id}:BTF-003:complaint:${p.uid}`,{
   actorId:`family:${p.uid}`,patientId:p.uid,
   ...(origin.recording?{recordId:`${p.uid}:recording:${origin.recording.id}`}:{})
  },'N03');
  chain.entrySource='existing-complaint';
  const add=(type:string,source=origin.source,knownBy=['player','records-office'])=>chain.facts.push({
   id:`${chain.id}:${type}`,type,scope:{...chain.scope},subjects:{...chain.subjects},
   sourceChoiceId:source.id,day:source.day,knownBy,
   observations:knownBy.map(actorId=>({actorId,source:source.id,day:source.day,channel:'delivered-record' as const})),
  });
  add('same_patient_dispute');add('complaint_delivered');
  if(origin.recording){add('recording_known',origin.recording,['player',chain.subjects.actorId]);add('record_holder_known',origin.recording,['player',chain.subjects.actorId]);}
  if(origin.excerpt)add('record_excerpt_received');
  if(origin.received)add('record_received');
  s.chains.push(chain);
 }
}

export function recordingSceneText(chain:ButterflyState,facts:readonly string[],fallback:string):string{
 if(chain.chain!=='BTF-003')return fallback;
 const f=new Set(facts);
 if(chain.cursor.endsWith(':N03'))return f.has('record_received')?RECORDING_PROSE.received:f.has('record_excerpt_received')?RECORDING_PROSE.excerpt:RECORDING_PROSE.absent;
 if(chain.cursor.endsWith(':N04'))return RECORDING_PROSE.holder;
 if(chain.cursor.endsWith(':N05'))return f.has('record_received')?RECORDING_PROSE.compare:RECORDING_PROSE.missing;
 return fallback;
}
