import {describe,it,expect} from 'vitest';
import {runRandom,runDie,runRandomKey,runShuffled} from './run-random';
import {random,die} from './random';
import {startRun} from './engine';
import {EVENT_BY_ID,eventToCard} from '../content/events/catalog';
import {rollPatientCheck,rerollPatientCheck} from './patient-checks';
import {instantiatePatientPreset} from './presets';
import {beginClinical} from './clinical';
import {createPatient} from './cards';

const a={id:'seed-repeat-audit:mywpiww0',seed:'seed-repeat-audit'},b={...a,id:'seed-repeat-audit:mywpixns'};
describe('explicit run-scoped stable random inputs',()=>{
 it('normalizes only the exact current run identity, leaving unrelated identifiers intact',()=>{
  expect(runRandomKey(a,`${a.id}:${a.id}:E-013`)).toBe('@current-run:@current-run:E-013');
  expect(runRandomKey(a,b.id)).toBe(b.id);expect(runRandomKey(a,'D2-C001-census0')).toBe('D2-C001-census0');
  expect(runRandom(a,'day:2')).toBe(random(a.seed,'day:2'));expect(runDie(a,'day:2')).toBe(die(a.seed,'day:2'));
 });
 it('reproduces keyed randomness and shuffle without mutating business IDs',()=>{
  const before=JSON.stringify([a,b]);
  for(const suffix of ['event:E-013:2:E-013-b','research-project','BTF-004:delay','event-patient:E-005:recording']){
   expect(runRandom(a,`${a.id}:${suffix}`)).toBe(runRandom(b,`${b.id}:${suffix}`));
   expect(runDie(a,`${a.id}:${suffix}`)).toBe(runDie(b,`${b.id}:${suffix}`));
  }
  expect(runShuffled(a,[1,2,3,4,5],`${a.id}:order`)).toEqual(runShuffled(b,[1,2,3,4,5],`${b.id}:order`));
  expect(JSON.stringify([a,b])).toBe(before);
  expect(new Set(['patient:1','patient:2','day:1','day:2','reroll:1','reroll:2'].map(key=>runRandom(a,key))).size).toBe(6);
 });
 it('reproduces real event single/multiple-party dice and retries at different run timestamps',()=>{
  const runs=[a,b].map(identity=>Object.assign(startRun(identity.seed,'程医生',[]),identity));
  const rolls=runs.map(r=>{const p=r.patients[0],card=eventToCard(EVENT_BY_ID['E-013'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:`${r.id}:event:E-013:2`,day:2,phase:'查房'}),option=card.options.find(o=>o.id.endsWith('E-013-b'))!;
   return [undefined,['甲方','乙方'] as [string,string]].map(parties=>rollPatientCheck(r,{id:option.id,label:option.label,modifier:0,dc:option.check!.dc,advantage:true,parties}));});
  for(let i=0;i<2;i++){
   const stripId=({id:_id,...roll}:ReturnType<typeof rollPatientCheck>)=>roll;
   expect(stripId(rolls[0][i])).toEqual(stripId(rolls[1][i]));
   expect(stripId(rerollPatientCheck(runs[0],rolls[0][i],1))).toEqual(stripId(rerollPatientCheck(runs[1],rolls[1][i],1)));
  }
  expect(rolls[0][0].id).not.toBe(rolls[1][0].id);
 });
 it('reproduces event-patient preset entity selection and full graph variants',()=>{
  const runs=[a,b].map(identity=>Object.assign(startRun(identity.seed,'程医生',[]),identity));
  const entities=runs.map(r=>instantiatePatientPreset(r,'C-067',`${r.id}:event-patient:fixture`,'病区')!.entity.id);expect(entities[0]).toBe(entities[1]);
  const variants=runs.map(r=>{const p=createPatient(r,'C001','same-graph');p.uid=`${r.id}:event-patient:fixture`;delete p.clinical;beginClinical(r,p);return p.clinical!.variants;});expect(variants[0]).toEqual(variants[1]);
 });
});
