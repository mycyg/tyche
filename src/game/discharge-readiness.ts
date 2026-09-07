import type {Fact,Patient}from './types';
import {RULES}from './rules';
import {patientAssessmentComplete}from './care-completion';
import {PRESET_BY_ID}from '../content/patients';

/** A preset's own risk contract: every required flag must be on record before
 * its risks count as closed. Ending the visit without the follow-up leaves the
 * same flags missing, so it cannot stand in for closure. Older callers that
 * cannot supply the run's facts keep the previous checks only. */
export function presetRiskPending(p:Pick<Patient,'uid'|'preset'|'presetNode'>,facts:Readonly<Record<string,Fact|undefined>>):string[]{
 // An inpatient profile whose workup was never opened has no risk contract of its own.
 const preset=p.preset&&p.presetNode?PRESET_BY_ID.get(p.preset.presetId):undefined;
 if(!preset)return [];
 const {requires,pending}=preset.riskClosure;
 return requires.flatMap((flag,index)=>facts[flag.replace(`preset:${preset.id}`,`preset:${preset.id}:${p.uid}`)]?[]:[pending[index]]);
}

/** A stability counter measures recovery, not completion of a diagnostic graph.
 * The paid discharge action performs the final review; merely opening a card
 * must not narrate that review as already completed. */
export function dischargeReadiness(p:Patient,facts?:Readonly<Record<string,Fact|undefined>>):{ready:boolean;reason:string}{
 if(!p.active||p.damage>=3)return{ready:false,reason:'患者目前不属于可办理康复出院的在院患者。'};
 if(!patientAssessmentComplete(p))return{ready:false,reason:'本次诊疗评估尚未完成，不能用恢复进度代替风险排查。'};
 const pending=facts?presetRiskPending(p,facts):[];
 if(pending.length)return{ready:false,reason:`本次病情的风险尚未闭合：${pending.join('')}`};
 if(p.damage>p.mitigated)return{ready:false,reason:'已经出现的损害尚未完成后续处置，需要继续评估或落实转接。'};
 if(p.stability<RULES.ward.stabilityNeed)return{ready:false,reason:'恢复情况尚未达到出院评估要求，仍需观察。'};
 return{ready:true,reason:'恢复情况允许进入出院评估，仍须核对当日病情并完成随访交接。'};
}
