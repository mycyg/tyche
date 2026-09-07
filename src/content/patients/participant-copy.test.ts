import {describe,it,expect} from 'vitest';
import {CASE_PRESETS,compatibleEntities,instantiatePreset,ENTITY_BY_ID} from './index';
import {projectParticipantScene} from './participant-copy';
import {act,availableOptions,startRun} from '../../game/engine';
import {createPatient} from '../../game/cards';
import {presetCard,refreshPresetEntryCopy} from '../../game/presets';
import {preflightPatientChoice} from '../../game/patient-director';

describe('actual child and companion dialogue',()=>{
 it('every minor scenario directs generic adult communication to the real companion, not the infant',()=>{
  for(const source of CASE_PRESETS)for(const e of compatibleEntities(source).filter(e=>e.ageYears<18)){
   const p=instantiatePreset(source,e,`child-${e.id}`),scene=p.steps.find(s=>s.id.endsWith(':communication'))!,o=scene.options[0];
   expect(o.label,`${source.id}/${e.id}`).not.toContain('请患者复述');
   expect(o.result).not.toMatch(/患者复述|本人决定/);expect(o.check?.failureText).not.toContain('患者仍有顾虑');
   expect(o.mechanics?.actor).toBe('family');expect(projectParticipantScene(scene,e)).toEqual(scene);
   expect(p.steps.find(s=>s.id.endsWith(':handoff'))!.options[0].result).not.toContain('本人决定');
   expect(p.steps.find(s=>s.id.endsWith(':echo'))!.options[0].result).not.toContain('患者知道');
   if(e.ageYears>=6)expect(o.result).toContain('患儿能够表达的感受');
  }
 });
 it.each(['C-134','C-135','C-133'])('%s keeps the real mother, father or grandparent, without substituting a different adult',id=>{
  const source=CASE_PRESETS.find(s=>s.id===id)!,entity=compatibleEntities(source)[0],p=instantiatePreset(source,entity),scene=p.steps.find(s=>s.id.endsWith(':communication'))!;
  expect(scene.options[0].label).toContain(entity.companion);expect(scene.options[0].result).toContain(`${entity.companion}复述`);
  if(id==='C-133')expect(scene.text).toContain('陪同关系不等于监护人授权');
  if(id==='C-135')expect(scene.options[0].result).not.toContain('母亲复述');
 });
 it('does not replace adult patient decisions merely for age, psychiatric history or cognitive-history labels',()=>{
  for(const source of CASE_PRESETS)for(const entity of compatibleEntities(source).filter(e=>e.ageYears>=18&&e.flags.some(f=>['认知障碍','精神障碍史'].includes(f)))){
   const scene=source.scenes.find(s=>s.id.endsWith(':communication'))!;
   expect(projectParticipantScene(scene,entity)).toBe(scene);
  }
 });
 it('actual neonatal communication completes once and old unchosen text refresh leaves stored history untouched',()=>{
  let r=startRun('neonate-dialogue','程医生',[]);r.patients=[];r.day=5;r.nightBudget=240;r.nightMinutes=240;
  const p=createPatient(r,'C-134','quick-neonate');r.patients=[p];
  const node=p.preset!.steps.find(s=>s.id.endsWith(':communication'))!;
  r.queue=[presetCard(r,p,node.id,'night')!];r.cursor=0;r.phase='play';r.shiftPhase='夜班';
  const entity=p.preset!.entityProfile??ENTITY_BY_ID.get(p.entityId!)!,o=availableOptions(r).find(o=>o.id.endsWith(':explain'))!;
  expect(o.label).toContain(entity.companion);const stored=structuredClone(r.queue);
  expect(refreshPresetEntryCopy(r,r.queue[0])).toEqual(r.queue[0]);expect(r.queue).toEqual(stored);
  r=act(r,{type:'choose',id:o.id});expect(r.phase).toBe('roll');const pending=structuredClone(r);
  expect(refreshPresetEntryCopy(r,r.queue[r.cursor]).options.find(x=>x.id===o.id)).toEqual(o);expect(r).toEqual(pending);
  r.roll={...r.roll!,face:15,success:true,critical:null};r=act(r,{type:'ack-roll'});
  expect(r.feedback!.text).toContain(`${entity.companion}复述`);expect(r.feedback!.text).not.toMatch(/患者复述|本人决定/);
  expect(act(r,{type:'ack-roll'})).toBe(r);
 });
 it('a neonatal unpaid-test gate speaks with family and does not report the test as completed',()=>{
  const r=startRun('neonate-unpaid','程医生',[]);r.patients=[];const p=createPatient(r,'C-134','quick-neonate-gate');r.patients=[p];
  p.preset!.entityProfile={...p.preset!.entityProfile!,payment:'医保欠费'};
  const node=p.preset!.steps.find(s=>s.id.endsWith(':investigate'))!,card=presetCard(r,p,node.id,'night')!,o=card.options.find(x=>x.id.endsWith(':targeted'))!;
  const gate=preflightPatientChoice(r,p,card,o).card!;
  expect(gate).toBeDefined();expect(gate.options[0].mechanics?.actor).toBe('family');
  expect(gate.options[0].result).not.toContain('患者同意');expect(gate.options[0].result).toContain('还没有检查结果');
  expect(gate.text).toContain('签字须核实监护人权限');expect(gate.options[0].check?.failureText).not.toContain('患者仍然拒绝');
 });
});
