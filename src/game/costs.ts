import { RULES } from './rules';
import type { Card, Option, Patient, Run, Skill,CheckTerm } from './types';
import { talentCheck, talentCosts, talentBudgetCharge } from './talents';
import { talentContext, checkContext, costContext } from './traits';
import { eventTuning, emptyEventTuning } from '../content/events/modifiers';
import { patientCheckAdjustment } from './patient-director';
import {episodeAdjustedBudget} from '../content/events/billing-episodes';
import {isPlayerResponsibleForPatient,playerBillableLiability}from '../content/events/clinical-ownership';
import {historyEventModifier}from '../content/events/specialized-checks';
import {nightClinicalCharge}from './night-costs';
import {patientBillingAction,patientLiability}from './budget-liability';

export function costTuning(r:Run,card?:Card) {return r.authored?eventTuning(r.authored.ledger,r.day,card?.scope,Object.keys(r.facts)):emptyEventTuning();}
export function optionCosts(r:Run,o:Option,card:Card|undefined=r.queue[r.cursor]) {
  if(o.interaction==='graph-continue'||o.interaction==='defer')return {ap:0,minutes:0,cost:0,stamina:0};
  const costs=talentCosts(talentContext(r),{ap:o.ap,minutes:o.minutes,cost:o.cost,stamina:Math.max(0,-(o.effects.stamina??0))},costContext(r,card,o));
  const tuning=costTuning(r,card);
  const firstPatient=!!card?.patientId&&!r.facts[`cost-started:${card.patientId}`];
  if(card?.kind==='night') {
    costs.ap=0;
    if(firstPatient)costs.minutes+=tuning.extraNightMinutes;
  } else if(card?.kind==='ward')costs.ap+=tuning.wardAP;
  else if(firstPatient&&['quick','clinical'].includes(card?.kind??'')&&!r.patients.find(p=>p.uid===card?.patientId)?.inpatient)costs.ap+=tuning.outpatientAP;
  if(['clinical','quick'].includes(card?.kind??'')&&r.vitals.stamina<RULES.perception.tired)costs.minutes*=1.25;
  const extraStamina=talentCosts(talentContext(r),{ap:0,minutes:0,cost:0,stamina:0},costContext(r,card,o)).stamina;
  // Vital effects truncate toward zero; added action costs round up separately.
  return {ap:Math.max(0,Math.ceil(costs.ap)),minutes:Math.max(0,Math.ceil(costs.minutes)),cost:Math.max(0,Math.round(costs.cost)),stamina:Math.max(0,Math.floor(costs.stamina-extraStamina)+Math.ceil(extraStamina))};
}
export const optionAp=(r:Run,o:Option,card?:Card)=>optionCosts(r,o,card).ap;
export function skillModifierSources(r:Run,skill:Skill,card?:Card,o?:Option):CheckTerm[] {
  const terms:CheckTerm[]=[{id:'ability',label:'本局能力',value:r.skills[skill]}];
  const add=(id:string,label:string,value:number)=>{if(value)terms.push({id,label,value});};
  if(skill==='comfort'&&r.vitals.emotion<30)add('emotion','情绪不足',-1);
  if(['comfort','persuade'].includes(skill)&&r.vitals.san<RULES.perception.distorted)add('san','精神状态影响沟通',-RULES.perception.socialPenalty);
  if(skill==='endure'){
    add('family','家人支持',r.relations.family>=4?2:r.relations.family>=3?1:0);
    add('debt','债务负担',-(r.debt>30000?2:r.debt>10000?1:0));
    add('depression','抑郁倾向',-Math.floor(r.depression/25));
  }
  add('fatigue','疲劳',-(r.vitals.stamina<RULES.perception.exhausted?2:r.vitals.stamina<RULES.perception.tired?1:0));
  if(r.overtime>0)add('overtime','当日透支',-1);
  const context=o?checkContext(r,card,o):{operation:skill==='endure'?'day-end':skill==='clinical'?'treatment':skill==='observe'?'observe':skill,actor:'other'} as const;
  const tuning=costTuning(r,card);
  add('traits','天赋与持续状态',talentCheck(talentContext(r),context).modifier);
  add('event-skill','该项能力的事件修正',tuning.skills[skill]??0);
  add('event-all','当日事件修正',tuning.allChecks);
  if(card&&context.operation==='history')add('history','这位患者的病史核对条件',historyEventModifier(r,card.scope));
  return terms;
}
export const sumCheckTerms=(terms:readonly CheckTerm[])=>terms.reduce((sum,t)=>sum+t.value,0);
export const skillModifier=(r:Run,skill:Skill,card?:Card,o?:Option)=>sumCheckTerms(skillModifierSources(r,skill,card,o));
export function previewCheckSources(r:Run,o:Option,card:Card|undefined):CheckTerm[] {
  if(!o.check||o.chanceCheck)return [];
  const state={...r,caps:{...r.caps},vitals:{...r.vitals}};
  const over=Math.max(0,optionAp(r,o,card)-r.ap);
  if(over) {
    state.overtime+=over;
    for(const vital of ['san','stamina','emotion'] as const) {
      state.caps[vital]=Math.max(1,state.caps[vital]-RULES.overtimeCapLoss*over);
      state.vitals[vital]=Math.min(state.vitals[vital],state.caps[vital]);
    }
    state.vitals.stamina-=RULES.overtimeStamina*over;
  }
  if(card?.kind==='night') {
    const baseline=nightClinicalCharge(r,card,o);state.vitals.san-=baseline.san;state.vitals.stamina-=baseline.stamina;
    if(r.nightMinutes-actionMinutes(r,o,card)<0) {state.vitals.san-=RULES.nightOverrun.san;state.vitals.stamina-=RULES.nightOverrun.stamina;}
  }
  return skillModifierSources(state,o.check.skill,card,o);
}
export const previewCheckModifier=(r:Run,o:Option,card:Card|undefined)=>sumCheckTerms(previewCheckSources(r,o,card));
export function checkDifficultySources(r:Run,o:Option,card:Card|undefined):CheckTerm[] {
  if(o.chanceCheck)return[{id:'chance',label:'事件所需骰点',value:o.chanceCheck.successAtLeast}];
  const patient=r.patients.find(p=>p.uid===card?.patientId);
  return[{id:'base',label:'本次事项难度',value:o.check?.dc??0},
    {id:'mode',label:'主治难度',value:r.difficulty==='attending'?2:0},
    {id:'traits',label:'天赋与持续状态',value:talentCheck(talentContext(r),checkContext(r,card,o)).dcDelta},
    {id:'patient',label:'患者与现场沟通条件',value:patient?patientCheckAdjustment(r,patient,o).dcDelta:0}].filter(t=>t.id==='base'||t.value!==0);
}
export const checkDifficulty=(r:Run,o:Option,card:Card|undefined)=>sumCheckTerms(checkDifficultySources(r,o,card));
export const treatmentCost=(r:Run,o:Option)=>optionCosts(r,o).cost;
export const actionMinutes=(r:Run,o:Option,card:Card|undefined)=>optionCosts(r,o,card).minutes;
export function personalLiability(r:Run,spent:number,budget:number):number {return Math.round(talentBudgetCharge(talentContext(r),Math.max(0,spent-budget)*RULES.budgetShare));}
export function patientPayment(r:Run,p:Patient,o:Option,card:Card|undefined=r.queue[r.cursor]) {
  const treatment=optionCosts(r,o,card).cost;
  const authored=!!card&&('authoredEventId'in card||card.billing==='spending');
  const spent=Math.max(0,p.spent+treatment+(authored||Number(o.effects.bill)>0?o.effects.bill??0:0));
  const budget=episodeAdjustedBudget(r,{...p,budget:p.budget+(authored?0:Math.max(0,-(o.effects.bill??0)))},spent);
  if(!patientBillingAction(o,card))return{treatment,spent:p.spent,budget:episodeAdjustedBudget(r,p),personal:0,refund:0};
  const total=patientLiability(r,p,spent,budget),liability=isPlayerResponsibleForPatient(r,p)?playerBillableLiability(r,p,total):Math.min(p.charged,playerBillableLiability(r,p,total));
  return {treatment,spent,budget,personal:Math.max(0,liability-p.charged),refund:Math.max(0,p.charged-liability)};
}
