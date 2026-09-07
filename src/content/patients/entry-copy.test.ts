import {describe,expect,it}from 'vitest';
import {CASE_PRESETS,compatibleEntities,instantiatePreset}from './index';
import {PRESET_ENTRY_COPY,ENTRY_EXAM_CHECKS,ENTRY_HISTORY_CHECKS,ENTRY_PRIVATE_HISTORY_IDS}from './entry-copy';
import {act,availableOptions,currentCard,startRun}from '../../game/engine';
import {createPatient}from '../../game/cards';
import {presetCard,refreshPresetEntryCopy}from '../../game/presets';
import {decode,emptySave,encode}from '../../game/storage';
import {checkContext}from '../../game/traits';
import {nightClinicalCharge}from '../../game/night-costs';
import {patientCheckAdjustment}from '../../game/patient-director';
import {entityScenario}from './scenarios';

function actualEntry(id:string){
 const source=CASE_PRESETS.find(p=>p.id===id)!;
 const period=compatibleEntities(source,source.period).length?source.period:source.constraints.periods.find(period=>compatibleEntities(source,period).length)!;
 const night=period==='夜班';
 const r=startRun('entry-evidence','程医生',[]);r.patients=[];r.day=3;r.nightBudget=240;r.nightMinutes=240;
 const p=createPatient(r,id,`${night?'night':period==='病区'?'census':'quick'}-entry-evidence`);r.patients=[p];
 const node=p.preset!.steps.find(s=>s.id.endsWith(':entry'))!;r.queue=[presetCard(r,p,node.id,night?'night':'quick')!];r.cursor=0;r.phase='play';r.shiftPhase=night?'夜班':'门诊';
 return r;
}
describe('all preset entry actions describe their actual evidence',()=>{
 it.each(ENTRY_PRIVATE_HISTORY_IDS)('%s actual private first interview retains the patient as speaker and removes only the companion interference modifier',id=>{
  const r=actualEntry(id),p=r.patients[0],o=availableOptions(r).find(o=>o.id.endsWith(':entry:history'))!;
  expect(o.mechanics?.actor).toBe('patient');expect(o.check?.skill).toBe('clinical');
  const privateCheck=patientCheckAdjustment(r,p,o),publicCheck=patientCheckAdjustment(r,p,{...o,id:`${o.id}:public`});
  expect(privateCheck.dcDelta).toBe(publicCheck.dcDelta-(entityScenario(p.preset!.entityProfile!).alone?0:2));expect(o.check!.failureText).not.toContain(ENTRY_HISTORY_CHECKS[id].result);
 });
 it('every mapped history entry uses its actual authored DC and only its reviewed answer, preserving failure expenditure',()=>{
  expect(Object.keys(ENTRY_HISTORY_CHECKS)).toHaveLength(38);
  for(const [id,history]of Object.entries(ENTRY_HISTORY_CHECKS)){
   const source=CASE_PRESETS.find(p=>p.id===id)!,o=source.scenes[0].options[0];
   expect(source.hidden,id).toMatch(new RegExp(`问诊\\s*DC\\s*${history.dc}`));
   expect(o.check).toMatchObject({skill:'clinical',dc:history.dc});expect(o.result).toBe(history.result);
   expect(o.check!.failure.stamina).toBe(o.effects.stamina);expect(o.check!.failure.flags).toEqual(o.effects.flags);
   expect(o.check!.failureText).not.toContain(history.result);expect(o.effects.flags).not.toContain(`preset:${id}:revealed`);
  }
 });
 it('C134 asks the source DC11 history and reveals birth-day-two onset only on success, never unperformed bilirubin or blood typing',()=>{
  let r=actualEntry('C-134'),o=availableOptions(r).find(o=>o.id.endsWith(':entry:history'))!;
  expect(o.check).toMatchObject({skill:'clinical',dc:11});expect(o.result).toContain('出生第2天');expect(o.result).toContain('建议复查，但没有去');
  expect(o.result).not.toMatch(/21\s*mg|母\s*O|子\s*B|足月|孕\s*\d/);
  expect(o.check!.failureText).not.toContain('出生第2天');
  r=act(r,{type:'choose',id:o.id});expect(r.phase).toBe('roll');r.roll={...r.roll!,face:15,success:true,critical:null};
  const after=act(r,{type:'ack-roll'});expect(after.feedback!.text).toContain('出生第2天');expect(after.feedback!.text).not.toContain('21mg');
 });
 it('all 208 entries have individually reviewed copy and explicit operations, not a universal history result',()=>{
  expect(Object.keys(PRESET_ENTRY_COPY)).toHaveLength(208);expect(new Set(Object.values(PRESET_ENTRY_COPY).map(x=>x.result)).size).toBe(208);
  for(const p of CASE_PRESETS){
   const entry=p.scenes.find(s=>s.id.endsWith(':entry'))!.options.find(o=>o.id.endsWith(':entry:history'))!;
   expect(entry.mechanics?.operation,p.id).toBe(PRESET_ENTRY_COPY[p.id].operation);
   expect(entry.result,p.id).not.toMatch(/你重新询问病史|你核对了目前的不适与病史|下一步：/);
   expect(entry.ap,p.id).toBe(0);expect(entry.cost,p.id).toBe(0);
   expect(entry.effects.stamina,p.id).toBe(p.id==='C-158'?-3:-2);
   expect(entry.effects.hazards,p.id).toBeUndefined();expect(entry.effects.flags,p.id).not.toContain(`preset:${p.id}:revealed`);
  }
 });
 it('the 12 actual entry examinations use only their authored DC and preserve expenditure on a failed examination',()=>{
  expect(Object.keys(ENTRY_EXAM_CHECKS)).toHaveLength(12);
  for(const [id,check]of Object.entries(ENTRY_EXAM_CHECKS)){
   const p=CASE_PRESETS.find(x=>x.id===id)!,o=p.scenes[0].options[0];
   expect(p.hidden,id).toMatch(new RegExp(`察觉\\s*DC\\s*${check.dc}`));
   expect(o.check).toMatchObject({skill:'observe',dc:check.dc});expect(o.mechanics?.checkOperation).toBe('observe');
   expect(o.check!.failure.stamina).toBe(o.effects.stamina);expect(o.check!.failure.flags).toEqual(o.effects.flags);
   expect(o.check!.failureText).not.toContain(check.result);
  }
 });
 it('every compatible entity keeps these action-specific entry results without changing scenario identity',()=>{
  for(const p of CASE_PRESETS)for(const entity of compatibleEntities(p)){
   const instance=instantiatePreset(p,entity,`copy-${entity.id}`),entry=instance.steps.find(s=>s.id.endsWith(':entry'))!.options.find(o=>o.id.endsWith(':entry:history'))!;
   expect(entry.result,p.id).not.toContain('你重新询问病史');expect(instance.entityId).toBe(entity.id);
   expect(entry.mechanics?.operation,p.id).toBe(PRESET_ENTRY_COPY[p.id].operation);
  }
 },30000);
 it('actual C091 entry is the sourced DC13 eye/coordination check, and failure does not reveal its success findings',()=>{
  let r=actualEntry('C-091'),o=availableOptions(r).find(o=>o.id.endsWith(':entry:history'))!;
  expect(o.check?.dc).toBe(13);expect(checkContext(r,currentCard(r),o).operation).toBe('observe');
  const before=structuredClone(r);r=act(r,{type:'choose',id:o.id});expect(r.phase).toBe('roll');expect(r.committed).not.toContain(o.id);
  expect(r.cash).toBe(before.cash);expect(r.vitals.stamina).toBe(before.vitals.stamina);
  r.roll={...r.roll!,face:1,success:false,critical:'failure'};
  const failed=act(r,{type:'ack-roll'});
  expect(failed.feedback?.text).not.toMatch(/垂直向|随注视方向改变|指鼻试验不准|头脉冲试验正常|小脑梗死/);
  expect(failed.feedback?.text).toContain('不能站立');
  const baseline=nightClinicalCharge(before,currentCard(before),o);
  expect(baseline.stamina).toBe(8);expect(failed.vitals.stamina).toBe(before.vitals.stamina-2-baseline.stamina);
  expect(nightClinicalCharge(failed,currentCard(before),o).stamina).toBe(0);
  expect(failed.hazards).toEqual([...before.hazards,expect.objectContaining({
   type:'R',weight:5,causal:false,choiceId:`${o.id}:critical`,scope:{kind:'patient',id:before.patients[0].uid},
  })]);expect(failed.committed).toContain(o.id);
  expect(act(failed,{type:'ack-roll'})).toBe(failed);
 });
 it('actual C091 success supplies only the selected physical findings, not unperformed HINTS or vascular imaging',()=>{
  let r=actualEntry('C-091');r=act(r,{type:'choose',id:availableOptions(r).find(o=>o.id.endsWith(':entry:history'))!.id});
  r.roll={...r.roll!,face:20,success:true,critical:'success'};r=act(r,{type:'ack-roll'});
  expect(r.feedback?.text).toContain('眼震呈垂直向');expect(r.feedback?.text).toContain('左侧指鼻试验不准');
  expect(r.feedback?.text).not.toMatch(/头脉冲试验正常|小脑梗死|PICA/);
 });
 it('actual C188 skin/airway/circulation assessment reports the concurrent findings instead of claiming a history interview',()=>{
  const before=actualEntry('C-188'),o=availableOptions(before).find(o=>o.id.endsWith(':entry:history'))!;
  expect(o.mechanics?.operation).toBe('exam');expect(o.check).toBeUndefined();
  const r=act(before,{type:'choose',id:o.id});expect(r.feedback?.text).toContain('声音变化和血压下降');expect(r.feedback?.text).toContain('全身皮疹');
  expect(r.feedback?.text).not.toMatch(/重新询问病史|以前同类药曾/);expect(r.patients[0].damage).toBe(before.patients[0].damage);
 });
 it('source-permitted bedside glucose gives the measured 1.9 without disclosing the unknown drug history',()=>{
  const r=actualEntry('C-068'),o=availableOptions(r).find(o=>o.id.endsWith(':entry:history'))!;
  expect(o.result).toContain('1.9mmol/L');expect(o.result).not.toContain('格列美脲');expect(o.check).toBeUndefined();
 });
 it('old entry projections are read-only and a pending shown die/DC survives reload without retroactive replacement',()=>{
  let r=actualEntry('C-091');const card=r.queue[0],o=card.options.find(o=>o.id.endsWith(':entry:history'))!;
  o.result='你重新询问病史。';o.mechanics={operation:'history',actor:'patient',quality:'correct'};delete o.check;
  const snapshot=JSON.stringify(r),projected=refreshPresetEntryCopy(r,card);
  expect(projected.options.find(x=>x.id===o.id)?.check?.dc).toBe(13);expect(JSON.stringify(r)).toBe(snapshot);
  r.queue=[projected];r=act(r,{type:'choose',id:o.id});expect(r.phase).toBe('roll');
  const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();
  const before=JSON.stringify(restored),shown=refreshPresetEntryCopy(restored,restored.queue[0]);
  expect(shown.options).toEqual(restored.queue[0].options);expect(JSON.stringify(restored)).toBe(before);expect(restored.roll).toEqual(r.roll);
 });
});
