import type {Run}from './types';
import type {AuthoredDirectorState}from './director';
import {RULES}from './rules';
import {confirmedLocalCareTransfer}from './care-completion';

/** The confirmed part of a shift owns its own workload. Performance pay is
 * already issued by each completed encounter, never by this shift receipt. */
export function extraShiftPlan(s:AuthoredDirectorState,day:number){
 const partial=!!s.activeFacts[`extra-night-partial:${day}`];
 return{partial,cases:partial?RULES.extraShift.partialCases:RULES.extraShift.fullCases,
  minutes:partial?RULES.extraShift.partialMinutes:RULES.extraShift.fullMinutes,alarm:!partial};
}
export function extraShiftCompleted(r:Pick<Run,'day'|'patients'|'committed'|'facts'>,s:AuthoredDirectorState){
 if(!s.activeFacts[`extra-night:${r.day}`])return false;
 const plan=extraShiftPlan(s,r.day);
 const patients=r.patients.filter(p=>s.activeFacts[`extra-night-patient:${p.uid}`]?.day===r.day);
 const tasks=Object.entries(s.activeFacts).filter(([k,v])=>k.startsWith('extra-night-task:')&&v.day===r.day).map(([k])=>k.slice('extra-night-task:'.length));
 return patients.length===plan.cases&&patients.every(p=>!!p.clinical?.outcomeId||confirmedLocalCareTransfer(r,p))&&
  tasks.length===(plan.alarm?1:0)&&tasks.every(id=>r.committed.some(c=>c.startsWith(`${id}:`)));
}
