import type {Card,Effects,Option,Patient,Roll,Run}from './types';
import {clinicalClues}from './abilities';
import {fullGraph}from './clinical';
import {revealGraphClue}from '../content/clinical/clues';
import {RULES}from './rules';

export interface CriticalConsequence {effects:Effects;text:string;patientPatch?:Partial<Patient>}
/** Extra facts come from existing case evidence. A natural twenty never creates
 * a lab result, consent, police receipt, payment or a fact about another case. */
export function criticalConsequence(r:Run,card:Card,option:Option,roll:Roll):CriticalConsequence {
  const none:CriticalConsequence={effects:{},text:''};
  if(roll.chance||roll.blockedReason||!roll.critical)return none;
  const p=r.patients.find(p=>p.uid===card.patientId);
  if(roll.critical==='success') {
    if(!p||!['history','observe','exam','full-exam'].includes(option.mechanics?.operation??''))return none;
    const clue=clinicalClues(p,r)[0];if(!clue)return none;
    const graph=fullGraph(p.caseId);
    if(graph&&p.clinical)return {effects:{},text:`补充线索：${clue.text}`,patientPatch:{clinical:revealGraphClue(graph,p.clinical,clue.id)}};
    if(p.preset)return {effects:{flags:[`preset:${p.caseId}:${p.uid}:chart-history`,`preset:${p.caseId}:${p.uid}:history-full`]},
      text:`补充线索：${clue.text}`,patientPatch:{preset:{...p.preset,history:[...new Set([...p.preset.history,clue.text])]}}};
    return none;
  }
  if(option.check?.skill==='endure')return {effects:{san:-RULES.critical.sanLoss},text:`你这次没能缓过来，精神减少 ${RULES.critical.sanLoss} 点。`};
  const type=['comfort','persuade'].includes(option.check?.skill??'')?'C':option.check?.skill==='record'||!p?'D':'R';
  const weight=RULES.critical[type];
  const labels={R:['这次核对仍有遗漏，后续接诊需要补查。','病史采集、查体与异常信息复核'],C:['这次谈话没有说清楚，沟通问题仍需处理。','向患者或相关当事人如实说明并记录沟通过程'],D:['本次材料仍有未核实的内容，需要保留原记录并补充核对。','原始记录真实、完整，补记说明时间与依据']} as const;
  return {effects:{hazards:[{type,weight,reason:labels[type][0],norm:labels[type][1],causal:false}]},text:labels[type][0]};
}
