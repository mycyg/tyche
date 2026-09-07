import {describe,it,expect} from 'vitest';
import {encounteredCollections} from './encounters';
import {startRun} from './engine';
import {initialTalentMemory} from './talents';

const fixture=()=>{const r=startRun('collection-contact','值班医生',[]);r.journal=[];r.patients=r.patients.slice(0,2);r.patients.forEach((p,i)=>{p.uid=`encounter-${i}`;p.caseId=`C00${i+1}`;p.entityId=`P-00${i+1}`;p.settled=false;delete p.clinical;});delete r.talentMemory;return r;};
describe('earned encounter collections',()=>{
 it('does not award any of the real new-run census patients before contact',()=>{
  const r=startRun('untouched-census','程医生',[]);
  expect(r.patients.some(p=>p.settled)).toBe(true);
  expect(encounteredCollections(r)).toEqual({patientIds:[],cases:[],entities:[],clinicalPatients:[]});
 });
 it('never credits generated beds, queued cards, active status or an initial case node',()=>{
  const r=fixture();expect(r.patients.length).toBe(2);expect(encounteredCollections(r)).toEqual({patientIds:[],cases:[],entities:[],clinicalPatients:[]});
 });
 it('credits actual first contact before any case resolution or paid action',()=>{
  const r=fixture();r.talentMemory=initialTalentMemory(r.day);r.talentMemory.firstContacts=[r.patients[0].uid];
  expect(encounteredCollections(r)).toEqual({patientIds:['encounter-0'],cases:['C001'],entities:['P-001'],clinicalPatients:[]});
 });
 it('credits only the patient scope of a committed clinical, history or talent action',()=>{
  for(const field of [{operation:'history' as const},{clinicalChoice:'s1_history'},{talentAction:'chart-review' as const}]){
   const r=fixture();r.journal.push({id:'a',day:1,title:'问诊',choice:'问诊',result:'记录',scope:{kind:'patient',id:r.patients[1].uid},flags:[],...field});
   expect(encounteredCollections(r).patientIds).toEqual(['encounter-1']);
  }
 });
 it('does not mistake unsolicited notices, personal/project IDs or event-only participants for a registry patient',()=>{
  const r=fixture();r.journal.push(...(['patient','personal','project'] as const).map(kind=>({id:'notice',day:1,title:'通知',choice:'通知',result:'通知',scope:{kind,id:r.patients[0].uid},flags:[],...(kind==='patient'?{}:{operation:'other' as const})})),{id:'event-action',day:1,title:'沟通',choice:'沟通',result:'沟通',scope:{kind:'patient',id:'event-patient'},flags:[],operation:'comfort'});
  expect(encounteredCollections(r).patientIds).toEqual([]);
 });
 it('accepts an explicit old first-contact entry and completed legacy case without mutating the run',()=>{
  const r=fixture();r.journal.push({id:'contact:encounter-0:4',day:1,title:'初次接触',choice:'走到床旁',result:'记录',scope:{kind:'patient',id:'encounter-0'},flags:[]});r.patients[1].settled=true;
  const before=JSON.stringify(r);expect(encounteredCollections(r).cases).toEqual(['C001','C002']);expect(JSON.stringify(r)).toBe(before);
 });
 it('deduplicates repeated contact, repeat admissions and repeated case/entity instances',()=>{
  const r=fixture();r.patients[1]={...structuredClone(r.patients[0]),uid:'encounter-1'};r.patients.forEach(p=>p.settled=true);
  expect(encounteredCollections(r)).toEqual({patientIds:['encounter-0','encounter-1'],cases:['C001'],entities:['P-001'],clinicalPatients:[]});
 });
});
