import type {Option,Patient,PatientCheckMember,Roll,Run} from './types';
import {patientProfile} from './patient-director';
import {runDie} from './run-random';
import {talentRollOutcome} from './talents';

/** 11_患者实体库/00_说明与字段.md §6: “多人” denotes two parties
 * with conflicting positions. “父母/子女” alone does not assert a disagreement. */
export function patientCheckParties(r:Run,p:Patient|undefined,option:Option):[string,string]|undefined {
 if(!p||option.chanceCheck||option.check?.skill!=='comfort')return;
 const companion=patientProfile(r,p)?.companion;
 if(companion&&/多人|两拨/.test(companion))return ['第一拨家属','第二拨家属'];
}
export interface PatientCheckSpec {
 id:string;label:string;modifier:number;dc:number;
 advantage?:boolean;disadvantage?:boolean;parties?:[string,string];
}
type Roller=Pick<Run,'id'|'seed'|'talents'|'debuffs'|'day'|'talentMemory'>;
const context=(r:Roller)=>({talents:r.talents,debuffs:r.debuffs,day:r.day,memory:r.talentMemory});

/** A single face is merely a compact summary. Members are the actual checks:
 * a natural 20 for one party can never turn the other party's refusal into consent. */
export function aggregatePatientCheckMembers(members:readonly PatientCheckMember[]) {
 const success=members.every(m=>m.success);
 const critical:Roll['critical']=members.some(m=>m.critical==='failure')?'failure':success&&members.some(m=>m.critical==='success')?'success':null;
 return {success,critical,face:Math.min(...members.map(m=>m.face))};
}
export function rollPatientCheck(r:Roller,spec:PatientCheckSpec,revision=0):Roll {
 const prefix=revision?`${spec.id}:reroll:${revision}`:`check:${spec.id}`;
 const mode=spec.advantage===spec.disadvantage?'normal':spec.advantage?'advantage':spec.disadvantage?'disadvantage':'normal';
 const draw=(key:string,party:string):PatientCheckMember=>{
  const dice=[runDie(r,key)];if(mode!=='normal')dice.push(runDie(r,`${key}:second`));
  const face=mode==='advantage'?Math.max(...dice):Math.min(...dice);
  return {party,dice,mode,face,modifier:spec.modifier,dc:spec.dc,...talentRollOutcome(context(r),face,spec.modifier,spec.dc)};
 };
 if(!spec.parties){
  const one=draw(prefix,'本次沟通');
  return {id:spec.id,kind:'choice',label:spec.label,face:one.face,second:one.dice[1],modifier:spec.modifier,dc:spec.dc,success:one.success,critical:one.critical,advantage:mode==='advantage',revision};
 }
 const members=spec.parties.map((party,index)=>draw(`${prefix}:party:${index+1}`,party)) as [PatientCheckMember,PatientCheckMember];
 return {id:spec.id,kind:'choice',label:spec.label,modifier:spec.modifier,dc:spec.dc,...aggregatePatientCheckMembers(members),revision,group:{rule:'all',members}};
}
/** Pure re-roll: caller spends one token for the whole group. No AP, money,
 * fatigue, risk, talent memory, or prior outcome is committed in this module. */
export function rerollPatientCheck(r:Roller,previous:Roll,revision:number):Roll {
 if(previous.kind!=='choice'||previous.chance||previous.blockedReason)throw new Error('This roll cannot be re-rolled as a patient check');
 if(!Number.isInteger(revision)||revision!==(previous.revision??0)+1)throw new Error('Patient check revision must advance exactly once');
 const modes=previous.group?.members.map(m=>m.mode);
 if(modes&&modes[0]!==modes[1])throw new Error('The same ability must be applied to both parties');
 const mode=modes?.[0]??(previous.second===undefined?'normal':previous.advantage?'advantage':'disadvantage');
 return {...rollPatientCheck(r,{id:previous.id,label:previous.label,modifier:previous.modifier,dc:previous.dc,
  advantage:mode==='advantage',disadvantage:mode==='disadvantage',parties:previous.group?.members.map(m=>m.party) as [string,string]|undefined},revision),
  ...(previous.modifierSources?{modifierSources:structuredClone(previous.modifierSources)}:{}),...(previous.difficultySources?{difficultySources:structuredClone(previous.difficultySources)}:{})};
}
export function patientGroupResultText(roll:Roll):string {
 if(!roll.group)return '';
 const details=roll.group.members.map(m=>`${m.party}：${m.success?'同意':'尚未同意'}（骰点 ${m.face}，能力修正 ${m.modifier>=0?'+':''}${m.modifier}，难度 ${m.dc}）`).join('；');
 return `${details}。${roll.success?'两拨家属均已同意。':'尚未取得双方同意，需要继续沟通或另选安排。'}`;
}
