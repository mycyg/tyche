import {describe,it,expect} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient} from './cards';
import {presetCard} from './presets';
import {abilityReports,clinicalClues,firstContact} from './abilities';
import {unrevealedPresetScent,PRESET_SCENTS} from '../content/patients/scent';
import {optionCosts} from './costs';
import {patientComplaintReliefFlag} from './patient-director';
import {CASE_PRESETS,compatibleEntities,instantiatePreset} from '../content/patients';
import {PRESET_CHART_CLUES} from '../content/patients/chart-clues';
import {initialTalentMemory} from './talents';
import {decode,emptySave,encode} from './storage';
import type {Run} from './types';
const initialRuns=new Map<string,Run>();
function fixture(id='C-001',talents=['T02','T05']):Run {
 const key=talents.join(',');
 if(!initialRuns.has(key))initialRuns.set(key,startRun('preset-ability','程医生',talents));
 const r=structuredClone(initialRuns.get(key)!),p=createPatient(r,'C003','abilities'),source=CASE_PRESETS.find(c=>c.id===id)!,entity=compatibleEntities(source)[0];
 p.caseId=id;p.entityId=entity.id;p.name=entity.name;p.preset=instantiatePreset(source,entity,p.uid);p.presetNode=p.preset.steps[0].id;delete p.clinical;p.inpatient=true;
 r.patients.push(p);r.queue=[presetCard(r,p)!];r.queue[0].shiftPhase='查房';r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=20;r.cash=20000;r.vitals={stamina:80,san:80,emotion:80};
 delete r.pendingCheck;delete r.feedback;delete r.roll;return r;
}
const subject=(r:Run)=>r.patients.find(p=>p.uid===currentCard(r)!.patientId)!;
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
describe('preset active abilities and delayed chart completion',()=>{
 it('T03 reveals only C-142 source breath smell, once per patient, without diagnostic results',()=>{
  const r=fixture('C-142',['T03']),p=subject(r),prefix=`preset:${p.caseId}:${p.uid}`;
  const contacts=firstContact(r,p),smell=contacts.find(c=>c.text.includes('酮味'))!;
  expect(smell).toBeDefined();expect(smell.hook.effects.emotion).toBe(-2);
  expect(smell.text).not.toMatch(/确诊|酸中毒|mmol|血酮为/);expect(smell.hook.effects.flags).not.toContain(`${prefix}:revealed`);
  for(const c of contacts){r.talentMemory=c.hook.memory;for(const f of c.hook.effects.flags??[])r.facts[f]={day:r.day,source:'scent',sequence:0};if(c.patientPatch)Object.assign(p,c.patientPatch);}
  expect(p.preset!.findings).toContain(smell.text);expect(firstContact(r,p).some(c=>c.text.includes('酮味'))).toBe(false);
  p.presetNode=p.preset!.steps.find(s=>s.id.endsWith(':investigate'))!.id;r.queue=[presetCard(r,p)!];
  expect(availableOptions(r).some(o=>o.id.includes('source-probe-2'))).toBe(false);
  expect(unrevealedPresetScent(reload(r),subject(reload(r)))).toBeUndefined();
 });
 it('does not charge T03 again when the actual observation or later assessment is already recorded',()=>{
  for(const suffix of ['probe-2-passed','revealed']) {
   const r=fixture('C-142',['T03']),p=subject(r),flag=`preset:${p.caseId}:${p.uid}:${suffix}`;
   r.facts[flag]={day:r.day,source:'actual-assessment',sequence:0};expect(unrevealedPresetScent(r,p)).toBeUndefined();
   delete r.facts[flag];r.journal.push({id:'old-assessment',day:r.day,title:'评估记录',choice:'实际观察',result:'已记录',scope:{kind:'patient',id:p.uid},flags:[flag]});
   expect(unrevealedPresetScent(r,p)).toBeUndefined();
  }
 });
 it('has no invented scent for the other 206 source presets or for already-known admission alcohol smell',()=>{
  expect(Object.keys(PRESET_SCENTS)).toEqual(['C-001','C-142']);
  const alcohol=fixture('C-001',['T03']);expect(firstContact(alcohol,subject(alcohol)).some(c=>c.text.includes('酒气')&&c.hook.effects.emotion===-2)).toBe(true);
  for(const source of CASE_PRESETS)if(!['C-001','C-142'].includes(source.id)) {
   const r=fixture(source.id,['T03']);expect(unrevealedPresetScent(r,subject(r)),source.id).toBeUndefined();
  }
 },30000);
 it.each([['C-128','investigate','targeted'],['C-158','entry','history']])('T12 reaches %s explicitly complete examination and charges four stamina',(id,node,choice)=>{
  const r=fixture(id,['T12']),p=subject(r);
  p.presetNode=p.preset!.steps.find(s=>s.id.endsWith(`:${node}`))!.id;r.queue=[presetCard(r,p)!];
  const option=availableOptions(r).find(o=>o.id.endsWith(`:${choice}`))!;
  expect(option.mechanics?.operation).toBe('full-exam');expect(optionCosts(r,option).stamina).toBe(4);
  const before=p.patience,after=act(r,{type:'choose',id:option.id});
  expect(subject(after).patience).toBe(before+3);expect(after.vitals.stamina).toBe(r.vitals.stamina-4);
  expect(after.facts[patientComplaintReliefFlag(p,option)]).toBeDefined();
 });
 it('T10 has a genuine source-policy entry in all 208 presets, including C/F/D-only cases',()=>{
  for(const source of CASE_PRESETS){
   const r=fixture(source.id,['T10']),option=availableOptions(r).find(o=>o.talentAction==='norm-quote');
   expect(option,source.id).toBeDefined();
   if(!source.hazards.some(h=>h.type==='R')) {
    const after=act(r,{type:'choose',id:option!.id});
    expect(after.feedback!.text).toBe(source.hazards.find(h=>h.norm)!.norm);
    expect(subject(after).presetNode).toBe(subject(r).presetNode);
   }
  }
 },30000);
 it.each(CASE_PRESETS.map(c=>c.id))('%s re-reads only already presented admission material at the first node',id=>{
  const r=fixture(id),p=subject(r),reports=abilityReports(r,p),o=availableOptions(r).find(o=>o.talentAction==='full-review');
  expect(o).toBeDefined();expect(reports).toHaveLength(1);expect(reports[0].full).toBe([p.preset!.complaint,...p.preset!.history].join('\n'));
  const after=act(r,{type:'choose',id:o!.id});expect(after.vitals.stamina).toBe(77);expect(after.talentMemory!.fullReviewsUsed).toBe(1);expect(after.feedback!.text).toContain(reports[0].full);
  expect(subject(after).presetNode).toBe(p.presetNode);expect(after.facts[`preset:${id}:${p.uid}:revealed`]).toBeUndefined();
 });
 it.each(Object.keys(PRESET_CHART_CLUES))('%s chart review reveals a sourced history fact, never claims the diagnostic investigation was done',id=>{
  const r=fixture(id),p=subject(r),o=availableOptions(r).find(o=>o.talentAction==='chart-review');expect(o).toBeDefined();
  const after=act(r,{type:'choose',id:o!.id});expect(after.ap).toBe(18);expect(after.feedback!.text).toBe(PRESET_CHART_CLUES[id]);expect(subject(after).preset!.history).toContain(PRESET_CHART_CLUES[id]);
  expect(after.facts[`preset:${id}:${p.uid}:history-full`]).toBeDefined();expect(after.facts[`preset:${id}:${p.uid}:revealed`]).toBeUndefined();expect(clinicalClues(subject(after),after)).toEqual([]);
 });
 it('does not expose an objective-only hidden examination as a historical chart clue',()=>{
  for(const id of ['C-023','C-091','C-119','C-128','C-146','C-158','C-161','C-173']){
   const r=fixture(id);expect(clinicalClues(subject(r),r)).toEqual([]);expect(availableOptions(r).some(o=>o.talentAction==='chart-review')).toBe(false);
  }
 });
 it('obtained reports remain patient-scoped and available history survives a reload',()=>{
  const r=fixture(),p=subject(r),prefix=`preset:${p.caseId}:${p.uid}`;
  r.journal.push({id:'done-report',day:r.day,title:'实际回报',choice:'已完成检查',result:'已经取得的结果。',scope:{kind:'patient',id:p.uid},flags:[`${prefix}:revealed`]});
  r.journal.push({id:'another-report',day:r.day,title:'另一患者',choice:'已完成检查',result:'另一患者的结果。',scope:{kind:'patient',id:r.patients[0].uid},flags:[`${prefix}:revealed`]});
  expect(abilityReports(r,p).map(x=>x.full)).toContain('已经取得的结果。');expect(abilityReports(r,p).map(x=>x.full)).not.toContain('另一患者的结果。');
  const o=availableOptions(r).find(o=>o.talentAction==='chart-review')!,after=act(r,{type:'choose',id:o.id});expect(reload(after)).toEqual(after);
 });
 it('offers every due record separately, retains old D risk and consumes only the chosen record across reload',()=>{
  const r=fixture('C-001',[]),p=subject(r);r.day=2;r.talentMemory=initialTalentMemory(2);r.talentMemory.delayedRecords=[{patientId:p.uid,recordId:'record-a',dueDay:2},{patientId:p.uid,recordId:'record-b',dueDay:2},{patientId:p.uid,recordId:'record-tomorrow',dueDay:3}];
  r.hazards.push({id:'late-risk',choiceId:'record-a',choice:'病程记录',day:1,type:'D',weight:10,reason:'病程记录延至次日',norm:'病历记录及时性',causal:false,scope:{kind:'patient',id:p.uid}});
  const options=availableOptions(r).filter(o=>o.talentAction==='late-record');expect(options).toHaveLength(2);expect(new Set(options.map(o=>o.id)).size).toBe(2);
  const chosen=options.find(o=>o.talentTarget==='record-a')!,after=act(r,{type:'choose',id:chosen.id});expect(after.ap).toBe(19);expect(after.talentMemory!.delayedRecords.map(x=>x.recordId)).toEqual(['record-b','record-tomorrow']);expect(after.hazards).toEqual(r.hazards);
  const saved=reload(after);expect(act(saved,{type:'choose',id:chosen.id})).toBe(saved);const resumed=act(saved,{type:'continue'});expect(availableOptions(resumed).filter(o=>o.talentAction==='late-record').map(o=>o.talentTarget)).toEqual(['record-b']);
 });
 it('permits completing a discharged patient’s overdue record at the rest desk',()=>{
  const r=fixture('C-001',[]),p=subject(r);r.day=2;p.active=false;p.inpatient=false;r.talentMemory=initialTalentMemory(2);r.talentMemory.delayedRecords=[{patientId:p.uid,recordId:'closed-patient-note',dueDay:2}];
  r.queue=[{id:'rest-desk',kind:'rest',title:'交班后',text:'病历夹放在桌面上。',scope:{kind:'personal',id:r.id},options:[{id:'rest-close',label:'结束',ap:0,cost:0,minutes:0,effects:{},result:'收好病历夹。'}]}];
  const option=availableOptions(r).find(o=>o.talentAction==='late-record');expect(option).toBeDefined();const after=act(r,{type:'choose',id:option!.id});expect(after.talentMemory!.delayedRecords).toEqual([]);expect(after.patients.find(x=>x.uid===p.uid)!.active).toBe(false);expect(reload(after)).toEqual(after);
 });
});
