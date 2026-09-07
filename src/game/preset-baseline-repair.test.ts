import {describe,it,expect} from 'vitest';
import {startRun} from './engine';
import {createPatient} from './cards';
import {CASE_PRESETS,compatibleEntities,instantiatePreset} from '../content/patients';
import {emptySave,encode,decode} from './storage';
import {repairLegacyPresetBaselines} from './preset-baseline-repair';

describe('recognized historical baseline concentration loss',()=>{
 it('restores C067 original sodium without fabricating a current normal value or changing history',()=>{
  const r=startRun('legacy-sodium','程医生',[]),p=createPatient(r,'C-067','census-sodium');
  const preset=CASE_PRESETS.find(p=>p.id==='C-067')!,entity=compatibleEntities(preset).find(e=>e.id==='P-174')!;
  p.preset=instantiatePreset(preset,entity,p.uid,'病区');p.entityId=entity.id;p.name=entity.name;
  r.patients.push(p);const correct=p.preset.complaint,damaged=correct.replace('血钠 118 mmol/L','Na /L');
  p.preset.complaint=damaged;const entry=p.preset.steps.find(s=>s.id.endsWith(':entry'))!;entry.text=entry.text.replace(correct,damaged);
  r.journal.push({id:'historic-care',day:1,title:'原记录',choice:'照旧记录',result:damaged,scope:{kind:'patient',id:p.uid},flags:[]});
  const immutable=JSON.stringify({journal:r.journal,committed:r.committed,cash:r.cash,patients:r.patients.map(p=>({uid:p.uid,spent:p.spent,charged:p.charged,damage:p.damage}))});
  const restored=decode(encode({...emptySave(),run:r})).run!,after=restored.patients.find(x=>x.uid===p.uid)!;
  expect(after.preset!.complaint).toContain('血钠 118 mmol/L');expect(after.preset!.complaint).not.toContain('正常');
  expect(after.preset!.steps.find(s=>s.id.endsWith(':entry'))!.text).toContain('血钠 118 mmol/L');
  expect(JSON.stringify({journal:restored.journal,committed:restored.committed,cash:restored.cash,patients:restored.patients.map(p=>({uid:p.uid,spent:p.spent,charged:p.charged,damage:p.damage}))})).toBe(immutable);
  const snapshot=JSON.stringify(restored);repairLegacyPresetBaselines(restored);expect(JSON.stringify(restored)).toBe(snapshot);
 });
 it('leaves healthy or merely differently worded saved baselines untouched',()=>{
  const r=startRun('no-baseline-rewrite','程医生',[]),p=createPatient(r,'C-067','census-sodium');r.patients.push(p);
  p.preset!.complaint='原始结果尚未提供。';const before=JSON.stringify(r);repairLegacyPresetBaselines(r);expect(JSON.stringify(r)).toBe(before);
 });
});
