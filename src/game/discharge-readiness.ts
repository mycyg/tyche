import type {Patient}from './types';
import {RULES}from './rules';
import {patientAssessmentComplete}from './care-completion';

/** A stability counter measures recovery, not completion of a diagnostic graph.
 * The paid discharge action performs the final review; merely opening a card
 * must not narrate that review as already completed. */
export function dischargeReadiness(p:Patient):{ready:boolean;reason:string}{
 if(!p.active||p.damage>=3)return{ready:false,reason:'患者目前不属于可办理康复出院的在院患者。'};
 if(!patientAssessmentComplete(p))return{ready:false,reason:'本次诊疗评估尚未完成，不能用恢复进度代替风险排查。'};
 if(p.damage>p.mitigated)return{ready:false,reason:'已经出现的损害尚未完成后续处置，需要继续评估或落实转接。'};
 if(p.stability<RULES.ward.stabilityNeed)return{ready:false,reason:'恢复情况尚未达到出院评估要求，仍需观察。'};
 return{ready:true,reason:'恢复情况允许进入出院评估，仍须核对当日病情并完成随访交接。'};
}
