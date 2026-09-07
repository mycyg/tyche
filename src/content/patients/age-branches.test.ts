import {describe,it,expect} from 'vitest';
import {CASE_PRESETS,ENTITY_BY_ID,PRESET_BY_ID,compatibleEntities} from './index';
import {instantiatePatientPreset,refreshPresetEntryCopy,presetCard} from '../../game/presets';
import {availableOptions,startRun} from '../../game/engine';
import {projectPresetAgeBranches} from './age-branches';
import type {Patient,Run} from '../../game/types';

function generated(entityId:string){
 for(let seed=0;seed<200;seed++){
  const r={id:'age-run',seed:`age-${seed}`,day:3,reputation:50,patients:[],facts:{}} as unknown as Run;
  const value=instantiatePatientPreset(r,'C-151','age-run:child','门诊')!;
  if(value.entity.id===entityId)return value;
 }
 throw new Error(`The actual generator did not draw ${entityId}`);
}
describe('C-151 source under-eight branch',()=>{
 it('generates the independent seven-year-old and existing nine-year-old through the real weighted selector',()=>{
  const seven=generated('P-251'),nine=generated('P-014');
  expect(seven.entity).toMatchObject({ageYears:7,companion:'母亲',portraitArchetype:'child-girl',original:false});
  expect(nine.entity).toMatchObject({ageYears:9,companion:'父母'});
  expect(CASE_PRESETS.filter(p=>compatibleEntities(p).some(e=>e.id==='P-251')).map(p=>p.id)).toEqual(['C-151']);
  const trap=seven.definition.steps.flatMap(s=>s.options).find(o=>o.id.endsWith(':decision:trap-2'))!;
  expect(trap.label).toContain('未满 8 岁的患儿');expect(trap.label).not.toContain('变体');
  expect(trap.effects.hazards).toEqual(expect.arrayContaining([expect.objectContaining({type:'R',weight:25,causal:true})]));
  expect(nine.definition.steps.flatMap(s=>s.options).some(o=>o.id.endsWith(':decision:trap-2'))).toBe(false);
  expect(nine.definition.steps.flatMap(s=>s.options).some(o=>o.id.endsWith(':rescue:defer'))).toBe(false);
  expect(nine.definition.steps.flatMap(s=>s.options).some(o=>o.id.endsWith(':rescue:defer-record'))).toBe(true);
  expect(seven.definition.steps.flatMap(s=>s.options).some(o=>o.id.endsWith(':rescue:defer'))).toBe(true);
  const source=PRESET_BY_ID.get('C-151')!.scenes.flatMap(s=>s.options).find(o=>o.id.endsWith(':decision:trap-2'))!;
  expect(source.label).toContain('<8 岁变体');
  expect([trap.ap,trap.minutes,trap.cost,JSON.stringify(trap.effects).replaceAll(':age-run:child','')]).toEqual([source.ap,source.minutes,source.cost,JSON.stringify(source.effects)]);
 });
 it('uses actual patient age in engine-visible choices and refreshes an old nine-year-old card without rewriting history',()=>{
  const baseline=startRun('age-visible','程医生',[]);
  for(const id of ['P-251','P-014']){
   const r=structuredClone(baseline),{entity,definition}=generated(id);
   const p={uid:'age-run:child',caseId:'C-151',entityId:id,preset:definition,active:true,inpatient:false,admitted:3,name:entity.name,damage:0,mitigated:0} as Patient;
   r.patients=[p];r.day=3;r.shiftPhase='门诊';r.phase='play';r.cursor=0;r.committed=[];
   const decision=definition.steps.find(s=>s.id.endsWith(':decision'))!;
   r.queue=[presetCard(r,p,decision.id,'quick')!];r.queue[0].shiftPhase='门诊';
   expect(availableOptions(r).some(o=>o.id.endsWith(':decision:trap-2'))).toBe(id==='P-251');
   if(id==='P-014'){
    const old=generated('P-251').definition.steps.find(s=>s.id.endsWith(':decision'))!.options.find(o=>o.id.endsWith(':decision:trap-2'))!;
    r.queue[0].options.push(structuredClone(old));r.roll={id:'past-roll',kind:'choice',face:12,modifier:0,dc:11,success:true,critical:null,label:'既往检定'};
    const before=structuredClone(r),card=refreshPresetEntryCopy(r,r.queue[0]);
    expect(card.options.some(o=>o.id===old.id)).toBe(false);expect(r).toEqual(before);
    expect(projectPresetAgeBranches(card,'C-151',9)).toBe(card);
   }
  }
  expect(ENTITY_BY_ID.get('P-014')!.ageYears).toBe(9);
 });
});
