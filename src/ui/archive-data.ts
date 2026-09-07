import type {Meta} from '../game/types';
import {CASES} from '../game/catalog';
import {CASE_PRESETS,PATIENT_ENTITIES} from '../content/patients';
import {DEBUFF_DEFINITIONS,TALENT_DEFINITIONS,TALENT_SYNERGIES} from '../content/talents';
import {CLINICAL_IDENTITIES,patientAgeLabel} from '../content/clinical/identity';
import {CLINICAL_PATIENTS} from '../content/clinical/patient-identities';
import type {PatientArtIdentity} from '../world/patients';
import {talentCopy,debuffCopy} from './talent-copy';

export type ArchiveKind='patients'|'cases'|'presets'|'talents'|'states';
export const ARCHIVE_KINDS:{id:ArchiveKind;label:string;singular:string}[]=[
 {id:'patients',label:'患者',singular:'患者'}, {id:'cases',label:'重点病例',singular:'病例'},
 {id:'presets',label:'接诊病例',singular:'病例'}, {id:'talents',label:'天赋',singular:'天赋'}, {id:'states',label:'状态记录',singular:'状态'},
];
export interface ArchiveEntry {
 key:string;kind:ArchiveKind;known:boolean;name:string;summary:string;group:string;
 fields:{label:string;text:string}[];portrait?:PatientArtIdentity;
}
export type ArchiveStatus='known'|'all'|'unknown';
export const ARCHIVE_PATIENT_SCOPE=`患者名册共 ${PATIENT_ENTITIES.length+CLINICAL_PATIENTS.length} 份：${PATIENT_ENTITIES.length} 位日常接诊患者、${CLINICAL_PATIENTS.length} 位重点病例患者。收录以实际接触为准，未见过的人保持封存。`;
const ageGroup=(age:number)=>age<1?'婴儿':age<6?'幼儿':age<13?'儿童':age<18?'青少年':age<40?'青年':age<60?'中年':'老年';
const locked=(kind:ArchiveKind,id:string):ArchiveEntry=>({key:`${kind}:${id}`,kind,known:false,name:`尚未收录的${ARCHIVE_KINDS.find(k=>k.id===kind)!.singular}`,summary:'你还没有取得这份记录。',group:'',fields:[]});
/** Deliberate public-field projections. Meta records encounters, not which
 * hidden findings were discovered: never export hiddenFact/traps/pathway,
 * concealment/diagnosis, arbitrary source objects, or unperformed reports. */
export function archiveEntries(meta:Meta):ArchiveEntry[] {
 const entities=new Set(meta.entities??[]),fixed=new Set(meta.clinicalPatients??[]),cases=new Set(meta.cases),talents=new Set(meta.usedTalents??[]),states=new Set(meta.debuffs??[]);
 return [
  ...PATIENT_ENTITIES.map(p=>entities.has(p.id)?{
   key:`patients:${p.id}`,kind:'patients' as const,known:true,name:p.name,summary:`${patientAgeLabel(p.ageYears)} · ${p.sex}`,group:ageGroup(p.ageYears),
   portrait:{caseId:'',entityId:p.id},fields:[{label:'年龄与性别',text:`${patientAgeLabel(p.ageYears)}，${p.sex}`},{label:'身份',text:p.occupation},{label:'陪同',text:p.companion},{label:'支付方式',text:p.payment}],
  }:locked('patients',p.id)),
  ...CLINICAL_PATIENTS.map(p=>{
   if(!fixed.has(p.id))return locked('patients',p.id);
   const c=CASES.find(c=>c.id===p.caseId)!;
   return {key:`patients:${p.id}`,kind:'patients' as const,known:true,name:p.name,summary:`${patientAgeLabel(p.age)} · ${p.sex}`,group:ageGroup(p.age),portrait:{caseId:p.caseId},
    fields:[{label:'年龄与性别',text:`${patientAgeLabel(p.age)}，${p.sex}`},{label:'接诊科室',text:c.department},{label:'接诊时主诉',text:c.complaint},{label:'病例记录',text:c.title},...(p.members?[{label:'同次接诊',text:p.members.join('；')}]:[])]};
  }),
  ...CASES.map(c=>cases.has(c.id)?{
   key:`cases:${c.id}`,kind:'cases' as const,known:true,name:c.title,summary:c.complaint,group:c.department,portrait:{caseId:c.id},
   fields:[{label:'科室',text:c.department},{label:'接诊资料',text:`${patientAgeLabel(c.age)}，${c.sex}`},{label:'已知主诉',text:c.complaint},...(CLINICAL_IDENTITIES[c.id]?.members?[{label:'同次接诊',text:CLINICAL_IDENTITIES[c.id].members!.join('；')}]:[])],
  }:locked('cases',c.id)),
  ...CASE_PRESETS.map(c=>cases.has(c.id)?{
   key:`presets:${c.id}`,kind:'presets' as const,known:true,name:c.title,summary:c.scenes.find(s=>s.id===c.entry)?.text??'',group:c.department,
   fields:[{label:'科室',text:c.department},{label:'接诊时段',text:c.period},{label:'接诊时已有资料',text:c.scenes.find(s=>s.id===c.entry)?.text??''}],
  }:locked('presets',c.id)),
  ...TALENT_DEFINITIONS.map(t=>{
   if(!talents.has(t.id))return locked('talents',t.id);
   const copy=talentCopy[t.id];
   return {key:`talents:${t.id}`,kind:'talents' as const,known:true,name:copy.name,summary:copy.benefit,group:copy.family,
    fields:[{label:'类别',text:`${copy.family} · ${copy.rarity}`},{label:'效果',text:copy.benefit},{label:'代价',text:copy.price},{label:'使用规则',text:copy.detail},
     ...TALENT_SYNERGIES.filter(s=>s.ids.some(id=>id===t.id)&&s.ids.every(id=>talents.has(id))).map(s=>({label:s.ids.map(id=>talentCopy[id].name).join(' ＋ '),text:s.text}))]};
  }),
  ...DEBUFF_DEFINITIONS.map(d=>states.has(d.id)?{
   key:`states:${d.id}`,kind:'states' as const,known:true,name:debuffCopy[d.id].name,summary:debuffCopy[d.id].text,group:d.family==='钱'?'财务':d.family,
   fields:[{label:'影响',text:debuffCopy[d.id].text},{label:'恢复与结束',text:debuffCopy[d.id].recovery}],
  }:locked('states',d.id)),
 ];
}
export function filterArchiveEntries(entries:readonly ArchiveEntry[],filter:{kind:ArchiveKind;status:ArchiveStatus;query?:string;group?:string}):ArchiveEntry[] {
 const query=(filter.query??'').trim().toLocaleLowerCase('zh-CN');
 return entries.filter(e=>e.kind===filter.kind&&(filter.status==='all'||e.known===(filter.status==='known'))&&(!filter.group||e.group===filter.group)&&
  (!query||e.known&&[e.name,e.summary,e.group,...e.fields.map(f=>f.text)].join('\n').toLocaleLowerCase('zh-CN').includes(query)))
  .sort((a,b)=>Number(b.known)-Number(a.known)||(a.known?a.name.localeCompare(b.name,'zh-CN'):0));
}
export const archiveEntryNarration=(entry:ArchiveEntry)=>entry.known?[entry.name,...entry.fields.map(f=>`${f.label}。${f.text}`)].join('\n'):'';
