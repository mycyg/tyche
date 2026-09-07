import { CASES, DEBUFFS } from "./catalog";
import { assignBed, awaitingBed, buildDay, patientCase, makeWardCard } from "./cards";
import {playerEarlyDischargeSource,isUnsupportedPatientClaim,unsupportedPatientClaimOption}from './discharge-responsibility';
import {clinicalAssignment,isPlayerResponsibleForPatient,playerBillableLiability,reconcileTeamCharge}from '../content/events/clinical-ownership';
import {currentClinicalHandoff,handoffLabel,isDirectPatientCare}from './clinical-handoff';
import { earlyEnding, tribunalEnding, auditScore, documentedEnding } from "./endings";
import {buildTribunalPreparation}from '../content/events/court-preparation';
import {runDie,runRandom,runShuffled} from './run-random';
import { conditionMet } from "./stories";
import { RULES, VITAL_LABELS, RELATION_LABELS } from "./rules";
import { actionMinutes, skillModifier, skillModifierSources,previewCheckSources,checkDifficultySources,treatmentCost, optionAp, previewCheckModifier, checkDifficulty, costTuning } from "./costs";
import {beginBudgetSettlement,finishBudgetSettlement,patientBillingAction,patientLiability}from './budget-liability';
import { perceptionOption } from './perception';
import { clinicalCard, progressClinical, scopedClinicalEffects, refreshClinicalCardCopy } from './clinical';
import type { GraphAdvance } from '../content/clinical';
import { presetCard, isPresetEnd, refreshPresetEntryCopy } from './presets';
import {refreshPeerReferralOffer}from './peer-referrals';
import { buildAuthoredEvents, afterAuthoredChoice, settleAuthoredEvents, authoredTuning, forceZeroEvent, authoredRequestedEnding, pendingClinicalEvent,refreshButterflyOptions,lateWeeklyBudgetEvents,eligibleAuthoredEvents } from './director';
import {eventToCard}from '../content/events/catalog';
import {prepareTalentEvent}from '../content/events/talent-adapter';
import type { DirectorResult, ClinicalEventCard } from './director';
import {finalizeFamilyPayments,refreshFamilyInvoiceCard}from '../content/events/family-accounts';
import { SHIFT_PHASES, scenePhase, orderPendingScenes } from './shift';
import type { EventPhase } from '../content/events/types';
import * as talent from './talents';
import { talentContext, checkContext, costContext, liveCap } from './traits';
import { nextShiftForecast } from './schedule-preview';
import { hasWorkedNight, isFullDayLeave, isLeaveHandoffCard, leaveHandoffOption } from './duty-state';
import { authoredChoiceEffects } from '../content/events';
import type { EventOption } from '../content/events';
import { patientCheckAdjustment, preflightPatientChoice, patientVisibleOptions, afterPatientChoice, isPatientGate, patientComplaintReliefFlag } from './patient-director';
import { firstContact, abilityOptions, resolveAbility } from './abilities';
import {patientCheckParties,rollPatientCheck,rerollPatientCheck,patientGroupResultText} from './patient-checks';
import { encounteredCollections } from './encounters';
import { nightTelephoneRequired,nightTelephoneOption,nightTelephoneId,nightTelephoneDeteriorates } from './night-overflow';
import { patientPerformance } from './performance';
import { isNewNightClinicalIncident,nightClinicalIncidentKey } from '../content/events/night-incidents';
import { archivedTrapIds,archiveNotices,collectTrapArchive,validArchiveTrap } from './trap-archive';
import {changeCashPressure} from '../content/events/pressure';
import {clinicalDisposition} from './clinical-disposition';
import {completedAdmissionChoice,underObservation}from './clinical-admission';
import {displayNumber}from './display-number';
import {captureContinuation,interruptionPhase,recordedSanBreaks,restoreContinuation,resumePhase}from './interruption';
import {criticalConsequence}from './critical-outcome';
import {relieveHazards}from './hazard-relief';
import {nightClinicalCharge}from './night-costs';
import {isRepresentativeBenefit}from './representative-benefit';
import {deferredPatientOption,captureDeferredWork,deferredWorkEffects,resolveDeferredWork,deferrablePatientCards}from './deferred-work';
import {incomeCoverage,recordDailyIncome}from './income-coverage';
export { skillModifier } from './costs';
import type {
  Action,
  Card,
  Effects,
  Feedback,
  Meta,
  Option,
  Run,
  Skill,
  Vital,
  Roll,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const has = (r: Run, id: string) =>
  r.talents.includes(id) || r.debuffs.includes(id);
export const currentCard = (r: Run) => {
  const card=r.queue[r.cursor];
  if(!card)return card;
  if(isUnsupportedPatientClaim(r,card))return{...card,title:'诊疗经手人待核对',text:'医务科发来的通知中，没有找到由你实施所涉诊疗的记录。先核对经手人和主管组，再转交相应材料。',options:[unsupportedPatientClaimOption(card)]};
  const wardPatient=card.kind==='ward'&&card.id===`ward:${card.patientId}:${r.day}`?r.patients.find(p=>p.uid===card.patientId):undefined;
  // Admission progress and intervening incidents can change discharge safety
  // after the morning queue was built. Keep a pre-paid handover quote intact.
  const refreshedWard=wardPatient?makeWardCard(r,wardPatient):undefined;
  const liveWard=refreshedWard?{...card,text:refreshedWard.text,options:card.options.map(o=>o.id.endsWith(':discharge')?refreshedWard.options.find(n=>n.id===o.id)??o:o)}:card;
  const projected=refreshPeerReferralOffer(r,refreshFamilyInvoiceCard(r,refreshPresetEntryCopy(r,refreshClinicalCardCopy(r,liveWard))));
  // A family call or an existing review can still arrive while off duty.
  // It is a personal obligation, not evidence that the doctor worked a night.
  return isFullDayLeave(r)&&projected.kind==='night'&&!isLeaveHandoffCard(r,projected)
    ? {...projected,kind:'story' as const} : projected;
};
/** Only the first unfinished scene for a patient can be visited. Night duty
 * opens after daytime encounters, and sleep never skips unfinished work. */
export function availableEncounters(r: Run): Card[] {
  if (r.phase !== "play") return [];
  if(r.emergency)return r.queue.filter(c=>c.id===r.emergency!.cardId);
  const pending = r.queue.slice(r.cursor).filter(c=>!r.shiftPhase||scenePhase(r,c)===r.shiftPhase);
  const day = pending.filter(c => c.kind !== "night" && c.kind !== "rest");
  const pool = day.length ? day : pending.some(c => c.kind === "night")
    ? pending.filter(c => c.kind === "night") : pending;
  const visited = new Set<string>();
  return pool.filter(c => {
    // A patient's clinical sequence stays ordered. Independent statements,
    // permissions and promised deliveries must remain separately selectable.
    const story=c as Card&{butterfly?:{chainStateId:string};butterflyPermission?:unknown;butterflyCommitment?:unknown};
    const key=story.butterfly?`story:${story.butterfly.chainStateId}`
      :story.butterflyPermission||story.butterflyCommitment?`task:${c.id}`
      :c.patientId??`${c.scope.kind}:${c.scope.id}:${c.actor??c.id}`;
    if (visited.has(key)) return false;
    visited.add(key);
    return true;
  });
}
export function newMeta(): Meta {
  return {
    schema: 1,
    insight:0,entities:[],clinicalPatients:[],debuffs:[],usedTalents:[],extraRedraws:0,depressionRank:0,seedHistory:[],
    xp: 0,
    runs: 0,
    rewarded: [],
    endings: [],
    cases: [],
    scenes: [],
    skills: {
      observe: 0,
      clinical: 0,
      record: 0,
      persuade: 0,
      comfort: 0,
      endure: 0,
    },
    caps: { stamina: 0, san: 0, emotion: 0 },
    cashRank: 0,
  };
}
export function startRun(
  seed: string,
  name: string,
  talents: string[],
  meta = newMeta(),
  difficulty: Run["difficulty"] = "rotation",
  instanceId = `${seed}:run:${meta.runs}`,
): Run {
  const invalid=talents.length?talent.validateTalentSelection(talents,!!meta.fourthSlot):[];
  if(invalid.length)throw new Error(invalid.join(' '));
  const caps = {
    stamina: 100 + meta.caps.stamina * RULES.meta.capRank,
    san: 100 + meta.caps.san * RULES.meta.capRank,
    emotion: 100 + meta.caps.emotion * RULES.meta.capRank,
  };
  const r: Run = {
    schema: 1,
    id: instanceId,
    seed: seed.slice(0, 48),
    name: name.trim().slice(0, 12) || "程医生",
    day: 1,
    difficulty,
    phase: "play",
    vitals: { ...caps },
    caps,
    relations: {
      chief: 2,
      nurse: 2,
      peer: 2,
      family: 2,
    },
    ap: RULES.ap,
    borrowed: 0,
    overtime: 0,
    cash:
      RULES.cash -
      RULES.rent +
      meta.cashRank * RULES.meta.cashStep,
    debt: 0,
    privateDebt: 0,
    receivable: 0,
    income: 0,
    interest: 0,
    uncoveredDays: 0,
    reputation: 50,
    depression: Math.max(0,10-(meta.depressionRank??0)*5),
    talents: [...talents],
    talentMemory:talent.initialTalentMemory(), priorSeeds:structuredClone(meta.seedHistory??[]),
    metaRerolls:meta.rerollToken?1:0, archiveTraps:[...archivedTrapIds({archiveTraps:meta.archiveTraps,priorSeeds:meta.seedHistory})].filter(id=>validArchiveTrap(id,true)),
    debuffs: [],
    skills: { ...meta.skills },
    coffee: 0,
    nap: false,
    exhausted: 0,
    sanBreaks: 0,
    emotionalBreaks: 0,
    skipNextDay: false,
    nightMinutes: 0,
    nightBudget: 0,
    patients: [],
    queue: [],
    cursor: 0,
    facts: {},
    journal: [],
    hazards: [],
    committed: [],
    offered: [],
    debuffPicks: 0,
    streak: 0,
  };
  applyTalent(r,talent.talentStart(talentContext(r)),'talent-start');
  applyTalent(r,talent.talentDayStart(talentContext(r)),'talent-day-start');
  r.ap=talent.talentBaseAp(talentContext(r),RULES.ap,false);
  r.vitals={...r.caps,stamina:liveCap(r,'stamina')};
  r.queue = buildDay(r);
  advanceShift(r);
  return r;
}
function applyDirector(r:Run, result:DirectorResult) {
  Object.assign(r,result.patch);
  r.queue=r.queue.filter((c,i)=>i<r.cursor||!result.removeCardIds.includes(c.id));
  let replyAt=Math.min(r.cursor+1,r.queue.length);
  for(const card of result.cards) if(!r.queue.some(c=>c.id===card.id)) {
    card.shiftPhase ??= r.shiftPhase;
    if(result.immediateCardIds?.includes(card.id))r.queue.splice(replyAt++,0,card);
    else r.queue.push(card);
  }
  for(const item of result.effects) {
    if(r.facts[`director-applied:${item.id}`]) continue;
    const message=item.id.includes('E-067-c:')&&isFullDayLeave(r)
      ?'今天休假，不需要从同事家赶去医院；通勤没有占用工作行动。':item.text;
    const card:Card={id:item.id,title:'后续消息',text:message,kind:r.shiftPhase==='夜班'?'night':'story',scope:item.scope,
      patientId:item.scope.kind==='patient'?item.scope.id:undefined,billing:'spending',options:[],...item.context};
    const option:Option={id:item.id,label:message,ap:0,minutes:0,cost:0,result:message,effects:item.effects};
    // Snapshot only the values used by deltas; keep actual clipping, payer and
    // overtime effects instead of promising the unprocessed authored amounts.
    const before={...r,vitals:{...r.vitals},caps:{...r.caps},relations:{...r.relations},patients:r.patients.map(p=>({...p}))};
    applyEffects(r,item.effects,card,option,false);
    flag(r,`director-applied:${item.id}`,item.id);
    const changes=deltas(before,r),text=[message,changes.length?`本次变化：${changes.join('；')}。`:''].filter(Boolean).join('\n');
    if(text)r.journal.push({id:item.id,day:r.day,title:card.title,choice:message||'收到后续消息',result:text,scope:item.scope,flags:item.effects.flags??[]});
  }
}
function applyTalent(r:Run,hook:talent.TalentHookResult,id:string,sourceCard?:Card) {
  r.talentMemory=hook.memory;
  const previousDebuffs=r.debuffs;
  r.debuffs=[...new Set([...r.debuffs.filter(d=>!hook.removeDebuffs.includes(d)),...hook.addDebuffs])];
  recordRecoveredStatuses(r,previousDebuffs.filter(d=>!r.debuffs.includes(d)),id);
  if(r.authored&&hook.pressureDelta)Object.assign(r.authored,changeCashPressure(r,r.authored,hook.pressureDelta));
  const card=sourceCard??{id,title:'值班记录',text:'',kind:'story' as const,scope:{kind:'personal' as const,id:r.id},options:[]};
  applyEffects(r,hook.effects,card,{id,label:card.title,ap:0,minutes:0,cost:0,result:'',effects:hook.effects},false);
}
function recordRecoveredStatuses(r:Run,removed:string[],source:string) {
  if(!removed.length)return;
  const names=removed.map(id=>DEBUFFS.find(d=>d.id===id)?.name).filter(Boolean).map(name=>`「${name}」`).join('、');
  if(!names)return;
  const id=`status-recovery:${source}`;
  if(r.journal.some(entry=>entry.id===id))return;
  const reason=removed.includes('B17')&&r.debt<=0?'信用债已清零，「账单日」的附加利率不再生效。':'';
  r.journal.push({id,day:r.day,title:'持续状态已解除',choice:names,
    result:`${names}已解除，后续不再受到这项状态影响。${reason}`,scope:{kind:'personal',id:r.id},flags:[]});
}
/** Enter each work period only when its real encounters have been completed. */
function advanceShift(r:Run):boolean {
  if(r.emergency)return true;
  if(r.day>RULES.days){
    if(r.queue.slice(r.cursor).length)return true;
    r.phase='tribunal';return true;
  }
  if(!r.shiftPhase) {
    r.shiftPhase=SHIFT_PHASES[0];
    applyDirector(r,buildAuthoredEvents(r,r.shiftPhase));
    interrupt(r);
    if(r.emergency||r.phase!=='play')return true;
  }
  for(let i=0;i<SHIFT_PHASES.length;i++) {
    orderPendingScenes(r);
    if(r.queue.slice(r.cursor).some(c=>scenePhase(r,c)===r.shiftPhase)) return true;
    const phase:EventPhase=r.shiftPhase??'交班';
    applyDirector(r,settleAuthoredEvents(r,phase));
    // Settlement can itself deliver an appointment or exhaust a resource.
    // Finish that actual period before changing its identity to the next one.
    interrupt(r);
    if(r.emergency||r.phase!=='play')return true;
    orderPendingScenes(r);
    if(r.queue.slice(r.cursor).some(c=>scenePhase(r,c)===phase))return true;
    const next:EventPhase|undefined=SHIFT_PHASES[SHIFT_PHASES.indexOf(phase)+1];
    if(!next)return false;
    r.shiftPhase=next;
    if(next==='夜班'&&!isFullDayLeave(r)&&(r.nightBudget>0||r.authored?.activeFacts[`extra-night:${r.day}`])) {
      flag(r,`night-duty-started:${r.day}`,`shift:${r.day}:夜班`);
      applyTalent(r,talent.talentNightStart(talentContext(r)),`talent-night:${r.day}`);
    }
    applyDirector(r,buildAuthoredEvents(r,next));
    interrupt(r);
    if(r.emergency||r.phase!=='play')return true;
  }
  return false;
}
function resumeWork(r:Run) {
  if(r.phase==='play'&&!r.emergency&&!advanceShift(r))endDay(r);
}
function flag(r: Run, key: string, source: string) {
  if (!r.facts[key])
    r.facts[key] = { day: r.day, source, sequence: r.journal.length };
}
function capLoss(r: Run, amount: number) {
  for (const vital of Object.keys(r.caps) as Vital[]) {
    r.caps[vital] = Math.max(1, r.caps[vital] - amount);
    r.vitals[vital] = Math.min(r.vitals[vital], r.caps[vital]);
  }
}
function income(r: Run, amount: number) {
  r.income += amount;
  if(amount<0){r.cash+=amount;return;}
  const pay = Math.min(r.debt, amount);
  r.debt -= pay;
  r.cash += amount - pay;
}
function spendAp(r: Run, ap: number): number {
  const over = Math.max(0, ap - r.ap);
  r.ap = Math.max(0, r.ap - ap);
  if (over) {
    r.overtime += over;
    capLoss(r, RULES.overtimeCapLoss * over);
    r.vitals.stamina -= RULES.overtimeStamina * over;
    r.reputation += talent.talentOvertime(talentContext(r)).reputation??0;
  }
  return over;
}
function addHazards(r: Run, effects: Effects, card: Card, option: Option) {
  const hazards=talent.talentHazards(talentContext(r),effects.hazards??[],{patientId:card.patientId,unsignedConsent:option.mechanics?.unsignedConsent,newAfterTransfer:true});
  for (const [index, h] of hazards.entries()) {
    if(h.weight<=0)continue;
    r.hazards.push({
      ...h,
      weight: Math.max(1, Math.round(h.weight)),
      id: `${option.id}:h${index}`,
      day: r.day,
      scope: card.scope,
      choiceId: option.id,
      choice: option.label,
    });
  }
}
function billPatient(r: Run, uid: string,source:string) {
  const p = r.patients.find((x) => x.uid === uid)!;
  const total=patientLiability(r,p);
  reconcileTeamCharge(r,p,total);
  const assignment=clinicalAssignment(r,p);
  if(assignment&&!isPlayerResponsibleForPatient(r,p))assignment.teamCharged=Math.max(assignment.teamCharged,Math.max(0,total-p.charged));
  const newCharge = playerBillableLiability(r,p,total) - p.charged;
  if (newCharge) {
    r.cash -= newCharge;
    p.charged += newCharge;
    if(newCharge>0) {
      r.vitals.emotion -= Math.min(20, Math.floor(newCharge / 1000) * 2);
      (r.budgetCharges??=[]).push({day:r.day,amount:newCharge,patientId:uid,source});
    }
  }
  finishBudgetSettlement(r,p);
}
function applyEffects(r: Run, e: Effects, card: Card, option: Option, chargeTreatment = true) {
  e=talent.talentEffects(talentContext(r),e,{randomEvent:'authoredEventId'in card&&!('butterfly'in card),dispute:card.chain==='BTF-003'||card.chain==='dispute',departmentNotice:card.actor==='chief',representativeBenefit:isRepresentativeBenefit(card,e),isNight:card.kind==='night'});
  for (const vital of ["stamina", "san", "emotion"] as Vital[]) {
    let amount = e[vital] ?? 0;
    amount=amount<0?Math.ceil(amount):Math.floor(amount);
    r.vitals[vital] = clamp(r.vitals[vital] + amount, 0, liveCap(r,vital));
    if (e.caps?.[vital]) {
      r.caps[vital] = Math.max(1, r.caps[vital] + e.caps[vital]!);
      r.vitals[vital] = Math.min(r.vitals[vital], r.caps[vital]);
    }
  }
  r.cash += e.cash ?? 0;
  r.debt = Math.max(0, r.debt + (e.debt ?? 0));
  r.privateDebt = Math.max(0, r.privateDebt + (e.privateDebt ?? 0));
  r.receivable = Math.max(0, r.receivable + (e.receivable ?? 0));
  if (e.income) income(r, e.income);
  if(e.cashPressure&&r.authored)Object.assign(r.authored,changeCashPressure(r,r.authored,e.cashPressure));
  if(e.apAllowance)r.ap=Math.max(0,r.ap+e.apAllowance);
  for(const type of ['R','C','D','F'] as const) {
    relieveHazards(r.hazards,card.scope,type,e.hazardRelief?.[type]??0,option.id,r.day);
  }
  r.reputation = clamp(r.reputation + (e.reputation ?? 0), 0, 100);
  r.depression = clamp(r.depression + (e.depression ?? 0), 0, 100);
  if (e.ap) {
    if (e.ap < 0) spendAp(r, -e.ap);
    else r.ap += e.ap;
  }
  for (const relation of Object.keys(r.relations) as (keyof Run["relations"])[])
    r.relations[relation] = clamp(
      r.relations[relation] + (e.relations?.[relation] ?? 0),
      0,
      5,
    );
  for (const key of e.flags ?? []) flag(r, key, option.id);
  for (const key of e.clear ?? []) delete r.facts[key];
  if (e.flags?.includes("li-half-repaid")) {
    const returned = Math.ceil(r.receivable / 2);
    r.receivable -= returned;
    r.cash += returned;
  }
  const p = r.patients.find((x) => x.uid === card.patientId);
  if (p) {
    const billing=patientBillingAction({...option,effects:e},card,chargeTreatment);
    if(billing)beginBudgetSettlement(r,p);
    p.spent = Math.max(
      0,
      p.spent + (chargeTreatment ? treatmentCost(r, option) : 0) + ((e.bill??0)>0||'authoredEventId'in card||card.billing==='spending'?(e.bill??0):0),
    );
    if (e.bill && e.bill < 0 && !('authoredEventId'in card) && card.billing!=='spending') {
      p.budget += -e.bill;
      const total=patientLiability(r,p);reconcileTeamCharge(r,p,total);
      const revisedCharge = playerBillableLiability(r,p,total);
      const refund = Math.max(0, p.charged - revisedCharge);
      r.cash += refund;
      p.charged -= refund;
    }
    // Damage is an ordinal severity, not hit points. Two serious nonfatal
    // incidents do not imply a death that the story never established.
    if (e.damage) {
      const priorDamage=p.damage;p.damage = Math.max(p.damage, Math.min(3, e.damage));
      if(priorDamage<3&&p.damage===3&&p.caseId!=='C020')flag(r,`patient-death:${p.uid}`,option.id);
    }
    if (e.mitigate) {
      p.mitigated += e.mitigate;
    }
    p.stability = clamp(p.stability + (e.stability ?? 0), 0, 3);
    p.patience = clamp(p.patience + (e.patience ?? 0), 0, 100);
    if (e.care) p.caredDay = r.day;
    if ((e.patience ?? 0) > 0) p.explainedDay = r.day;
    if (e.discharge) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      delete r.facts[`observation:${p.uid}`];
      p.dischargedDay = r.day;
      p.planned = !!e.plannedDischarge;
      if (card.kind === 'clinical') flag(r, `clinical-departure:${p.uid}`, option.id);
    }
    const pendingBodyTransfer=p.caseId==='C020'&&p.clinical&&!p.clinical.outcomeId&&!p.clinical.flags.includes('body_transferred');
    if (p.damage >= 3&&!pendingBodyTransfer) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      delete r.facts[`observation:${p.uid}`];
    }
    if(billing)billPatient(r,p.uid,option.id);
  }
  addHazards(r, e, card, option);
}
function deltas(before: Run, after: Run): string[] {
  const parts: string[] = [];
  for (const key of Object.keys(VITAL_LABELS) as Vital[]) {
    const n = after.vitals[key] - before.vitals[key];
    if (n) parts.push(`${VITAL_LABELS[key]} ${n > 0 ? "+" : ""}${displayNumber(n)}`);
    const cap = after.caps[key] - before.caps[key];
    if (cap) parts.push(`${VITAL_LABELS[key]}上限 ${cap > 0 ? "+" : ""}${displayNumber(cap)}`);
  }
  if (after.cash !== before.cash)
    parts.push(
      `余额 ${after.cash - before.cash > 0 ? "+" : "−"}¥${Math.abs(after.cash - before.cash).toLocaleString("zh-CN")}`,
    );
  if (after.debt !== before.debt)
    parts.push(
      `信用负债 ${after.debt - before.debt > 0 ? "+" : "−"}¥${Math.abs(after.debt - before.debt).toLocaleString("zh-CN")}`,
    );
  if(after.privateDebt!==before.privateDebt)parts.push(`私人借款 ${after.privateDebt-before.privateDebt>0?'+':'−'}¥${Math.abs(after.privateDebt-before.privateDebt).toLocaleString('zh-CN')}`);
  if(after.income!==before.income)parts.push(`当日收入 ${after.income-before.income>0?'+':'−'}¥${Math.abs(after.income-before.income).toLocaleString('zh-CN')}`);
  if(after.reputation!==before.reputation)parts.push(`声望 ${after.reputation-before.reputation>0?'+':''}${displayNumber(after.reputation-before.reputation)}`);
  if(after.depression!==before.depression)parts.push(`抑郁倾向 ${after.depression-before.depression>0?'+':''}${displayNumber(after.depression-before.depression)}`);
  for (const k of Object.keys(RELATION_LABELS) as (keyof Run["relations"])[]) {
    const n = after.relations[k] - before.relations[k];
    if (n) parts.push(`${RELATION_LABELS[k]} ${n > 0 ? "+" : ""}${displayNumber(n)}`);
  }
  if (after.ap !== before.ap) parts.push(`行动值 ${after.ap - before.ap}`);
  if(after.overtime>before.overtime)parts.push(`透支行动 +${after.overtime-before.overtime}`);
  if(after.nightMinutes!==before.nightMinutes)parts.push(`夜班剩余时间 ${after.nightMinutes-before.nightMinutes>0?'+':''}${after.nightMinutes-before.nightMinutes} 分钟`);
  for(const id of before.debuffs.filter(id=>!after.debuffs.includes(id))){const name=DEBUFFS.find(d=>d.id===id)?.name;if(name)parts.push(`「${name}」已解除`);}
  for (const p of after.patients) {
    const prior = before.patients.find(x => x.uid === p.uid);
    if (prior && p.spent > prior.spent) parts.push(`诊疗记账 +¥${(p.spent - prior.spent).toLocaleString("zh-CN")}`);
    if (prior && p.charged > prior.charged) parts.push(`超支自付 ¥${(p.charged - prior.charged).toLocaleString("zh-CN")}（已计入余额变动）`);
  }
  return parts;
}
function stop(r: Run, kind: Parameters<typeof earlyEnding>[1], occurredPhase=interruptionPhase(r)) {
  if(r.authored) applyDirector(r,settleAuthoredEvents(r,r.shiftPhase??'日终',true));
  r.ending = earlyEnding(r, kind, occurredPhase);
  delete r.pendingCheck;delete r.emergency;delete r.pendingResume;
  r.phase = "ending";
}
function touchPatient(r:Run,card:Card) {
  const p=r.patients.find(p=>p.uid===card.patientId);
  if(p&&currentClinicalHandoff(r,p)&&isDirectPatientCare(card))return;
  // A chief's request or a colleague's handover does not put the player at
  // that patient's bedside. Do not spend first-contact abilities or reveal
  // patient clues before an actual encounter or an agreed clinical takeover.
  if(p&&!isPlayerResponsibleForPatient(r,p)&&!card.clinicalGraph&&!card.presetNode)return;
  touchArchive(r,card);
  if(!p||r.emergency||p.damage>=3)return;
  for(const contact of firstContact(r,p)) {
    applyTalent(r,contact.hook,`contact:${p.uid}`,card);
    if(contact.patientPatch)Object.assign(p,contact.patientPatch);
    if(contact.text) {
      r.journal.push({id:`contact:${p.uid}:${r.journal.length}`,day:r.day,title:'初次接触',choice:'走到患者身边',result:contact.text,scope:card.scope,flags:contact.hook.effects.flags??[]});
      if(!card.text.includes(contact.text))card.text+=`\n${contact.text}`;
    }
  }
  interrupt(r,card);
}
function touchArchive(r:Run,card:Card) {
  for(const notice of archiveNotices(r,card)) {
    flag(r,notice.flag,card.id);
    card.text+=`\n${notice.text}`;
    r.journal.push({id:notice.flag,day:r.day,title:'病例复盘经验',choice:'对照以前的病例',result:notice.text,scope:card.scope,flags:[notice.flag]});
  }
}
function interrupt(r: Run, sourceCard?:Card) {
  if(r.emergency || r.phase==='ending')return;
  const occurredPhase=interruptionPhase(r,sourceCard);
  for (const vital of ["san", "stamina", "emotion"] as Vital[]) {
    if (r.vitals[vital] > 0) continue;
    if(vital==='san') {
      const previous=recordedSanBreaks(r);
      r.sanBreaks=previous+1;
      flag(r,'san-ever-zero',sourceCard?.id??`san-zero:${r.day}`);
      if(previous>=RULES.sanRescueChances){stop(r,'san',occurredPhase);return;}
    }
    const survival=talent.talentSurvival(talentContext(r),vital,liveCap(r,vital));
    if (survival.rescued) {
      r.vitals[vital]=survival.value;
      applyTalent(r,survival,`survival:${vital}`);
      flag(r,'survival-used','T23');
      if(r.vitals[vital]<=0)r.vitals[vital]=1;
      continue;
    }
    if(vital==='stamina' && r.exhausted>=1) {
      r.exhausted++;
      stop(r,'stamina',occurredPhase);
      return;
    }
    if(vital==='emotion'&&r.emotionalBreaks>=1) {
      r.emotionalBreaks++;
      stop(r,'emotion',occurredPhase);
      return;
    }
    const immediate=forceZeroEvent(r,vital,occurredPhase,sourceCard?.patientId);
    const card=immediate.cards[0];
    if(!card)throw new Error(`Missing acute event for ${vital}`);
    const resume=captureContinuation(r);
    applyDirector(r,immediate);
    r.queue=r.queue.filter(c=>c.id!==card.id);
    card.last=false;card.shiftPhase=occurredPhase;
    r.queue.splice(r.cursor,0,card);
    r.emergency={cardId:card.id,vital,resolved:false,occurred:{day:r.day,phase:occurredPhase},resume};
    if(vital==='stamina')r.exhausted++;
    if(vital==='emotion')r.emotionalBreaks++;
    delete r.pendingCheck;
    r.phase='play';
    return;
  }
  if (r.debt > RULES.debtMax) {
    stop(r, "debt");
    return;
  }
  if (r.cash < 0) {
    r.pendingResume = resumePhase(r);
    if(r.pendingResume!=='feedback')delete r.feedback;
    r.phase = "funding";
  }
}
function prepareChoiceRoll(r:Run,option:Option,card:Card) {
  if(option.chanceCheck) {
    const face=runDie(r,`check:${option.id}`),dc=option.chanceCheck.successAtLeast;
    r.roll={id:option.id,kind:'choice',chance:true,label:option.check?.purpose??card.title,face,modifier:0,dc,success:face>=dc,critical:null,revision:0};
    r.pendingCheck={kind:'choice',day:r.day,cardId:card.id,optionId:option.id,context:{operation:'other',actor:'other',patientId:card.patientId},rerolls:0};
    r.phase='roll';return;
  }
  const patient=r.patients.find(p=>p.uid===card.patientId),adjustment=patient?patientCheckAdjustment(r,patient,option):undefined;
  const baseContext=checkContext(r,card,option);
  const context={...baseContext,advantage:baseContext.advantage||adjustment?.advantage,disadvantage:baseContext.disadvantage||adjustment?.disadvantage},mod=talent.talentCheck(talentContext(r),context);
  const modifier=previewCheckModifier(r,option,card),dc=checkDifficulty(r,option,card);
  r.roll=rollPatientCheck(r,{id:option.id,label:option.check?.purpose??card.title,modifier,dc,advantage:mod.advantage,disadvantage:mod.disadvantage,parties:patientCheckParties(r,patient,option)});
  r.roll.modifierSources=previewCheckSources(r,option,card);r.roll.difficultySources=checkDifficultySources(r,option,card);
  if(adjustment?.automaticFailure)Object.assign(r.roll,{success:false,critical:null,blockedReason:'患者无法独立提供可靠病史，现场没有可核实的陪同者。需要寻找其他病史来源。'});
  r.pendingCheck={kind:'choice',day:r.day,cardId:card.id,optionId:option.id,context,rerolls:0};
  r.phase='roll';
}
function acknowledgeLeaveHandoff(r:Run,card:Card) {
  const option=leaveHandoffOption(card);
  if(r.committed.includes(option.id))return;
  r.committed.push(option.id);
  r.journal.push({id:option.id,day:r.day,title:card.title,choice:option.label,result:option.result,scope:card.scope,flags:[]});
  delete r.pendingCheck;
  r.cursor++;
  r.phase='feedback';
  r.feedback={title:'停诊交接',text:option.result,changes:[],next:'play'};
}
function deferPatient(r:Run,patientId:string,source:string,reason:'ap-empty'|'half-leave'):string|undefined {
  const work=captureDeferredWork(r,patientId,source,reason);if(!work)return;
  const card=work.cards[0],p=r.patients.find(p=>p.uid===patientId)!;
  const effects=deferredWorkEffects(patientId,r.day),text=`${p.name}今天的处置没有完成。未处理事项已写进交班单，明天仍需接着处理；等待期间的风险由原有诊疗经过和后续病情决定。`;
  const option:Option={id:source,label:reason==='ap-empty'?'今天先不处理，留给明天':'离岗半天，未完成的患者处置留待次日',ap:0,minutes:0,cost:0,result:text,effects};
  applyEffects(r,effects,card,option,false);r.committed.push(source);
  r.journal.push({id:source,day:r.day,title:`${p.name}的待办`,choice:option.label,result:text,scope:card.scope,flags:effects.flags});
  return text;
}
function commitChoice(r: Run, option: Option, card: Card, before: Run, acceptedRoll?:Roll) {
  const handedPatient=r.patients.find(p=>p.uid===card.patientId);
  if(handedPatient&&currentClinicalHandoff(r,handedPatient)&&isDirectPatientCare(card)){
    delete r.pendingCheck;r.committed.push(option.id);r.cursor++;
    r.phase='feedback';r.feedback={sourceCardId:card.id,title:'交班记录',text:option.result,changes:[],next:'play'};
    return;
  }
  r.committed.push(option.id);
  const ap=optionAp(r,option,card);
  const minutes = actionMinutes(r, option, card);
  if (card.kind !== 'night') spendAp(r, ap);
  if (card.kind === "night") {
    const baseline=nightClinicalCharge(r,card,option);
    r.vitals.stamina-=baseline.stamina;r.vitals.san-=baseline.san;
    if(baseline.key)flag(r,baseline.key,option.id);
    flag(r,`worked-night:${r.day}`,option.id);
    if(isNewNightClinicalIncident(card,r))flag(r,nightClinicalIncidentKey(card),option.id);
    r.nightMinutes -= minutes;
    const nightEncounter=card.patientId??card.id;
    if(baseline.key&&!r.facts[`night-started:${nightEncounter}`]) {
      flag(r,`night-started:${nightEncounter}`,option.id);
    }
    if (r.nightMinutes < 0) {
      r.vitals.stamina -= RULES.nightOverrun.stamina;
      r.vitals.san -= RULES.nightOverrun.san;
      flag(r, `night-overrun:${r.day}`, option.id);
    }
  }
  const operation=costContext(r,card,option).operation;
  const extraStamina=talent.talentCosts(talentContext(r),{ap:0,minutes:0,cost:0,stamina:0},costContext(r,card,option)).stamina;
  r.vitals.stamina-=Math.ceil(extraStamina);
  let effects = option.effects,
    result = option.result,
    showRoll = false;
  let checkSuccess = true;
  const telephone=option.id===nightTelephoneId(card);
  const telephoneIncident=telephone&&isNewNightClinicalIncident(card,before);
  const telephoneHarm=telephone&&nightTelephoneDeteriorates(before,card);
  if(telephone&&card.patientId)flag(r,telephoneIncident?`night-telephone-incident:${card.id}`:`night-telephone:${card.patientId}`,option.id);
  let graphAdvance: GraphAdvance | undefined;
  let stopLocalCare=false;
  if (option.check) {
    if(!acceptedRoll)throw new Error('Check must be accepted before committing treatment');
    const {face,success}=acceptedRoll;
    checkSuccess = success;
    r.roll=acceptedRoll;
    if(!acceptedRoll.chance)r.talentMemory=talent.commitTalentCheck(talentContext(r),checkContext(r,card,option));
    if ('authoredEventId' in card&&!('butterfly'in card)) {
      effects=authoredChoiceEffects(option as EventOption,success);
      if(!success)result=option.check.failureText;
    } else if (!success && !card.clinicalGraph) {
      effects = {
        ...option.check.failure,
        cash: (option.effects.cash ?? 0) + (option.check.failure.cash ?? 0),
      };
      result = option.check.failureText;
    }
  }
  const graphPatient = card.clinicalGraph ? r.patients.find(p => p.uid === card.patientId) : undefined;
  if(option.talentAction) {
    const ability=resolveAbility(r,card,option,checkSuccess);
    applyTalent(r,ability.hook,option.id,card);
    const abilityPatient=r.patients.find(p=>p.uid===card.patientId);
    if(abilityPatient&&ability.patientPatch)Object.assign(abilityPatient,ability.patientPatch);
    result=ability.text;effects=ability.hook.effects;stopLocalCare=!!ability.stopLocalCare;
    if(ability.leaveTomorrow)r.skipNextDay=true;
  } else if (graphPatient && option.clinicalChoice) {
    graphAdvance = progressClinical(r, graphPatient, option, checkSuccess, minutes, ap);
    // The death-investigation case begins after a collapse discovered by staff.
    // Confirmation changes the patient's condition, not the player's causal
    // responsibility. Its evidence/consent graph must remain available.
    if(graphPatient.caseId==='C020'&&graphPatient.clinical?.flags.includes('death_confirmed'))graphPatient.damage=3;
    applyEffects(r, {}, card, option);
    const applied = graphAdvance.effects.map(effect => scopedClinicalEffects(graphPatient, effect));
    for (const effect of applied) applyEffects(r, effect, card, option, false);
    effects = { flags: applied.flatMap(e => e.flags ?? []) };
    result = [...new Set([graphAdvance.actionText, graphAdvance.text].filter(Boolean))].join('\n');
  } else if('butterfly'in card||'butterflyMerge'in card) {
    // Quoted effects are visible on the option; the scoped graph transaction
    // below applies them once alongside its repayment and commitment facts.
    applyEffects(r,{},card,option);
  } else applyEffects(r, effects, card, option);
  if(acceptedRoll?.critical) {
    const critical=criticalConsequence(r,card,option,acceptedRoll);
    applyEffects(r,critical.effects,card,{...option,id:`${option.id}:critical`},false);
    const p=r.patients.find(p=>p.uid===card.patientId);
    if(p&&critical.patientPatch)Object.assign(p,critical.patientPatch);
    if(critical.text)result=[result,critical.text].filter(Boolean).join('\n');
  }
  if(!option.talentAction||option.talentAction==='counselling') {
    const followup=afterAuthoredChoice(r,card,option,checkSuccess);
    applyDirector(r,followup);
    finalizeFamilyPayments(r);
    result=[...new Set([result,...followup.effects.map(effect=>effect.text)].filter(Boolean))].join('\n');
  }
  if(card.patientId&&r.debuffs.includes('B11')&&['unrest_2_success','unrest_3_success'].some(flag=>r.facts[`clinical:${card.patientId}:${flag}`]?.source===option.id))
    applyTalent(r,talent.talentRecover(talentContext(r),'dispute-ended'),`${option.id}:dispute-recovery`,card);
  if((card as Card&{authoredEventId?:string}).authoredEventId==='E-197'&&option.id.endsWith('E-197-c')) {
    for(const p of r.patients.filter(p=>deferrablePatientCards(r,p.uid).length)) {
      const text=deferPatient(r,p.uid,`${option.id}:defer:${p.uid}`,'half-leave');if(text)result+=`\n${text}`;
    }
  }
  if(card.patientId && !option.talentAction && !['hallucination','graph-continue'].includes(option.interaction??'')) {
    flag(r,`cost-started:${card.patientId}`,option.id);
    const after=talent.talentAfterAction(talentContext(r),{id:option.id,operation,patientId:card.patientId,proactive:operation==='consult',correctCare:option.mechanics?.quality==='correct'});
    applyTalent(r,after,`${option.id}:talent-action`,card);
    const p=r.patients.find(p=>p.uid===card.patientId);
    if(p)p.patience=clamp(p.patience+after.patientTrust,0,100);
    if(p&&after.complaintDelta<0)flag(r,patientComplaintReliefFlag(p,option),option.id);
    applyTalent(r,talent.talentDelayedRecord(talentContext(r),card.patientId,option.id,operation,runRandom(r,`late-note:${option.id}`)),`${option.id}:late`,card);
  }
  const presetPatient = card.presetNode ? r.patients.find(p=>p.uid===card.patientId) : undefined;
  const presetDone = !!presetPatient && isPresetEnd(option.next);
  if (presetDone) presetPatient!.presetResolved = true;
  if(telephone&&card.patientId){
    const p=r.patients.find(p=>p.uid===card.patientId)!;
    if(telephoneHarm){
      p.damage=Math.max(2,p.damage);
      for(const h of r.hazards.filter(h=>h.choiceId===option.id&&h.type==='R'))h.causal=true;
      result+='\n二线随后回报：患者在等待期间病情恶化，发生严重临床损害。接诊时间、电话记录与后续抢救经过将一并复核。';
    }else result+='\n二线完成接手，暂未回报新的严重临床损害。';
  }
  const terminal = !!card.patientId && (telephone&&!telephoneIncident||!!graphAdvance?.outcome || (card.presetNode ? presetDone : card.last || card.kind === 'night'&&!card.clinicalGraph&&card.last!==false&&!isPatientGate(card)&&!('authoredEventId'in card)));
  if (terminal && !['hallucination','ability'].includes(option.interaction??'')) {
    const p = r.patients.find((x) => x.uid === card.patientId)!;
    const risks = r.hazards
      .filter(
        (h) =>
          h.scope.kind === "patient" &&
          h.scope.id === p.uid &&
          h.type === "R" &&
          h.causal,
      )
      .reduce((n, h) => n + h.weight, 0);
    if (!telephone&&!card.clinicalGraph && card.last && risks >= 15 && p.damage < 2 && p.caseId !== "C020") {
      const face = runDie(r, `course:${p.uid}`),
        dc = clamp(4 + Math.floor(risks / 6) - p.mitigated * 3, 2, 19);
      const success = face === 20 || (face !== 1 && face >= dc);
      r.roll = {
        id: `course:${p.uid}`,
        kind: "choice",
        label: "交班之后 · 病情转归",
        face,
        dc,
        modifier: 0,
        success,
      };
      showRoll = true;
      if (!success) {
        p.damage = face === 1 && risks >= 60 ? 3 : 2;
        result +=
          p.damage === 3
            ? "患者在交班后病情恶化，经抢救无效死亡。调查人员将核对你此前的处置记录。"
            : "患者在交班后病情恶化，受到严重临床损害。二线接管了救治，复核人员将查看你此前的处置记录。";
      } else
        result +=
          "截至本次交班，没有出现新的严重临床损害；已经留下的处置隐患仍在记录中。";
    }
    p.settled = true;
    if (p.damage === 0 && p.caseId !== "C020"&&!telephone) {
      p.stability = Math.max(1, p.stability);
      r.vitals.san = Math.min(r.caps.san, r.vitals.san + 3);
      if (!has(r, "B12"))
        r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 5);
    }
    if(!telephone&&(presetDone||card.kind==='clinical'||card.kind==='night')){
      const unresolvedRisk=r.hazards.some(h=>h.scope.kind==='patient'&&h.scope.id===p.uid&&h.weight>0);
      income(r,patientPerformance(r,p,{period:card.kind==='night'?'night':'day',quality:p.damage>=2?'none':p.damage>0||unresolvedRisk?'ordinary':'good'}).amount);
    }
    if (p.damage === 3) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      if ((before.patients.find(x => x.uid === p.uid)?.damage ?? 0) < 3) {
        if(p.caseId!=='C020'&&!r.facts[`patient-death:${p.uid}`])flag(r,`patient-death:${p.uid}`,option.id);
        r.vitals.san -= has(r, "B12") ? 5 : 15;
      }
      applyTalent(r,talent.talentConcealDeath(talentContext(r),p.uid,r.hazards),`conceal-death:${p.uid}`,card);
    }
    const disposition=clinicalDisposition(p);
    if(['transfer','self-transfer','home'].includes(disposition.kind)) {
      p.active=false;p.inpatient=false;p.bed=0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      delete r.facts[`observation:${p.uid}`];
      flag(r,`clinical-departure:${p.uid}`,option.id);
      // Graph outcomes already own their clinical follow-up. Do not set the
      // legacy ward-discharge date and roll a second, unrelated readmission.
    }
    if (!p.inpatient && !awaitingBed(r, p)&&!underObservation(r,p)) p.active = false;
  }
  if(graphPatient?.active&&!graphPatient.inpatient&&!r.facts[`clinical-departure:${graphPatient.uid}`]) {
    const admitted=completedAdmissionChoice(graphPatient);
    if(admitted&&!r.facts[`clinical-admission:${graphPatient.uid}`]) {
      assignBed(r,graphPatient);
      flag(r,`clinical-admission:${graphPatient.uid}`,option.id);
    }
  }
  const auxiliary=['hallucination','ability'].includes(option.interaction??'');
  if(auxiliary&&graphPatient?.clinical) {
    graphPatient.clinical.minutes+=minutes;
    graphPatient.clinical.ap+=ap;
  }
  if (!auxiliary) flag(r, `seen:${card.id}`, option.id);
  if(acceptedRoll?.group)result+=`\n${patientGroupResultText(acceptedRoll)}`;
  r.journal.push({
    id: option.id,
    operation,
    clinicalChoice:option.clinicalChoice,
    talentAction:option.talentAction,
    day: r.day,
    title: card.title,
    choice: option.label,
    result,
    scope: card.scope,
    flags: effects.flags ?? [],
  });
  r.feedback = {
    sourceCardId:card.id,
    title: card.title,
    text: result,
    changes: deltas(before, r),
    next: card.kind === "rest" && !auxiliary && !('authoredEventId'in card) ? "check" : "play",
  };
  if (!auxiliary) r.cursor++;
  if (graphPatient && graphAdvance && !graphAdvance.outcome) {
    const next = clinicalCard(r, graphPatient);
    if (next) r.queue.splice(r.cursor, 0, next);
  }
  if (presetPatient && !presetDone && !auxiliary && !telephone && option.interaction!=='transfer') {
    if (!option.next) throw new Error(`Preset choice has no next: ${option.id}`);
    const next = presetCard(r, presetPatient, option.next, card.kind);
    if (next) r.queue.splice(r.cursor, 0, next);
  }
  const interacted=r.patients.find(p=>p.uid===card.patientId);
  if(interacted&&!auxiliary) {
    const actual=graphAdvance?.effects.reduce<Effects>((sum,e)=>({...sum,...e,flags:[...(sum.flags??[]),...(e.flags??[])],hazards:[...(sum.hazards??[]),...(e.hazards??[])]}),effects)??effects;
    const patientResult=afterPatientChoice(r,interacted,card,option,checkSuccess,terminal,actual);
    if(patientResult.patch)Object.assign(interacted,patientResult.patch);
    if(patientResult.effects)applyEffects(r,patientResult.effects,card,option,false);
    if(patientResult.cards?.length)r.queue.splice(r.cursor,0,...patientResult.cards.filter(c=>!r.queue.some(old=>old.id===c.id)));
    if(patientResult.stopLocalCare)stopLocalCare=true;
  }
  if(interacted&&(option.interaction==='transfer'||stopLocalCare)) {
      interacted.active=false;interacted.inpatient=false;interacted.bed=0;
      flag(r,option.talentAction==='transfer'||option.interaction==='transfer'?`local-care-transferred:${interacted.uid}`:`local-care-ended:${interacted.uid}`,option.id);
      r.queue=r.queue.filter((c,i)=>i<r.cursor||c.patientId!==interacted.uid||!['clinical','night','ward','quick'].includes(c.kind)||'authoredEventId'in c||c.last===false&&!c.clinicalGraph&&!c.presetNode&&!isPatientGate(c));
  }
  if(graphPatient&&auxiliary&&!stopLocalCare) {
    const refreshed=clinicalCard(r,graphPatient);
    if(refreshed)r.queue[r.cursor]=refreshed;
  }
  // A bedside conversation may change the clinical node (for example, a
  // recorded refusal of lumbar puncture). Rebuild the queued snapshot from
  // the actual patient's updated graph instead of replaying the old node.
  const resume=(card as Partial<ClinicalEventCard>).clinicalResume;
  if(resume&&!auxiliary) {
    const patient=r.patients.find(p=>p.uid===resume.patientId);
    if(patient) {
      const index=r.queue.findIndex((c,i)=>i>=r.cursor&&c.patientId===patient.uid&&!!(c.clinicalGraph||c.presetNode));
      const previous=index>=0?r.queue[index]:undefined;
      const next=patient.clinical?clinicalCard(r,patient):presetCard(r,patient,patient.presetNode,previous?.kind??'quick');
      if(next) {
        next.shiftPhase=previous?.shiftPhase??card.shiftPhase;
        if(index>=0)r.queue[index]=next;
        else r.queue.splice(r.cursor,0,next);
      } else if(index>=0)r.queue.splice(index,1);
    }
  }
  if(!auxiliary&&!telephone&&!stopLocalCare) {
    const pending=pendingClinicalEvent(r,card,option);
    applyDirector(r,pending);
    // The event belongs between the action just taken and the patient's next
    // step. Keep completed cards and all unrelated pending scenes intact.
    const ids=new Set(pending.cards.map(c=>c.id));
    const events=r.queue.filter((c,i)=>i>=r.cursor&&ids.has(c.id));
    r.queue=r.queue.filter((c,i)=>i<r.cursor||!ids.has(c.id));
    r.queue.splice(r.cursor,0,...events);
  }
  // A departed patient has no remaining bedside visit in this ward. Preserve
  // the completed card and all clinical/audit records; remove only future rounds.
  r.queue = r.queue.filter((pending, index) => {
    if (index < r.cursor) return true;
    const patient = r.patients.find(p => p.uid === pending.patientId);
    if (patient?.damage === 3 && ['clinical', 'night', 'ward'].includes(pending.kind)&&!(pending.clinicalGraph?.caseId==='C020'&&!patient.clinical?.outcomeId)) return false;
    return pending.kind !== 'ward' || !!patient?.active;
  });
  r.phase = showRoll ? "roll" : "feedback";
  const requested=option.talentAction?undefined:authoredRequestedEnding(r,card,option,checkSuccess);
  if(requested==='X31'||requested==='X32') {
    // E-209 confirms the resignation already requested from the settlement page.
    flag(r,'quit-confirmed',option.id);
    stop(r,'quit');
    return;
  }
  if(requested) {
    applyDirector(r,settleAuthoredEvents(r,r.shiftPhase??'日终',true));
    r.ending=documentedEnding(r,requested,{requested});r.phase='ending';delete r.emergency;delete r.pendingCheck;delete r.pendingResume;
    return;
  }
  if(r.emergency?.cardId===card.id) {
    if(r.emergency.vital==='emotion'&&r.emotionalBreaks>=2) {stop(r,'emotion');return;}
    r.emergency.resolved=true;
    r.feedback!.changes=deltas(before,r);
    return;
  }
  if(r.feedback)r.feedback.changes=deltas(before,r);
  interrupt(r,card);
  if(r.phase==='feedback'&&option.interaction==='graph-continue'&&!r.feedback?.text&&!r.feedback?.changes.length){
    r.phase='play';delete r.feedback;
  }
}
function endDay(r: Run) {
  applyDirector(r,settleAuthoredEvents(r,'日终'));
  if(!r.facts[`day-ledger-settled:${r.day}`]){
  const pressure = RULES.pressure[r.day - 1];
  r.vitals.san -= pressure;
  r.vitals.emotion -= Math.ceil(pressure / 2);
  r.cash -= RULES.living;
  applyTalent(r,talent.talentDayEnd(talentContext(r),{emotion:r.vitals.emotion,san:r.vitals.san,reputation:r.reputation,relations:r.relations,debt:r.debt,fullSleep:!!r.facts[`slept:${r.day}`],coffeeCount:r.coffee}),`talent-day-end:${r.day}`);
  if (r.vitals.emotion < 30) r.depression += 8;
  else if (r.vitals.emotion > 60) r.depression -= 2;
  if (hasWorkedNight(r)) r.depression += 3;
  r.depression = clamp(r.depression, 0, 100);
  if (r.depression >= 50 && !r.facts["depression-cap"]) {
    capLoss(r, 5);
    flag(r, "depression-cap", "day-end");
  }
  for (const p of r.patients.filter((x) => x.active && (x.inpatient || awaitingBed(r, x)||underObservation(r,x)))) {
    beginBudgetSettlement(r,p);
    const responsible=isPlayerResponsibleForPatient(r,p);
    const overdue = r.day - p.admitted + 1 > p.expectedDays;
    p.spent += Math.round(
      Math.max(0,(p.inpatient ? p.dailyBaseCost??(p.preset?Math.ceil(p.preset.baseCost/p.expectedDays):RULES.ward.dailyCost) : RULES.ward.observationDailyCost)+authoredTuning(r,{kind:'patient',id:p.uid}).patientDailyCost) * (overdue ? RULES.ward.overdueMultiplier : 1),
    );
    p.patience = Math.max(
      0,
      p.patience -
        RULES.ward.patienceDaily -
        (overdue && p.explainedDay !== r.day ? RULES.ward.patienceOverdue : 0),
    );
    if (overdue && !r.facts[`budget-cut:${p.uid}`]) {
      p.budget = Math.round(p.budget * (1 - RULES.ward.extensionRate));
      flag(r, `budget-cut:${p.uid}`, "insurance-overstay");
    }
    if (responsible &&
      p.patience <= RULES.ward.lowPatience &&
      !r.facts[`complaint:${p.uid}`]
    ) {
      flag(r, `complaint:${p.uid}`, "family-overstay");
      r.vitals.emotion -= 8;
      r.reputation -= 3;
      r.journal.push({
        id: `complaint:${p.uid}`,
        day: r.day,
        title: "住院期间的投诉",
        choice: "长期住院，家属提交费用与沟通记录",
        result:
          "家属保存了缴费单，向医务科要求说明住院依据。投诉本身不等于处置过错。",
        scope: { kind: "patient", id: p.uid },
        flags: [],
      });
    }
    billPatient(r, p.uid,`ward-billing:${r.day}:${p.uid}`);
    const handoff=currentClinicalHandoff(r,p);
    if(handoff){
      p.caredDay=r.day;
      r.journal.push({id:`handoff-care:${p.uid}:${r.day}`,day:r.day,title:handoffLabel(handoff),choice:'核对本班交接责任',result:'接班者负责交接清单内的工作。未回报的检查和尚未完成的诊断仍留在病历中，下次交班继续核对。',scope:{kind:'patient',id:p.uid},flags:[]});
    }else if(!responsible){
      p.caredDay=r.day;p.explainedDay=r.day;p.stability=Math.min(RULES.ward.stabilityNeed,p.stability+1);
      r.journal.push({id:`team-care:${p.uid}:${r.day}`,day:r.day,title:'主管组查房',choice:'原主管组完成床旁复评',result:'主管组记录了复评与费用，尚未交由你接管。',scope:{kind:'patient',id:p.uid},flags:[]});
      if(r.day-p.admitted+1>=p.expectedDays&&p.stability>=RULES.ward.stabilityNeed){p.active=false;p.inpatient=false;p.bed=0;p.planned=true;p.dischargedDay=r.day;flag(r,`team-discharge:${p.uid}`,`team-care:${p.uid}:${r.day}`);delete r.facts[`awaiting-bed:${p.uid}`];}
    }
  }
  if (RULES.wageDays.includes(r.day as never)) income(r, RULES.wages);
  recordDailyIncome(r);
  r.interest = Math.ceil(
    r.debt * talent.talentInterestRate(talentContext(r),RULES.debtRate),
  );
  r.debt += r.interest;
  // A day off has no scheduled work: it neither adds an uncovered day nor
  // clears the count that scheduled days already produced.
  if(!isFullDayLeave(r))r.uncoveredDays = r.interest > 0 && r.interest > incomeCoverage(r).daily ? r.uncoveredDays + 1 : 0;
  flag(r,`day-ledger-settled:${r.day}`,'day-end');
  }
  if (r.uncoveredDays >= RULES.debtGrace) {
    stop(r, "interest");
    return;
  }
  const notices=lateWeeklyBudgetEvents(r);
  if(notices.cards.length){applyDirector(r,notices);r.phase='play';r.shiftPhase='日终';interrupt(r);return;}
  const first = runDie(r, `day:${r.day}`),
    second = r.vitals.san < RULES.perception.fractured ? runDie(r, `day:${r.day}:disadvantage`) : undefined,
    face = second === undefined ? first : Math.min(first, second),
    modifier = skillModifier(r, "endure"),
    dc = RULES.dc[r.day - 1] + (r.difficulty === "attending" ? 2 : 0)+talent.talentCheck(talentContext(r),{operation:'day-end',actor:'other'}).dcDelta;
  const outcome=talent.talentRollOutcome(talentContext(r),face,modifier,dc);
  r.roll = {
    id: `day:${r.day}`,
    kind: "day",
    face,
    second,
    modifier,
    dc,
    ...outcome,
    label: "日终 · 扛住这一夜",
    modifierSources:skillModifierSources(r,'endure'),
    difficultySources:[{id:'day',label:'当日压力门槛',value:RULES.dc[r.day-1]},{id:'mode',label:'主治难度',value:r.difficulty==='attending'?2:0},{id:'traits',label:'天赋与持续状态',value:talent.talentCheck(talentContext(r),{operation:'day-end',actor:'other'}).dcDelta}].filter(t=>t.value!==0),
  };
  r.phase = "roll";
  r.pendingCheck={kind:'day',day:r.day,context:{operation:'day-end',actor:'other',disadvantage:second!==undefined},rerolls:0};
  interrupt(r);
}
function returns(r: Run) {
  for (const p of r.patients.filter(
    (x) =>
      !x.active && x.damage < 3 && !x.planned && x.dischargedDay !== undefined && !x.readmitted && !!playerEarlyDischargeSource(r,x) && !r.facts[`local-care-transferred:${x.uid}`],
  )) {
    if (r.day <= p.dischargedDay!) continue;
    if (runRandom(r, `return:${p.uid}`) < RULES.ward.earlyReturnChance) {
      p.readmitted = true;
      p.active = true;
      p.bed = 0;
      p.inpatient = false;
      assignBed(r, p);
      p.settled = true;
      p.damage = Math.max(2, p.damage);
      p.stability = 0;
      p.patience = 5;
      flag(r, `readmitted:${p.uid}`, `early-discharge:${p.uid}`);
      r.journal.push({
        id: `return-outcome:${p.uid}`,
        day: r.day,
        title: "出院后病情恶化",
        choice: r.facts[`family-record:${p.uid}`]?"家属携录音与出院小结回院":"家属携出院小结回院",
        result:
          "患者出现严重临床损害。抢救、原有出院决定与损害之间的关系进入调查。",
        scope: { kind: "patient", id: p.uid },
        flags: [`readmitted:${p.uid}`],
      });
    } else flag(r, `return-not-observed:${p.uid}`, "followup");
    // A fixed per-patient result is resolved once, never retried each day.
    p.planned = true;
  }
}
function nextDay(r: Run) {
  const forecast=nextShiftForecast(r,0,false);
  r.day++;
  returns(r);
  const deferred=resolveDeferredWork(r);
  if (r.day > RULES.days) {
    r.queue=buildTribunalPreparation(r);r.cursor=0;r.shiftPhase='交班';
    r.phase=r.queue.length?'play':'tribunal';
    return;
  }
  r.borrowed = 0;
  r.overtime = 0;
  applyTalent(r,talent.talentDayStart(talentContext(r)),`talent-day-start:${r.day}`);
  r.ap=forecast.ap;
  r.vitals.stamina=Math.max(1,forecast.stamina);
  r.vitals.san = Math.min(
    r.caps.san,
    r.vitals.san + 5 + (r.relations.family >= 3 ? 2 : 0),
  );
  const recovered=talent.talentAutomaticRecovery(talentContext(r),{san:r.vitals.san,reputation:r.reputation,relations:r.relations,debt:r.debt});
  r.debuffs=r.debuffs.filter(id=>!recovered.includes(id));
  recordRecoveredStatuses(r,recovered,`morning:${r.day}`);
  r.coffee = 0;
  r.nap = false;
  r.income = 0;
  r.interest = 0;
  r.cursor = 0;
  delete r.shiftPhase;
  if (forecast.leave) {
    r.skipNextDay = false;
    r.relations.peer = Math.max(0, r.relations.peer - 1);
    r.ap = 0;
    r.nightMinutes = 0;
    r.nightBudget = 0;
    applyTalent(r,talent.talentRecover(talentContext(r),'day-off'),`day-off:${r.day}`);
    flag(r, `leave:${r.day}`, "emotional-leave");
    for (const p of r.patients.filter((p) => p.active)) p.caredDay = r.day;
    r.queue = [
      {
        id: `leave:${r.day}`,
        title: "今天由别人接班",
        kind: "rest",
        scope: { kind: "personal", id: "self" },
        text: "科室没有安排你上临床班。同事接管病人，你留在宿舍等待复评。",
        options: [
          {
            id: `leave:${r.day}:rest`,
            label: "接受休息与复评安排",
            ap: 0,
            minutes: 0,
            cost: 0,
            result: "你放下手机。病区的电话打给了另一位医生。",
            effects: { san: 15, emotion: 10 },
          },
        ],
      },
    ];
  } else {
    const continuing=new Set(deferred.map(c=>c.patientId));
    r.queue=[...deferred,...buildDay(r).filter(c=>!continuing.has(c.patientId)||!['clinical','quick','ward'].includes(c.kind))];
  }
  r.phase = "play";
  advanceShift(r);
  interrupt(r);
}
export function availableOptions(r: Run): Option[] {
  const card = currentCard(r);
  if (!card) return [];
  const handedPatient=r.patients.find(p=>p.uid===card.patientId),handoff=handedPatient&&currentClinicalHandoff(r,handedPatient);
  if(handoff&&isDirectPatientCare(card))return[{id:`${card.id}:handoff-record`,label:'查看已签收的交接单',ap:0,minutes:0,cost:0,effects:{},result:'接班者已签收今天的待办。本次只查看交班记录，没有重复开单、收费或完成尚未回报的诊疗。'}];
  if(isUnsupportedPatientClaim(r,card))return[unsupportedPatientClaimOption(card)];
  if(isLeaveHandoffCard(r,card)&&!(r.pendingCheck?.kind==='choice'&&r.pendingCheck.cardId===card.id)) return [leaveHandoffOption(card)];
  const patient = r.patients.find(p => p.uid === card.patientId);
  if(patient&&card.kind==='ward'&&!patient.active&&!(r.pendingCheck?.kind==='choice'&&r.pendingCheck.cardId===card.id)) {
    const destination=clinicalDisposition(patient).destination;
    return [{id:`${card.id}:closed-bed-handoff`,label:'核对离院去向并归档本院病历',ap:0,minutes:0,cost:0,
      result:destination?`患者已离开本院病区，去向：${destination}。本次只核对交接记录，不再安排病区治疗。`:'患者已不在本院病区。本次只核对交接记录，不再安排病区治疗。',effects:{}}];
  }
  if (patient?.damage === 3 && ['clinical', 'night', 'ward'].includes(card.kind)&&!(card.clinicalGraph?.caseId==='C020'&&!patient.clinical?.outcomeId)) return [{
    id: `${card.id}:death-handoff`, label: '核实死亡记录并交接善后事项', ap: 0, cost: 0, minutes: 0,
    result: '你核实了已有的死亡记录，停止床旁治疗安排，并向下一班交接善后事项。', effects: {},
  }];
  if(nightTelephoneRequired(r,card))return [nightTelephoneOption(card)];
  const choices=(
    [...refreshButterflyOptions(r,card), ...abilityOptions(r,card), perceptionOption(r, card),deferredPatientOption(r,card)].filter((o): o is Option => !!o).map(o => {
      if(o.check?.skill==='record'&&!o.chanceCheck&&talent.talentCheck(talentContext(r),{...checkContext(r,card,o),operation:o.mechanics?.operation??'other'}).signatureAutomatic) {
        const {check:_check,...signed}=o;
        return {...signed,hint:'签字核对由「签字栏」保障。患者是否接受处置，仍取决于此前的告知与沟通。'};
      }
      if (card.kind === 'clinical' && ['C006-s4-b', 'C008-s4-c', 'C013-s3-c', 'C014-s3-c', 'C016-s3-c'].some(id => o.id.endsWith(id)))
        o = { ...o, effects: { ...o.effects, discharge: true } };
      // Older local saves attached an information check to zero-action skips.
      // Normalize only an uncommitted option; past records and dice stay intact.
      if (card.kind === "clinical" && !card.clinicalGraph && o.ap === 0 && o.check &&
          ["observe", "record"].includes(o.check.skill)) {
        const { check: _check, ...choice } = o;
        return choice;
      }
      return o;
    }).filter((o) =>
      conditionMet(r.facts, o.when, r.cash, r.relations),
    )
  ).sort((a,b)=>{
    // A multi-action scene loses completed choices; the remaining choices keep
    // their relative positions so that a player's next tap cannot hit a new row.
    const scene=card.clinicalGraph?`${card.patientId}:${card.clinicalGraph.nodeId}`:card.id;
    return runRandom(r,`choice-order:${scene}:${a.clinicalChoice??a.id}`)-runRandom(r,`choice-order:${scene}:${b.clinicalChoice??b.id}`);
  });
  const visible=patient?patientVisibleOptions(r,patient,card,choices):choices;
  return talent.talentTransferFirst(talentContext(r))?visible.sort((a,b)=>Number(b.talentAction==='transfer'||b.interaction==='transfer')-Number(a.talentAction==='transfer'||a.interaction==='transfer')):visible;
}
/** B24 shows the current patient's bill against the DIP budget. */
export function visibleBudget(r:Run):{patientId:string;spent:number;budget:number;gap:number}|undefined {
  if(!talent.talentShowBudget(talentContext(r)))return;
  const p=r.patients.find(p=>p.uid===currentCard(r)?.patientId);
  if(!p)return;
  return {patientId:p.uid,spent:p.spent,budget:p.budget,gap:p.budget-p.spent};
}
export interface AssetSaleOffer {id:string;label:string;amount:number;soldFlag:string}
/** An event can put a specific asset on offer with a fact `asset-offer:<id>:<amount>`.
 * Without one, the idle equipment from the rules is sold once per run. */
export function assetSaleOffer(r:Run):AssetSaleOffer|undefined {
  const offers=Object.keys(r.facts).flatMap(key=>{
    const m=key.match(/^asset-offer:([^:]+):(\d+)$/);
    if(!m||r.facts[`asset-sold:${m[1]}`])return [];
    return [{id:m[1],label:r.facts[key].source||m[1],amount:Number(m[2]),soldFlag:`asset-sold:${m[1]}`}];
  }).sort((a,b)=>b.amount-a.amount);
  if(offers.length)return offers[0];
  if(r.facts['asset-sold'])return;
  return {id:'equipment',label:'卖掉闲置设备',amount:RULES.assetSale,soldFlag:'asset-sold'};
}
export interface GrayIncomeOffer {amount:number;flags:string[]}
/** Only an open representative line can offer money on the spot. The director
 * writes `gray-income-offer:<amount>`; accepting it records the kickback. */
export function grayIncomeOffer(r:Run):GrayIncomeOffer|undefined {
  if(r.facts['gray-income-accepted'])return;
  const key=Object.keys(r.facts).find(key=>/^gray-income-offer:\d+$/.test(key));
  if(!key)return;
  return {amount:Number(key.split(':')[1]),flags:['gray-income-accepted','kickback-received']};
}
/** Available from the evening settlement page until the day-end check. */
export function resignationAvailable(r:Run):boolean {
  if(r.emergency||r.day>RULES.days||r.facts['resign-requested'])return false;
  if(r.phase==='play')return r.shiftPhase==='结算'||r.shiftPhase==='日终';
  return r.phase==='feedback'&&r.feedback?.next==='check';
}
function requestResignation(r:Run) {
  flag(r,'resign-requested',`resign:${r.day}`);
  // The locker-room scene is a settlement-page scene even when the request
  // arrives at the day-end summary; a rest-desk card would offer rest abilities.
  const match=eligibleAuthoredEvents(r,'结算').find(x=>x.event.id==='E-209');
  if(!match)throw new Error('E-209 is not eligible after resign-requested');
  const card=prepareTalentEvent(r,eventToCard(match.event,match.binding,match.context));
  card.shiftPhase=r.shiftPhase??'结算';
  if(r.authored)r.authored.published[card.id]=card;
  if(!r.queue.some(c=>c.id===card.id))r.queue.splice(r.cursor,0,card);
  delete r.feedback;delete r.pendingCheck;delete r.roll;
  r.phase='play';
}
export function act(input: Run, action: Action): Run {
  if (input.phase === "ending") return input;
  // Exhaustion is handled by the acute event cards (E-197 to E-199); the old
  // collapse panel no longer exists and its action is rejected.
  if (action.type === "collapse") return input;
  if (action.type === "focus") {
    if (!availableEncounters(input).some(c => c.id === action.id)) return input;
    const index = input.queue.findIndex(c => c.id === action.id);
    const next = structuredClone(input);
    const [card] = next.queue.splice(index, 1);
    next.queue.splice(next.cursor, 0, card);
    touchPatient(next,card);
    interrupt(next,card);
    return next;
  }
  const r = structuredClone(input);
  if (action.type === "choose") {
    if (r.phase !== "play" || r.committed.includes(action.id)) return input;
    const card = currentCard(r),
      option = availableOptions(r).find((x) => x.id === action.id);
    if (!option || !card) return input;
    if(r.emergency&&r.emergency.cardId!==card.id)return input;
    if(option.interaction==='defer'&&card.patientId) {
      const text=deferPatient(r,card.patientId,option.id,'ap-empty');if(!text)return input;
      r.phase='feedback';r.feedback={title:'留待明天的患者',text,changes:deltas(input,r),next:'play'};interrupt(r,card);return r;
    }
    if(isUnsupportedPatientClaim(r,card)){
      r.committed.push(option.id);flag(r,`seen:${card.id}`,option.id);r.journal.push({id:option.id,day:r.day,title:'诊疗经手人核对',choice:option.label,result:option.result,scope:card.scope,flags:[]});
      r.cursor++;r.phase='feedback';r.feedback={title:'转交主管组核实',text:option.result,changes:[],next:'play'};return r;
    }
    if(isLeaveHandoffCard(r,card)) {acknowledgeLeaveHandoff(r,card);return r;}
    if(card.patientId&&r.patients.some(p=>p.uid===card.patientId&&currentClinicalHandoff(r,p))&&isDirectPatientCare(card)){
      commitChoice(r,option,card,input);return r;
    }
    touchPatient(r,card);
    if(r.phase!=='play'||r.emergency&&r.emergency.cardId!==card.id)return r;
    const patient=r.patients.find(p=>p.uid===card.patientId);
    if(patient) {
      const preflight=preflightPatientChoice(r,patient,card,option);
      if(preflight.card) {
        r.queue.splice(r.cursor,0,preflight.card);
        return r;
      }
    }
    if(option.check)prepareChoiceRoll(r,option,card);
    else commitChoice(r, option, card, input);
  } else if (action.type === "continue") {
    if (r.phase !== "feedback") return input;
    if(r.emergency?.resolved) {
      const resume=r.emergency.resume;delete r.emergency;
      restoreContinuation(r,resume);
      interrupt(r);
      resumeWork(r);
    } else if (r.feedback?.next === "check") {
      // Rest may precede newly delivered evening calls in an older save. Finish
      // those actual encounters before committing the daily recovery/check.
      r.phase="play";
      if(!advanceShift(r))endDay(r);
    }
    else if (r.feedback?.next === "day") nextDay(r);
    else {
      r.phase = "play";
      if (!advanceShift(r)) endDay(r);
    }
  } else if (action.type === "ack-roll") {
    if (r.phase !== "roll" || !r.roll) return input;
    if(r.pendingCheck?.kind==='choice') {
      const cardBefore=currentCard(r),owner=r.patients.find(p=>p.uid===cardBefore?.patientId);
      if(cardBefore&&isLeaveHandoffCard(r,cardBefore)&&r.pendingCheck.cardId===cardBefore.id) {
        acknowledgeLeaveHandoff(r,cardBefore);return r;
      }
      if(cardBefore?.kind==='ward'&&owner&&!owner.active&&r.pendingCheck.cardId===cardBefore.id) {
        // A migrated old save can already display a die for a bedside visit
        // that no longer exists. Preserve that die; close the unperformed visit
        // without charging for treatment after the established departure.
        delete r.pendingCheck;
        const handoff=availableOptions(r)[0];
        commitChoice(r,handoff,cardBefore,input);
        if(r.feedback)r.feedback.text+=' 原定病区处置未执行，也未计费。';
        return r;
      }
      const pending=r.pendingCheck,card=currentCard(r),option=availableOptions(r).find(o=>o.id===pending.optionId);
      if(!card||card.id!==pending.cardId||!option||r.committed.includes(option.id))return input;
      delete r.pendingCheck;
      commitChoice(r,option,card,input,r.roll);
      for(const key of Object.keys(r.vitals) as Vital[])r.vitals[key]=clamp(Math.round(r.vitals[key]),0,liveCap(r,key));
      r.reputation=clamp(r.reputation,0,100);
      return r;
    }
    delete r.pendingCheck;
    if (r.roll.kind === "tribunal") r.phase = "ending";
    else if (r.roll.kind === "choice") r.phase = "feedback";
    else {
      if(r.roll.critical==='failure'||r.roll.face===1)r.vitals.san-=RULES.critical.sanLoss;
      r.streak = r.roll.success ? r.streak + 1 : 0;
      if (r.streak >= 3)
        r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 5);
      let recoveredName:string|undefined;
      if (r.roll.face === 20) {
        const removable = talent.talentRemovableDebuffs(talentContext(r));
        const removed = runShuffled(r,removable,`cure:${r.day}`)[0];
        if (removed) {
          r.debuffs = r.debuffs.filter((x) => x !== removed);
          recoveredName=DEBUFFS.find(d=>d.id===removed)?.name;
          recordRecoveredStatuses(r,[removed],`day-critical:${r.day}`);
        }
      }
      if (r.roll.success) {
        r.phase = "feedback";
        r.feedback = {
          title: "这一夜过去了",
          text:
            r.roll.face === 20
              ? `天亮之前，你睡了一段没有被电话打断的觉。${recoveredName?`「${recoveredName}」已解除。`:'当前没有可解除的持续状态。'}`
              : "你合上登记本，明天还得按排班来上班。",
          changes: [],
          next: "day",
        };
      } else {
        r.phase = "debuff";
        r.debuffPicks = r.roll.critical==='failure'||r.roll.face===1 ? 2 : 1;
        let draw=0;
        r.offered=talent.drawTalentDebuffs(talentContext(r),{debt:r.debt,afterNight:hasWorkedNight(r),san:r.vitals.san},()=>runRandom(r,`debuff:${r.day}:${draw++}`));
        if (r.offered.length < r.debuffPicks) r.debuffPicks = r.offered.length;
        if(r.debuffPicks===0){r.phase='feedback';r.feedback={title:'交班结束',text:'这一夜没有新增的持续状态。',changes:[],next:'day'};}
      }
      interrupt(r);
    }
  } else if(action.type==='reroll') {
    if(r.phase!=='roll'||!r.pendingCheck||!r.roll||r.roll.blockedReason||r.roll.chance)return input;
    const memory=talent.useTalentReroll(talentContext(r),true);
    if(memory)r.talentMemory=memory;
    else if((r.metaRerolls??0)>0)r.metaRerolls!--;
    else return input;
    const n=++r.pendingCheck.rerolls;
    if(r.roll.kind==='choice')r.roll=rerollPatientCheck(r,r.roll,n);
    else {
      const first=runDie(r,`${r.roll.id}:reroll:${n}`),second=r.roll.second===undefined?undefined:runDie(r,`${r.roll.id}:reroll:${n}:second`);
      r.roll.face=second===undefined?first:r.roll.advantage?Math.max(first,second):Math.min(first,second);
      r.roll.second=second;r.roll.revision=n;
      Object.assign(r.roll,talent.talentRollOutcome(talentContext(r),r.roll.face,r.roll.modifier,r.roll.dc));
    }
  } else if (action.type === "debuff") {
    if (r.phase !== "debuff" || !r.offered.includes(action.id)) return input;
    r.offered = r.offered.filter((x) => x !== action.id);
    r.debuffPicks--;
    applyTalent(r,talent.talentGainDebuff(talentContext(r),action.id),`debuff:${r.day}:${action.id}`);
    r.journal.push({
      id: `debuff:${r.day}:${action.id}`,
      day: r.day,
      title: "夜里留下的东西",
      choice: DEBUFFS.find((x) => x.id === action.id)!.name,
      result: DEBUFFS.find((x) => x.id === action.id)!.text,
      scope: { kind: "personal", id: "self" },
      flags: [],
    });
    if (r.debuffPicks <= 0) {
      r.phase = "feedback";
      r.feedback = {
        title: "天亮了",
        text: "闹钟响了。你摸到床边的外套，翻出胸牌。",
        changes: [],
        next: "day",
      };
      interrupt(r);
    }
  } else if (
    action.type === "borrow" ||
    action.type === "coffee" ||
    action.type === "nap"
  ) {
    if (r.phase !== "play" || r.emergency || action.type==='borrow'&&isFullDayLeave(r)) return input;
    if (action.type === "borrow") {
      if (r.borrowed >= RULES.borrowMax || r.day >= 14) return input;
      r.borrowed++;
      r.ap++;
      capLoss(r, RULES.borrowCapLoss);
    }
    if (action.type === "coffee") {
      const serving=talent.talentCoffee(talentContext(r),r.coffee),tuning=costTuning(r);
      if(!serving.allowed||r.coffee>=(tuning.coffeeLimit??3))return input;
      r.cash -= tuning.coffeePrice??RULES.coffeeCost;
      r.vitals.stamina = Math.min(
        liveCap(r,'stamina'),
        r.vitals.stamina + (r.coffee===0&&tuning.coffeeFirst!==undefined?tuning.coffeeFirst:serving.stamina),
      );
      r.coffee++;
      r.reputation=Math.max(0,r.reputation+serving.reputation);
    }
    if (action.type === "nap") {
      const nap=talent.talentNap(talentContext(r),r.nap);
      if (!nap.allowed || r.ap < nap.ap || r.shiftPhase!=='结算') return input;
      r.nap = true;
      spendAp(r, nap.ap);
      r.vitals.stamina = Math.min(
        liveCap(r,'stamina'),
        r.vitals.stamina + nap.stamina,
      );
    }
    r.feedback = {
      title:
        action.type === "borrow"
          ? "明天少一格"
          : action.type === "coffee"
            ? "纸杯"
            : "二十分钟",
      text:
        action.type === "borrow"
          ? "你今天增加了 1 点行动值，明天会扣回 1 点。体力、精神和情绪上限各减 1 点。"
          : action.type === "coffee"
            ? "你把纸杯放回值班室的咖啡台。"
            : "你把闹钟关掉，坐了一会。",
      changes: deltas(input, r),
      next: "play",
    };
    r.phase = "feedback";
    interrupt(r);
  } else if (action.type === "fund") {
    if (r.phase !== "funding") return input;
    if (action.method === "stop") {
      stop(r, "quit");
      return r;
    }
    if (action.method === "credit") {
      const needed = -r.cash;
      if(needed<=0)return input;
      r.debt += needed;
      r.cash = 0;
      if(r.authored)Object.assign(r.authored,changeCashPressure(r,r.authored,RULES.creditPressure));
      flag(r, "credit-used", `fund:${r.day}`);
    }
    if (action.method === "family") {
      if (r.facts["family-funding"]) return input;
      r.cash += RULES.familyFunding;
      r.relations.family = Math.max(0, r.relations.family - 2);
      r.vitals.emotion = Math.max(0, r.vitals.emotion - 10);
      flag(r, "family-funding", `fund:${r.day}`);
    }
    if (action.method === "asset") {
      const offer=assetSaleOffer(r);
      if (!offer) return input;
      r.cash += offer.amount;
      flag(r, offer.soldFlag, `fund:${r.day}`);
      r.vitals.emotion = Math.max(0, r.vitals.emotion - 5);
      r.journal.push({id:`asset-sale:${r.day}:${offer.id}`,day:r.day,title:'变卖资产',choice:offer.label,result:`${offer.label}换来 ¥${offer.amount.toLocaleString('zh-CN')}。这件东西以后不能再用了。`,scope:{kind:'personal',id:r.id},flags:[offer.soldFlag]});
    }
    if (action.method === "gray") {
      const offer=grayIncomeOffer(r);
      if (!offer) return input;
      r.cash += offer.amount;
      for(const key of offer.flags)flag(r,key,`fund:${r.day}`);
      r.journal.push({id:`gray-income:${r.day}`,day:r.day,title:'眼前的钱',choice:'接受眼前的灰色收入',result:`你收下了 ¥${offer.amount.toLocaleString('zh-CN')}。这笔钱的来路会留在记录里。`,scope:{kind:'personal',id:r.id},flags:offer.flags});
    }
    finalizeFamilyPayments(r);
    r.phase = resumePhase(r);
    if(r.phase!=='feedback')delete r.feedback;
    delete r.pendingResume;
    interrupt(r);
    resumeWork(r);
  } else if (action.type === "resign") {
    if (!resignationAvailable(r)) return input;
    requestResignation(r);
  } else if (action.type === "testify") {
    if (r.phase !== "tribunal") return input;
    r.tribunalResponse = action.response;
    if(action.response==='silent') {
      r.vitals.san=Math.max(0,r.vitals.san-RULES.critical.sanLoss);
      r.journal.push({id:'tribunal:silent',day:r.day,title:'复核陈述',choice:'保持沉默',result:'你没有回答。记录员记下你的选择，复核继续以已经提交的材料为依据。精神减少 5 点。',scope:{kind:'personal',id:r.id},flags:[]});
    }
    applyDirector(r,settleAuthoredEvents(r,'日终',true));
    r.ending = tribunalEnding(r, action.response);
    delete r.pendingCheck;delete r.emergency;
    r.phase = r.roll?.kind === "tribunal" ? "roll" : "ending";
  }
  for (const key of Object.keys(r.vitals) as Vital[])
    r.vitals[key] = clamp(Math.round(r.vitals[key]), 0, liveCap(r,key));
  if(r.phase==='play'&&currentCard(r))touchArchive(r,currentCard(r));
  r.reputation = clamp(r.reputation, 0, 100);
  return r;
}
export function reward(meta: Meta, r: Run): Meta {
  if (!r.ending || meta.rewarded.includes(r.id)) return meta;
  const next = structuredClone(meta),{cases,entities,clinicalPatients}=encounteredCollections(r);
  const scenes = [
    ...new Set(r.journal.filter((x) => x.id.includes("-")).map((x) => x.title)),
  ];
  const endingIds=[...new Set([r.ending.id,...(r.ending.annexIds??[])])];
  const newEntries=cases.filter(c=>!meta.cases.includes(c)).length+entities.filter(e=>!meta.entities?.includes(e)).length;
  const newEndings=endingIds.filter(id=>!meta.endings.includes(id)).length;
  const newTalents=r.talents.filter(id=>!meta.usedTalents?.includes(id)).length;
  const xp=(r.day>=15?3:0)+newEndings*2+newEntries+newTalents+Math.min(5,scenes.filter(s=>!meta.scenes.includes(s)).length*.5);
  next.xp+=Math.round(xp*(r.difficulty==='attending'?1.5:1)*2)/2;
  const caught=r.patients.filter(p=>p.clinical?.outcomeId&&p.damage<2&&p.clinical.causalChoices.length===0).length;
  next.insight=(next.insight??0)+caught+newEndings*2+newEntries+(r.day>=15?2:0);
  next.runs++;
  next.rewarded.push(r.id);
  next.endings = [...new Set([...next.endings, ...endingIds])];
  next.cases = [...new Set([...next.cases, ...cases])];
  next.scenes = [...new Set([...next.scenes, ...scenes])];
  next.entities=[...new Set([...(next.entities??[]),...entities])];
  next.clinicalPatients=[...new Set([...(next.clinicalPatients??[]),...clinicalPatients])];
  next.usedTalents=[...new Set([...(next.usedTalents??[]),...r.talents])];
  next.debuffs=[...new Set([...(next.debuffs??[]),...r.debuffs])];
  const seeds=(r.ending as typeof r.ending&{seedHistory?:NonNullable<Meta['seedHistory']>}).seedHistory??[];
  next.seedHistory=[...(next.seedHistory??[]),...seeds.filter(seed=>!next.seedHistory?.some(old=>old.runId===seed.runId&&old.caseId===seed.caseId&&old.trapId===seed.trapId))];
  next.archiveTraps=[...new Set([...(next.archiveTraps??[]),...collectTrapArchive(r).keys])];
  return next;
}
export type UpgradeKind='skill'|'cap'|'cash'|'fourth-slot'|'redraw'|'reroll-token'|'attending'|'depression';
export function upgrade(
  meta: Meta,
  kind: UpgradeKind,
  key?: string,
): Meta {
  const m = structuredClone(meta);
  const spendInsight=(cost:number)=>{if((m.insight??0)<cost)return false;m.insight=(m.insight??0)-cost;return true;};
  if(kind==='fourth-slot'&&!m.fourthSlot&&spendInsight(RULES.meta.fourthSlotCost))m.fourthSlot=true;
  if(kind==='redraw'&&(m.extraRedraws??0)<RULES.meta.redrawMax&&spendInsight(RULES.meta.redrawCost))m.extraRedraws=(m.extraRedraws??0)+1;
  if(kind==='reroll-token'&&!m.rerollToken&&spendInsight(RULES.meta.rerollCost))m.rerollToken=true;
  if(kind==='attending'&&!m.attendingUnlocked&&spendInsight(RULES.meta.attendingCost))m.attendingUnlocked=true;
  if(kind==='depression'&&(m.depressionRank??0)<RULES.meta.depressionMax&&m.xp>=RULES.meta.depressionCost){m.depressionRank=(m.depressionRank??0)+1;m.xp-=RULES.meta.depressionCost;}
  if (
    kind === "skill" &&
    key &&
    key in m.skills &&
    m.skills[key as Skill] < RULES.meta.skillMax &&
    m.xp >= RULES.meta.skillCost
  ) {
    m.skills[key as Skill]++;
    m.xp -= RULES.meta.skillCost;
  } else if (
    kind === "cap" &&
    key &&
    key in m.caps &&
    m.caps[key as Vital] < RULES.meta.capMax &&
    m.xp >= RULES.meta.capCost
  ) {
    m.caps[key as Vital]++;
    m.xp -= RULES.meta.capCost;
  } else if (
    kind === "cash" &&
    m.cashRank < RULES.meta.cashMax &&
    m.xp >= RULES.meta.cashCost
  ) {
    m.cashRank++;
    m.xp -= RULES.meta.cashCost;
  }
  return m;
}
export function publicState(r: Run) {
  return {
    name: r.name,
    day: r.day,
    phase: r.phase,
    vitals: r.vitals,
    caps: r.caps,
    ap: r.ap,
    cash: r.cash,
    debt: r.debt,
    privateDebt: r.privateDebt,
    borrowed: r.borrowed,
    relations: r.relations,
    debuffs: r.debuffs,
    budget: visibleBudget(r),
    card:
      r.phase === "play"
        ? {
            title: currentCard(r)?.title,
            text: currentCard(r)?.text,
            options: availableOptions(r).map((x) => ({
              id: x.id,
              label: x.label,
              ap: optionAp(r,x,currentCard(r)),
              minutes: actionMinutes(r,x,currentCard(r)),
              cost: treatmentCost(r,x),
              cash: x.effects.cash ?? 0,
              check: x.check
                ? { skill: x.check.skill, dc: checkDifficulty(r,x,currentCard(r)) }
                : undefined,
            })),
          }
        : undefined,
    ...(r.phase === "tribunal" || r.phase === "ending"
      ? { audit: auditScore(r), hazards: r.hazards, ending: r.ending }
      : {}),
    feedback: r.phase === "feedback" ? r.feedback : undefined,
  };
}
