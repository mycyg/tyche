import {describe,expect,it}from 'vitest';
import {PRESET_BY_ID,compatibleEntities,instantiatePreset}from './index';
import {projectInvestigationCopy}from './middle-copy';
import {refreshPresetEntryCopy}from '../../game/presets';
import {startRun}from '../../game/engine';
import type {Card,Patient}from '../../game/types';
const targeted=(id:string)=>PRESET_BY_ID.get(id)!.scenes.flatMap(s=>s.options).find(o=>o.id.endsWith(':investigate:targeted'))!;
describe('investigation evidence and decision text',()=>{
 it('keeps unsafe prescription thresholds intact',()=>{
  const trap=PRESET_BY_ID.get('C-085')!.scenes.flatMap(s=>s.options).find(o=>o.id.endsWith(':decision:trap-1'))!;
  expect(trap.label).toContain('>20 mmol/h');expect(trap.label).toContain('>100 mmol');
  expect(trap.effects.hazards).toEqual(expect.arrayContaining([expect.objectContaining({type:'R',weight:25,causal:true})]));
 });
 it('blood pressure and ECG findings do not invent an unasked supplement or family history',()=>{
  expect(targeted('C-029').result).toContain('复测的血压较初测下降');
  expect(targeted('C-029').result).not.toContain('服过提神');
  expect(targeted('C-031').result).not.toContain('年轻亲属猝死');
  expect(targeted('C-031').result).toContain('家族史仍需分别核实');
 });
 it('a comatose patient does not answer the medication history',()=>{
  expect(targeted('C-068').label).toContain('电话追查');
  expect(targeted('C-068').result).toContain('家属确认');
  expect(targeted('C-068').result).not.toContain('患者说');
  expect(targeted('C-068').mechanics?.actor).toBe('family');
 });
 it('fetal monitoring and somatic assessment do not reveal private testimony',()=>{
  expect(targeted('C-176').result).toContain('165 次/分');
  expect(targeted('C-176').result).not.toContain('十二小时前');
  expect(targeted('C-176').result).not.toContain('丈夫回避后说出');
  expect(targeted('C-197').result).toContain('需要另行与本人单独评估');
  expect(targeted('C-197').result).not.toContain('患者有伤害自己的想法');
 });
 it('reports actual source values rather than only listing the next step',()=>{
  expect(targeted('C-070').result).toContain('QRS 增宽');
  expect(targeted('C-083').result).toContain('0—2/高倍视野');
  expect(targeted('C-151').result).toContain('支原体核酸阳性');
 });
 it('refreshes only unperformed old copy, without resetting a pending check or historical result',()=>{
  const preset=PRESET_BY_ID.get('C-029')!,entity=compatibleEntities(preset)[0],definition=instantiatePreset(preset,entity,'copy-patient');
  const scene=definition.steps.find(s=>s.id.endsWith(':investigate'))!;
  const old=structuredClone(scene);old.options.find(o=>o.id.endsWith(':targeted'))!.result='旧结果保留为历史';
  const card={...old,id:`${old.id}:visit:0`,presetNode:old.id,kind:'quick',scope:{kind:'patient',id:'copy-patient'},patientId:'copy-patient'} as Card;
  const r=startRun('middle-copy','程医生',[]);r.patients=[{uid:'copy-patient',entityId:entity.id,preset:definition} as Patient];
  r.queue=[card];r.cursor=0;r.committed=[];
  const before=structuredClone(r),projected=refreshPresetEntryCopy(r,card);
  expect(projected.options.find(o=>o.id.endsWith(':targeted'))!.result).toContain('复测的血压');expect(r).toEqual(before);
  expect(projected.options.map(o=>[o.id,o.ap,o.minutes,o.cost,o.check,o.effects,o.next])).toEqual(card.options.map(o=>[o.id,o.ap,o.minutes,o.cost,o.check,o.effects,o.next]));
  const id=card.options.find(o=>o.id.endsWith(':targeted'))!.id;
  r.committed=[id];expect(refreshPresetEntryCopy(r,card).options.find(o=>o.id===id)!.result).toBe('旧结果保留为历史');
  expect(projectInvestigationCopy(old,'C-029',()=>false)).toBe(old);
 });
});
