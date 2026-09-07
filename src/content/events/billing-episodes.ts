import type {Patient,Run}from '../../game/types';

/** A billing claim is not a clinical discharge. The actual encounter and its
 * accumulated spending/charges remain intact and independently auditable. */
export interface BillingEpisode{
 id:string;
 source:string;
 sourceEvent:'E-171';
 patientId:string;
 day:number;
 kind:'claimed-readmission';
 continuousStay:true;
 spendingAtSplit:number;
 chargedAtSplit:number;
 budgetAtSplit:number;
 additionalBudget:number;
}
type EpisodeWorld={authored?:{billingEpisodes?:BillingEpisode[]}};
export function createClaimedReadmission(r:Run,p:Patient,source:string):BillingEpisode|undefined{
 if(!source.endsWith(':E-171-c')||!p.active||!p.inpatient||p.damage>=3||r.authored?.billingEpisodes?.some(e=>e.patientId===p.uid&&e.sourceEvent==='E-171'))return;
 return{id:`${source}:billing-episode`,source,sourceEvent:'E-171',patientId:p.uid,day:r.day,kind:'claimed-readmission',continuousStay:true,spendingAtSplit:p.spent,chargedAtSplit:p.charged,budgetAtSplit:p.budget,additionalBudget:p.initialBudget??p.budget};
}
/** The additional allowance pays only post-claim spending. Previously paid or
 * still-owed excess is never erased, refunded, or counted a second time. */
export function billingEpisodeCredit(r:EpisodeWorld,p:Pick<Patient,'uid'|'spent'>,prospectiveSpent=p.spent):number{
 const episodes=(r.authored?.billingEpisodes??[]).filter(e=>e.patientId===p.uid).sort((a,b)=>a.spendingAtSplit-b.spendingAtSplit||a.day-b.day);
 return episodes.reduce((credit,e,index)=>{
  const end=Math.min(prospectiveSpent,episodes[index+1]?.spendingAtSplit??prospectiveSpent);
  return credit+Math.min(e.additionalBudget,Math.max(0,end-e.spendingAtSplit));
 },0);
}
export function episodeAdjustedBudget(r:EpisodeWorld,p:Pick<Patient,'uid'|'spent'|'budget'>,prospectiveSpent=p.spent):number{return p.budget+billingEpisodeCredit(r,p,prospectiveSpent);}
export function billingEpisodeSummaries(r:EpisodeWorld,p:Pick<Patient,'uid'|'spent'>){
 const episodes=(r.authored?.billingEpisodes??[]).filter(e=>e.patientId===p.uid).sort((a,b)=>a.spendingAtSplit-b.spendingAtSplit||a.day-b.day);
 return episodes.map((e,index)=>{
  const used=Math.min(e.additionalBudget,Math.max(0,Math.min(p.spent,episodes[index+1]?.spendingAtSplit??p.spent)-e.spendingAtSplit));
  return{id:e.id,day:e.day,additionalBudget:e.additionalBudget,used,remaining:e.additionalBudget-used,continuousStay:true as const,title:'分次住院申报',text:`你在第 ${e.day} 天申报再次住院，患者实际一直住在院内。追加额度 ¥${e.additionalBudget.toLocaleString('en-US')}，已用 ¥${used.toLocaleString('en-US')}，剩余 ¥${(e.additionalBudget-used).toLocaleString('en-US')}。此前的账单和超支金额仍需按原记录结算。`};
 });
}
