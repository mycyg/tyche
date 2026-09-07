import {it,expect}from 'vitest';
import {startRun}from './engine';
import {createPatient}from './cards';
import {clinicalAdmissionDay,repairLegacyClinicalAdmission,clinicalEntryLocation,underObservation,completedAdmissionChoice}from './clinical-admission';
import {initialGraphState,getClinicalGraph}from '../content/clinical';
import {RULES}from './rules';
import {emptySave,encode,decode}from './storage';
it('uses the stated current hospital day, not encounter day or symptom duration',()=>{
 expect(clinicalAdmissionDay('C004',2)).toBe(-2);expect(clinicalAdmissionDay('C010',7)).toBe(6);
 expect(clinicalAdmissionDay('C020',14)).toBe(6);expect(clinicalAdmissionDay('C017',5)).toBe(5);
});
it('new patients preserve entry stay and future review window',()=>{
 const r=startRun('admission-boundary','程医生',[]);r.day=2;
 const p=createPatient(r,'C004');expect(r.day-p.admitted+1).toBe(5);expect(p.expectedDays).toBeGreaterThan(5);
});
it('repairs only recognizable obsolete dates, once, without touching charges',()=>{
 const r=startRun('admission-migration','程医生',[]);r.day=4;
 const p=createPatient(r,'C004');p.admitted=4;p.expectedDays=3;p.charged=350;p.spent=900;r.patients=[p];
 repairLegacyClinicalAdmission(r);expect(p.admitted).toBe(0);expect(p.expectedDays).toBe(7);expect(p.charged).toBe(350);expect(p.spent).toBe(900);
 repairLegacyClinicalAdmission(r);expect(p.expectedDays).toBe(7);
 p.admitted=-8;repairLegacyClinicalAdmission(r);expect(p.admitted).toBe(-8);
});
it('uses the contact setting rather than an eventual funding group for all full cases',()=>{
 const expected={ward:['C004','C009','C010','C012','C014','C015','C017','C018','C020'],outpatient:['C002','C005','C007','C013'],observation:['C001','C003','C006','C008','C011','C016','C019']}as const;
 for(const [location,ids]of Object.entries(expected))for(const id of ids)expect(clinicalEntryLocation(id),id).toBe(location);
 const r=startRun('location-basis','程医生',[]);r.patients=[];
 for(const id of ['C005','C007']){const p=createPatient(r,id);expect(p.inpatient,id).toBe(false);expect(p.bed,id).toBe(0);expect(underObservation(r,p),id).toBe(false);}
 const p=createPatient(r,'C010','night-known-inpatient');expect(p.inpatient).toBe(true);expect(r.day-p.admitted+1).toBe(2);
});
it('retains ED observation and its quoted bill through saving, without creating a ward bed',()=>{
 const r=startRun('observation-location','程医生',[]);const p=createPatient(r,'C006','night-observation');r.patients.push(p);
 expect(p.budget).toBe(1800);expect(p.spent).toBe(Math.round(1800*RULES.billing.outpatientBaseRate));expect(p.bed).toBe(0);expect(underObservation(r,p)).toBe(true);
 const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();const q=restored.patients.find(x=>x.uid===p.uid)!;
 expect(underObservation(restored,q)).toBe(true);expect(q.spent).toBe(p.spent);
});
it('requires the actual admitted choice and its successful record, not a consultation alone',()=>{
 const r=startRun('admission-proof','程医生',[]),p=createPatient(r,'C005');p.clinical=initialGraphState(getClinicalGraph('C005')!,'boundary');
 p.clinical.choices=['s4_neurosurg'];expect(completedAdmissionChoice(p)).toBeUndefined();
 p.clinical.flags=['admitted'];expect(completedAdmissionChoice(p)).toBeUndefined();
 p.clinical.choices.push('s4_admit_lmwh');expect(completedAdmissionChoice(p)).toBe('s4_admit_lmwh');
 p.damage=3;expect(completedAdmissionChoice(p)).toBeUndefined();
});
