import {describe,it,expect} from 'vitest';
import {aggregatePatientCheckMembers,patientCheckParties,patientGroupResultText,rerollPatientCheck,rollPatientCheck} from './patient-checks';
import {act,availableOptions,startRun} from './engine';
import {createPatient} from './cards';
import {CASE_PRESETS,PATIENT_ENTITIES,compatibleEntities,instantiatePreset} from '../content/patients';
import {decode,emptySave,encode} from './storage';
import {talentRollOutcome} from './talents';
import {die} from './random';
import type {PatientCheckMember,Run} from './types';
const roller={id:'separate-parties:test-run',seed:'separate-parties',talents:['T22'],debuffs:[],day:1};
const spec={id:'comfort',label:'说明安排',modifier:2,dc:12,parties:['第一拨家属','第二拨家属'] as [string,string]};
function fixture(companion='多人',talents=['T15','T22']):Run {
 const r=startRun('two-family-engine','程医生',talents),entity=PATIENT_ENTITIES.find(e=>e.companion===companion&&CASE_PRESETS.some(c=>compatibleEntities(c).some(candidate=>candidate.id===e.id)))!,source=CASE_PRESETS.find(c=>compatibleEntities(c).some(e=>e.id===entity.id))!,p=createPatient(r,'C003','group-check');
 p.caseId=source.id;p.entityId=entity.id;p.preset=instantiatePreset(source,entity,p.uid);p.presetNode=p.preset.steps[0].id;p.name=entity.name;p.active=true;p.inpatient=true;delete p.clinical;r.patients.push(p);
 r.queue=[{id:'two-party-card',kind:'clinical',patientId:p.uid,caseId:p.caseId,scope:{kind:'patient',id:p.uid},title:'家属会谈',text:'两拨家属有不同意见。',last:false,shiftPhase:'查房',options:[{
  id:'two-party-agree',label:'分别说明安排，核对双方决定',ap:2,minutes:10,cost:300,effects:{flags:['two-party-consent']},result:'沟通完成。',mechanics:{operation:'comfort',actor:'family',quality:'neutral'},
  check:{skill:'comfort',dc:12,purpose:'双方是否同意',failure:{patience:-5},failureText:'尚未取得双方同意。'},
 }]}];r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=20;r.cash=20000;r.vitals={stamina:80,san:80,emotion:80};delete r.roll;delete r.pendingCheck;delete r.feedback;return r;
}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
describe('separate multiple-family checks',()=>{
 it.each(['normal','advantage','disadvantage'] as const)('%s applies to each of two independent checks',mode=>{
  const before=JSON.stringify(roller);
  for(let i=0;i<100;i++){
   const r={...roller,seed:`separate-${i}`},roll=rollPatientCheck(r,{...spec,advantage:mode==='advantage',disadvantage:mode==='disadvantage'}),members=roll.group!.members;
   expect(members).toHaveLength(2);for(const m of members){expect(m.mode).toBe(mode);expect(m.dice).toHaveLength(mode==='normal'?1:2);expect(m).toMatchObject(talentRollOutcome(r,m.face,m.modifier,m.dc));expect(m.face).toBe(mode==='advantage'?Math.max(...m.dice):Math.min(...m.dice));}
   expect(roll.success).toBe(members.every(m=>m.success));expect(roll).toEqual(rollPatientCheck(r,{...spec,advantage:mode==='advantage',disadvantage:mode==='disadvantage'}));
  }
  expect(JSON.stringify(roller)).toBe(before);
 });
 it('advantage and disadvantage may cancel within each check, never cancel the second party',()=>{
  const roll=rollPatientCheck(roller,{...spec,advantage:true,disadvantage:true});expect(roll.group!.members).toHaveLength(2);expect(roll.group!.members.map(m=>m.mode)).toEqual(['normal','normal']);
 });
 it('uses separately addressed deterministic random streams for each family, including each advantage die',()=>{
  const roll=rollPatientCheck(roller,{...spec,advantage:true});
  expect(roll.group!.members.map(m=>m.dice)).toEqual([1,2].map(i=>[die(roller.seed,`check:comfort:party:${i}`),die(roller.seed,`check:comfort:party:${i}:second`)]));
  const rerolled=rerollPatientCheck(roller,roll,1);expect(rerolled.group!.members.map(m=>m.dice)).toEqual([1,2].map(i=>[die(roller.seed,`comfort:reroll:1:party:${i}`),die(roller.seed,`comfort:reroll:1:party:${i}:second`)]));
 });
 it.each([1,2,9])('one natural twenty never overrides the other party’s failed %s',face=>{
  const make=(face:number,party:string):PatientCheckMember=>({party,dice:[face],mode:'normal',face,modifier:2,dc:12,...talentRollOutcome(roller,face,2,12)});
  const members=[make(20,'甲'),make(face,'乙')];expect(aggregatePatientCheckMembers(members).success).toBe(false);expect(aggregatePatientCheckMembers(members).critical).toBe(face<=2?'failure':null);
 });
 it('rerolls the entire pair once with distinct stable streams and no resource or memory mutation',()=>{
  const r={...roller},first=rollPatientCheck(r,{...spec,advantage:true}),before=JSON.stringify({r,first}),next=rerollPatientCheck(r,first,1);
  expect(next.group!.members.map(m=>m.dice)).not.toEqual(first.group!.members.map(m=>m.dice));expect(next.revision).toBe(1);expect(next).toEqual(rerollPatientCheck(r,first,1));expect(JSON.stringify({r,first})).toBe(before);
  expect(()=>rerollPatientCheck(r,first,2)).toThrow();expect(()=>rerollPatientCheck(r,{...first,chance:true},1)).toThrow();
 });
 it('only explicitly conflicting multiple-family companionship creates the two-party rule',()=>{
  const r=fixture(),p=r.patients.at(-1)!,o=r.queue[0].options[0];expect(patientCheckParties(r,p,o)).toEqual(spec.parties);
  const parents=fixture('父母');expect(patientCheckParties(parents,parents.patients.at(-1),parents.queue[0].options[0])).toBeUndefined();
  expect(patientCheckParties(r,p,{...o,check:{...o.check!,skill:'observe'}})).toBeUndefined();expect(patientCheckParties(r,p,{...o,chanceCheck:{successAtLeast:12}})).toBeUndefined();
 });
 it('real engine preserves both T15 advantages, restores the pending pair and bills the entire transaction exactly once',()=>{
  const r=fixture(),p=r.patients.at(-1)!,option=availableOptions(r).find(o=>o.id==='two-party-agree')!,pending=act(r,{type:'choose',id:option.id});
  expect(pending.phase).toBe('roll');expect(pending.roll!.group!.members.map(m=>m.mode)).toEqual(['advantage','advantage']);expect(pending.ap).toBe(r.ap);expect(pending.patients.at(-1)!.spent).toBe(p.spent);
  const next=act(reload(pending),{type:'reroll'});expect(next.roll!.revision).toBe(1);expect(next.talentMemory!.rerollsUsed).toBe(1);expect(next.ap).toBe(r.ap);expect(next.patients.at(-1)!.spent).toBe(p.spent);
  const saved=reload(next);expect(act(saved,{type:'reroll'})).toBe(saved);const after=act(saved,{type:'ack-roll'});
  expect(after.ap).toBe(r.ap-2);expect(after.patients.at(-1)!.spent).toBe(p.spent+300);expect(after.committed.filter(id=>id===option.id)).toHaveLength(1);expect(!!after.facts['two-party-consent']).toBe(saved.roll!.group!.members.every(m=>m.success));
  expect(act(after,{type:'ack-roll'})).toBe(after);expect(reload(after)).toEqual(after);expect(after.feedback!.text).toContain('第一拨家属');expect(after.feedback!.text).toContain('第二拨家属');
 });
 it('states individual consent and requires both in player-facing feedback',()=>{
  const roll=rollPatientCheck(roller,spec),text=patientGroupResultText(roll);expect(text).toContain('第一拨家属');expect(text).toContain('第二拨家属');expect(text).toContain(roll.success?'两拨家属均已同意':'尚未取得双方同意');
 });
 it.each(['dice','face','success','critical','mode','party','modifier','dc'] as const)('rejects corrupted nested group %s after checksum recomputation',key=>{
  const r=fixture(),pending=act(r,{type:'choose',id:'two-party-agree'});expect(pending.roll!.group).toBeDefined();
  const part=pending.roll!.group!.members[1];const values={dice:[0,21],face:99,success:!part.success,critical:'not-a-critical',mode:'unknown',party:pending.roll!.group!.members[0].party,modifier:999,dc:-999};
  (part as unknown as Record<string,unknown>)[key]=values[key];expect(()=>reload(pending)).toThrow();
 });
 it('rejects one-party group truncation and an aggregate success that ignores a refusal',()=>{
  const r=fixture(),pending=act(r,{type:'choose',id:'two-party-agree'});pending.roll!.group!.members.pop();expect(()=>reload(pending)).toThrow();
  const other=act(r,{type:'choose',id:'two-party-agree'});other.roll!.success=!other.roll!.success;expect(()=>reload(other)).toThrow();
 });
});
