import type {Card,Option,Patient,Run}from './types';
import {RULES}from './rules';
import {talentBudgetCharge}from './talents';
import {talentContext}from './traits';
import {clinicalAssignment}from '../content/events/clinical-ownership';
import {episodeAdjustedBudget}from '../content/events/billing-episodes';

const base=(spent:number,budget:number)=>Math.max(0,spent-budget)*RULES.budgetShare;
export function patientBillingAction(o:Option,card:Card|undefined,chargeTreatment=true):boolean{
 return chargeTreatment&&o.cost>0||o.effects.bill!==undefined||chargeTreatment&&
   (card as Card&{authoredEventId?:string}|undefined)?.authoredEventId==='E-171';
}

/** B24 multiplies new shortfall payments, not money already settled before
 * it appeared. A legacy mixed-rate account is inferred from its actual total
 * paid; no old invoice is silently charged again or refunded on inspection. */
export function budgetSurchargeExemption(r:Run,p:Patient):number{
 if(p.budgetSurchargeExempt!==undefined)return p.budgetSurchargeExempt;
 const gross=base(p.spent,episodeAdjustedBudget(r,p));
 const paid=p.charged+(clinicalAssignment(r,p)?.teamCharged??0);
 const multiplier=talentBudgetCharge(talentContext(r),1);
 if(multiplier<=1)return Math.min(gross,paid);
 return Math.max(0,Math.min(gross,paid,(gross*multiplier-paid)/(multiplier-1)));
}
export function patientLiability(r:Run,p:Patient,spent=p.spent,budget=episodeAdjustedBudget(r,p,spent)):number{
 const gross=base(spent,budget),exempt=Math.min(gross,budgetSurchargeExemption(r,p));
 return Math.round(exempt+talentBudgetCharge(talentContext(r),gross-exempt));
}
/** Capture the old invoice before spending/budget changes, then retain only
 * the exempt principal still paid after this settlement or genuine refund. */
export function beginBudgetSettlement(r:Run,p:Patient):void{
 p.budgetSurchargeExempt=budgetSurchargeExemption(r,p);
}
export function finishBudgetSettlement(r:Run,p:Patient):void{
 const gross=base(p.spent,episodeAdjustedBudget(r,p));
 p.budgetSurchargeExempt=talentBudgetCharge(talentContext(r),1)>1
   ?Math.min(gross,p.budgetSurchargeExempt??0):gross;
}
