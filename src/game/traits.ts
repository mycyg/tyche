import type { Run, Card, Option, Vital } from './types';
import { talentOperationForSkill, talentStaminaCap } from './talents';
import type { TalentCheckContext, TalentCostContext } from './talents';
import {archiveCheckMatched} from './trap-archive';

export const talentContext=(r:Run)=>({talents:r.talents,debuffs:r.debuffs,day:r.day,memory:r.talentMemory});
export function liveCap(r:Run,vital:Vital) {return vital==='stamina'?talentStaminaCap(talentContext(r),r.caps.stamina,r.shiftPhase==='夜班'):r.caps[vital];}
export function checkContext(r:Run,card?:Card,option?:Option):TalentCheckContext {
  const operation=option?.mechanics?.checkOperation??option?.mechanics?.operation??(option?.check?talentOperationForSkill(option.check.skill):'other');
  const actor=option?.mechanics?.actor??(card?.actor==='chief'?'chief':card?.actor==='nurse'?'nurse':card?.actor==='peer'?'peer':['family','father','mother'].includes(card?.actor??'')&&!card?.patientId?'family':card?.patientId?'patient':'other');
  // A doctor's family relationship does not describe an unrelated patient's
  // relatives. Patient trust/companion checks have their own scoped modifiers.
  const relation=['chief','nurse','peer'].includes(actor)?r.relations[actor as 'chief'|'nurse'|'peer']:actor==='family'&&!card?.patientId?r.relations.family:undefined;
  const social=['comfort','persuade','consult','endure'].includes(operation);
  return {operation,actor,
    ...(social&&relation!==undefined?{advantage:relation>=4,disadvantage:relation<=1}:{}),
    patientId:card?.patientId,
    archiveMatched:archiveCheckMatched(r,card,option)};
}
export function costContext(r:Run,card?:Card,option?:Option):TalentCostContext {
  return {operation:option?.mechanics?.operation??checkContext(r,card,option).operation,isNight:card?.kind==='night',clinical:!!card?.patientId,quality:option?.mechanics?.quality,consultWaitMinutes:option?.mechanics?.consultWaitMinutes};
}
