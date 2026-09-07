import {describe,it,expect} from 'vitest';
import {act,startRun,newMeta,reward} from './engine';
import {createPatient} from './cards';
import {clinicalCard} from './clinical';
import {initialGraphState,getClinicalGraph} from '../content/clinical';
import {CLINICAL_PATIENTS,fixedClinicalPatientId} from '../content/clinical/patient-identities';
import {PATIENT_ENTITIES} from '../content/patients';
import {encounteredCollections,recoverClinicalPatientCollection} from './encounters';
import {archiveEntries,ARCHIVE_PATIENT_SCOPE} from '../ui/archive-data';
import {encode,decode,emptySave} from './storage';
import type {Run} from './types';

function fixture(caseId='C011'){
 const r=startRun('named-collection','程医生',[]);r.patients=[];r.queue=[];r.journal=[];
 const p=createPatient(r,caseId,'named');p.clinical=initialGraphState(getClinicalGraph(caseId)!,'named-collection');
 r.patients.push(p);r.queue=[clinicalCard(r,p)!];r.queue[0].shiftPhase='查房';r.shiftPhase='查房';r.cursor=0;r.phase='play';
 return {r,p};
}
function finish(r:Run){r.ending={id:'X31',title:'离开值班室',category:'选择',decision:'交接工作后离开。',epilogue:'本次轮转结束。',annexes:[],court:false};r.phase='ending';return r;}
const load=(run:Run|null,meta=newMeta())=>decode(encode({...emptySave(),run,meta}));

describe('independent fixed clinical patient collections',()=>{
 it('keeps 251 patient-library entries and 20 separate named clinical chart anchors, without aliasing any identity',()=>{
  expect(PATIENT_ENTITIES).toHaveLength(251);expect(CLINICAL_PATIENTS).toHaveLength(20);
  expect(new Set(CLINICAL_PATIENTS.map(p=>p.id)).size).toBe(20);
  expect(CLINICAL_PATIENTS.every(p=>!PATIENT_ENTITIES.some(e=>e.name===p.name||e.id===p.id))).toBe(true);
  expect(archiveEntries(newMeta()).filter(e=>e.kind==='patients')).toHaveLength(271);
  expect(ARCHIVE_PATIENT_SCOPE).toContain('271');
 });
 it.each(CLINICAL_PATIENTS.map(p=>[p.caseId,p.id,p.name]))('%s credits its exact named patient only after contact, with no P-entity masquerade',(caseId,id,name)=>{
  const {r,p}=fixture(caseId);expect(p.name).toBe(name);expect(encounteredCollections(r).clinicalPatients).toEqual([]);
  const focused=act(r,{type:'focus',id:r.queue[0].id});expect(encounteredCollections(focused).clinicalPatients).toEqual([id]);
  expect(encounteredCollections(focused).entities).toEqual([]);
  const meta=reward(newMeta(),finish(focused));expect(meta.clinicalPatients).toEqual([id]);
  expect(archiveEntries(meta).find(e=>e.key===`patients:${id}`)).toMatchObject({name,known:true,portrait:{caseId}});
  expect(load(focused,meta).meta.clinicalPatients).toEqual([id]);expect(reward(meta,focused)).toBe(meta);
 });
 it('does not credit the unseen original when only a second person with the same graph is contacted',()=>{
  const {r,p}=fixture(),other=createPatient(r,'C011','second');other.clinical=initialGraphState(getClinicalGraph('C011')!,'second');r.patients.push(other);
  expect(other.name).not.toBe(p.name);r.queue=[clinicalCard(r,other)!];r.queue[0].shiftPhase='查房';
  const focused=act(r,{type:'focus',id:r.queue[0].id}),meta=reward(newMeta(),finish(focused));
  expect(meta.cases).toContain('C011');expect(meta.clinicalPatients).toEqual([]);
  expect(archiveEntries(meta).find(e=>e.key==='patients:CP-C011')!.known).toBe(false);
  delete meta.clinicalPatients;const old=load(focused,meta);expect(old.meta.clinicalPatients).toBeUndefined();
 });
 it('never matches another case, a similarly named person, or an entity profile masquerading as the fixed chart',()=>{
  const {p}=fixture();expect(fixedClinicalPatientId(p)).toBe('CP-C011');
  expect(fixedClinicalPatientId({...p,caseId:'C012'})).toBeUndefined();expect(fixedClinicalPatientId({...p,name:'林妍同名患者'})).toBeUndefined();
  expect(fixedClinicalPatientId({...p,entityId:'P-001'})).toBeUndefined();
 });
 it('restores the three browser-encountered named people from a rewarded retained old run without awarding XP or touching the run',()=>{
  let {r}=fixture();r.patients=[];r.queue=[];
  for(const caseId of ['C011','C012','C017']){
   const p=createPatient(r,caseId,'old-contact');p.clinical=initialGraphState(getClinicalGraph(caseId)!,'old-contact');r.patients.push(p);
   r.queue=[clinicalCard(r,p)!];r.queue[0].shiftPhase='查房';r.cursor=0;r.phase='play';r=act(r,{type:'focus',id:r.queue[0].id});
  }
  finish(r);const meta=reward(newMeta(),r);delete meta.clinicalPatients;const before=structuredClone({meta,run:r});
  const restored=load(r,meta);expect(restored.meta.clinicalPatients).toEqual(['CP-C011','CP-C012','CP-C017']);
  expect(restored.run).toEqual(before.run);expect({...restored.meta,clinicalPatients:undefined}).toEqual({...before.meta,clinicalPatients:undefined});
  expect(archiveEntries(restored.meta).filter(e=>e.kind==='patients'&&e.known).map(e=>e.name)).toEqual(['林妍','周守成','蒋砚']);
  expect(load(restored.run,restored.meta)).toEqual(restored);
 });
 it('a case-only archive or a currently uncompleted run is insufficient identity evidence',()=>{
  const meta=newMeta();delete meta.clinicalPatients;meta.cases=['C011','C012','C017'];
  expect(load(null,meta).meta.clinicalPatients).toBeUndefined();expect(archiveEntries(meta).filter(e=>e.kind==='patients'&&e.known)).toEqual([]);
  const {r}=fixture();const focused=act(r,{type:'focus',id:r.queue[0].id});recoverClinicalPatientCollection(meta,focused);expect(meta.clinicalPatients).toBeUndefined();
 });
 it.each([['CP-C999'],['CP-C011','CP-C011'],['C011'],['P-001'],['CP-C011',3],{},'CP-C011',null])('strictly rejects invalid clinical identity metadata %j',bad=>{
  const meta=newMeta();(meta as unknown as Record<string,unknown>).clinicalPatients=bad;expect(()=>load(null,meta)).toThrow();
 });
 it('the named patient archive exposes registration data, not hidden diagnoses or prospective outcomes',()=>{
  const meta=newMeta();meta.clinicalPatients=['CP-C011'];const known=archiveEntries(meta).filter(e=>e.kind==='patients'&&e.known);
  expect(known).toHaveLength(1);const text=JSON.stringify(known);expect(text).toContain('林妍');expect(text).not.toMatch(/epi_|过敏性休克|o_hypoxic|bedsideLine|真实诊断/);
 });
});
