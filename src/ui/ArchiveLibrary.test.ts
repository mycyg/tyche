import {describe,it,expect} from 'vitest';
import {archiveEntries,archiveEntryNarration,filterArchiveEntries,ARCHIVE_KINDS} from './ArchiveLibrary';
import {newMeta} from '../game/engine';
import {CASE_PRESETS,PATIENT_ENTITIES} from '../content/patients';
import {CASES} from '../game/catalog';
import {TALENT_DEFINITIONS,DEBUFF_DEFINITIONS} from '../content/talents';
import {patientArt} from '../world/patients';
import {CLINICAL_PATIENTS} from '../content/clinical/patient-identities';
const completeMeta=()=>({...newMeta(),entities:PATIENT_ENTITIES.map(e=>e.id),clinicalPatients:CLINICAL_PATIENTS.map(p=>p.id),cases:[...CASES,...CASE_PRESETS].map(c=>c.id),usedTalents:TALENT_DEFINITIONS.map(t=>t.id),debuffs:DEBUFF_DEFINITIONS.map(d=>d.id)});
describe('collection library disclosure and discovery',()=>{
 it('includes all current registries without a fixed patient or preset total',()=>{
  const entries=archiveEntries(completeMeta());expect(entries).toHaveLength(PATIENT_ENTITIES.length+CLINICAL_PATIENTS.length+CASES.length+CASE_PRESETS.length+TALENT_DEFINITIONS.length+DEBUFF_DEFINITIONS.length);expect(new Set(entries.map(e=>e.key)).size).toBe(entries.length);expect(entries.every(e=>e.known)).toBe(true);
  const totals={patients:PATIENT_ENTITIES.length+CLINICAL_PATIENTS.length,cases:CASES.length,presets:CASE_PRESETS.length,talents:TALENT_DEFINITIONS.length,states:DEBUFF_DEFINITIONS.length};
  for(const kind of ARCHIVE_KINDS)expect(entries.filter(e=>e.kind===kind.id)).toHaveLength(totals[kind.id]);
 });
 it('does not leak a name, demographic, department, symptom, rule, portrait or narration for any unseen entry',()=>{
  for(const e of archiveEntries(newMeta())){expect(e.known).toBe(false);expect(e.name).toMatch(/^尚未收录的/);expect(e.fields).toEqual([]);expect(e.group).toBe('');expect(e.portrait).toBeUndefined();expect(e.summary).toBe('你还没有取得这份记录。');expect(archiveEntryNarration(e)).toBe('');}
 });
 it('searching an unseen name or hidden content cannot disclose a locked entry',()=>{
  const entries=archiveEntries(newMeta());
  for(const kind of ARCHIVE_KINDS)for(const query of [PATIENT_ENTITIES[0].name,CASES[0].title,CASE_PRESETS[0].title,TALENT_DEFINITIONS[0].name,DEBUFF_DEFINITIONS[0].name,PATIENT_ENTITIES[0].concealedFact])expect(filterArchiveEntries(entries,{kind:kind.id,status:'all',query})).toEqual([]);
 });
 it('unlocks exactly the IDs in the corresponding meta collection and ignores stale unknown IDs',()=>{
  const meta=newMeta();meta.entities=[PATIENT_ENTITIES[0].id,'P-invalid'];meta.cases=[CASES[2].id,CASE_PRESETS[4].id,'C-invalid'];meta.usedTalents=['T07'];meta.debuffs=['B23'];
  const before=JSON.stringify(meta),known=archiveEntries(meta).filter(e=>e.known);expect(known.map(e=>e.key)).toEqual([`patients:${PATIENT_ENTITIES[0].id}`,`cases:${CASES[2].id}`,`presets:${CASE_PRESETS[4].id}`,'talents:T07','states:B23']);expect(JSON.stringify(meta)).toBe(before);
 });
 it('supports old meta snapshots without optional new collection fields and does not retroactively unlock them',()=>{
  const meta=newMeta();delete meta.entities;delete meta.usedTalents;delete meta.debuffs;meta.cases=['C003'];const entries=archiveEntries(meta);expect(entries.filter(e=>e.known).map(e=>e.key)).toEqual(['cases:C003']);expect(meta.entities).toBeUndefined();
 });
 it('uses real patient identities and only basic registration fields for every encountered person',()=>{
  const entries=archiveEntries(completeMeta());for(const p of PATIENT_ENTITIES){const e=entries.find(e=>e.key===`patients:${p.id}`)!;
   expect(e.name).toBe(p.name);expect(e.fields.map(f=>f.label)).toEqual(['年龄与性别','身份','陪同','支付方式']);expect(e.portrait).toEqual({caseId:'',entityId:p.id});expect(patientArt(e.portrait!)).toEqual(patientArt({caseId:'',entityId:p.id}));
   for(const unsafe of ['concealedFact','concealment','complaintTendency','adherence','flagDescription','source'])expect(e).not.toHaveProperty(unsafe);
  }
 });
 it('keeps seen cases to initial presentation and never exports source solutions, hazards or later diagnostics',()=>{
  const entries=archiveEntries(completeMeta());for(const c of [...CASES,...CASE_PRESETS]){
   const e=entries.find(e=>e.key===`${c.id.includes('-')?'presets':'cases'}:${c.id}`)!;
   for(const unsafe of ['hidden','hiddenFact','hazards','traps','pathway','scenes','steps','source','variants','findings','history','next'])expect(e).not.toHaveProperty(unsafe);
   expect(e.fields.every(f=>!['底牌','解法','后续结果','检查回报','陷阱'].includes(f.label))).toBe(true);
  }
  const text=archiveEntryNarration(entries.find(e=>e.key==='cases:C005')!);expect(text).toContain('头痛');expect(text).not.toContain('静脉窦血栓');expect(text).not.toContain('s1_bag');
 });
 it('records complete usable talent costs and rules, and state recovery rather than effect-only cards',()=>{
  const entries=archiveEntries(completeMeta());for(const t of TALENT_DEFINITIONS){const entry=entries.find(e=>e.key===`talents:${t.id}`)!;expect(entry.fields.map(f=>f.label)).toEqual(expect.arrayContaining(['效果','代价','使用规则']));expect(entry.fields.every(f=>f.text.length>0)).toBe(true);}
  for(const d of DEBUFF_DEFINITIONS){const entry=entries.find(e=>e.key===`states:${d.id}`)!;expect(entry.fields.map(f=>f.label)).toEqual(['影响','恢复与结束']);expect(archiveEntryNarration(entry)).toContain(d.recovery);}
 });
 it('shows a synergy only when all members have been used, and known searches work by displayed public prose',()=>{
  const meta=newMeta();meta.usedTalents=['T01'];let entries=archiveEntries(meta);expect(entries.find(e=>e.key==='talents:T01')!.fields.some(f=>f.label.includes('＋'))).toBe(false);
  meta.usedTalents.push('T04');entries=archiveEntries(meta);expect(entries.find(e=>e.key==='talents:T01')!.fields.some(f=>f.label==='不对劲 ＋ 复盘')).toBe(true);
  expect(filterArchiveEntries(entries,{kind:'talents',status:'known',query:'复盘',group:'临床直觉'}).some(e=>e.name==='复盘')).toBe(true);
 });
 it('keeps names as primary copy and supplies known-only read-aloud text without source identifiers',()=>{
  for(const e of archiveEntries(completeMeta())){expect(e.name).not.toMatch(/^(?:P-|C-?|T|B)\d+$/);expect(archiveEntryNarration(e)).not.toMatch(/(?:\.md|\.yaml|source-probe-|s\d_)/);}
 });
});
