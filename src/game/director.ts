import type { Card, Effects, Option, Patient, Run, Scope } from './types';
import { CASES } from './catalog';
import { RULES } from './rules';
import { runRandom } from './run-random';
import { getClinicalGraph,graphCondition } from '../content/clinical';
import { createPatient,assignBed,makeWardCard,nextFreeBed,awaitingBed } from './cards';
import { beginClinical } from './clinical';
import {presetCard}from './presets';
import {authoredCashPressure,changeCashPressure,PRESSURE_CHARGE_EVENTS}from '../content/events/pressure';
import {createClaimedReadmission,type BillingEpisode}from '../content/events/billing-episodes';
import {paperDefenseModifier,paperStepCredit}from '../content/events/specialized-checks';
import {makeRepresentativeRecontact,RECONTACT_FEES,type RepresentativeRecontactCard}from '../content/events/representative-recontact';
import {patientIdentityMatches,projectPatientSpeaker}from '../content/events/patient-requirements';
import {historicalEventEligible,projectHistoricalEvent,sameNameWardPatient,priorUnperformedPeerExam}from '../content/events/historical-context';
import {BUTTERFLY_CHOICE_RESULTS,BUTTERFLY_MERGE_RESULTS}from '../content/events/butterfly-prose';
import {butterflySceneActor}from '../content/events/butterfly-cast';
import {departmentStatementSource,recordDepartmentStatementReceipt}from '../content/events/statement-requests';
import {patientReviewMaterial,patientReviewPairs,recordPatientReview,PATIENT_REVIEW_RECEIPT}from '../content/events/patient-review';
import {isFullDayLeave}from './duty-state';
import {clinicalAssignment,isPlayerResponsibleForPatient,type ClinicalAssignment,type FamilyRegistration}from '../content/events/clinical-ownership';
import { talentResearch, talentChiefLearns, talentRepresentative, talentPressureDecay } from './talents';
import { authoredTalentWeight, prepareTalentEvent, eventTalentContext, PAPER_SUBMISSION_CHOICES, AUTOMATIC_BEAUTIFICATION_CHOICES } from '../content/events/talent-adapter';
import { TROLLEY_DEFINITIONS, emptyTrolleyLedger, pickTrolley, trolleyEchoCard } from '../content/events/trolley';
import type { TrolleyLedger,TrolleyCard,TrolleyWorld } from '../content/events/trolley';
import { buildSourceFollowups } from '../content/events/followups';
import type { DisputeState,SourceFollowup } from '../content/events/followups';
import {isResearchCollaboration,butterflyMergeClaim,butterflyNodeEligible,mergeParticipantGroups,butterflyChoiceCost,butterflyMergeCost,butterflyMergeOptions,stopsMergedCooperation,type ButterflyChoice}from '../content/events/butterfly';
import {ENTITY_BY_ID,PRESET_BY_ID,CASE_PRESETS,compatibleEntities,instantiatePreset}from '../content/patients';
import type {CasePreset,PatientEntity,PatientPeriod}from '../content/patients';
import {entityScenario}from '../content/patients/scenarios';
import {
  AUTHORED_EVENTS, EVENT_BY_ID, eventEligible, eventWeight, eventToCard, eventRiskTargets, eventRuntimeActor, authoredChoiceEffects,
  createEventLedger, recordEventChoice, settleEventLedger, eventRecovery, eventTuning,
  BUTTERFLY_NODES, BUTTERFLY_MERGES, startButterfly, routeButterfly, butterflyChoices,
  commitButterflyChoice, completeButterflyCommitment, butterflyResolutionView,
  mergeEligible, commitButterflyMerge, compileClauses, eventPlayerOutcome, eventPlayerHint,
} from '../content/events';
import type { AuthoredEvent, EventBinding, EventCard, EventContext, EventLedger, EventOption, EventPhase, EventModifier, ButterflyId, ButterflyState, ButterflyWorld } from '../content/events';
import {relieveHazards}from './hazard-relief';
import {chargedBudgetTotal}from './budget-account';
import {beginBudgetSettlement,patientLiability,finishBudgetSettlement}from './budget-liability';
import {budgetNoticeCopy}from '../content/events/budget-notices';
import {auditEventWeight,auditEchoCard}from '../content/events/audit-echo';
import {weddingDayCard,familyDeathVariant}from '../content/events/family-milestones';
import {butterflyPermissionCards,PERMISSION_FACTS,permissionActor,type ButterflyPermissionCard}from '../content/events/butterfly-permissions';
import {extraShiftPlan,extraShiftCompleted}from './extra-shift';
import {patientAssessmentComplete}from './care-completion';
import {butterflyCommitmentCard,commitmentDelivery}from '../content/events/butterfly-commitments';
import {scheduleEventClauses}from '../content/events/ledger';
import {butterflyFinanceCard,type ButterflyFinanceCard}from '../content/events/butterfly-finance';
import {obligatoryScene,scheduleEchoScenes,randomSceneSlots,pendingSceneNotes,type SceneAgendaItem}from '../content/events/scene-agenda';
import {offerLiaisonRole,butterflyRoleDutyCard}from '../content/events/butterfly-role';
import {registerFamilyInvoice,familyInvoiceFor,recordFamilyInvoiceChoice,familyInvoiceNotes,reduceFamilyContribution,type FamilyInvoice}from '../content/events/family-accounts';
import {receivableDue,privateDebtDue,settleButterflyAccounts}from '../content/events/butterfly-accounts';
import {deadlineCandidates,approvedDeadlineChanges,applyApprovedDeadlines}from '../content/events/butterfly-deadlines';
import {currentClinicalHandoff,isDirectPatientCare,type ClinicalHandoff}from './clinical-handoff';
import {canLeaveForFamily,postponeFamilyDepartureWork}from '../content/events/family-departure';
import {hasScopedButterflyReview,butterflyReviewScope}from '../content/events/butterfly-review';
import {hasDueFamilyWorkConflict}from '../content/events/butterfly-conflicts';
import {mergeClaimsScene}from '../content/events/merge-scenes';
import {pendingPeerExamObservations,type PeerExamObservationCard}from '../content/events/peer-exam-observation';
import {pendingGlucoseTranscription,glucoseTranscriptionCard,type GlucoseTranscriptionCard}from '../content/events/glucose-transcription';
import {canContactForFamilyFunding,familyFundingContactCard,type FamilyFundingContactCard}from '../content/events/family-funding-contact';
import {openComplaintRecordingChains,recordingOrigin,recordingSceneText,ownContemporaneousRecord,RECORDING_PROSE}from '../content/events/recording-origins';
import {schedulePeerReferral,deliverPeerReferrals,pendingPeerReferralNotes,type PeerReferral}from './peer-referrals';

export interface EventParticipant {
  id: string; name: string; age: number; sex: string; bed: number; admitted: number;
  category: '孕产' | '认知障碍' | '恶性终末期' | '他组死亡' | '普通门诊';
  history: string; active: boolean; charges: number; budget:number; charged:number; sourceEvent: string;
  entityId?: string; presetId?: string;
}
export interface AuthoredDirectorState {
  schema: 1;
  seen: Record<string, number>;
  activeFacts: Record<string,{day:number;source:string}>;
  scheduled: string[];
  ledger: EventLedger;
  chains: ButterflyState[];
  participants: EventParticipant[];
  actor: { liCash: number; liAwayDays: number[]; zhouAwayDays: number[]; liFalseStatementWilling: boolean; datasetHasProblem: boolean; sharedResearch: boolean };
  published: Record<string, Card>;
  sceneAgenda?:SceneAgendaItem[];
  echoDays?:{day:number;cardIds:string[]}[];
  pressure: number;
  pressureCharges?:{day:number;amount:number;source:string}[];
  pressureBackground?:{raw:number;value:number};
  billingEpisodes?:BillingEpisode[];
  clinicalAssignments?:ClinicalAssignment[];
  clinicalHandoffs?:ClinicalHandoff[];
  familyRegistrations?:FamilyRegistration[];
  familyInvoices?:FamilyInvoice[];
  legacyBedNumbers?:{patientId:string;bed:number;source:'schema-1-before-authored'}[];
  benefitsReceived?:number;
  benefitsReturned?:number;
  leaveUntil?: number;
  returnedFromLeave?: number;
  paperDeadline?: number;
  endNotes: string[];
  trolley?:TrolleyLedger;
  dispute?:DisputeState;
  dipPolicy?:{group:string;started:number;sequence:number;patientId:string;source:string};
  drugStage?:number;
  drugNextDay?:number;
  drugCooldownUntil?:number;
  refusals?:Record<string,{day:number;source:string;resolved?:'assessment'|'known-damage'|'telephone'|'stable'|'deteriorated'}>;
  appointments?:{id:string;source:'E-032'|'E-109';day:number;patientId?:string;arrived?:boolean}[];
  peerReferrals?:PeerReferral[];
}
export type AuthoredRun = Run & { authored?: AuthoredDirectorState };
function refusedAssessmentCompleted(p:Patient):boolean{
  if(p.clinical?.flags.includes('lp_assessment_completed'))return true;
  const graph=getClinicalGraph(p.caseId),report=graph?.reports.find(report=>report.id==='C008_r2');
  return !!(p.clinical&&report&&graphCondition(report.when,p.clinical));
}
/** One remaining-risk draw, shared with the exhausted-night telephone route. */
export function authoredRefusalRiskBonus(r:AuthoredRun,patientId:string):number{
  const refusal=r.authored?.refusals?.[patientId],p=r.patients.find(p=>p.uid===patientId);
  return refusal&&!refusal.resolved&&p&&p.damage<2&&!refusedAssessmentCompleted(p) ? .2 : 0;
}
export interface DirectedEffect { id: string; scope: Scope; effects: Effects; text: string; context?:Pick<Card,'actor'|'chain'|'kind'> }
export interface DirectorResult {
  patch: Partial<Run> & { authored: AuthoredDirectorState };
  effects: DirectedEffect[];
  cards: Card[];
  /** Same-conversation replies, after the chosen card and before its pending bill. */
  immediateCardIds?:string[];
  removeCardIds: string[];
}
export interface ButterflyCard extends Card { butterfly: { chainStateId: string; nodeId: string; day: number; phase: EventPhase }; authoredEventId?: string }
export interface ButterflyMergeCard extends Card { butterflyMerge: {
  mergeId:string;chainStateIds:string[];day:number;phase:EventPhase;
  familyBillId?:string;
  claimedSceneIds?:string[];
  claimedCommitmentIds?:string[];
  continuations?:{chainStateId:string;sourceNode:string;targetNode:string}[];
} }
export interface ButterflyCommitmentCard extends Card { butterflyCommitment: { chainStateId:string; commitmentId:string; phase:EventPhase } }
export interface ClinicalEventCard extends EventCard {clinicalResume:{patientId:string;nodeId:string};}

/** Equivalent scene instances are replaced, not replayed after an imported choice. */
export const LEGACY_EVENT_EQUIVALENTS: Record<string, string[]> = {
  'E-042': ['shift-1'], 'E-064': ['cash-1'], 'E-025': ['record-1'], 'E-135': ['research-1'],
  'E-105': ['family-wedding'], 'E-188': ['research-5'],
};
/** Existing saves retain the route already played; fresh routes use the authored graph. */
export function shouldSuppressLegacyStory(r:AuthoredRun,id:string):boolean {
  if(id==='family-wedding'||id.endsWith(':family-wedding'))return !Object.keys(r.facts).some(k=>k==='seen:family-wedding'||k.endsWith(':seen:family-wedding'));
  const prefix=['shift-','cash-','record-','research-'].find(p=>id.startsWith(p)||id.includes(`:${p}`));
  return !!prefix&&!Object.keys(r.facts).some(k=>k.startsWith(`seen:${prefix}`));
}
const chainEntry: Record<string, [ButterflyId, string]> = {
  'E-042': ['BTF-001', 'N01'], 'E-054': ['BTF-001', 'N03'], 'E-040': ['BTF-001', 'N05'],
  'E-064': ['BTF-002', 'N01'], 'E-146': ['BTF-002', 'N04'],
  'E-025': ['BTF-003', 'N01'], 'E-135': ['BTF-004', 'N01'],
  'E-185': ['BTF-004', 'N05'], 'E-188': ['BTF-004', 'N06'], 'E-191': ['BTF-004', 'N08'],
};
const nodeSource: Record<string, string> = {
  'BTF-001:N01': 'E-042', 'BTF-001:N03': 'E-054', 'BTF-001:N05': 'E-040',
  'BTF-002:N01': 'E-064', 'BTF-002:N04': 'E-146', 'BTF-002:N05': 'E-137',
  'BTF-003:N01': 'E-025', 'BTF-004:N01': 'E-135', 'BTF-004:N05': 'E-185', 'BTF-004:N06': 'E-188', 'BTF-004:N07': 'E-190', 'BTF-004:N08': 'E-191',
};
const legacyFacts: Record<string, string[]> = {
  'gift-accepted': ['收礼'], 'rep-contact': ['药代-0搭话'], 'rep-dinner': ['药代-1餐叙'],
  'lecture-fee-received': ['药代-2讲课费'], 'prescription-exported': ['药代-4统方'], 'rebate-received': ['药代-5回扣'],
  'family-icu': ['家庭-车祸', '家庭-车祸-ICU中', '家庭-高潮已发'], 'wedding-paid': ['家庭-婚事', '家庭-高潮已发'],
  'paper-submitted-clean': ['科研-诚实', '科研-收口'], 'paper-submitted-false': ['科研-造假', '科研-收口'],
  'research-withdrawn': ['科研-放弃'], 'audit-opened': ['飞检-进驻'], 'self-health-open': ['健康-开启'],
};
function initialize(r: AuthoredRun): AuthoredDirectorState {
  if (r.authored) return structuredClone(r.authored);
  return { schema: 1, seen: {}, activeFacts:{}, scheduled: [], ledger: createEventLedger(), chains: [], participants: [],
    ...(r.patients.some(p=>p.bed>16)?{legacyBedNumbers:r.patients.filter(p=>p.bed>16).map(p=>({patientId:p.uid,bed:p.bed,source:'schema-1-before-authored' as const}))}:{}),
    actor: { liCash: [0, 500, 1500, 3000][Math.floor(runRandom(r, 'actor:li:cash') * 4)], liAwayDays: [4 + Math.floor(runRandom(r, 'actor:li:away') * 6)], zhouAwayDays: [8 + Math.floor(runRandom(r, 'actor:zhou:away') * 4)], liFalseStatementWilling: runRandom(r, 'actor:li:false-witness') < 0.3, datasetHasProblem: runRandom(r, 'dataset:actual-problem') < 0.55, sharedResearch: runRandom(r, 'dataset:same-project') < 0.65 },
    published: {}, pressure: 0, endNotes: [] };
}
const factsFor = (r: AuthoredRun, s: AuthoredDirectorState): EventContext['facts'] => {
  const facts: Record<string, boolean | number | { day: number }> = { ...r.facts };
  for (const [old, targets] of Object.entries(legacyFacts)) if (r.facts[old]) for (const target of targets) facts[target] = { day: r.facts[old].day };
  for (const [id,f] of Object.entries(s.activeFacts)) facts[id] = { day: f.day };
  const refused = s.ledger.facts.filter(f => f.id === '药代-拒绝').length;
  if (refused) facts['药代-拒绝'] = refused;
  for (const c of s.chains) for (const f of c.facts) facts[`${c.chain}:${f.type}`] = { day: f.day };
  if (r.exhausted > 0) facts['体力归零一次'] = true;
  if (r.emotionalBreaks > 0) facts['情绪归零一次'] = true;
  if (r.facts['health-open']||facts['健康-开启']) facts['自身健康线开启'] = r.facts['health-open']??facts['健康-开启'];
  if(facts['药代-4统方'])facts['统方']=facts['药代-4统方'];
  if(facts['药代-5回扣'])facts['回扣']=facts['药代-5回扣'];
  return facts;
};
function clinicalText(p: Patient): string {
  const g = getClinicalGraph(p.caseId);
  if (!g || !p.clinical) return '';
  const selected = new Set(p.clinical.choices);
  return g.nodes.flatMap(n => n.options.filter(o => selected.has(o.id)).map(o => `${o.label} ${o.result}`)).join(' ');
}
function clinicalFlags(p?: Patient): string[] { return p ? [...(p.clinical?.flags ?? []), ...(p.clinical?.variants ?? [])] : []; }
const scopeMatches = (a: Scope, b: Scope) => a.kind === b.kind && a.id === b.id;
const roomFor=(p:Patient)=>p.inpatient&&p.bed>=RULES.ward.firstBed&&p.bed<RULES.ward.firstBed+RULES.ward.capacity?Math.floor((p.bed-RULES.ward.firstBed)/4):-1;
function receivingOxygen(r:Run,p:Patient):boolean{
  const graph=getClinicalGraph(p.caseId),all=graph?.nodes.flatMap(n=>n.options)??[];
  const labels=(p.clinical?.choices??[]).flatMap(id=>{const o=all.find(o=>o.id===id);return o?[o.label]:[];});
  const actions=[...labels,...r.journal.filter(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&e.operation==='treatment').map(e=>e.choice)];
  const last=actions.filter(s=>/吸氧|给氧|氧疗/.test(s)).at(-1);
  return last?!/不[予做用]|未|停止|拒绝/.test(last):!!p.preset?.history.some(s=>/正在吸氧|持续吸氧|鼻导管吸氧|面罩吸氧/.test(s));
}
function contextFor(r: AuthoredRun, s: AuthoredDirectorState, phase: EventPhase, p?: Patient, extra?: EventParticipant): EventContext {
  const c = p ? p.preset ?? CASES.find(c => c.id === p.caseId) : undefined;
  const text = p ? clinicalText(p) : '';
  const base = c ? `${c.complaint} ${c.history.join(' ')} ${c.findings.join(' ')}` : extra?.history ?? '';
  const flags = clinicalFlags(p), q: string[] = [];
  const alive = r.patients.filter(p => p.active && p.damage < 3), inpatients = alive.filter(p => p.inpatient);
  const selected = p?.clinical?.choices ?? [];
  const age = c?.age ?? extra?.age ?? 0;
  const entity=p?.preset?.entityProfile??(p?.entityId?ENTITY_BY_ID.get(p.entityId):undefined),scenario=entity?entityScenario(entity):undefined;
  const payment=p?.preset?.payment??entity?.payment??'',companion=p?.preset?.companion??entity?.companion??'';
  const insured=/医保|公费|新农合/.test(payment)&&!/断缴|未参保|无医保/.test(payment)||!payment&&/医保/.test(base);
  const carer=!!p&&/护工/.test(`${companion} ${base}`);
  if (/抗菌|头孢|青霉素|左氧|碳青霉烯/.test(text) || /使用抗菌药/.test(base)) q.push('当前病人用药方案含抗菌药');
  if (carer) q.push('当前床有护工');
  if (age >= 18 && (scenario?scenario.roles.has('spouse'):/妻子|丈夫|配偶|老伴陪/.test(base))) q.push('当前病人为成年且有配偶陪护');
  if ((p?.inpatient && age >= 65) || extra && extra.age >= 65) q.push('在床有老年病人');
  if (phase === '门诊' && !r.queue.slice(r.cursor).some(card => card.kind === 'quick' || card.kind === 'clinical' && !r.patients.find(p => p.uid === card.patientId)?.inpatient)) q.push('当日门诊最后一位病人处置完毕');
  if(age>=18&&(scenario?scenario.context.includes('active-employment'):/工厂|司机|职员|工程师|教师|快递员|店员|务工/.test(base)&&!/退休|卧床|失能/.test(base)))q.push('当前病人为在职人员');
  if (inpatients.length >= 4) q.push('在床≥4 人');
  if(p&&!p.inpatient&&/静脉|静滴|输液|注射/.test(text))q.push('当日门诊有静脉用药');
  if (p?.caseId==='C008'&&flags.includes('lp_proposed')&&!flags.includes('lp_consented')&&!flags.includes('refusal_signed')&&!p.clinical?.outcomeId) q.push('当前病人方案含有创检查');
  if (extra?.category === '认知障碍' || /痴呆|认知障碍/.test(base)) q.push('在床有认知障碍病人');
  if (p?.planned && p.stability >= RULES.ward.stabilityNeed) q.push('当前床明日出院');
  if (extra?.category === '恶性终末期' || /恶性|终末期|进展期胃癌/.test(base)) q.push('当前病人诊断为恶性或终末期');
  if (p?.active && p.stability < RULES.ward.stabilityNeed) q.push('当前病人未达出院标准');
  if(p&&/自费|欠费|未参保|无医保|断缴/.test(`${payment} ${base}`))q.push('当前病人自费或欠费');
  if (insured) q.push('当前病人为医保');
  if (p && getClinicalGraph(p.caseId)) q.push('当前病人为底牌');
  if(p&&r.patients.some(other=>other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&receivingOxygen(r,other)))q.push('在床有吸氧病人');
  if (age < 18 && (p || extra)) q.push('当前病人为儿科');
  if (extra?.category === '孕产' || flags.includes('pregnant') || scenario?.pregnancy || entity?.flags.some(f=>['孕妇','孕晚期','哺乳期'].includes(f)) || !entity&&/妊娠|孕\s*\d+\s*周|孕期|产后/.test(base)) q.push('当前病人为孕产');
  if (extra?.category === '他组死亡') q.push('当日有他人管的病人死亡');
  if (p?.dischargedDay === r.day && (p.mitigated >= 2 || selected.filter(id => /review|recheck|inform|full/.test(id)).length >= 2)) q.push('当日有病人出院且处置得当≥2 次');
  if (p?.inpatient && age >= 18 && age <= 40) q.push('在床有青年病人');
  if (p?.admitted === r.day && /handover|转入|转床/.test(`${p.uid} ${base}`)) q.push('当日有他组转入');
  if (phase === '交班') q.push('主任在场');
  if (phase === '交班' || phase === '查房') q.push('带教实习生');
  if (/会诊|consult|called/.test(`${text} ${flags.join(' ')}`) && !/consult_arrived|consult_completed/.test(flags.join(' '))) q.push('在床有待会诊病人');
  const reviewDay = s.seen['E-045'];
  if (reviewDay !== undefined && reviewDay >= r.day - 1 && s.ledger.commits.some(k => /E-045-c/.test(k))) q.push('当日有病历退回未改');
  if (r.overtime > 0) q.push('当日已加班');
  if (s.chains.some(c => c.facts.some(f => f.type === 'financial_need_disclosed')) || s.ledger.facts.some(f => f.id === 'financial-need-told-representative')) q.push('药代经实际交流已知资金困难');
  if (p?.inpatient && p.spent > p.budget) q.push('在床有超预算病人');
  if (p && (p.readmitted || !p.inpatient && /高血压|糖尿病|慢病/.test(base))) q.push('当前病人为慢病复诊');
  q.push(phase === '夜班' ? '时段=夜班' : '时段=白天');
  if (phase === '结算') { q.push('结算阶段'); if (r.relations.family >= 2) q.push('家人关系 ≥2'); }
  if(p&&s.activeFacts['SAN归零']&&s.activeFacts[`san-wrong-record:${p.uid}`]&&r.journal.some(e=>e.day===r.day&&scopeMatches(e.scope,{kind:'patient',id:p.uid})&&/质控|退回|复核/.test(e.title)))q.push('写入 SAN归零 且当日质控抽查');
  const f = {...factsFor(r, s)};
  const reducedIcuFee=s.ledger.modifiers.find(m=>m.target==='family-icu-fee'&&m.starts<=r.day&&m.expires>=r.day);
  if(reducedIcuFee)f['family-icu-daily-fee']=reducedIcuFee.value??4000;
  if(f['家庭-降级'])f['family-icu-daily-fee']=2000;
  if(p){f['patient-budget-excess']=Math.max(0,p.spent-p.budget);f['patient-budget-unpaid']=Math.max(0,p.spent-p.budget-p.charged);}
  // Published cards are the run's own record of how often an event has happened.
  for(const card of Object.values(s.published)){
    const id=(card as Partial<EventCard>).authoredEventId;
    if(id)f[`event-count:${id}`]=Number(f[`event-count:${id}`]??0)+1;
  }
  if (f['药代-4统方'] || f['药代-5回扣'] || r.facts['prescription-exported']) {
    q.push('写入 统方 或 回扣');
    // The source gives two ways in: a hit on the end-of-run check, or D13 settlement.
    if (r.day === 13 && phase === '结算') q.push('或 D13 结算');
    if (r.day >= 13 && runRandom(r, 'authored:arrest:13') < 0.45) q.push('局末判定命中');
  }
  if (r.facts['resign-requested']) q.push('玩家在结算页选择「提桶跑路」（确认前）');
  if (f['人情债'] || r.facts['li-owes-time']) q.push('写入 人情债');
  if (s.actor.liAwayDays.includes(r.day + 1)) q.push('同事需要');
  if (s.returnedFromLeave === r.day) q.push('归零事件后请假返岗的第一天');
  if (f['自身健康线开启'] || f['健康-开启']) q.push('写入 自身健康线开启');
  return { day: r.day, phase, night: RULES.nightDays.includes(r.day as never), stamina: r.vitals.stamina, san: r.vitals.san, emotion: r.vitals.emotion, depression: r.depression, cash: r.cash, debt: r.debt,
    pressure: authoredCashPressure(r,s), reputation: r.reputation, overspend: chargedBudgetTotal({...r,authored:s}), interest: r.interest, income: r.income, paperDeadline:s.paperDeadline, relations: r.relations, facts: f, seen: s.seen, qualifiers: q,
    scope: p ? { kind: 'patient', id: p.uid } : extra ? { kind: 'patient', id: extra.id } : undefined };
}

/** Additional documented bedside people are their own instances, never mutations of C001–C020. */
const supplemental: Record<string, Omit<EventParticipant, 'id' | 'admitted' | 'active' | 'charges' | 'budget' | 'charged' | 'sourceEvent'>> = {
  'E-005': { name: '鲁长顺', age: 67, sex: '男', bed: 0, category: '普通门诊', history: '清早从县城乘车来院，原定门诊结束后请求加号。' },
  'E-003': { name: '沈其昌', age: 58, sex: '男', bed: 12, category: '恶性终末期', history: '胃镜提示进展期胃癌，妻子在病房陪护。患者希望亲自告诉妻子。' },
  'E-016': { name: '许松年', age: 79, sex: '男', bed: 11, category: '认知障碍', history: '认知障碍患者由家属陪护，家属暂离病房缴费。' },
  'E-020': { name: '陈静岚', age: 62, sex: '女', bed: 14, category: '恶性终末期', history: '患者本人已经收到恶性肿瘤报告，正在等待与主管医师单独交谈。' },
  'E-033': { name: '唐雨晴', age: 29, sex: '女', bed: 0, category: '孕产', history: '孕期咳嗽两周，肺部有湿啰音；丈夫陪同就诊，担心影像检查。' },
  'E-035': { name: '曾崇礼', age: 78, sex: '男', bed: 10, category: '他组死亡', history: '隔壁组患者凌晨去世，主管医师暂不在病区，家属来询问复印流程。' },
};
function participantFor(r: AuthoredRun, s: AuthoredDirectorState, e: AuthoredEvent): EventParticipant | undefined {
  const profile = supplemental[e.id];
  if (!profile) return undefined;
  const existing=s.participants.find(p=>p.sourceEvent===e.id);if(existing)return existing;
  if(e.id==='E-005'){
    const preset=PRESET_BY_ID.get('C-043')!;
    const candidates=compatibleEntities(preset,'门诊').filter(p=>p.sex==='男'&&p.ageYears>=65&&!r.patients.some(old=>old.entityId===p.id));
    const entity=candidates[Math.floor(runRandom(r,'late-outpatient:identity')*candidates.length)];
    if(!entity)return;
    return{...profile,id:`${r.id}:event-patient:${e.id}`,name:entity.name,age:entity.ageYears,sex:entity.sex,entityId:entity.id,presetId:preset.id,admitted:r.day,active:true,charges:0,budget:preset.budget,charged:0,sourceEvent:e.id};
  }
  return s.participants.find(p => p.sourceEvent === e.id) ?? { ...profile, id: `${r.id}:event-patient:${e.id}`, admitted: r.day, active: true, charges: 0, budget:profile.bed===0?1200:15000,charged:0,sourceEvent: e.id };
}
function sourcePatient(r:Run,preset:CasePreset,entity:PatientEntity,id:string,period:PatientPeriod):Patient{
  const definition=instantiatePreset(preset,entity,id,period);definition.entityProfile=structuredClone(entity);
  const p:Patient={uid:id,caseId:preset.id,entityId:entity.id,preset:definition,name:entity.name,bed:0,admitted:r.day,expectedDays:definition.expectedDays,budget:definition.budget,initialBudget:definition.budget,spent:period==='门诊'?definition.baseCost:0,charged:0,stability:0,patience:RULES.ward.initialPatience,damage:0,mitigated:0,active:true,inpatient:false,caredDay:0,explainedDay:0,planned:false,settled:false};
  if(period==='病区')assignBed(r,p);return p;
}
function sonCandidates(r:Run,parent:Patient){
  const age=(parent.preset??CASES.find(c=>c.id===parent.caseId))?.age??0;
  if(age<20)return[];
  const used=new Set(r.patients.map(p=>p.entityId)),parentSex=(parent.preset??CASES.find(c=>c.id===parent.caseId))?.sex;
  return CASE_PRESETS.filter(p=>p.constraints.periods.includes('门诊')).flatMap(preset=>compatibleEntities(preset,'门诊').filter(entity=>{
    const scenario=entityScenario(entity);
    return entity.sex==='男'&&entity.ageYears<=age-18&&!used.has(entity.id)&&(!scenario.roles.has('father')||parentSex==='男')&&(!scenario.roles.has('mother')||parentSex==='女');
  }).map(entity=>({preset,entity}))).sort((a,b)=>runRandom(r,`E026-son:${parent.uid}:${a.preset.id}:${a.entity.id}`)-runRandom(r,`E026-son:${parent.uid}:${b.preset.id}:${b.entity.id}`));
}
function registerSon(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,parent:Patient,source:string){
  if(s.familyRegistrations?.some(a=>a.source===source))return;
  const candidate=sonCandidates(r,parent)[0];if(!candidate)return;
  const work=structuredClone({...r,patients:result.patch.patients??r.patients}),id=`${parent.uid}:E-026-son`,p=sourcePatient(work,candidate.preset,candidate.entity,id,'门诊');
  work.patients.push(p);const card=presetCard(work,p,undefined,'clinical');if(!card)return;
  card.shiftPhase='门诊';card.text=`${parent.name}的儿子${p.name}用自己的身份挂号。${parent.name}所说的“同样的毛病”尚未核实，需要独立评估。\n${card.text}`;
  result.patch.patients=work.patients;result.cards.push(card);(s.familyRegistrations??=[]).push({parentId:parent.uid,patientId:p.uid,day:r.day,source,relation:'son'});
}
/** Other teams supply real, compatible people; no existing player bed changes owner. */
function ensureTeamPatients(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,phase:EventPhase){
  if(phase!=='交班')return;
  const work=structuredClone({...r,patients:result.patch.patients??r.patients});s.clinicalAssignments??=[];
  for(const [owner,event,count]of [['peer','E-043',r.day>=3&&s.seen['E-043']===undefined?3:0],['chief','E-053',r.day===12&&s.seen['E-053']===undefined?1:0]]as const){
    const current=s.clinicalAssignments.filter(a=>a.owner===owner&&work.patients.some(p=>p.uid===a.patientId&&p.active&&p.damage<3));
    for(let i=current.length;i<count;i++){
      const used=new Set(work.patients.map(p=>p.entityId));
      const pool=CASE_PRESETS.filter(p=>p.constraints.periods.includes('病区')).flatMap(preset=>compatibleEntities(preset,'病区').filter(e=>!used.has(e.id)).map(entity=>({preset,entity})));
      if(!pool.length)break;
      const chosen=pool[Math.floor(runRandom(r,`team-patient:${event}:${r.day}:${i}`)*pool.length)],id=`${r.id}:team:${event}:${r.day}:${i}`,p=sourcePatient(work,chosen.preset,chosen.entity,id,'病区');
      // The three-bed handover cannot commandeer occupied beds or turn a waiting patient into a bed.
      if(owner==='peer'&&!p.inpatient){delete work.facts[`awaiting-bed:${p.uid}`];break;}
      p.stability=RULES.ward.handoverStability;p.settled=true;
      work.patients.push(p);s.clinicalAssignments.push({patientId:id,owner,day:r.day,source:event,teamCharged:0});
    }
  }
  if(work.patients.length!==r.patients.length){result.patch.patients=work.patients;result.patch.facts=work.facts;}
}
function addLateOutpatient(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,source:string){
  if(s.activeFacts['late-outpatient-arrived'])return;
  const participant=participantFor(r,s,EVENT_BY_ID['E-005']);if(!participant)return;
  const preset=PRESET_BY_ID.get(participant.presetId??'C-043')!;
  // Old event-only saves retain their identity, not another case's admission.
  const base=participant.entityId?ENTITY_BY_ID.get(participant.entityId):compatibleEntities(preset,'门诊').find(e=>e.sex==='男'&&e.ageYears===participant.age);
  if(!base)return;
  const entity={...base,name:participant.name,age:String(participant.age),ageYears:participant.age};
  const work=structuredClone({...r,patients:result.patch.patients??r.patients}),p=sourcePatient(work,preset,entity,participant.id,'门诊');
  const card=presetCard(work,p,undefined,'quick');if(!card)return;
  card.shiftPhase='门诊';work.patients.push(p);result.patch.patients=work.patients;result.cards.push(card);
  s.participants=s.participants.filter(extra=>extra.id!==p.uid);
  s.activeFacts['late-outpatient-arrived']={day:r.day,source};
}
function addDueAppointments(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,phase:EventPhase){
  for(const appointment of s.appointments??[]){
    if(appointment.arrived||appointment.day>r.day)continue;
    const original=r.patients.find(p=>p.uid===appointment.patientId),ward=!!original?.active&&original.inpatient;
    if(phase!==(ward?'查房':'门诊'))continue;
    if(original?.damage===3){appointment.arrived=true;s.endNotes.push(`${original.name}在预约复诊之前去世，原复诊安排取消。`);continue;}
    const work=structuredClone({...r,patients:result.patch.patients??r.patients});
    if(appointment.source==='E-109'){
      let p:Patient|undefined;for(const caseId of ['C-139','C-150','C-136','C-151']){try{p=createPatient(work,caseId,'quick-family-referral');break;}catch(error){if(!String(error).includes('No compatible patient'))throw error;}}
      if(!p)continue;const bound=presetCard(work,p,undefined,'clinical');if(!bound)continue;
      bound.text=`表姨介绍的邻居带孩子按预约来到门诊。\n${bound.text}`;bound.shiftPhase='门诊';work.patients.push(p);result.patch.patients=work.patients;result.cards.push(bound);appointment.arrived=true;
    }else if(original){
      const p=ward?work.patients.find(p=>p.uid===original.uid)!:structuredClone(original);
      if(!ward){p.uid=`${original.uid}:E-032-return`;p.active=true;p.inpatient=false;p.bed=0;p.admitted=r.day;p.spent=0;p.charged=0;p.settled=false;p.planned=false;p.caredDay=0;p.explainedDay=0;delete p.clinical;delete p.presetNode;delete p.dischargedDay;delete p.budgetSurchargeExempt;p.presetResolved=true;
        const definition=PRESET_BY_ID.get(original.caseId),entity=original.preset?.entityProfile??(original.entityId?ENTITY_BY_ID.get(original.entityId):undefined);
        if(definition&&entity){p.preset=instantiatePreset(definition,entity,p.uid,'门诊');p.preset.revisit={previousPatientId:original.uid,priorGood:original.damage===0,nonAdherent:false};}work.patients.push(p);
      }
      const id=`${appointment.id}:review`;
      result.cards.push({id,kind:ward?'story':'quick',shiftPhase:phase,scope:{kind:'patient',id:p.uid},patientId:p.uid,caseId:p.caseId,last:!ward,title:'约好的复诊',text:`${p.name}的监护人带来昨天的口服药和用药记录。${ward?'孩子已住院，这次复查在病区完成。':'你按约为孩子加号，需要重新问诊、查体并核对用药。'}`,options:[{id:`${id}:assess`,label:'完成问诊、查体和用药核对，记录后续安排',ap:3,minutes:36,cost:0,mechanics:{operation:'exam',quality:'correct'},effects:{stamina:-6,mitigate:1,care:true},result:'本次症状、体征与用药情况已重新核对，复查记录和后续就诊安排已交给监护人。'}]});
      result.patch.patients=work.patients;appointment.arrived=true;
    }
  }
}
function chooseBinding(r: AuthoredRun, s: AuthoredDirectorState, e: AuthoredEvent, phase: EventPhase): { binding: EventBinding; context: EventContext; extra?: EventParticipant } | undefined {
  if(authoredTalentWeight(r,e,1)===0)return;
  const pending=[...r.queue.slice(r.cursor),...(s.sceneAgenda??[]).flatMap(a=>s.published[a.cardId]?[s.published[a.cardId]]:[])];
  if(pending.some(c=>(c as Partial<EventCard>).authoredEventId===e.id&&!c.options.some(o=>r.committed.includes(o.id))))return;
  const stage=({'E-132':1,'E-134':2,'E-136':3,'E-137':4,'E-138':5}as Record<string,number>)[e.id];
  if(stage){
    if(Object.keys(s.activeFacts).some(k=>k.startsWith('rep-recontact-due:'))||s.activeFacts['rep-recontact-closed'])return;
    // After the player was offered grey income at a funding break, the next
    // rung of the ladder arrives without waiting out the usual interval.
    const invited=!!s.activeFacts['gray-income-offered']&&stage===(s.drugStage??0)+1;
    if(!invited&&r.day<(s.drugCooldownUntil??0))return;
    if(s.drugStage!==undefined&&stage>s.drugStage+1)return;
    // The explicit D8 invitation in book 13 keeps its fixed beat; other new
    // stages use the 2–3 day interval in 03 §2.6.
    if(!invited&&!(e.id==='E-134'&&r.day===8)&&r.day<(s.drugNextDay??0))return;
  }
  const project = e.category===7||e.id==='E-135'?'research-project':e.category===5?'representative-account':'audit-project';
  const sourceChain=e.category===7?(s.chains.find(c=>c.chain==='BTF-004'&&c.subjects.projectId&&c.status!=='closed')??[...s.chains].reverse().find(c=>c.chain==='BTF-004'&&c.subjects.projectId&&c.facts.some(f=>f.type==='submitted'))):
    e.id==='E-140'?s.chains.find(c=>c.chain==='BTF-002'&&c.facts.some(f=>f.type==='exchange_performed')):undefined;
  const defaultScope: Scope = sourceChain?(e.id==='E-140'?butterflyReviewScope(sourceChain):{...sourceChain.scope}):e.scopeKind === 'project' ? { kind: 'project', id: `${r.id}:${project}` } : { kind: 'personal', id: `${r.id}:${e.category === 4 ? 'family' : 'self'}` };
  const participant = participantFor(r,s,e);
  let candidates: (Patient | undefined)[] = e.id==='E-005'?[]:e.scopeKind === 'patient' ? r.patients.filter(p => p.damage < 3 && (p.active || e.id === 'E-036' && p.dischargedDay === r.day)) : [undefined];
  if(e.id==='E-059')candidates=r.patients.filter(p=>p.damage===3&&p.caseId!=='C020'&&(p.caredDay>0||!!p.clinical?.choices.length)&&!!r.facts[`patient-death:${p.uid}`]&&r.facts[`patient-death:${p.uid}`].day>=r.day-1);
  if(e.id==='E-056')candidates=r.patients.filter(p=>historicalEventEligible(e.id,r,p));
  if (phase === '查房') candidates = candidates.filter(p => !p || p.inpatient || e.id==='E-036'&&p.dischargedDay===r.day);
  // A night shift walks the ward; an outpatient of that day is not on it.
  if (phase === '夜班') candidates = candidates.filter(p => !p || p.inpatient);
  if (phase === '门诊'&&e.id!=='E-046') candidates = candidates.filter(p => !p || !p.inpatient);
  if(e.id==='E-043'||e.id==='E-053')candidates=candidates.filter(p=>p&&s.clinicalAssignments?.some(a=>a.patientId===p.uid&&a.owner===(e.id==='E-043'?'peer':'chief')));
  else if(e.id!=='E-056')candidates=candidates.filter(p=>!p||isPlayerResponsibleForPatient({...r,authored:s},p));
  if(e.id==='E-048'){
    if(nextFreeBed(r)!==0||r.patients.some(p=>p.active&&p.bed===17))return;
    candidates=candidates.filter(p=>p&&awaitingBed(r,p));
  }
  // Stable binding order: changing how long a player reads does not change the patient.
  candidates.sort((a,b) => runRandom(r, `event:${e.id}:patient:${a?.uid}`) - runRandom(r, `event:${e.id}:patient:${b?.uid}`));
  for (const p of candidates) {
    if(p&&['E-022','E-031'].includes(e.id)&&roomFor(p)<0)continue;
    if(p&&!patientIdentityMatches(e.id,r,p))continue;
    if(p&&!historicalEventEligible(e.id,r,p))continue;
    if(p&&!['E-059','E-056'].includes(e.id)&&/\d+\s*床/.test(e.text)&&(!p.inpatient||p.bed<=0))continue;
    if(e.id==='E-031'&&(!p||(p.preset??CASES.find(c=>c.id===p.caseId))!.age<65||!r.patients.some(other=>other.uid!==p.uid&&other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&receivingOxygen(r,other))))continue;
    if(e.id==='E-046'&&(!p||!p.inpatient||p.bed<=0||p.admitted>=r.day||!(p.settled||p.caredDay>0||p.clinical?.choices.length)))continue;
    if(e.id==='E-022'&&p&&r.patients.filter(other=>other.uid!==p.uid&&other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&other.damage<3).length<2)continue;
    if(e.id==='E-026'&&p&&!sonCandidates(r,p).length)continue;
    if(e.id==='E-003'&&p&&!/胃癌/.test((p.preset?.history??CASES.find(c=>c.id===p.caseId)?.history??[]).join(' ')))continue;
    if(e.id==='E-032'&&p&&(!['C-139','C-151'].includes(p.caseId)||p.damage>0||(p.preset?.age??0)<3))continue;
    if(e.id==='E-162'&&p&&(!['C-001','C-151'].includes(p.caseId)||p.damage>0))continue;
    const ctx = contextFor(r,s,phase,p);
    if (!eventEligible(e,ctx)) continue;
    const scope = p ? { kind: 'patient' as const, id: p.uid } : defaultScope;
    const multi = e.id!=='E-144'&&/(?:三床各计|两床各计|当日三床各计|该三床各计)/.test(e.options.map(o=>o.consequence).join(' '));
    const affected = r.patients.filter(x=>x.active && x.inpatient && x.damage < 3&&(e.id==='E-043'?s.clinicalAssignments?.some(a=>a.patientId===x.uid&&a.owner==='peer'):isPlayerResponsibleForPatient({...r,authored:s},x)));
    if (multi && affected.length < (/三床/.test(e.options.map(o=>o.consequence).join(' ')) ? 3 : 2)) continue;
    const participants=e.id==='E-048'?r.patients.filter(other=>other.active&&other.inpatient&&other.damage<3&&isPlayerResponsibleForPatient({...r,authored:s},other)&&(other.stability<RULES.ward.stabilityNeed||r.day-other.admitted+1<other.expectedDays)).sort((a,b)=>a.stability-b.stability||a.bed-b.bed).slice(0,1):e.id==='E-031'&&p?r.patients.filter(other=>other.uid!==p.uid&&other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&receivingOxygen(r,other)):multi?affected:undefined;
    return { context: ctx, binding: { scope, patientId: p?.uid, patientName: p?.name, bed: p?.bed, patients: (e.id==='E-010'&&p?[p,sameNameWardPatient(r,p)!]:participants)?.map(x=>({id:x.uid,bed:x.bed,name:x.name})), instanceId: `${r.id}:event:${e.id}:${r.day}`, day:r.day, phase,
      actorId: e.category===1?p?.uid:({chief:'tang',nurse:'jiang',peer:'li',research:'zhou',rep:'ye',father:'father',mother:'mother'}as Record<string,string>)[eventRuntimeActor(e,{scope,day:r.day,phase,instanceId:''})??'']??(e.category===6?'auditor':undefined), projectId: scope.kind === 'project' ? scope.id : undefined } };
  }
  if (participant) {
    const ctx = contextFor(r,s,phase,undefined,participant);
    if (eventEligible(e,ctx)) return { context:ctx, extra:participant, binding:{scope:{kind:'patient',id:participant.id},patientId:participant.id,patientName:participant.name,bed:participant.bed,instanceId:`${r.id}:event:${e.id}:${r.day}`,day:r.day,phase,actorId:participant.id} };
  }
  return undefined;
}

function isMandatory(e: AuthoredEvent,r:AuthoredRun): boolean { return e.weight === 0 || ['E-102','E-106'].includes(e.id) || ['E-099','E-105'].includes(e.id) && r.day===10 || ['E-132','E-134'].includes(e.id) && r.day===8 || ['E-159','E-160'].includes(e.id)&&RULES.wageDays.includes(r.day as never); }
export const REPRESENTATIVE_STAGE_EVENTS=['E-132','E-134','E-136','E-137','E-138']as const;
export const representativeContactChance=(pressure:number)=>pressure>=60?.6:pressure>=40?.3:.1;
function freshResult(s:AuthoredDirectorState):DirectorResult { return {patch:{authored:s},effects:[],cards:[],removeCardIds:[]}; }
function consumePaperCredit(r:Run,s:AuthoredDirectorState,result:DirectorResult,scope:Scope,source:string){
  if(!paperStepCredit({...r,authored:s},scope))return;
  s.ledger.modifiers=s.ledger.modifiers.filter(m=>!(m.target==='paper-step-credit'&&scopeMatches(m.scope,scope)));
  delete s.activeFacts['research-conference-credit'];
  result.effects.push({id:`${source}:conference-credit`,scope,effects:{clear:['research-conference-credit']},text:'会议提供的现成材料减少了这次投稿整理的工作量，署名经过与原始资料仍分别保留。'});
}

/** Patient facts created during a clinical action must be checked before the
 * next node, not only at the beginning of an otherwise indivisible shift. */
export function pendingClinicalEvent(r:AuthoredRun,card:Card,option:Option):DirectorResult{
  const s=initialize(r),result=freshResult(s),p=r.patients.find(p=>p.uid===card.patientId);
  if(!p||p.damage>=3||(!option.clinicalChoice&&!card.presetNode&&card.kind!=='ward')||option.interaction==='graph-continue')return result;
  const phase=card.shiftPhase??(card.kind==='night'?'夜班':p.inpatient?'查房':'门诊');
  if(phase!=='查房'&&phase!=='门诊')return result;
  const ctx=contextFor(r,s,phase,p);
  const complete=!!p.clinical?.outcomeId||!!p.presetResolved;
  const ids=complete&&card.kind!=='ward'?['E-036']:['E-013','E-001','E-011','E-017','E-031','E-036'];
  const pool=ids.map(id=>EVENT_BY_ID[id]).filter(e=>patientIdentityMatches(e.id,r,p)&&eventEligible(e,ctx)&&!(e.id==='E-031'&&(roomFor(p)<0||!r.patients.some(other=>other.uid!==p.uid&&other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&receivingOxygen(r,other))))&&!Object.values(s.published).some(c=>(c as Partial<EventCard>).authoredEventId===e.id));
  if(!pool.length)return result;
  const total=pool.reduce((sum,e)=>sum+eventWeight(e,ctx),0);let needle=runRandom(r,`clinical-event:${option.id}`)*total;
  const event=pool.find(e=>e.id==='E-013')??pool.find(e=>(needle-=eventWeight(e,ctx))<=0)??pool.at(-1)!;
  const binding:EventBinding={scope:{kind:'patient',id:p.uid},patientId:p.uid,patientName:p.name,bed:p.bed,instanceId:`${r.id}:event:${event.id}:${r.day}`,day:r.day,phase,actorId:p.uid};
  if(event.id==='E-031')binding.patients=r.patients.filter(other=>other.uid!==p.uid&&other.active&&other.inpatient&&roomFor(other)===roomFor(p)&&receivingOxygen(r,other)).map(p=>({id:p.uid,bed:p.bed,name:p.name}));
  const next=prepareTalentEvent(r,eventToCard(event,binding,ctx))as ClinicalEventCard;next.shiftPhase=phase;
  if(event.id==='E-001'){const pronoun=(p.preset??CASES.find(c=>c.id===p.caseId))?.sex==='女'?'她':'他';next.text=`护士准备核对下一次抗菌药时，陪床的女儿提了一句：「上回在县医院打头孢，${pronoun}胳膊上起了一片疹子。」患者仍说自己没有药物过敏。下一次给药前，需要先核实这段经过。`;}
  if(event.id==='E-031'){next.text=`护士来报，${p.bed}床的老人${p.name}躲在卫生间抽烟。同病房的${binding.patients?.map(p=>`${p.bed}床${p.name}`).join('、')}正在吸氧。`;next.options[2].effects.hazards=[];}
  const resumeNode=!complete&&card.kind!=='ward'?(p.clinical?.nodeId??p.presetNode):undefined;
  if(resumeNode)next.clinicalResume={patientId:p.uid,nodeId:resumeNode};
  if(event.id==='E-013'&&(p.preset??CASES.find(c=>c.id===p.caseId))!.age<18){next.text='你解释完腰穿的目的，孩子的监护人仍然摇头：「听人说做了以后腰会一直疼。我们不同意。」你把检查目的、拒绝后的风险与可以先做的治疗再次说明。';next.options=next.options.map(o=>({...o,result:o.result.replaceAll('患者','监护人'),check:o.check?{...o.check,failureText:o.check.failureText?.replaceAll('患者','监护人')}:undefined}));}
  s.published[next.id]=next;result.cards.push(next);
  if(Object.keys(event.onEnter).length)result.effects.push({id:`${next.id}:enter`,scope:binding.scope,effects:event.onEnter,text:event.title});
  return result;
}

export function authoredTrolleyWorld(r:AuthoredRun,s:AuthoredDirectorState,phase:EventPhase):TrolleyWorld{
  const flags=factsFor(r,s),facts:string[]=[];
  if(flags['家庭-车祸-ICU中']){facts.push('family-icu');const started=flags['家庭-车祸'];if(started&&typeof started==='object'&&r.day-started.day<=1)facts.push('recent-family-icu');}
  if(flags['药代-0搭话'])facts.push('representative-contact');
  if(flags['飞检-进驻'])facts.push('audit-open');
  if(s.chains.some(c=>c.chain==='BTF-004'&&c.facts.some(f=>f.type==='verified_problem'&&f.knownBy.includes('player'))))facts.push('verified-colleague-false-data');
  for(const p of r.patients){
    const recorded=flags[`patient:${p.uid}:recorded`]||flags[`recording-full:${p.uid}`]||flags[`clinical:${p.uid}:recording-exists`]||s.ledger.facts.some(f=>f.scope.kind==='patient'&&f.scope.id===p.uid&&f.id==='录音在手')||s.chains.some(c=>c.subjects.patientId===p.uid&&c.chain==='BTF-003'&&c.consumed.includes('BTF-003:N01'));
    if(recorded)facts.push(`recording:${p.uid}`);
    const held=s.activeFacts[`pharmacy-held:${p.uid}`];if(held&&r.day-held.day>=3)facts.push(`three-day-debt:${p.uid}`);
  }
  const nightArrivalIds=[...new Set(r.queue.slice(r.cursor).filter(card=>{
    const p=r.patients.find(p=>p.uid===card.patientId);
    return card.kind==='night'&&(card.clinicalGraph||card.presetNode)&&p?.active&&!p.clinical?.outcomeId&&!p.clinical?.choices.length&&!p.presetResolved&&!r.facts[`night-started:${p.uid}`]&&!r.journal.some(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&!!e.operation);
  }).map(card=>card.patientId!))];
  return{day:r.day,phase,patients:r.patients,facts,peerAvailable:!s.actor.liAwayDays.includes(r.day)&&!r.debuffs.includes('B16'),nightArrivalIds};
}

function paperTalentCommitted(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,choiceId:string,projectId:string,scope:Scope,chain?:ButterflyState){
  if(!r.talents.includes('T29')||!AUTOMATIC_BEAUTIFICATION_CHOICES.includes(choiceId))return;
  const hook=talentResearch(eventTalentContext(r),projectId);if(!hook.automatic)return;
  result.patch.talentMemory=hook.memory;
  const flags=[...(hook.effects.flags??[]),'科研-造假','科研-收口'];
  result.effects.push({id:`${projectId}:talent-beautification`,scope,effects:{flags,clear:['科研-诚实']},text:'周乔看过删改前后的稿件，知道投稿表格与原始结果不一致。'});
  activateFacts(s,{flags,clear:['科研-诚实']},r.day,choiceId);
  if(chain){
    for(const type of ['verified_problem','problem_known','knowingly_false_submission'])if(!chain.facts.some(f=>f.type===type))chain.facts.push({id:`${chain.id}:talent:${type}`,type,scope,subjects:{...chain.subjects},sourceChoiceId:choiceId,day:r.day,knownBy:['player','zhou'],observations:[{actorId:'zhou',source:choiceId,day:r.day,channel:'present'}]});
    chain.facts=chain.facts.filter(f=>f.type!=='honest_submission');
  }
  if(runRandom(r,`talent-retraction:${projectId}`)<hook.retractionProbability)s.activeFacts[`talent-retraction-due:${projectId}`]={day:Math.min(14,r.day+1),source:choiceId};
}

export function buildAuthoredEvents(r: AuthoredRun, phase: EventPhase): DirectorResult {
  const s=initialize(r), result=freshResult(s), key=`${r.day}:${phase}`;
  if(s.scheduled.includes(key))return result;
  s.scheduled.push(key);
  if(phase==='交班'){const wedding=weddingDayCard({...r,authored:s});if(wedding){s.published[wedding.id]=wedding;result.cards.push(wedding);}}
  const leave=isFullDayLeave(r);
  if(!leave)ensureTeamPatients(r,s,result,phase);
  r={...r,...result.patch};
  if(!leave)for(const card of pendingPeerExamObservations(r,phase)){s.published[card.id]=card;result.cards.push(card);}
  if(!leave){const card=pendingGlucoseTranscription(r,phase);if(card){s.published[card.id]=card;result.cards.push(card);}}
  if(phase==='结算'&&r.day<=14&&!factsFor(r,s)['药代-上交']&&!s.activeFacts['rep-recontact-closed']){
    const pending=Object.entries(s.activeFacts).find(([k,v])=>k.startsWith('rep-recontact-due:')&&v.day<=r.day);
    if(pending){const [key,due]=pending,stage=Number(key.split(':').at(-1));
      const card=makeRepresentativeRecontact({...r,authored:s},stage,due.source,due.day);
      if(!s.published[card.id]){s.published[card.id]=card;result.cards.push(card);}
    }
  }
  if(phase==='结算')for(const [key,due]of Object.entries(s.activeFacts).filter(([k,v])=>k.startsWith('rep-recontact-interview:')&&v.day<=r.day)){
    const id=`${key}:notice`;if(s.published[id])continue;
    const card:Card={id,kind:'story',shiftPhase:'结算',chain:'REP-RECONTACT-INQUIRY',actor:'auditor',scope:{kind:'project',id:`${r.id}:representative-account`},title:'讲课与署名的收款核对',text:'核查人员根据已经发生的讲课或会议署名发来通知，要求说明实际工作、付款人、金额和资料来源。通知只列你实际接受的事项，没有把拒绝的邀请写成收款。',options:[{id:`${id}:reply`,label:'按本次实际工作和付款记录逐项答复',ap:1,minutes:12,cost:0,effects:{flags:['药代-约谈',`rep-recontact-interview-complete:${key}`]},result:'你写清自己参加过什么工作、收了谁的钱，再列出手里的材料，交出了答复。核查人员还会对照实际材料核实。'}]};
    s.published[id]=card;result.cards.push(card);
  }
  if(!leave){addDueAppointments(r,s,result,phase);deliverPeerReferrals(r,s,result,phase);}
  if(!leave&&phase==='门诊'&&s.activeFacts['late-outpatient-due']?.day<=r.day&&!s.activeFacts['late-outpatient-arrived'])addLateOutpatient(r,s,result,key);
  if(phase==='结算'||r.day>=14&&phase==='日终')for(const [fact,due]of Object.entries(s.activeFacts).filter(([k,v])=>k.startsWith('talent-retraction-due:')&&v.day<=r.day)){
    const projectId=fact.slice('talent-retraction-due:'.length),id=`${projectId}:talent-retraction`;
    if(s.published[id])continue;
    const card:Card&{talentPaperRetraction:string}={id,kind:'story',title:'期刊撤稿通知',text:'期刊核对原始数据后，决定撤回这篇稿件。通知同时抄送了通讯作者和科室，主任已经看到删改前后的表格。周乔把你留存的原稿放在桌边。',scope:{kind:'project',id:projectId},talentPaperRetraction:projectId,options:[{id:`id:ack:${projectId}`,label:'确认收到，保留原始材料并说明删改经过',ap:1,minutes:0,cost:0,effects:{reputation:-10,relations:{chief:-2},flags:['科研-撤稿',`retracted:${projectId}`,`chief_knows:${projectId}`]},result:'你确认收到通知，把原始资料与更正说明一并归档。撤稿记录已经公开，署名与数据问题还需要继续说明。'}]};
    s.published[id]=card;result.cards.push(card);
  }
  result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>shouldSuppressLegacyStory(r,c.id)).map(c=>c.id));
  if(!leave&&phase==='夜班' && s.activeFacts[`extra-night:${r.day}`]) {
    const work=structuredClone(r), ids:string[]=[],plan=extraShiftPlan(s,r.day);
    for(const [i,caseId] of ['C004','C012'].slice(0,plan.cases).entries()){
      const p=createPatient(work,caseId,`night-extra-${i}`);
      const card=beginClinical(work,p);
      if(card){work.patients.push(p);card.kind='night';ids.push(p.uid);result.cards.push(card);}
    }
    result.patch.patients=work.patients;result.patch.nightMinutes=r.nightMinutes+plan.minutes;result.patch.nightBudget=r.nightBudget+plan.minutes;
    for(const uid of ids)s.activeFacts[`extra-night-patient:${uid}`]={day:r.day,source:key};
    if(plan.alarm){const id=`${r.id}:extra-night-call:${r.day}`;
    result.cards.push({id,kind:'night',title:'输液泵报警',text:'护士打来电话：“输液泵一直在报警，患者暂时没说哪里不舒服。你先来核对患者和用药，看看泵速，再处理管路吧。”',scope:{kind:'personal',id:r.id},options:[{id:`${id}:check`,label:'到床旁核对并处理报警',ap:0,minutes:20,cost:0,effects:{stamina:-3},result:'你核对药物和泵速都没有问题，处理了折叠的管路。护士重新检查穿刺点后，输液泵不再报警了。'}]});
    s.activeFacts[`extra-night-task:${id}`]={day:r.day,source:key};}
  }
  const eligible=AUTHORED_EVENTS.flatMap(e=>{
    if(leave&&(![3,4,6].includes(e.category)||['E-161','E-162','E-164','E-165','E-168','E-171','E-172','E-174','E-176'].includes(e.id)))return[];
    // A previous equivalent legacy choice is real history; never ask for it twice.
    if((LEGACY_EVENT_EQUIVALENTS[e.id]??[]).some(id=>r.facts[`seen:${id}`]))return [];
    const b=chooseBinding(r,s,e,phase);return b?[{event:e,...b}]:[];
  });
  if(!leave&&r.day===8&&phase==='结算'&&s.seen['E-132']===undefined&&s.seen['E-134']===undefined&&!factsFor(r,s)['药代-1餐叙']&&!factsFor(r,s)['药代-上交']&&r.day>=(s.drugCooldownUntil??0)&&!eligible.some(x=>x.event.id==='E-132')){
    const event={...EVENT_BY_ID['E-132'],text:'科里转来叶茗的聚餐邀请，这是你第一次收到她的工作消息。\n'+EVENT_BY_ID['E-132'].text,onEnter:{flags:['药代-0搭话']}},scope:Scope={kind:'project',id:`${r.id}:representative-account`},context=contextFor(r,s,phase);
    context.facts={...context.facts,'药代-0搭话':{day:r.day}};
    eligible.push({event,context,binding:{scope,projectId:scope.id,actorId:'ye',day:r.day,phase,instanceId:`${r.id}:event:E-132:${r.day}`}});
  }
  // This talent pair supplies a real interview notice even without a previous inspection draw.
  if(phase==='结算'&&r.day>=9&&r.facts['forced_audit_interview']&&s.seen['E-156']===undefined&&!eligible.some(x=>x.event.id==='E-156')){
    const scope:Scope={kind:'project',id:`${r.id}:audit-project`};
    eligible.push({event:EVENT_BY_ID['E-156'],context:contextFor(r,s,phase),binding:{scope,projectId:scope.id,actorId:'auditor',day:r.day,phase,instanceId:`${r.id}:forced-audit:${r.day}`}});
  }
  const required=eligible.filter(x=>isMandatory(x.event,r));
  // A D10 family peak and first exhaustion variants are mutually exclusive offers.
  const filtered=required.filter((x,i,a)=> !['E-099','E-105'].includes(x.event.id) || x.event.id===a.filter(x=>['E-099','E-105'].includes(x.event.id))[Math.floor(runRandom(r,'family:peak')*a.filter(x=>['E-099','E-105'].includes(x.event.id)).length)]?.event.id);
  const collapse=filtered.filter(x=>['E-197','E-198','E-199'].includes(x.event.id));
  const selected=filtered.filter(x=>(!collapse.includes(x)||x===collapse[Math.floor(runRandom(r,'collapse:first')*collapse.length)]) && (x.event.id!=='E-203'||phase!=='夜班'));
  const contacts=r.day>=7&&phase==='结算'?eligible.filter(x=>REPRESENTATIVE_STAGE_EVENTS.includes(x.event.id as typeof REPRESENTATIVE_STAGE_EVENTS[number])&&!isMandatory(x.event,r)):[];
  const contact=contacts[0];
  if(contact&&runRandom(r,`representative-contact:${r.day}`)<Math.min(1,representativeContactChance(contact.context.pressure??0)*authoredTalentWeight(r,contact.event,1)*eventTuning(s.ledger,r.day).drugEventWeight))selected.push(contact);
  const pool=eligible.filter(x=>!isMandatory(x.event,r) && !selected.includes(x)&&!contacts.includes(x)&&!(x.event.id==='E-100'&&selected.some(x=>x.event.id==='E-102')));
  const weights=pool.map(x=>authoredTalentWeight(r,x.event,eventWeight(x.event,x.context))*auditEventWeight(r,x.event)*(x.event.category===5?eventTuning(s.ledger,r.day).drugEventWeight:1)*(x.event.category===6&&s.activeFacts['低标入院']?1.5:1)*s.ledger.modifiers.filter(m=>m.target===`event-weight:${x.event.id}`&&m.starts<=r.day&&m.expires>=r.day).reduce((v,m)=>v*(m.factor??1),1));
  const randomPicks:typeof pool=[];
  // A night beat exists only on an actual night shift; a day without one
  // builds no night cards (V-24).
  const nightOnDuty=phase!=='夜班'||r.nightBudget>0||!!s.activeFacts[`extra-night:${r.day}`];
  const slots=nightOnDuty?randomSceneSlots(r.day,phase):0;
  for(let slot=0;slot<slots;slot++){
    const total=pool.reduce((sum,item,i)=>sum+(randomPicks.includes(item)?0:weights[i]),0);
    if(total<=0)break;
    let ticket=runRandom(r,`authored:${key}:draw:${slot}`)*total;
    const picked=pool.find((item,i)=>!randomPicks.includes(item)&&(ticket-=weights[i])<0);
    if(picked)randomPicks.push(picked);
  }
  selected.push(...randomPicks);
  // Mandatory requests cannot be displaced by an echo. Prepare their real
  // cards now so today's bill participates in today's conflict, not tomorrow's.
  // Cache the ICU variant: its course draw and entry effects happen only once.
  const mandatoryCards=new Map<string,Card>();
  for(const {event:e,binding,context}of selected.filter(x=>isMandatory(x.event,r))){
    let card:Card=prepareTalentEvent(r,eventToCard(e,binding,context));
    if(e.id==='E-102')card=familyDeathVariant(r,card as EventCard)??card;
    mandatoryCards.set(e.id,card);registerFamilyInvoice(s,card,e.id,r.day);
  }
  // Department teaching is a real independent origin, not a fictitious drug
  // representative contact inserted merely to unlock the research graph.
  if(!leave&&phase==='结算'&&r.day===6&&s.actor.sharedResearch&&!s.chains.some(c=>c.chain==='BTF-004')){
    const chain=startButterfly('BTF-004',`${r.id}:BTF-004:department-teaching`,{actorId:'zhou',projectId:`${r.id}:department-research`,datasetId:`${r.id}:department-slides`,recipientIds:['player','zhou']});
    chain.entrySource='department-teaching';s.chains.push(chain);
    s.activeFacts['department-teaching-received']={day:r.day,source:chain.id};
  }
  // Existing due butterfly obligations have priority over the random slot.
  if(!leave&&(phase==='交班'||phase==='结算'))openComplaintRecordingChains(r,s);
  const due=buildButterflyCards(r,s,phase);
  if(phase==='结算'){const echo=auditEchoCard({...r,authored:s});if(echo){s.published[echo.id]=echo;due.push(echo);}}
  due.push(...buildSourceFollowups({...r,authored:s},phase));
  s.trolley??=emptyTrolleyLedger();
  if(phase==='结算'){
    for(const token of s.trolley.tokens.filter(t=>!t.resolved&&t.due<=r.day&&!s.published[`${t.id}:${t.stage}`]))due.push(trolleyEchoCard(r,token));
  }
  const offeredEchoes=scheduleEchoScenes(r,s,phase,due);
  const merging=due.filter(c=>'butterflyMerge'in c);
  result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>merging.some(m=>mergeClaimsScene(m,c))).map(c=>c.id));
  // Echoes keep their own daily quota (RULES.events.echoDailyCaps) and the
  // trolley keeps its own draw, so neither cancels an authored random event.
  result.cards.push(...offeredEchoes);
  if(!leave&&r.day>1&&runRandom(r,`trolley-slot:${key}`)<.3){
    const trolley=pickTrolley(r,phase,s.trolley,authoredTrolleyWorld(r,s,phase));
    if(trolley){s.trolley.seen.push(trolley.trolley.sourceId);s.published[trolley.id]=trolley;result.cards.push(trolley);}
  }
  for(const chain of s.chains){
    const prefix=({'BTF-001':'shift-','BTF-002':'cash-','BTF-003':'record-','BTF-004':'research-'}as const)[chain.chain];
    result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>c.id.startsWith(prefix)||c.id.includes(`:${prefix}`)).map(c=>c.id));
  }
  for(const chosen of selected){
    const {event:e,binding,context,extra}=chosen;
    if(extra&&!s.participants.some(p=>p.id===extra.id))s.participants.push(extra);
    let card:Card=mandatoryCards.get(e.id)??prepareTalentEvent(r,eventToCard(e,binding,context));
    if(e.id==='E-102') {
      if(!mandatoryCards.has(e.id))card=familyDeathVariant(r,card as EventCard)??card;
      if((card as EventCard).onEnter.flags?.includes('father-deceased'))activateFacts(s,(card as EventCard).onEnter,r.day,`${card.id}:enter`);
    }
    card=budgetNoticeCopy(r,card);
    const historicalPatient=r.patients.find(p=>p.uid===binding.patientId);if(historicalPatient)card=projectHistoricalEvent(card,e.id,r,historicalPatient,binding);
    if(e.id==='E-031'){
      card.text=`护士来报，${binding.bed}床的老人${binding.patientName}躲在卫生间抽烟。同病房的${binding.patients?.map(p=>`${p.bed}床${p.name}`).join('、')}正在吸氧。`;
      card.options[2].effects.hazards=[];
    }
    if(e.id==='E-037')card.text=card.text.replace('住院第三天',`住院第${Math.max(1,r.day-(r.patients.find(p=>p.uid===binding.patientId)?.admitted??r.day)+1)}天`);
    if(e.id==='E-022')card.text='病房里挤着六位探视的家属，有人在床边吃盒饭，过道不好通行。护士长站在门口，对你说：「你负责的患者家属，麻烦你来劝劝。」';
    const speakingPatient=r.patients.find(p=>p.uid===binding.patientId);if(speakingPatient)card=projectPatientSpeaker(card,speakingPatient);
    if(e.id==='E-001'&&(r.patients.find(p=>p.uid===binding.patientId)?.preset??CASES.find(c=>c.id===r.patients.find(p=>p.uid===binding.patientId)?.caseId))?.sex==='女')card.text=card.text.replace('他胳膊','她胳膊');
    if(e.id==='E-048'){
      card.text=`急诊的${binding.patientName}还在等待住院床位。5至16床均已占用。护士长说没有常规空床，主任提出在走廊临时加一张床。两人等你答复。`;
      const old=binding.patients?.[0];
      if(old){card.options[2].label=`让尚未达到出院标准的${old.bed}床${old.name}今天离院，接入候床患者`;card.options[2].effects.hazards=[];}
      else card.options=card.options.filter(o=>!o.id.endsWith('E-048-c'));
    }
    if(e.id==='E-034')card.text='一位候诊者径直走进诊室：「我是你们院长的老同学，他让我直接找你。」他没有按原来的顺序等候。';
    if(e.id==='E-046'){
      card.text=`${phase==='交班'?'交班时':'门诊期间'}，检验科打来电话：「${binding.bed}床${binding.patientName}，本次送检的血钾为 6.8 mmol/L，危急值，请复述。」这份报告刚送到护士站，需要立即核对并安排床旁处置。`;
      const effects={flags:[`critical-potassium-received:${binding.patientId}`]};
      activateFacts(s,effects,r.day,`${card.id}:critical-report`);
      result.effects.push({id:`${card.id}:critical-report`,scope:binding.scope,effects,text:`检验科本次电话报告：${binding.patientName}，${binding.bed}床，血钾 6.8 mmol/L。报告于第${r.day}天${phase}收到，处置尚待记录。`});
    }
    if(e.id==='E-059'){
      card.title='死亡病例交班';card.text=`交班时，护士把${binding.patientName}的死亡病例材料交给你。患者已经去世，原床位不再占用；你需要核对自己参与的诊疗经过，完成本次死亡记录。`;
    }
    if(e.id==='E-013'){
      const p=r.patients.find(p=>p.uid===binding.patientId),age=(p?.preset??CASES.find(c=>c.id===p?.caseId))?.age??18;
      if(age<18){card.text='你解释完腰穿的目的，孩子的监护人仍然摇头：「听人说做了以后腰会一直疼。我们不同意。」你把检查目的、拒绝后的风险与可以先做的治疗再次说明。';card.options=card.options.map(o=>({...o,result:o.result.replaceAll('患者','监护人'),check:o.check?{...o.check,failureText:o.check.failureText?.replaceAll('患者','监护人')}:undefined}));}
    }
    if(e.id==='E-156'&&r.facts['forced_audit_interview'])card.text='稽核组发来约谈通知，请你带上实际经手的处方、审批材料和往来款项记录。哪些内容由你签署、依据在哪里，需要分别说明；询问本身还不是调查结论。';
    if(['E-139','E-141','E-152'].includes(e.id)){
      const due=Math.max(0,(s.benefitsReceived??0)-(s.benefitsReturned??0));
      card.options[0].effects.cash=-due;
      card.options[0].hint=`退缴实际尚未退还的款项 ¥${due.toLocaleString('en-US')}`;
      card.options[0].result=due>0?`你按实际收款记录退缴了 ¥${due.toLocaleString('en-US')}，收据上写明金额和日期。`:'你核对了收款记录，没有还需要退的钱。';
      if(e.id==='E-141'){
        const returned=Math.min(3000,due);card.options[1].effects.cash=-returned;
        card.options[1].hint=`退缴 ¥${returned.toLocaleString('en-US')}，尚余 ¥${(due-returned).toLocaleString('en-US')}`;
        card.options[1].result=`收据记录本次退缴 ¥${returned.toLocaleString('en-US')}。此前尚未退还的款项还剩 ¥${(due-returned).toLocaleString('en-US')}。`;
      }
    }
    const entry=chainEntry[e.id];
    if(entry&&!s.chains.some(c=>c.chain===entry[0]&&c.status!=='closed')){
      const subjects={actorId:entry[0]==='BTF-004'?'zhou':'li',patientId:binding.patientId,projectId:entry[0]==='BTF-004'?`${r.id}:research-project`:undefined,datasetId:entry[0]==='BTF-004'?`${r.id}:slides-source`:undefined,recordId:entry[0]==='BTF-003'?`${binding.patientId}:recording`:undefined,shiftId:entry[0]==='BTF-001'?`shift:${r.day+1}`:undefined,sponsorId:'ye',recipientIds:['player','zhou']};
      const chain=startButterfly(entry[0],`${r.id}:${entry[0]}:${e.id}`,subjects,entry[1]);
      s.chains.push(chain);
      const bcard=makeButterflyCard(r,s,chain,phase);
      if(bcard){bcard.authoredEventId=e.id;card=bcard;}else s.chains.splice(s.chains.indexOf(chain),1);
    }
    if(result.cards.some(c=>c.id===card.id))continue;
    registerFamilyInvoice(s,card,e.id,r.day);
    s.published[card.id]=card;result.cards.push(card);
    for(const legacy of LEGACY_EVENT_EQUIVALENTS[e.id]??[])result.removeCardIds.push(...r.queue.filter(c=>c.id===legacy||c.id.endsWith(`:${legacy}`)).map(c=>c.id));
    if(e.id==='E-205'&&(factsFor(r,s)['家庭-丧亲']||factsFor(r,s)['father-deceased']))card.text='母亲的电话你没有接，随后是护士长的：“你家里人在楼下。”母亲和弟弟赶来了。她手里拿着你的体检报告，问你能不能先下楼见一面。';
    // A prepared course variant owns its entry effects (including bereavement).
    const onEnter=(card as Partial<EventCard>).onEnter??e.onEnter;
    if(Object.keys(onEnter).length)result.effects.push({id:`${card.id}:enter`,scope:binding.scope,effects:onEnter,text:card.title});
  }
  // The delivered bill opens a genuine funding discussion before its original
  // payment choice. It is not inferred next day from an unrelated family flag.
  if(phase==='结算')for(let i=0;i<s.chains.length;i++){
    const chain=s.chains[i];if(chain.chain!=='BTF-002'||chain.status==='closed'||chain.consumed.includes('BTF-002:N02'))continue;
    const w=authoredGraphWorld(r,s,chain,phase);
    if(!w.facts.includes('family_bill_due')||!w.facts.includes('cash_gap'))continue;
    const routed=routeButterfly(chain,w,['BTF-002:N02']);if(!routed.cursor.endsWith(':N02'))continue;
    const card=makeButterflyCard(r,s,routed,phase);
    if(card&&!s.published[card.id]){s.chains[i]=routed;s.published[card.id]=card;result.cards.unshift(card);}
  }
  if(phase==='结算'&&!s.chains.some(c=>c.chain==='BTF-002'&&!c.consumed.includes('BTF-002:N02')&&Object.values(s.published).some(card=>(card as Partial<ButterflyCard>).butterfly?.chainStateId===c.id&&(card as ButterflyCard).butterfly.nodeId==='BTF-002:N02'))){
    const bill=s.familyInvoices?.find(b=>canContactForFamilyFunding({...r,authored:s},b.id));
    if(bill){const contact=familyFundingContactCard(r,bill.id);if(!s.published[contact.id]){s.published[contact.id]=contact;result.cards.unshift(contact);}}
  }
  // A selected random family request is known only after ordinary scene slots
  // are settled. It can still replace today's uncompleted work appointment.
  // Do not reroute other graphs or publish the random requests it displaced.
  const lateMerges=appendButterflyMerges(r,s,phase,[],'XJ-01');
  if(lateMerges.length){
    const offered=scheduleEchoScenes(r,s,phase,lateMerges);
    for(let i=result.cards.length-1;i>=0;i--)if(lateMerges.some(m=>mergeClaimsScene(m,result.cards[i])))result.cards.splice(i,1);
    result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>lateMerges.some(m=>mergeClaimsScene(m,c))).map(c=>c.id));
    result.cards.unshift(...offered);
  }
  if(!leave&&!result.cards.length&&r.day>1){
    const card=pickTrolley(r,phase,s.trolley,authoredTrolleyWorld(r,s,phase));
    if(card){s.trolley.seen.push(card.trolley.sourceId);s.published[card.id]=card;result.cards.push(card);}
  }
  for(const card of due)if('trolley'in card)s.published[card.id]=card;
  return result;
}

/** Ward-day charges settle after the usual evening visit. Crossing a weekly
 * threshold there still produces that day's notice, without charging twice. */
export function lateWeeklyBudgetEvents(r:Run):DirectorResult {
  const s=initialize(r),result=freshResult(s);
  if(!RULES.wageDays.includes(r.day as never))return result;
  for(const id of ['E-159','E-160']){
    if(Object.values(s.published).some(c=>(c as Partial<EventCard>).authoredEventId===id&&(c as Partial<EventCard>).eventBinding?.day===r.day))continue;
    const e=EVENT_BY_ID[id],matched=chooseBinding(r,s,e,'结算');
    if(!matched)continue;
    const {scope}=matched.binding,card=prepareTalentEvent(r,budgetNoticeCopy(r,eventToCard(e,{...matched.binding,instanceId:`${r.id}:late-budget:${id}:${r.day}`},matched.context)));
    card.shiftPhase='日终';s.published[card.id]=card;result.cards.push(card);
    if(Object.keys(card.onEnter).length)result.effects.push({id:`${card.id}:enter`,scope,effects:card.onEnter,text:card.title});
  }
  return result;
}

/** Acute interruption, independent of phase scheduling. The caller increments collapse counts afterwards. */
export function forceZeroEvent(r:AuthoredRun,vital:'stamina'|'san'|'emotion',phase:EventPhase,triggeringPatientId?:string):DirectorResult{
  const s=initialize(r),result=freshResult(s),night=phase==='夜班';
  const offered=Object.values(s.published).find(c=>'acuteVital'in c&&(c as Card&{acuteVital:string}).acuteVital===vital&&!c.options.some(o=>r.committed.includes(o.id)));
  if(offered){result.cards.push(offered);return result;}
  const current=r.patients.find(p=>p.uid===triggeringPatientId)??r.patients.find(p=>p.uid===r.queue[r.cursor]?.patientId&&p.active&&p.damage<3);
  const marked=Object.keys(s.activeFacts).filter(k=>k.startsWith('san-wrong-record:')).map(k=>k.slice('san-wrong-record:'.length));
  const qualityPatient=r.patients.find(p=>marked.includes(p.uid)&&r.journal.some(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&/质控|退回|复核/.test(e.title)&&e.day>=s.activeFacts[`san-wrong-record:${p.uid}`].day));
  let id=vital==='stamina'?['E-197','E-198','E-199'][Math.floor(runRandom(r,`acute:stamina:${r.exhausted}`)*3)]:vital==='san'?qualityPatient?'E-202':night?'E-201':'E-200':night?'E-204':'E-203';
  const event=EVENT_BY_ID[id],p=qualityPatient??current;
  const binding:EventBinding={instanceId:`${r.id}:acute:${vital}:${r.day}:${vital==='stamina'?r.exhausted:vital==='emotion'?r.emotionalBreaks:s.seen[id]??0}`,day:r.day,phase,scope:p?{kind:'patient',id:p.uid}:{kind:'personal',id:r.id},patientId:p?.uid,patientName:p?.name,bed:p?.bed,actorId:'jiang'};
  if(p&&id==='E-200'){
    const other=r.patients.find(other=>other.uid!==p.uid&&other.active&&other.damage<3);
    if(other)binding.patients=[{id:p.uid,name:p.name,bed:p.bed},{id:other.uid,name:other.name,bed:other.bed}];
  }
  const ctx=contextFor(r,s,phase,p),scopedEvent={...event,scopeKind:p?'patient' as const:'personal' as const};
  const card=prepareTalentEvent(r,eventToCard(scopedEvent,binding,ctx))as EventCard&{acuteVital:string};card.acuteVital=vital;
  if(!p){
    card.text=vital==='stamina'?'你在值班室支撑不住，护士长扶你坐下，叫同事接管工作。现在先决定怎么休息。':vital==='san'?'你发现自己无法再集中注意。护士长关掉工作电话，联系二线接管，陪你坐在值班室里。':'你停下手里的工作，发现自己已经没法平静交谈。护士长让同事接手，请你先到值班室坐下。';
    for(const o of card.options){o.effects.hazards=undefined;if(o.failureTotal)o.failureTotal.hazards=undefined;if(o.check)o.check.failure.hazards=undefined;}
  }
  if(id==='E-200'&&p&&!binding.patients)card.text=`你写完病程，发现其中一段内容并不属于${p.name}。护士长拿着病历站在桌边，安排二线接手你下午的工作。`;
  s.published[card.id]=card;result.cards.push(card);
  if(Object.keys(event.onEnter).length)result.effects.push({id:`${card.id}:enter`,scope:binding.scope,effects:event.onEnter,text:event.title});
  return result;
}

/** An accepted, current project supplies the funding link. A different open
 * invitation, a closed project or an ambiguous pair cannot inherit the loan. */
function fundingResearchProject(s:AuthoredDirectorState,chain:ButterflyState):ButterflyState|undefined{
  const candidates=s.chains.filter(c=>c.chain==='BTF-004'&&c.status!=='closed'&&c.subjects.projectId
    &&c.facts.some(f=>f.type==='project_accepted')&&!c.facts.some(f=>f.type==='cooperation_ended')
    &&(!chain.subjects.projectId||c.subjects.projectId===chain.subjects.projectId));
  return candidates.length===1?candidates[0]:undefined;
}
export function authoredGraphWorld(r: AuthoredRun,s:AuthoredDirectorState,chain:ButterflyState,phase:EventPhase):ButterflyWorld {
  const values=factsFor(r,s), f=new Set(chain.facts.map(x=>x.type));
  const patient=r.patients.find(p=>p.uid===chain.subjects.patientId);
  const ownEntries=r.journal.filter(e=>scopeMatches(e.scope,chain.scope));
  const ownRisks=r.hazards.filter(h=>scopeMatches(h.scope,chain.scope));
  const cf=clinicalFlags(patient), ctext=patient?clinicalText(patient):'';
  const add=(condition:boolean,...keys:string[])=>{if(condition)keys.forEach(k=>f.add(k));};
  const liAvailable=!s.actor.liAwayDays.includes(r.day),zhouAvailable=!s.actor.zhouAwayDays.includes(r.day);
  const nurseAvailable=phase!=='日终';
  const paperActive=Boolean(values['科研-deadline'])||f.has('project_accepted');
  // Zhou can be invited before the player accepts the project. The message
  // and invitation must not require their own later acceptance as a trigger.
  const completedTeaching=chain.chain==='BTF-004'&&chain.consumed.includes('BTF-004:N01')
    &&!!chain.subjects.projectId&&!!chain.subjects.datasetId&&!f.has('lecture_cancelled');
  const invoice=familyInvoiceFor(s,chain);
  const familyActive=Boolean(values['家庭-车祸-ICU中']||values['家庭-父母住院']||values['家庭-婚事']||invoice);
  const bill=invoice?.status==='decision-pending'?invoice.requested:0;
  const borrowed=chain.receivable>0;
  const sourceDay=chain.facts[0]?.day??r.day;
  add(familyActive,'family_event');
  add(bill>0,'family_bill_due');
  add(!!invoice,'family_finance_question');
  add(bill>0&&r.cash<bill,'cash_gap');
  add(!!patient?.active&&isPlayerResponsibleForPatient({...r,authored:s},patient)&&patient.caredDay!==r.day,'handoff_pending');
  add(!!patient&&!!priorUnperformedPeerExam(r,patient),'false_exam_discovered');
  add(!!patient&&patient.admitted===r.day&&/handover|转床|转入/.test(`${patient.uid} ${CASES.find(c=>c.id===patient.caseId)?.history.join(' ')}`),'related_transfer');
  add(!!departmentStatementSource(r,chain),'statement_request_delivered');
  add(hasDueFamilyWorkConflict(r,s,chain,phase),'commitment_collision');
  add(chain.facts.some(f=>/statement|witness|entry|correction/.test(f.type))&&r.day>=sourceDay+1,'record_due');
  add(f.has('early_repayment_requested')&&liAvailable&&r.day>sourceDay,'repayment_reply_received');
  add((borrowed&&r.day>=receivableDue(chain))||(chain.privateDebt>0&&r.day>=privateDebtDue(chain))||chain.facts.some(f=>f.type==='repayment_received'),'payment_due');
  add(chain.commitments.some(c=>c.status==='accepted'&&c.due<r.day),'duty_overdue');
  add(invoice?.status==='paid'&&!!invoice.payment?.paidDay,'bill_paid');
  add(f.has('financial_need_disclosed')&&r.cash<bill&&eventEligible(EVENT_BY_ID['E-146'],contextFor(r,s,phase)),'representative_offer');
  add(f.has('representative_offer')&&s.actor.sharedResearch&&!!fundingResearchProject(s,chain),'same_project_funding_offer');
  add(f.has('conditional_offer_accepted')&&r.day>=sourceDay+1,'exchange_request_received');
  add(chain.chain==='BTF-002'&&hasScopedButterflyReview({...r,authored:s},chain),'review_due','review_opened');
  add(f.has('exchange_performed')&&f.has('liaison_offer_received')&&f.has('liaison_position_vacant')&&!f.has('cooperation_ended'),'review_due');
  add(!!patient?.active&&patient.damage<3&&!/昏睡|无反应/.test(CASES.find(c=>c.id===patient.caseId)?.complaint??''),'patient_can_express');
  add(cf.some(x=>/private|refuse|cannot_pay|family_consent/.test(x)),'private_request');
  add(ownEntries.some(e=>/投诉|争执|医务科/.test(e.title))||ownRisks.some(h=>h.type==='C'&&h.weight>=15),'same_patient_dispute','complaint_delivered');
  const complaint=patient?recordingOrigin(r,s,patient):undefined;
  add(!!complaint,'same_patient_dispute','complaint_delivered');
  add(!!complaint?.excerpt,'record_excerpt_received');
  add(!!complaint?.received,'record_received');
  const recordingKnown=!!patient&&(chain.consumed.includes('BTF-003:N01')||f.has('recording_known')||!!values[`clinical:${patient.uid}:recording-exists`]||!!values[`family-record:${patient.uid}`]);
  add(recordingKnown,'recording_known','record_holder_known');
  add(chain.chain==='BTF-003'&&chain.consumed.includes('BTF-003:N03')&&!f.has('record_received'),'record_missing');
  add(f.has('original_record_requested')&&r.day>sourceDay&&f.has('record_holder_known'),'holder_contacted');
  add(f.has('record_received')||f.has('contemporary_record_submitted')||f.has('record_missing_registered')||f.has('record_missing'),'evidence_review_due');
  add(f.has('patient_privacy_retained')&&f.has('complaint_delivered'),'privacy_conflict');
  add(ownRisks.some(h=>h.type==='C'||h.type==='D'),'own_error_or_actual_query');
  add(ownRisks.some(h=>h.weight>0&&['R','D'].includes(h.type)&&r.journal.some(j=>j.scope.id===chain.scope.id&&(h.choiceId===j.id||h.choiceId.startsWith(`${j.id}:`)))),'own_actual_error');
  add(!!patient&&(!patient.active||patient.planned)||r.day===14,'patient_followup_due');
  add(!!patient&&!patient.active&&patient.damage<2&&!f.has('same_patient_dispute'),'normal_discharge');
  add(!!patient&&patient.active&&patient.damage<3,'followup_required');
  add(!!patient&&(!!values[`clinical:${patient.uid}:unrest_3_success`]||s.dispute?.patientId===patient.uid&&s.dispute.second),'dispute_resolved');
  add(f.has('unauthorized_disclosure')||!!patient&&patient.patience<=0&&f.has('same_patient_dispute'),'trust_broken');
  add(f.has('own_error_or_actual_query')&&!f.has('dispute_resolved')&&!f.has('evidence_scope_submitted')&&!f.has('formal_reply_submitted'),'formal_case_unresolved');
  add(s.actor.sharedResearch&&completedTeaching&&zhouAvailable&&r.day>=sourceDay+1,'same_dataset_request');
  add(f.has('zhou_saw_original')||f.has('original_file_retained')&&f.has('self_verification_accepted'),'materials_received');
  add(f.has('zhou_saw_original')&&zhouAvailable&&r.relations.peer>=1,'collaboration_agreed');
  add((f.has('slides_presented')||f.has('citation_gap_disclosed')||f.has('zhou_saw_original'))&&r.day>sourceDay,'chief_meeting_requested');
  add(s.actor.sharedResearch&&completedTeaching&&(chain.entrySource==='department-teaching'||Boolean(values['药代-0搭话']))&&r.day>=8,'same_project_invitation');
  add(paperActive&&r.day>=(s.paperDeadline??RULES.butterfly.paperDeadline),'manuscript_due');
  add(f.has('submitted')&&r.day>=12,'defense_due');
  add(f.has('submitted')&&(f.has('supplement_required')||hasScopedButterflyReview({...r,authored:s},chain)),'inquiry_delivered','formal_inquiry_unresolved');
  add(f.has('original_submitted')&&!s.actor.datasetHasProblem,'all_attachments_received');
  add(s.actor.datasetHasProblem,'dataset_has_problem');
  add(f.has('verification_completed'),'real_contribution');
  add(f.has('original_file_retained')&&s.actor.sharedResearch,'project_share_authorization');
  add(/告知|解释|同意/.test(ctext)||cf.some(x=>/informed|consent|explain/.test(x)),'written_explanation');
  // Evidence can cross a line only when its subject, delivery and time match.
  const witness=chain.subjects.patientId?s.chains.find(c=>c.chain==='BTF-001'&&c.subjects.patientId===chain.subjects.patientId&&c.facts.some(f=>f.type==='witness_delivered')):undefined;
  add(Boolean(witness)&&liAvailable,'witness_commitment');
  add(patientReviewPairs(r,s).some(pair=>pair.chains.some(c=>c.id===chain.id)),'same_review_received');
  add(!!patient?.active&&nurseAvailable,'successor_commitment','assistant_commitment');
  const cond:Record<string,boolean>={};
  cond.unconditional_loan_10000=f.has('unconditional_terms_received');
  const allow=(id:string,value:boolean)=>{cond[`${chain.chain}:${id}`]=value;};
  if(chain.chain==='BTF-001'){
    const limitedFavor=f.has('favor_one_ward_review');
    const assessedPatient=!!patient?.active&&patient.damage<3&&patientAssessmentComplete(patient);
    allow('N01a',liAvailable);allow('N01c',nurseAvailable);allow('N01d',familyActive&&liAvailable);
    allow('N02a',liAvailable&&f.has('favor_available')&&(!limitedFavor||assessedPatient));allow('N02c',nurseAvailable);allow('N02d',s.chains.some(c=>c.chain==='BTF-002'&&c.receivable>0)&&liAvailable);
    allow('N03b',liAvailable&&r.relations.peer>=1);allow('N03d',f.has('false_exam_discovered'));
    allow('N04a',liAvailable&&f.has('false_exam_discovered')&&r.relations.peer>=1);allow('N04d',liAvailable&&f.has('false_exam_entry')&&s.actor.liFalseStatementWilling);
    allow('N05a',liAvailable&&f.has('favor_available')&&f.has('related_transfer')&&!limitedFavor);allow('N05b',f.has('related_transfer'));allow('N05d',!liAvailable&&nurseAvailable);
    allow('N06c',f.has('false_exam_entry')&&f.has('statement_request_delivered'));allow('N06d',true);
    allow('N07a',f.has('family_delegate_agreed'));allow('N07b',canLeaveForFamily({...r,authored:s}));allow('N07c',r.day<14);allow('N07d',liAvailable&&f.has('favor_available')&&!limitedFavor);
    allow('N08a',f.has('record_due'));allow('N08b',f.has('witness_delivered'));allow('N08d',f.has('false_exam_entry'));
  }else if(chain.chain==='BTF-002'){
    allow('N01d',liAvailable&&r.relations.peer>=2);
    allow('N02a',borrowed&&liAvailable);allow('N02b',r.debt<50000);allow('N02c',r.relations.family>0);allow('N02d',f.has('time_help_completed')&&liAvailable);allow('N02e',Boolean(values['药代-0搭话']));
    allow('N03c',liAvailable&&r.relations.peer>=2);allow('N03d',s.actor.liCash>0&&r.relations.peer>=2);
    allow('N04a',f.has('representative_offer'));allow('N04d',s.ledger.modifiers.some(m=>m.kind==='pending-asset'&&(m.value??0)>0&&/E-134|E-146/.test(m.id)));
    allow('N05a',f.has('conditional_offer_accepted'));allow('N05c',f.has('conditional_offer_accepted'));allow('N05d',liAvailable&&s.actor.liFalseStatementWilling&&r.relations.peer>=3);
    allow('N06a',f.has('repayment_received'));allow('N07a',!f.has('family_told'));allow('N07b',!f.has('family_told'));allow('N07c',invoice?.sourceEventId==='E-105'&&invoice.status==='decision-pending'&&!invoice.adjustment&&r.relations.family>=2);allow('N07d',f.has('unconditional_terms_received'));
    allow('N08b',f.has('exchange_performed'));allow('N08c',f.has('exchange_performed')&&f.has('liaison_offer_received')&&f.has('liaison_position_vacant')&&!f.has('review_opened'));allow('N08d',f.has('exchange_performed'));
  }else if(chain.chain==='BTF-003'){
    allow('N01c',nurseAvailable);allow('N01d',f.has('written_explanation'));
    allow('N02a',f.has('patient_can_express')&&r.relations.family>=1);allow('N02b',f.has('private_request'));allow('N02d',f.has('limited_patient_authorization'));
    allow('N03a',f.has('record_holder_known'));allow('N03b',!!patient&&!!ownContemporaneousRecord(r,patient,s));allow('N03d',f.has('public_authorization'));
    allow('N04a',f.has('handoff_pending')&&!!patient&&patient.damage<3);allow('N04b',nurseAvailable);allow('N04d',f.has('patient_can_express')&&f.has('record_delivery_agreed'));
    allow('N05b',ownRisks.some(h=>h.type==='D'));allow('N05c',ownRisks.some(h=>h.type==='D')&&f.has('record_received'));allow('N05d',Boolean(witness));
    allow('N06a',f.has('record_received'));allow('N06b',f.has('patient_privacy_retained'));allow('N06c',f.has('record_received')&&!f.has('public_authorization'));allow('N06d',f.has('patient_can_express')&&r.relations.family>=2);
    allow('N07b',ownRisks.length>0);allow('N07c',ownRisks.length>0&&Boolean(witness));allow('N07d',f.has('handoff_record_submitted')||r.journal.some(e=>e.scope.id===chain.subjects.patientId&&/交接/.test(e.choice)));
    allow('N08a',Boolean(patient?.active));allow('N08b',nurseAvailable);allow('N08c',f.has('formal_case_unresolved')||f.has('record_missing'));allow('N08d',!patient?.active&&!f.has('formal_case_unresolved'));
  }else{
    allow('N02b',f.has('original_file_retained')||Boolean(values['药代-0搭话']));allow('N02d',f.has('original_file_retained'));
    allow('N03d',f.has('zhou_saw_original')&&zhouAvailable);
    allow('N04a',zhouAvailable&&r.ap>=2);allow('N04b',zhouAvailable&&r.relations.peer>=2);allow('N04d',zhouAvailable&&r.relations.peer>=1);
    allow('N06a',f.has('real_contribution')||!s.actor.datasetHasProblem);
    allow('N07b',f.has('problem_known'));allow('N07d',zhouAvailable&&f.has('verification_completed'));
    allow('N08a',f.has('original_file_retained'));
  }
  return {day:r.day,cash:r.cash,ap:r.ap,facts:[...f],actorAvailable:chain.chain==='BTF-004'?zhouAvailable:liAvailable,conditions:cond,repaymentAvailable:Math.min(s.actor.liCash,chain.receivable),boundPatientId:chain.subjects.patientId,boundProjectId:chain.subjects.projectId,boundFamilyBillId:invoice?.id,final:r.phase==='ending',freeSubmissionCosts:r.talents.includes('T29')};
}

function adjustedButterflyCost(r:Run,chain:ButterflyState,choice:ButterflyChoice,w:ButterflyWorld){
  const cost=butterflyChoiceCost(chain,choice,w);
  if(PAPER_SUBMISSION_CHOICES.includes(choice.id)&&cost.ap>0){const credit=paperStepCredit(r,chain.scope);cost.ap=Math.max(0,cost.ap-credit);cost.minutes=Math.max(0,cost.minutes-credit*12);}
  if(r.talents.includes('T29')&&PAPER_SUBMISSION_CHOICES.includes(choice.id)){
    if((cost.effects.stamina??0)<0)delete cost.effects.stamina;
    if((cost.effects.cash??0)<0)delete cost.effects.cash;
  }
  if(['BTF-002:N04a','BTF-002:N05a','BTF-004:N05a'].includes(choice.id)&&r.talents.includes('T28')&&(cost.effects.san??0)<0)cost.effects.san=0;
  return cost;
}
function makeButterflyCard(r:AuthoredRun,s:AuthoredDirectorState,chain:ButterflyState,phase:EventPhase):ButterflyCard|undefined {
  const node=BUTTERFLY_NODES.find(n=>n.id===chain.cursor);if(!node)return;
  const world=authoredGraphWorld(r,s,chain,phase);
  const options=butterflyChoices(chain,world).filter(c=>c.available&&!(r.debuffs.includes('B16')&&['BTF-001:N02a','BTF-001:N02d','BTF-001:N05a','BTF-001:N07d'].includes(c.choice.id))).map(({choice}):Option=>{
    const cost=adjustedButterflyCost(r,chain,choice,world);
    const automatic=r.talents.includes('T29')&&PAPER_SUBMISSION_CHOICES.includes(choice.id),beautify=automatic&&AUTOMATIC_BEAUTIFICATION_CHOICES.includes(choice.id);
    const defense=['BTF-004:N07a','BTF-004:N07b','BTF-004:N07d'].includes(choice.id);
    const firstShiftResults=BUTTERFLY_CHOICE_RESULTS;
    let result=firstShiftResults[choice.id];
    if(choice.id==='BTF-003:N05c'&&!world.conditions?.[choice.id])result=RECORDING_PROSE.reserveResult;
    if(choice.id==='BTF-002:N03a'&&(world.repaymentAvailable??0)>=chain.receivable)result='李恂把剩余借款转给你。你确认收到了钱，他的本金也就还清了。你保留了借款约定和收款凭证，你们没有因此新增另一笔欠款。';
    if(choice.id==='BTF-002:N06b'&&r.cash<=0)result='你告诉叶茗：“我今天没钱退给你，能不能再商量一下还款时间？”她还没有答应延期，你也没有退钱，欠款本金和原来约定的日期都没变。';
    if(['BTF-002:N03d','BTF-002:N06c'].includes(choice.id))result=`你和李恂约好，他在第 ${r.day+RULES.butterfly.loanDays} 天归还剩余本金。你今天没有收到钱，他此前失约的记录也还在。你自己的信用债仍要计息。`;
    if(['BTF-003:N05a','BTF-003:N05b'].includes(choice.id)&&patientReviewMaterial(r,s,chain))result+=PATIENT_REVIEW_RECEIPT;
    return {id:`${chain.id}:${choice.id}`,label:beautify?'按美化后的现稿提交':choice.id==='BTF-002:N06b'&&r.cash<=0?'说明暂无资金，请求另议还款':choice.label,ap:cost.ap,minutes:cost.minutes,cost:0,effects:cost.effects,result:beautify?'稿件已经提交。周乔看过删改前后的表格，知道两份结果并不一致。':result,hint:automatic?'有「美化」天赋时，你整理投稿材料不消耗体力或现金。稿件如果含有删改，周乔会知道，期刊也可能要求撤稿。':undefined,...(defense?{check:{skill:'endure' as const,dc:14-paperDefenseModifier(r,chain.scope),purpose:'答辩中说明本人实际工作',failure:cost.effects,failureText:'你没能向评委说清他们追问的部分。会后，你收到评委的补充材料要求，还得根据实际资料答复。目前只是要求补件，还没有认定你研究造假。'}}:{})};
  });
  if(!options.length)return;
  const sourceId=nodeSource[node.id],event=sourceId?EVENT_BY_ID[sourceId]:undefined;
  if(event&&phase!==event.phases[0]&&!event.phases.includes(phase))return;
  if(!event&&phase!=='结算'&&phase!=='交班')return;
  let text=recordingSceneText(chain,world.facts,node.text);
  if(chain.chain==='BTF-001'&&node.localId==='N02'){
    const patient=r.patients.find(p=>p.uid===chain.subjects.patientId);
    if(patient)text=`家里催你过去，可你还没把${patient.name}今天剩下的诊疗交给别人。你把病历递给李恂，问他能不能接手。你得等他答应，把待办说清楚，再由他签收交接单，才能离开。`;
  }
  if(chain.chain==='BTF-002'&&node.localId==='N02'){
    const bill=familyInvoiceFor(s,chain);
    if(bill)text=`家里等着你回复「${bill.title}」的缴费安排。你要全额付清，就得转过去 ${bill.requested.toLocaleString('zh-CN')} 元，可你的余额不够。你打开与李恂的聊天，想问他能不能帮忙周转。等筹到钱，你还得决定给家里转多少。`;
  }
  if(chain.chain==='BTF-002'&&node.localId==='N06'){
    const receipts=chain.facts.filter(f=>f.type==='repayment_received');
    text=receipts.length?`你确认收到了李恂的转账。他还欠你 ${chain.receivable} 元本金，你自己的账单也得安排付款。`:chain.receivable>0?`约好的还款日期到了，李恂还欠你 ${chain.receivable} 元。你查过收款记录，他还没把余款转来。要是同意他晚些还，你们得重新约定日期。`:`你向叶茗借的 ${chain.privateDebt} 元到了约定的还款日。你今天可用的余额是 ${Math.max(0,r.cash)} 元，得确认这次能还她多少。`;
  }
  if(chain.chain==='BTF-002'&&node.localId==='N08')text=world.facts.includes('review_opened')?'核查人员指着清单问：“你这天收了钱，后来又交了资料。在这期间，你们谈过什么条件？”':'唐济发来消息：“原来负责联络的人不干了，你来接吧。你要是答应，我就让办公室把分工发下去。”你之前收钱和交资料的记录都还在。';
  if(chain.entrySource==='department-teaching'){
    if(node.localId==='N01')text='唐济在科室群里发了病例讨论课件，安排你明天主讲。你翻到第七页，三页对照数据没有标来源。周乔的科内项目也在用这批资料。';
    if(node.localId==='N05')text='周乔把科室研究方案放在桌边：“我们还缺个人核对资料，你来不来？”唐济催着要作者名单，可大家还没核完原始资料，也没说清每个人负责哪部分。';
  }
  return {id:`${chain.id}:${node.localId}`,title:node.title,text,scope:chain.scope,patientId:chain.subjects.patientId,actor:butterflySceneActor(chain,world.facts),kind:phase==='夜班'?'night':'story',chain:chain.chain,options,butterfly:{chainStateId:chain.id,nodeId:node.id,day:r.day,phase}};
}
function butterflyMergeWorld(r:AuthoredRun,s:AuthoredDirectorState,participants:ButterflyState[],phase:EventPhase):ButterflyWorld {
  const worlds=participants.map(c=>authoredGraphWorld(r,s,c,phase));
  const facts=[...new Set(worlds.flatMap(w=>w.facts))],has=(f:string)=>facts.includes(f);
  const review=patientReviewPairs(r,s).find(pair=>participants.length===pair.chains.length&&participants.every(c=>pair.chains.some(p=>p.id===c.id)));
  const materials=participants.every(c=>c.facts.some(f=>['record_received','witness_delivered','original_submitted','funding_review_terms'].includes(f.type)));
  const availableCommitment=participants.some(c=>c.commitments.some(x=>x.status==='accepted'&&x.due>=r.day&&(x.resumeDay??0)<=r.day&&(/verification|division|handoff/.test(x.type)||isResearchCollaboration(x.type))&&
    (x.actorId==='zhou'?!s.actor.zhouAwayDays.includes(r.day):x.actorId==='li'&&!s.actor.liAwayDays.includes(r.day))));
  const conditions:Record<string,boolean>={
    XJ01a:has('family_event')&&canLeaveForFamily({...r,authored:s}),XJ01b:has('family_delegate_agreed'),
    XJ01c:r.day<RULES.days&&[true,false].every(family=>participants.some(c=>approvedDeadlineChanges({...r,authored:s},c).some(t=>t.family===family))),
    XJ01d:availableCommitment&&!has('favor_one_ward_review'),
    XJ02a:true,XJ02b:has('funding_review_terms')&&!has('responsibility_statement_signed'),
    XJ02c:has('verified_problem')&&has('problem_known')&&has('funding_review_terms'),
    XJ02d:has('verification_completed')&&has('real_contribution')&&has('project_split_agreed'),
    XJ03a:!!review||materials,XJ03b:has('privacy_conflict'),
    XJ03c:has('own_error_or_actual_query')&&!has('separate_responsibilities_submitted')&&!has('joint_personal_statements_submitted'),
    XJ03d:has('joint_statement_agreed')&&!has('selective_disclosure'),
  };
  return{day:r.day,cash:r.cash,ap:r.ap,facts,actorAvailable:worlds.some(w=>w.actorAvailable),conditions,reviewChainIds:review?.chains.map(c=>c.id)};
}
const separateMergeOption=(id:string):Option=>({id:`${id}:separate`,label:'把两件事分开，逐项办理',ap:0,minutes:0,cost:0,effects:{},result:'你把两件事分别留在待办里，原来的责任和截止时间都不变。你这次没有完成代办、签字或交付，还得按原来的安排办理。'});
const mergeChoiceResult=(id:string,w:ButterflyWorld)=>stopsMergedCooperation(id,w)?'你终止了后续合作，放弃还没拿到的项目收益。已经收到的钱仍按原来的约定处理。你没有签署不实声明，也没有再交出资料。':BUTTERFLY_MERGE_RESULTS[id];
/** Requote after another appointment, payment or day change. Published cards
 * are history, not an authority to spend yesterday's repayment amount. */
export function refreshButterflyOptions(r:Run,card:Card):Option[]{
  if('familyFundingContact'in card){
    const contact=card as FamilyFundingContactCard;
    return canContactForFamilyFunding(r,contact.familyFundingContact.familyBillId)?card.options:card.options.filter(o=>o.id.endsWith(':decline'));
  }
  if('butterflyPermission'in card&&r.authored){
    const b=card as ButterflyPermissionCard,chain=r.authored.chains.find(c=>c.id===b.butterflyPermission.chainStateId);
    const current=chain?butterflyPermissionCards(r,chain,authoredGraphWorld(r,r.authored,chain,r.shiftPhase??'结算'),card.id).find(c=>c.id===card.id):undefined;
    return current?.options??card.options.filter(o=>o.id.endsWith(':defer')).map(o=>({...o,label:'保留现有范围，继续办理其他事项',result:'你暂时还办不了这项申请，也没取得新的授权。对方没有因此到场或交出材料。'}));
  }
  if('butterflyMerge'in card&&r.authored){
    const b=card as ButterflyMergeCard,participants=r.authored.chains.filter(c=>b.butterflyMerge.chainStateIds.includes(c.id));
    const world=butterflyMergeWorld(r,r.authored,participants,b.butterflyMerge.phase);
    const merge=BUTTERFLY_MERGES.find(m=>m.id===b.butterflyMerge.mergeId);
    const stillClaimed=bcClaimsMatch(r,r.authored,b,participants);
    const offered=merge&&stillClaimed&&mergeEligible(merge.id,participants,world)?butterflyMergeOptions(merge.id,world).map(o=>{
      const cost=butterflyMergeCost(o,world);return{id:`${card.id}:${o.id}`,label:o.label,ap:cost.ap,minutes:cost.minutes,cost:0,effects:cost.effects,result:mergeChoiceResult(o.id,world)};
    }):[];
    return[...offered,separateMergeOption(card.id)];
  }
  if('butterflyFinance'in card&&r.authored){
    const chain=r.authored.chains.find(c=>c.id===(card as ButterflyFinanceCard).butterflyFinance.chainStateId);
    return chain?butterflyFinanceCard(r,chain,card.id).options:card.options.filter(o=>o.id.endsWith(':decline'));
  }
  if('butterfly'in card&&r.authored){
    const b=card as ButterflyCard,chain=r.authored.chains.find(c=>c.id===b.butterfly.chainStateId);
    if(chain?.consumed.includes(b.butterfly.nodeId))return [];
    if(chain){const current=makeButterflyCard(r,r.authored,{...chain,cursor:b.butterfly.nodeId},b.butterfly.phase);return current?.options??[];}
  }
  if('butterflyCommitment'in card&&r.authored){
    const b=card as ButterflyCommitmentCard,chain=r.authored.chains.find(c=>c.id===b.butterflyCommitment.chainStateId),commitment=chain?.commitments.find(c=>c.id===b.butterflyCommitment.commitmentId);
    if(chain&&commitment){
      const fresh=butterflyCommitmentCard(r,r.authored,chain,commitment,authoredGraphWorld(r,r.authored,chain,b.butterflyCommitment.phase),b.butterflyCommitment.phase,card.id);
      if(fresh)return fresh.options;
    }
    return card.options.filter(o=>o.id.endsWith(':defer')).map(o=>({...o,label:'记下未完成事项，继续当班工作',result:'你暂时还不能完成这项约定的交接，你这次没有完成交付，也没有留下完成记录。原来该你负责的事仍要处理。'}));
  }
  return card.options;
}
/** An unanswered scene belongs to one patient/project instance, not every
 * conversation using the same authored node ID. */
export function hasUnansweredButterflyScene(s:Pick<AuthoredDirectorState,'published'>,chain:ButterflyState):boolean{
  if(chain.consumed.includes(chain.cursor))return false;
  return Object.values(s.published).some(c=>'butterfly'in c&&(c as ButterflyCard).butterfly.chainStateId===chain.id&&(c as ButterflyCard).butterfly.nodeId===chain.cursor);
}
function buildButterflyCards(r:AuthoredRun,s:AuthoredDirectorState,phase:EventPhase):Card[]{
  const result:Card[]=[];
  for(let i=0;i<s.chains.length;i++){
    let chain=s.chains[i];
    // The shift favour starts as a personal agreement. Bind its first bedside
    // request to real pending work, once; later unrelated transfers cannot
    // replace that patient's evidence.
    if(chain.chain==='BTF-001'&&!chain.subjects.patientId&&chain.facts.some(f=>f.type==='cover_completed')&&authoredGraphWorld(r,s,chain,phase).facts.includes('family_event')){
      const pending=r.queue.slice(r.cursor).find(c=>isDirectPatientCare(c)&&r.patients.some(p=>p.uid===c.patientId&&p.active&&p.damage<3&&p.caredDay!==r.day&&isPlayerResponsibleForPatient({...r,authored:s},p)));
      if(pending?.patientId){
        chain.subjects.patientId=pending.patientId;chain.scope={kind:'patient',id:pending.patientId};
        chain.facts.push({id:`${chain.id}:patient-assigned`,type:'handoff_patient_assigned',scope:{...chain.scope},subjects:{...chain.subjects},sourceChoiceId:pending.id,day:r.day,knownBy:['player']});
      }
    }
    if(chain.status==='closed'){
      for(const permission of butterflyPermissionCards({...r,authored:s},chain,authoredGraphWorld(r,s,chain,phase))){s.published[permission.id]=permission;result.push(permission);}
      continue;
    }
    if(phase==='结算')offerLiaisonRole({...r,authored:s},chain);
    const world=authoredGraphWorld(r,s,chain,phase);
    // A shown, unanswered node remains a real pending appointment.
    if(!hasUnansweredButterflyScene(s,chain))chain=routeButterfly(chain,world);
    s.chains[i]=chain;
    for(const permission of butterflyPermissionCards({...r,authored:s},chain,world)){s.published[permission.id]=permission;result.push(permission);}
    if(chain.status!=='active')continue;
    const card=makeButterflyCard(r,s,chain,phase);
    if(card&&!s.published[card.id]){s.published[card.id]=card;result.push(card);}
  }
  if(phase==='结算')for(const chain of s.chains){
    const duty=butterflyRoleDutyCard(r,chain);
    if(duty&&!s.published[duty.id]){s.published[duty.id]=duty;result.push(duty);}
  }
  const deliveryKeys=new Set<string>();
  if(phase==='交班'||phase==='结算')for(const chain of s.chains){
    for(const commitment of chain.commitments.filter(c=>c.status==='accepted'&&!/cover_accepted/.test(c.type))){
      const sharedKey=`${commitment.source}:${commitment.type}`;
      if(deliveryKeys.has(sharedKey))continue;
      const pendingCards=[...(s.sceneAgenda??[]).flatMap(item=>s.published[item.cardId]?[s.published[item.cardId]]:[]),...r.queue.slice(r.cursor)];
      const alreadyPending=pendingCards.some(card=>{
        const b=(card as Partial<ButterflyCommitmentCard>).butterflyCommitment;if(!b||card.options.some(o=>r.committed.includes(o.id)))return false;
        const other=s.chains.find(c=>c.id===b.chainStateId)?.commitments.find(c=>c.id===b.commitmentId);
        return other?.source===commitment.source&&other.type===commitment.type;
      });
      if(alreadyPending)continue;
      const id=`${commitment.id}:fulfil:${r.day}`;
      if(s.published[id])continue;
      const card=butterflyCommitmentCard(r,s,chain,commitment,authoredGraphWorld(r,s,chain,phase),phase,id);
      if(!card)continue;
      deliveryKeys.add(sharedKey);
      s.published[id]=card;result.push(card);
    }
  }
  return appendButterflyMerges(r,s,phase,result);
}
function appendButterflyMerges(r:AuthoredRun,s:AuthoredDirectorState,phase:EventPhase,result:Card[],only?:string):Card[]{
  for(const merge of BUTTERFLY_MERGES){
    if(only&&merge.id!==only)continue;
    if(phase!=='结算')continue;
    if(Object.values(s.published).some(c=>'butterflyMerge'in c&&(c as ButterflyMergeCard).butterflyMerge.mergeId===merge.id&&!s.ledger.commits.includes(`merge:${c.id}`)&&(s.sceneAgenda?.some(a=>a.cardId===c.id)||r.queue.slice(r.cursor).some(q=>q.id===c.id))))continue;
    const candidates=s.chains.filter(c=>activeMergeClaim(r,s,merge.id,c,phase));
    const groups=merge.id==='XJ-03'?patientReviewPairs(r,s).map(pair=>pair.chains).filter(pair=>pair.every(c=>candidates.some(candidate=>candidate.id===c.id))):mergeParticipantGroups(merge.id,candidates);
    const participating=groups.find(group=>mergeEligible(merge.id,group,butterflyMergeWorld(r,s,group,phase)));
    if(!participating)continue;
    const w=butterflyMergeWorld(r,s,participating,phase);
    if(!mergeEligible(merge.id,participating,w))continue;
    const id=`${r.id}:${merge.id}:${r.day}`;
    if(s.published[id])continue;
    const continuations=participating.map(c=>{
      const sourceNode=activeMergeClaim(r,s,merge.id,c,phase)!;
      return{chainStateId:c.id,sourceNode,targetNode:merge.continuations[sourceNode]};
    });
    const claimedCommitmentIds=participating.flatMap(c=>continuations.some(k=>k.chainStateId===c.id&&k.sourceNode==='BTF-004:LABOR')
      ?c.commitments.filter(k=>k.status==='accepted'&&k.due<=r.day&&(k.resumeDay??0)<=r.day&&isResearchCollaboration(k.type)).map(k=>k.id):[]);
    const sources=[...Object.values(s.published),...r.queue.slice(r.cursor),...result];
    const claimedSceneIds=[...new Set(sources.filter(source=>{
      if(source.options.some(o=>r.committed.includes(o.id)))return false;
      const node=(source as Partial<ButterflyCard>).butterfly;
      if(node)return continuations.some(c=>c.chainStateId===node.chainStateId&&c.sourceNode===node.nodeId);
      const task=(source as Partial<ButterflyCommitmentCard>).butterflyCommitment;
      if(!task||!continuations.some(c=>c.chainStateId===task.chainStateId&&c.sourceNode==='BTF-004:LABOR'))return false;
      return participating.find(c=>c.id===task.chainStateId)?.commitments.some(c=>c.id===task.commitmentId&&c.status==='accepted'&&c.due<=r.day&&isResearchCollaboration(c.type));
    }).map(c=>c.id))];
    const prose:Record<string,string>={'XJ-01':'你还没挂断家里的电话，另一边又有人来催今天约好的事。两件事都到了约定时间，你得现在决定自己去哪里，另一件事又怎么办。','XJ-02':'桌上的资助记录与项目材料写着相同的项目名称、资助人和付款编号。对方把两份材料并排放好，等你说明这笔钱与资料的关系。','XJ-03':'复核人员把两份记录放在一起。同一件事，记录里的时间和说法有对不上的地方。你的名字也在上面。'};
    const card:ButterflyMergeCard={id,title:merge.title,text:prose[merge.id],scope:participating[0].scope,kind:'story',chain:merge.id,options:butterflyMergeOptions(merge.id,w).map(o=>{const cost=butterflyMergeCost(o,w);return{id:`${id}:${o.id}`,label:o.label,ap:cost.ap,minutes:cost.minutes,cost:0,effects:cost.effects,result:mergeChoiceResult(o.id,w)}}),butterflyMerge:{mergeId:merge.id,chainStateIds:participating.map(c=>c.id),day:r.day,phase,claimedSceneIds,continuations}};
    if(merge.id==='XJ-01'){
      card.butterflyMerge.familyBillId=s.familyInvoices?.find(b=>b.status==='decision-pending'&&(b.dueDay??b.day)<=r.day)?.id;
      card.butterflyMerge.claimedCommitmentIds=claimedCommitmentIds;
    }
    card.options.push(separateMergeOption(id));
    for(let i=result.length-1;i>=0;i--)if(mergeClaimsScene(card,result[i]))result.splice(i,1);
    s.published[id]=card;result.push(card);
  }
  return result;
}

/** Validate source prerequisites before pooling facts for a shared response.
 * One participant's receipt cannot supply another participant's missing act. */
function activeMergeClaim(r:AuthoredRun,s:AuthoredDirectorState,id:string,chain:ButterflyState,phase:EventPhase):string|undefined{
 const world=authoredGraphWorld(r,s,chain,phase),claimed=butterflyMergeClaim(id,chain,world);
 if(!claimed||claimed==='BTF-004:LABOR')return claimed;
 const node=BUTTERFLY_NODES.find(n=>n.id===claimed);
 return node&&butterflyNodeEligible(chain,node,world)?claimed:undefined;
}
function bcClaimsMatch(r:AuthoredRun,s:AuthoredDirectorState,card:ButterflyMergeCard,participants:ButterflyState[]):boolean{
 const b=card.butterflyMerge;
 if(b.familyBillId&&!s.familyInvoices?.some(invoice=>invoice.id===b.familyBillId&&invoice.status==='decision-pending'&&(invoice.dueDay??invoice.day)<=r.day))return false;
 return b.chainStateIds.length===participants.length&&participants.every(chain=>{
   const claimed=activeMergeClaim(r,s,b.mergeId,chain,b.phase);
   return !!claimed&&(!b.continuations||b.continuations.some(c=>c.chainStateId===chain.id&&c.sourceNode===claimed));
 });
}

function activateFacts(s:AuthoredDirectorState,e:Effects,day:number,source:string){
  for(const flag of e.flags??[])s.activeFacts[flag]={day,source};
  for(const flag of e.clear??[])delete s.activeFacts[flag];
}
/** A signed receipt can follow its request in this interaction, not only after
 * the next daily scheduler sweep. Published IDs still allow one offer per day. */
function appendReadyDeliveries(r:Run,s:AuthoredDirectorState,result:DirectorResult,phase:EventPhase){
  const sources=new Set<string>();
  for(const chain of s.chains)for(const c of chain.commitments){
    const key=`${c.source}:${c.type}`,id=`${c.id}:fulfil:${r.day}`;
    if(sources.has(key)||s.published[id])continue;
    const pending=[...r.queue.slice(r.cursor),...(s.sceneAgenda??[]).flatMap(a=>s.published[a.cardId]?[s.published[a.cardId]]:[])];
    if(pending.some(card=>{
      const bc=(card as Partial<ButterflyCommitmentCard>).butterflyCommitment;
      if(!bc||card.options.some(o=>r.committed.includes(o.id)))return false;
      const other=s.chains.find(ch=>ch.id===bc.chainStateId)?.commitments.find(k=>k.id===bc.commitmentId);
      return other?.source===c.source&&other.type===c.type;
    }))continue;
    const card=butterflyCommitmentCard({...r,authored:s},s,chain,c,authoredGraphWorld(r,s,chain,phase),phase,id);
    if(!card)continue;
    sources.add(key);s.published[id]=card;result.cards.push(card);
  }
}
/** The merge settles who will do the work, not whether that work was done.
 * Reopen its exact uncompleted delivery using the same transaction identity;
 * paused, cancelled, completed or currently unavailable work stays closed. */
function resumeMergedDeliveries(r:Run,s:AuthoredDirectorState,result:DirectorResult,merge:ButterflyMergeCard){
  const data=merge.butterflyMerge;
  const sourceCards=(data.claimedSceneIds??[]).flatMap(id=>s.published[id]?[s.published[id]]:[]);
  const taskOf=(card:Card)=>(card as Partial<ButterflyCommitmentCard>).butterflyCommitment;
  const ids=data.claimedCommitmentIds??sourceCards.flatMap(c=>taskOf(c)?[taskOf(c)!.commitmentId]:[]);
  for(const commitmentId of new Set(ids)){
    const chain=s.chains.find(c=>data.chainStateIds.includes(c.id)&&c.commitments.some(k=>k.id===commitmentId)),commitment=chain?.commitments.find(c=>c.id===commitmentId);
    if(!chain||!commitment)continue;
    const original=sourceCards.find(c=>taskOf(c)?.commitmentId===commitmentId&&!c.options.some(o=>r.committed.includes(o.id)));
    const id=original?.id??`${commitment.id}:fulfil:${r.day}:after:${merge.id}`;
    if(s.published[id]?.options.some(o=>r.committed.includes(o.id)))continue;
    const phase=merge.butterflyMerge.phase;
    const card=butterflyCommitmentCard({...r,authored:s},s,chain,commitment,authoredGraphWorld(r,s,chain,phase),phase,id);
    if(!card||result.cards.some(c=>c.id===id))continue;
    s.published[id]=card;result.cards.push(card);(result.immediateCardIds??=[]).push(id);
  }
}
function applyNewModifiers(r:AuthoredRun,s:AuthoredDirectorState,result:DirectorResult,mods:EventModifier[],scope:Scope,source:string){
  for(const m of mods){
    if(m.kind==='cash-pressure')Object.assign(s,changeCashPressure(r,s,m.value??0));
    if(m.kind==='night-shift')s.activeFacts[`extra-night:${r.day+1}`]={day:r.day,source};
    if(m.kind==='leave'){
      const days=m.value??1;
      if(days>=1){
        const start=(m as EventModifier&{starts?:number}).starts??m.startsOn??r.day+(m.startsAfter??1);
        if(start<=r.day+1){s.leaveUntil=Math.max(s.leaveUntil??0,start+Math.ceil(days)-1);result.patch.skipNextDay=true;}
      }
      else {
        // Approved time away reduces the remaining working allowance. It is
        // not an action and must not be billed as overtime when AP is empty.
        result.patch.ap=Math.max(0,(result.patch.ap??r.ap)-RULES.halfDayAp);
        result.effects.push({id:`${source}:half-leave`,scope:{kind:'personal',id:r.id},effects:{flags:[`half-day-leave:${r.day}`]},text:'主任同意你离岗半天，剩下的工作先交接。'});
      }
    }
  }
  const recovery=mods.filter(m=>m.kind==='recover');
  if(recovery.length)result.patch.vitals=eventRecovery(recovery,r.vitals,r.caps);
}

/** Called after AP/time and the roll are committed. Normal event effects are
 * already paid; butterfly/merge base effects are owned here and paid once. */
export function afterAuthoredChoice(r:AuthoredRun,card:Card,option:Option,success:boolean):DirectorResult{
  const s=initialize(r),result=freshResult(s);
  if('familyFundingContact'in card){
    if(s.ledger.commits.includes(option.id))return result;
    s.ledger.commits.push(option.id);
    const {familyBillId}=(card as FamilyFundingContactCard).familyFundingContact;
    if(!option.id.endsWith(':ask')||!canContactForFamilyFunding({...r,authored:s},familyBillId))return result;
    let chain=s.chains.find(c=>c.chain==='BTF-002'&&c.status!=='closed');
    if(!chain){chain=startButterfly('BTF-002',`${r.id}:BTF-002:E-146:${familyBillId}`,{actorId:'ye',familyBillId},'N04');s.chains.push(chain);}
    chain.subjects.familyBillId=familyBillId;
    chain.facts.push({id:`${option.id}:financial-need`,type:'financial_need_disclosed',scope:chain.scope,subjects:{...chain.subjects},sourceChoiceId:option.id,day:r.day,knownBy:['player','ye']});
    const world=authoredGraphWorld({...r,authored:s},s,chain,'结算');
    if(butterflyNodeEligible(chain,BUTTERFLY_NODES.find(n=>n.id==='BTF-002:N04')!,world)){
      const next=routeButterfly(chain,world,['BTF-002:N04']),reply=makeButterflyCard(r,s,next,'结算');
      s.chains[s.chains.indexOf(chain)]=next;
      if(reply&&!s.published[reply.id]){s.published[reply.id]=reply;result.cards.push(reply);(result.immediateCardIds??=[]).push(reply.id);}
    }else{chain.status='dormant';}
    return result;
  }
  if('glucoseTranscription'in card){
    const receipt=(card as GlucoseTranscriptionCard).glucoseTranscription,p=r.patients.find(p=>p.uid===card.patientId);
    if(!p||!success||receipt.stage!=='report'||!option.id.endsWith(':read'))return result;
    const next=glucoseTranscriptionCard(r,p,'write',receipt.reportDay);
    if(!s.published[next.id]){s.published[next.id]=next;result.cards.push(next);}
    return result;
  }
  if('peerExamObservation'in card){
    const observation=(card as PeerExamObservationCard).peerExamObservation;
    if(!success||observation.stage!=='record'||s.seen['E-054']!==undefined)return result;
    const p=r.patients.find(p=>p.uid===card.patientId);if(!p)return result;
    const day=observation.workDay,origin=Object.values(s.published).find(c=>(c as Partial<PeerExamObservationCard>).peerExamObservation?.stage==='meeting'&&c.patientId===p.uid&&(c as PeerExamObservationCard).peerExamObservation.workDay===day);
    if(!origin?.options.some(o=>r.committed.includes(o.id))||r.day<=day)return result;
    let chain=s.chains.find(c=>c.chain==='BTF-001'&&c.status!=='closed'&&!c.consumed.includes('BTF-001:N03')&&(c.subjects.patientId===p.uid||!c.subjects.patientId&&c.consumed.includes('BTF-001:N01')));
    if(!chain){chain=startButterfly('BTF-001',`${r.id}:BTF-001:E-054:${p.uid}`,{actorId:'li',patientId:p.uid},'N03');s.chains.push(chain);}
    chain.subjects.patientId=p.uid;chain.scope={kind:'patient',id:p.uid};chain.cursor='BTF-001:N03';chain.status='active';
    chain.facts.push({id:`${option.id}:discovery`,type:'false_exam_discovered',scope:chain.scope,subjects:{...chain.subjects},day:r.day,sourceChoiceId:option.id,knownBy:['player','li']});
    const next=makeButterflyCard(r,s,chain,'交班');
    if(next&&!s.published[next.id]){next.authoredEventId='E-054';s.published[next.id]=next;result.cards.push(next);}
    return result;
  }
  if('butterflyPermission'in card){
    const permission=(card as ButterflyPermissionCard).butterflyPermission,chain=s.chains.find(c=>c.id===permission.chainStateId);
    if(!chain||s.ledger.commits.includes(option.id))return result;
    s.ledger.commits.push(option.id);
    if(success&&option.id.endsWith(':ask')){
      const type=PERMISSION_FACTS[permission.kind];
      const actor=permissionActor(permission.kind);
      chain.facts.push({id:`${chain.id}:${option.id}:${type}`,type,scope:chain.scope,subjects:{...chain.subjects},sourceChoiceId:option.id,day:r.day,knownBy:['player',actor==='rep'?'ye':actor==='research'?'zhou':actor??chain.subjects.patientId??'patient'],...(permission.kind==='loan-terms'?{amount:RULES.butterfly.bridgeLoan}:{}),...(permission.kind==='deadline-change'?{deadlineChanges:deadlineCandidates({...r,authored:s})}:{})});
      appendReadyDeliveries(r,s,result,r.shiftPhase??'结算');
    }
    return result;
  }
  if(option.talentAction==='counselling'&&success){
    delete s.activeFacts['幻听'];delete s.activeFacts['失眠'];
    s.ledger.modifiers=s.ledger.modifiers.filter(m=>m.target!=='nightSanPenalty'&&!m.until?.includes('心理咨询'));
  }
  const patient=card.patientId?r.patients.find(p=>p.uid===card.patientId):undefined;
  if(patient&&s.refusals?.[patient.uid]&&r.facts[`night-telephone:${patient.uid}`])s.refusals[patient.uid].resolved='telephone';
  if(patient&&!('authoredEventId'in card)&&!('sourceFollowup'in card)&&['clinical','quick','night'].includes(card.kind)){
    const tuning=eventTuning(s.ledger,r.day,card.scope,Object.keys(factsFor(r,s))),night=card.kind==='night'||card.shiftPhase==='夜班';
    const applyOnce=(key:string,effects:Effects,text:string)=>{if(s.activeFacts[key])return;s.activeFacts[key]={day:r.day,source:option.id};result.effects.push({id:key,scope:card.scope,effects,text});};
    if(!night&&!patient.inpatient&&tuning.outpatientHazardR)applyOnce(`outpatient-limit:${patient.uid}`,{hazards:[{type:'R',weight:tuning.outpatientHazardR,reason:'按压缩后的门诊方案接诊，必要诊疗不足',norm:'不能为限额省略患者需要的诊疗',causal:false}]},'门诊限额仍在执行，这位患者的诊疗也受到了压缩。');
    // E-201 replaces the per-incident SAN baseline. nightClinicalCharge owns
    // it; a continuing record or follow-up cannot pay another eight points.
  }
  if('sourceFollowup'in card){
    const fc=card as SourceFollowup,source=fc.sourceFollowup,uid=source.patientId;
    if(s.ledger.commits.includes(option.id))return result;s.ledger.commits.push(option.id);
    const actual=success?option.effects:option.check?.failure??{};activateFacts(s,actual,r.day,option.id);
    if(source.kind==='nurse-report'&&option.id.endsWith(':refuse'))s.ledger.modifiers.push({id:`${option.id}:night-cooperation`,scope:{kind:'personal',id:r.id},kind:'workload',target:'extraNightMinutes',value:10,starts:r.day,expires:14,description:'夜班每起急诊 +10 分钟。'});
    if(source.kind==='dispute'){
      s.dispute??={patientId:uid,stage:1,first:false,second:false};
      if(source.stage===1){s.dispute.first=success&&(option.id.endsWith(':explain')||option.id.endsWith(':office'));s.dispute.stage=2;}
      if(source.stage===2){s.dispute.second=success&&(option.id.endsWith(':review')||option.id.endsWith(':settle'));s.dispute.settled=success&&option.id.endsWith(':settle');s.dispute.stage=3;}
      if(source.stage===3){if(option.id.endsWith(':delay')){s.dispute.stage3due=r.day+1;s.dispute.suppressionCount=(s.dispute.suppressionCount??0)+1;}else s.dispute.stage=4;}
    }
    const decrease=(type:'R'|'C'|'D'|'F',value:number,sourceId?:string)=>{
      const hazards=structuredClone(result.patch.hazards??r.hazards);
      relieveHazards(hazards,card.scope,type,value,option.id,r.day,sourceId);result.patch.hazards=hazards;
    };
    if(source.kind==='denial-record'&&option.id.endsWith(':record')){
      decrease('D',5);
      // Knowing an allergy is not proof of causation. Require a recorded causal event about this exact hidden history.
      const causal=r.hazards.some(h=>h.scope.kind==='patient'&&h.scope.id===uid&&h.type==='R'&&h.causal&&/隐瞒|否认|过敏|饮酒史/.test(h.reason));
      if(causal){const effects={flags:[`clinical:${uid}:hidden_history_causal`]};activateFacts(s,effects,r.day,option.id);result.effects.push({id:`${option.id}:causal-history`,scope:card.scope,effects,text:'已核对原先隐瞒的内容与这次具体处置的关系，记录仍对应同一位患者。'});}
    }
    if(source.kind==='superior-evidence'&&option.id.endsWith(':deliver'))decrease('F',12,'E-053');
    if(source.kind==='forgiveness'&&option.id.endsWith(':ask')){
      const willing=runRandom(r,`family-forgiveness:${uid}`)<.6;
      const effects=willing?{flags:[`clinical:${uid}:forgiven`]}:{flags:[`clinical:${uid}:forgiveness_declined`]};activateFacts(s,effects,r.day,option.id);
      result.effects.push({id:`${option.id}:family-decision`,scope:card.scope,effects,text:willing?'家属在医务科工作人员见证下独立签署谅解书，签收件对应这位患者及本次事件。':'家属确认赔偿到账，但表示目前不愿出具谅解。付款事实保留，谅解没有成立。'});
    }
    return result;
  }
  if('trolley'in card){
    const tc=card as TrolleyCard;s.trolley??=emptyTrolleyLedger();if(s.trolley.commits.includes(option.id))return result;s.trolley.commits.push(option.id);
    const number=+tc.trolley.sourceId.split('-')[1],letter=option.id.split(':').at(-1)!,d=TROLLEY_DEFINITIONS.find(d=>d.id===tc.trolley.sourceId)!;
    activateFacts(s,success?option.effects:option.check?.failure??{},r.day,option.id);
    const clinicalRisk=(type:'R'|'C'|'D'|'F',weight:number,reason:string,scope=card.scope)=>result.effects.push({id:`${option.id}:${type}:${scope.id}`,scope,effects:{hazards:[{type,weight,reason,norm:'核对同一患者或项目的实际经过',causal:false}]},text:option.result});
    if(tc.trolley.stage===1){
      if(!s.trolley.seen.includes(d.id))s.trolley.seen.push(d.id);
      s.trolley.tokens.push({id:tc.trolley.tokenId,sourceId:d.id,choice:letter,day:r.day,due:r.day+1+Math.floor(runRandom(r,`${tc.trolley.tokenId}:delay`)*2),stage:2,scope:card.scope,patientIds:tc.trolley.patientIds,actor:d.actor,object:d.object,resolved:false});
      if(number===1&&letter==='a')clinicalRisk('R',25,'同时到院时仅获电话处置',{kind:'patient',id:tc.trolley.patientIds[1]});
      if(number===2&&letter==='a')clinicalRisk('C',15,'家属对最后一张重症床位的分配提出异议',{kind:'patient',id:tc.trolley.patientIds[1]});
      if([5,18].includes(number)&&letter==='a'){
        const patients=structuredClone(r.patients),p=patients.find(p=>p.uid===card.patientId);if(p){p.charged+=Math.max(0,-(option.effects.cash??0));result.patch.patients=patients;}
      }
      if(number===14&&letter==='a'){result.patch.borrowed=r.borrowed+1;result.patch.caps={...r.caps,stamina:Math.max(1,r.caps.stamina-RULES.borrowCapLoss)};}
      if(number===20&&(letter==='a'||letter==='c')){s.activeFacts[`extra-night:${r.day+1}`]={day:r.day,source:option.id};}
      if(number===20&&letter==='c')s.ledger.pending.push({id:`${option.id}:handoff`,scope:card.scope,due:r.day+1,delay:1,phase:'交班',effects:{ap:-2},description:'换班交接按约进行，今天先留出时间核对工作。'});
      if(number===10&&letter==='a')s.benefitsReceived=(s.benefitsReceived??0)+3000;
      if(number===13&&letter!=='b'){
        const effects={clear:[`pharmacy-held:${card.patientId}`],flags:[`clinical:${card.patientId}:${letter==='a'?'medicine_advanced_800':'arrears_medication_authorized'}`]};activateFacts(s,effects,r.day,option.id);
        result.effects.push({id:`${option.id}:resume-dispensing`,scope:card.scope,effects,text:letter==='a'?'八百元用于这次用药，药房恢复发出这批药。其他欠费仍按原账目处理。':'医务科确认本次欠费用药手续，药房按确认范围继续发药。原有欠款仍保留。'});
      }
      const reduction=number===9&&letter==='c'?['D',5]:number===11&&letter==='a'?['C',10]:number===19&&letter==='a'?['C',5]:undefined;
      if(reduction){const hazards=structuredClone(r.hazards);relieveHazards(hazards,card.scope,reduction[0] as 'C'|'D',Number(reduction[1]),option.id,r.day);result.patch.hazards=hazards;}
      if(number===19&&letter==='a'&&(s.activeFacts[`tampered:${card.patientId}`]||r.facts[`tampered:${card.patientId}`]))clinicalRisk('D',10,'家属查看病历时发现与原件不一致的改动');
    }else{
      const token=s.trolley.tokens.find(t=>t.id===tc.trolley.tokenId);if(!token)return result;
      if(tc.trolley.stage===2){
        token.response=letter;token.stage=3;token.due=r.day+1;
        if(number===14&&token.choice==='b'&&letter==='reserve'&&!r.patients.some(p=>p.uid===card.patientId&&p.caredDay>=token.day))clinicalRisk('R',10,'接班后未完成对应危急值处置');
        if(number===16&&token.choice==='b'&&letter==='review')clinicalRisk('D',20,'修改日志核对发现未报告的错误医嘱');
        if(number===12&&token.choice==='b'&&letter==='review')clinicalRisk('F',15,'核查原始审批后发现与此前说明不符');
      }else token.resolved=true;
    }
    return result;
  }
  if('talentPaperRetraction'in card){
    const projectId=String(card.talentPaperRetraction);
    result.patch.talentMemory=talentChiefLearns(eventTalentContext(r),projectId);activateFacts(s,option.effects,r.day,option.id);return result;
  }
  if('butterflyCommitment'in card){
    const bc=card as ButterflyCommitmentCard;
    if(!option.id.endsWith(':complete')||!success)return result;
    const i=s.chains.findIndex(c=>c.id===bc.butterflyCommitment.chainStateId);
    if(i<0)return result;
    const chain=s.chains[i],commitment=chain.commitments.find(c=>c.id===bc.butterflyCommitment.commitmentId);
    if(!commitment||commitment.status!=='accepted')return result;
    const w=authoredGraphWorld(r,s,chain,bc.butterflyCommitment.phase);
    if(!commitmentDelivery(r,s,chain,commitment,w))return result;
    if(commitment.type==='deadline_change_requested'&&!applyApprovedDeadlines(r,s,[chain],false).length)return result;
    w.actorAvailable=true;w.facts=[...w.facts,`completed:${commitment.id}`];
    s.chains[i]=completeButterflyCommitment(chain,commitment.id,w);
    if(commitment.type==='offer_return_requested')s.ledger.modifiers=s.ledger.modifiers.filter(m=>m.id!==chain.subjects.offerAssetId);
    // A merged family errand appears in both source histories but is performed
    // only once. Fan out the same receipt, not a second delivery interaction.
    if(/family_delegate_requested|family_attendance_chosen/.test(commitment.type))for(let j=0;j<s.chains.length;j++){
      if(j===i)continue;
      const other=s.chains[j],same=other.commitments.find(c=>c.source===commitment.source&&c.type===commitment.type&&c.status==='accepted');if(!same)continue;
      s.chains[j]=completeButterflyCommitment(other,same.id,{...w,facts:[...w.facts,`completed:${same.id}`]});
    }
    if(/handoff/.test(commitment.type)&&chain.subjects.patientId){
      const patients=structuredClone(r.patients),p=patients.find(p=>p.uid===chain.subjects.patientId)!;
      const handoff:ClinicalHandoff={patientId:p.uid,day:r.day,source:option.id,commitmentId:commitment.id,recipient:/alternative|successor/.test(commitment.type)?'cover-doctor':'li',scope:!(/alternative|successor/.test(commitment.type))&&chain.facts.some(f=>f.type==='favor_one_ward_review')?'ward-review':'remaining-care'};
      if(!currentClinicalHandoff({...r,authored:s},p))(s.clinicalHandoffs??=[]).push(handoff);
      p.caredDay=r.day;result.patch.patients=patients;
      result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>c.patientId===p.uid&&isDirectPatientCare(c)&&(handoff.scope==='remaining-care'||c.kind==='ward')).map(c=>c.id));
    }
    appendReadyDeliveries(r,s,result,bc.butterflyCommitment.phase);
    return result;
  }
  if('butterflyMerge'in card){
    const bc=card as ButterflyMergeCard,key=`merge:${card.id}`;
    if(s.ledger.commits.includes(key))return result;
    const participants=s.chains.filter(c=>bc.butterflyMerge.chainStateIds.includes(c.id));
    const choice=option.id.split(':').at(-1)!;
    if(choice==='separate'){
      s.ledger.commits.push(key);
      for(const chain of participants){
        const source=bc.butterflyMerge.continuations?.find(c=>c.chainStateId===chain.id)?.sourceNode??chain.cursor;
        if(source==='BTF-004:LABOR'||chain.consumed.includes(source))continue;
        const original=makeButterflyCard(r,s,{...chain,cursor:source},bc.butterflyMerge.phase);
        if(original){s.published[original.id]=original;result.cards.push(original);}
      }
      resumeMergedDeliveries(r,s,result,bc);
      return result;
    }
    const w=butterflyMergeWorld({...r,ap:r.ap+option.ap},s,participants,bc.butterflyMerge.phase);
    w.transactionId=option.id;
    const merged=commitButterflyMerge(bc.butterflyMerge.mergeId,choice,participants,w);
    s.ledger.commits.push(key);
    for(const chain of merged.states){const i=s.chains.findIndex(c=>c.id===chain.id);s.chains[i]=chain;}
    if(choice==='XJ02d'||stopsMergedCooperation(choice,w)){
      const projects=new Set(merged.states.flatMap(c=>c.subjects.projectId?[c.subjects.projectId]:[]));
      for(const pending of s.ledger.pending)if(pending.scope.kind==='project'&&projects.has(pending.scope.id)){
        const waived=(pending.effects.cash??0)>0||(pending.effects.income??0)>0;
        if((pending.effects.cash??0)>0)delete pending.effects.cash;
        if((pending.effects.income??0)>0)delete pending.effects.income;
        if(waived)pending.description='此前约定的未付项目报酬已放弃，其他未决事项仍按原记录处理。';
      }
    }
    if(choice==='XJ01c')applyApprovedDeadlines(r,s,merged.states,true);
    if(choice==='XJ01a')result.removeCardIds.push(...postponeFamilyDepartureWork(r,s,card.id,option.id));
    const definition=butterflyMergeOptions(bc.butterflyMerge.mergeId,w).find(o=>o.id===choice)!;
    const obligations=butterflyMergeCost(definition,w);
    s.ledger=scheduleEventClauses(s.ledger,obligations,{scope:card.scope,day:r.day,instanceId:card.id},key);
    applyNewModifiers(r,s,result,obligations.modifiers,card.scope,key);
    result.effects.push({id:key,scope:card.scope,effects:merged.effects,text:option.result,context:{actor:card.actor,chain:card.chain,kind:card.kind}});
    result.removeCardIds.push(...Object.values(s.published).filter(c=>mergeClaimsScene(card,c)).map(c=>c.id));
    resumeMergedDeliveries(r,s,result,bc);
    appendReadyDeliveries(r,s,result,bc.butterflyMerge.phase);
    return result;
  }
  if('butterfly'in card){
    const bc=card as ButterflyCard,index=s.chains.findIndex(c=>c.id===bc.butterfly.chainStateId);
    if(index<0)return result;
    const chain=s.chains[index],localChoice=option.id.slice(option.id.lastIndexOf(chain.chain));
    if(chain.facts.some(f=>f.sourceChoiceId===localChoice))return result;
    // Reconstruct the AP offered before this choice was paid, including every
    // condition derived from AP, not just the scalar used for the final cost.
    const offeredAp=r.ap+option.ap+(PAPER_SUBMISSION_CHOICES.includes(localChoice)?paperStepCredit({...r,authored:s},chain.scope):0);
    const w=authoredGraphWorld({...r,ap:offeredAp},s,chain,bc.butterfly.phase);
    const committed=commitButterflyChoice(chain,localChoice,w);
    recordDepartmentStatementReceipt(committed.state,localChoice,r.day);
    recordPatientReview(r,s,committed.state,localChoice);
    if(localChoice==='BTF-002:N04d'){
      const asset=s.ledger.modifiers.find(m=>m.kind==='pending-asset'&&(m.value??0)>0&&/E-134|E-146/.test(m.id));
      if(asset){
        committed.state.subjects.offerAssetId=asset.id;
        for(const fact of committed.state.facts.filter(f=>f.sourceChoiceId===localChoice)){fact.subjects.offerAssetId=asset.id;fact.amount=asset.value;}
      }
    }
    if(bc.butterfly.nodeId==='BTF-004:N07'&&option.check&&!success){
      for(const type of ['supplement_required','inquiry_delivered'])if(!committed.state.facts.some(f=>f.type===type))committed.state.facts.push({id:`${chain.id}:${localChoice}:${type}`,type,scope:chain.scope,sourceChoiceId:localChoice,day:r.day,subjects:{...chain.subjects},knownBy:['player']});
      committed.state.cursor='BTF-004:N08';committed.state.status='active';delete committed.state.resolution;
    }
    if(r.talents.includes('T29')&&PAPER_SUBMISSION_CHOICES.includes(localChoice)){
      if((committed.effects.stamina??0)<0)delete committed.effects.stamina;
      if((committed.effects.cash??0)<0)delete committed.effects.cash;
      paperTalentCommitted(r,s,result,localChoice,chain.subjects.projectId??chain.scope.id,chain.scope,committed.state);
    }
    if(['BTF-002:N04a','BTF-002:N05a','BTF-004:N05a'].includes(localChoice)&&r.talents.includes('T28')&&(committed.effects.san??0)<0)committed.effects.san=0;
    if(localChoice==='BTF-002:N05a')s.benefitsReceived=(s.benefitsReceived??0)+Math.max(0,committed.effects.cash??0);
    s.chains[index]=committed.state;
    if(localChoice==='BTF-002:N07c')reduceFamilyContribution(s,committed.state,option.id,r.day);
    if(localChoice==='BTF-001:N07b')result.removeCardIds.push(...postponeFamilyDepartureWork(r,s,card.id,option.id));
    if(localChoice==='BTF-002:N02b'){
      const finance=butterflyFinanceCard({...r,authored:s},committed.state);
      if(!s.published[finance.id]){s.published[finance.id]=finance;result.cards.push(finance);(result.immediateCardIds??=[]).push(finance.id);}
    }
    if(PAPER_SUBMISSION_CHOICES.includes(localChoice))consumePaperCredit(r,s,result,card.scope,option.id);
    const research=localChoice==='BTF-002:N04a'&&w.facts.includes('same_project_funding_offer')?fundingResearchProject(s,committed.state):undefined;
    if(research){
      const paymentId=`${r.id}:funding:${r.day}:${option.id}`;
      committed.state.subjects.projectId=research.subjects.projectId;committed.state.subjects.paymentId=paymentId;committed.state.subjects.sponsorId='ye';
      committed.state.scope={kind:'project',id:research.subjects.projectId!};
      research.subjects.paymentId=paymentId;research.subjects.sponsorId='ye';
      for(const fact of committed.state.facts.filter(f=>f.sourceChoiceId===localChoice)){fact.subjects={...committed.state.subjects};fact.scope={...committed.state.scope};}
    }
    result.effects.push({id:`${option.id}:graph`,scope:committed.state.scope,effects:committed.effects,text:success?option.result:option.check?.failureText??option.result,context:{actor:card.actor,chain:card.chain,kind:card.kind}});
    activateFacts(s,committed.effects,r.day,option.id);
    const sourceId=chain.entrySource==='department-teaching'&&['N01','N05'].some(n=>bc.butterfly.nodeId.endsWith(`:${n}`))?undefined:bc.authoredEventId??nodeSource[bc.butterfly.nodeId];
    if(sourceId){s.seen[sourceId]=r.day;s.activeFacts[`event-seen:${sourceId}`]={day:r.day,source:option.id};}
    if(localChoice==='BTF-001:N01a'||localChoice==='BTF-001:N01c'||localChoice==='BTF-001:N01d'){
      s.activeFacts['额外夜班']={day:r.day,source:option.id};
      s.activeFacts[`extra-night:${r.day+1}`]={day:r.day,source:option.id};
      if(localChoice==='BTF-001:N01d')s.activeFacts[`extra-night-partial:${r.day+1}`]={day:r.day,source:option.id};
    }
    if(localChoice==='BTF-002:N01a'||localChoice==='BTF-002:N01b')result.effects.push({id:`${option.id}:receivable`,scope:chain.scope,effects:{receivable:committed.state.receivable-chain.receivable},text:'你记下了约好的还款日期。'});
    if(localChoice==='BTF-002:N03a'){
      const received=Math.max(0,chain.receivable-committed.state.receivable);s.actor.liCash=Math.max(0,s.actor.liCash-received);
      result.effects.push({id:`${option.id}:receivable-paid`,scope:chain.scope,effects:{receivable:-received},text:'你收到了多少还款，就从李恂欠你的本金里减去多少。'});
    }
    if(localChoice==='BTF-002:N02e'){
      s.activeFacts['financial-need-told-representative']={day:r.day,source:option.id};
      const disclosed=committed.state.facts.find(f=>f.type==='financial_need_disclosed'&&f.sourceChoiceId===localChoice);
      if(disclosed&&!disclosed.knownBy.includes('ye'))disclosed.knownBy.push('ye');
    }
    if(localChoice==='BTF-002:N02e'){
      // The player has called about this bill. A reply with all E146 gates
      // satisfied belongs to this conversation, not tomorrow's random draw.
      // It offers a choice only: no payment, promise acceptance or table transfer.
      const replyWorld=authoredGraphWorld({...r,authored:s},s,committed.state,bc.butterfly.phase);
      const replyNode=BUTTERFLY_NODES.find(n=>n.id==='BTF-002:N04')!;
      if(butterflyNodeEligible(committed.state,replyNode,replyWorld)){
        const next=routeButterfly(committed.state,replyWorld,[replyNode.id]);
        const reply=makeButterflyCard(r,s,next,bc.butterfly.phase);
        if(reply&&!s.published[reply.id]){
          s.chains[index]=next;s.published[reply.id]=reply;result.cards.push(reply);(result.immediateCardIds??=[]).push(reply.id);
        }
      }
    }
    if(localChoice==='BTF-004:N05a')s.activeFacts['科研-deadline']={day:r.day,source:option.id};
    if(localChoice==='BTF-004:N06a')activateFacts(s,{flags:['科研-诚实','科研-收口']},r.day,option.id);
    if(localChoice==='BTF-004:N06b')activateFacts(s,{flags:[committed.state.facts.some(f=>f.type==='knowingly_false_submission')?'科研-造假':'科研-诚实','科研-收口']},r.day,option.id);
    if(localChoice==='BTF-004:N05b'||localChoice==='BTF-004:N06c'||localChoice==='BTF-004:N06d')activateFacts(s,{flags:['科研-放弃']},r.day,option.id);
    if(localChoice==='BTF-002:N05a')activateFacts(s,{flags:['药代-4统方']},r.day,option.id);
    const node=BUTTERFLY_NODES.find(n=>n.id===bc.butterfly.nodeId)!;
    const graphOption=node.options.find(o=>o.id===localChoice)!;
    const obligations=butterflyChoiceCost(chain,graphOption,w),modifierRules=obligations.modifiers;
    if(['BTF-002:N04a','BTF-002:N05a'].includes(localChoice))for(const m of modifierRules)if(m.kind==='cash-pressure'&&(m.value??0)<0)m.value=-talentRepresentative(eventTalentContext(r),-m.value!,0).pressureRelief;
    s.ledger=scheduleEventClauses(s.ledger,obligations,{scope:committed.state.scope,day:r.day,instanceId:chain.id},option.id);
    applyNewModifiers(r,s,result,s.ledger.modifiers.filter(m=>m.id.startsWith(`${option.id}:`)),committed.state.scope,option.id);
    appendReadyDeliveries(r,s,result,bc.butterfly.phase);
    return result;
  }
  if('representativeRecontact'in card){
    const contact=card as RepresentativeRecontactCard,{stage,priorChoiceId}=contact.representativeRecontact;
    if(s.ledger.commits.includes(option.id))return result;s.ledger.commits.push(option.id);
    const actual=success?option.effects:option.check?.failure??option.effects;activateFacts(s,actual,r.day,option.id);
    for(const id of actual.flags??[])s.ledger.facts.push({id,scope:card.scope,day:r.day,source:option.id,knownBy:['player','ye']});
    for(const [key,due]of Object.entries(s.activeFacts))if(key.startsWith('rep-recontact-due:')&&due.source===priorChoiceId)delete s.activeFacts[key];
    if(option.id.endsWith(':accept')){
      s.drugStage=stage;s.benefitsReceived=(s.benefitsReceived??0)+RECONTACT_FEES[stage];
      if(stage===2){const relief=r.talents.includes('T28')?30:15;Object.assign(s,changeCashPressure(r,s,-relief));}
      if(stage===3)s.ledger.modifiers.push({id:`${option.id}:paper-credit`,kind:'formula',target:'paper-step-credit',value:1,scope:{kind:'project',id:`${r.id}:research-project`},starts:r.day,expires:14,description:'你可以使用挂名会议的现成材料，这次整理论文少花 1 点行动值。'});
      if(stage<5){s.drugNextDay=r.day+2+Math.floor(runRandom(r,`drug-next:${option.id}`)*2);s.activeFacts[`rep-recontact-due:${stage+1}`]={day:s.drugNextDay,source:option.id};}
      if(stage===5)s.ledger.pending.push({id:`${option.id}:next-week`,delay:7,due:r.day+7,phase:'结算',scope:card.scope,effects:{cash:6000},until:['药代-上交'],description:'按已接受的处方量结算约定，下一期六千元按期结算。'});
      if([2,3].includes(stage)&&runRandom(r,`rep-recontact-inquiry:${option.id}`)<(stage===2?.1:.25))s.activeFacts[`rep-recontact-interview:${card.id}`]={day:r.day+1,source:option.id};
    }else if(option.id.endsWith(':department')){
      s.benefitsReceived=(s.benefitsReceived??0)+RECONTACT_FEES[stage];s.benefitsReturned=(s.benefitsReturned??0)+RECONTACT_FEES[stage];s.activeFacts['rep-recontact-closed']={day:r.day,source:option.id};
    }else if(stage===0)s.activeFacts['rep-recontact-closed']={day:r.day,source:option.id};
    else{s.drugStage=stage-1;s.drugCooldownUntil=r.day+3;s.drugNextDay=r.day+3;s.activeFacts[`rep-recontact-due:${stage-1}`]={day:r.day+3,source:option.id};}
    return result;
  }
  if(!('authoredEventId'in card)||!('eventBinding'in card))return result;
  const ec=card as EventCard,e=EVENT_BY_ID[ec.authoredEventId],o=ec.options.find(o=>o.id===option.id);
  if(e?.id==='E-012'&&option.id===`${card.id}:night-telephone`){
    const key=`${card.id}:${option.id}`;if(s.ledger.commits.includes(key))return result;
    s.ledger.commits.push(key);(s.ledger.outcomes??=[]).push({eventId:e.id,choiceId:option.id,success,scope:card.scope,day:r.day});
    s.seen[e.id]=r.day;activateFacts(s,{flags:[`event-seen:${e.id}`,`night-incident-started:${card.id}`]},r.day,option.id);
    return result;
  }
  if(!e||!o||s.ledger.commits.includes(`${ec.id}:${option.id}`))return result;
  s.seen[e.id]=r.day;
  if(e.id==='E-156'&&r.facts['forced_audit_interview']){
    const effects={flags:['forced_audit_interview_consumed'],clear:['forced_audit_interview']};activateFacts(s,effects,r.day,option.id);result.effects.push({id:`${option.id}:forced-audit-complete`,scope:card.scope,effects,text:'约谈已经完成，你的说明与所交材料一并存档。'});
  }
  if(success)paperTalentCommitted(r,s,result,o.id.split(':').at(-1)!,ec.eventBinding.projectId??card.scope.id,card.scope);
  if(e.id==='E-200'||e.id==='E-201')s.activeFacts['SAN归零']={day:r.day,source:option.id};
  if(e.id==='E-200'&&card.patientId&&option.id.endsWith('E-200-b')&&success)s.activeFacts[`san-wrong-record:${card.patientId}`]={day:r.day,source:option.id};
  if(e.id==='E-202'&&card.patientId){
    s.activeFacts[`clinical:${card.patientId}:san-wrong-record-discovered`]={day:r.day,source:option.id};
    if(option.id.endsWith('E-202-b')){
      s.activeFacts[`tampered:${card.patientId}`]={day:r.day,source:option.id};
      s.activeFacts[`tampering-discovered:${card.patientId}`]={day:r.day,source:option.id};
    }
  }
  const actual=authoredChoiceEffects(o,success);
  recordFamilyInvoiceChoice(s,card,option.id,actual.cash??0,r.day);
  if(e.id==='E-106')s.activeFacts['wedding-due']={day:r.day+3,source:option.id};
  if(e.id==='E-014'&&card.patientId){
    const returned=option.id.endsWith('E-014-a')&&success;
    result.effects.push({id:`${option.id}:self-departure`,scope:card.scope,effects:{...(returned?{}:{discharge:true}),flags:[`self-departure:${card.patientId}`,...(returned?[`self-departure-returned:${card.patientId}`]:[])]},text:returned?'患者已经返回病区，原来的自行离院经过仍保留。':'患者已经自行离开，本院床位释放。自行离院经过与未完成的评估分别保留，没有记成已劝返。'});
  }
  if(PAPER_SUBMISSION_CHOICES.some(id=>option.id.endsWith(id)))consumePaperCredit(r,s,result,card.scope,option.id);
  if(e.id==='E-031'&&option.id.endsWith('E-031-c'))for(const affected of ec.eventBinding.patients??[])result.effects.push({id:`${option.id}:oxygen:${affected.id}`,scope:{kind:'patient',id:affected.id},effects:{hazards:structuredClone(e.options[2].effects.hazards)},text:`同病房抽烟没有得到处理，${affected.name??'吸氧患者'}所在的用氧环境仍有安全隐患。`});
  if(PRESSURE_CHARGE_EVENTS.includes(e.id as typeof PRESSURE_CHARGE_EVENTS[number])&&(actual.cash??0)<0){s.pressureCharges??=[];s.pressureCharges.push({day:r.day,amount:-actual.cash!,source:option.id});}
  if(e.category===5&&e.id!=='E-146')s.benefitsReceived=(s.benefitsReceived??0)+Math.max(0,actual.cash??0);
  if(['E-139','E-141','E-152'].includes(e.id)&&(option.id.endsWith(`${e.id}-a`)||e.id==='E-141'&&option.id.endsWith('E-141-b')))s.benefitsReturned=(s.benefitsReturned??0)+Math.max(0,-(actual.cash??0));
  const before=s.ledger.modifiers.length;
  s.ledger=recordEventChoice(s.ledger,ec,option.id,success);
  if(e.id==='E-048'&&success){
    s.ledger.modifiers=s.ledger.modifiers.filter(m=>!m.id.startsWith(`${ec.id}:${option.id}:`));
    if(!option.id.endsWith('E-048-b')&&card.patientId){
      const work=structuredClone(r),incoming=work.patients.find(p=>p.uid===card.patientId);
      if(incoming&&awaitingBed(work,incoming)&&nextFreeBed(work)===0){
        let canAdmit=option.id.endsWith('E-048-a')&&!work.patients.some(p=>p.active&&p.bed===17);
        const old=ec.eventBinding.patients?.[0],leaving=old&&work.patients.find(p=>p.uid===old.id);
        if(option.id.endsWith('E-048-c')&&leaving?.active&&leaving.inpatient){
          leaving.active=false;leaving.bed=0;leaving.planned=false;leaving.dischargedDay=r.day;canAdmit=true;
          result.effects.push({id:`option:${option.id}:early-departure`,scope:{kind:'patient',id:leaving.uid},effects:{discharge:true,flags:[`early-discharge:${leaving.uid}`],hazards:structuredClone(e.options[2].effects.hazards)},text:`${leaving.name}尚未达到出院标准就被安排离院，原住院记录与提前离院风险保留。`});
        }
        if(canAdmit){
          if(option.id.endsWith('E-048-a')){incoming.inpatient=true;incoming.bed=17;}else assignBed(work,incoming);
          delete work.facts[`awaiting-bed:${incoming.uid}`];
          const flag=option.id.endsWith('E-048-a')?`corridor-bed:${incoming.uid}`:`capacity-admission:${incoming.uid}`;
          result.patch.patients=work.patients;result.patch.facts=work.facts;
          result.effects.push({id:`${option.id}:admission`,scope:card.scope,effects:{flags:[flag]},text:`${incoming.name}已接入住院${incoming.bed===17?'走廊临时17床':`${incoming.bed}床`}，后续照常查房、记录实际费用。此前的留观和费用记录仍在病历中。`});
          result.removeCardIds.push(...r.queue.slice(r.cursor).filter(c=>c.patientId===incoming.uid&&c.kind==='ward').map(c=>c.id));
          result.cards.push(makeWardCard({...work,authored:s},incoming));
        }
      }
    }
  }
  if(e.id==='E-022'||e.id==='E-034'){
    const pending=s.ledger.modifiers.slice(before).filter(m=>m.target==='history-check');
    if(pending.length){
      const patient=r.patients.find(p=>p.uid===card.patientId);
      const targets=e.id==='E-022'&&patient?r.patients.filter(p=>p.uid!==patient.uid&&p.active&&p.inpatient&&p.damage<3&&roomFor(p)===roomFor(patient)).slice(0,2):r.queue.slice(r.cursor).flatMap(c=>{const p=r.patients.find(p=>p.uid===c.patientId);return p&&p.uid!==card.patientId&&p.active&&!p.inpatient&&(c.presetNode||c.clinicalGraph||c.kind==='quick')?[p]:[]}).slice(0,1);
      s.ledger.modifiers=s.ledger.modifiers.filter(m=>!pending.includes(m));
      for(const m of pending)for(const p of targets)s.ledger.modifiers.push({...m,id:`${m.id}:patient:${p.uid}`,scope:{kind:'patient',id:p.uid},starts:r.day,expires:r.day});
    }
  }
  activateFacts(s,actual,r.day,option.id);
  if(e.id==='E-171'&&option.id.endsWith(':E-171-c')&&success&&card.patientId){
    const p=r.patients.find(p=>p.uid===card.patientId),episode=p?createClaimedReadmission({...r,authored:s},p,option.id):undefined;
    if(episode){(s.billingEpisodes??=[]).push(episode);result.effects.push({id:episode.id,scope:card.scope,effects:{flags:[`billing-split:${card.patientId}`]},text:`${p!.name}的实际住院和原账单保持连续，结算材料却报成出院后再入院。新增额度只抵之后的费用，原来的超支仍保留，稽核能够对照这两份记录。`});}
  }
  if((e.id==='E-032'||e.id==='E-109')&&option.id.endsWith(`${e.id}-c`)){
    s.appointments??=[];if(!s.appointments.some(a=>a.id===option.id))s.appointments.push({id:option.id,source:e.id,day:r.day+1,patientId:card.patientId});
  }
  if(e.id==='E-013'&&card.patientId){
    if(actual.flags?.includes('refusal-informed-signed')){
      s.refusals??={};s.refusals[card.patientId]??={day:r.day,source:option.id};
      const patients=structuredClone(result.patch.patients??r.patients),p=patients.find(p=>p.uid===card.patientId);
      if(p?.clinical&&!p.clinical.flags.includes('refusal_signed'))p.clinical.flags.push('refusal_signed');
      result.patch.patients=patients;
    }
    if(option.id.endsWith('E-013-b')&&success){
      const patients=structuredClone(result.patch.patients??r.patients),p=patients.find(p=>p.uid===card.patientId);
      if(p?.clinical&&!p.clinical.flags.includes('lp_consented'))p.clinical.flags.push('lp_consented');
      if(p?.clinical&&!p.clinical.flags.includes('lp_assessment_completed'))p.clinical.flags.push('lp_assessment_completed');
      result.patch.patients=patients;
    }
    const patients=structuredClone(result.patch.patients??r.patients),p=patients.find(p=>p.uid===card.patientId);
    if(p?.caseId==='C008'&&p.clinical?.nodeId==='s3'){
      p.clinical.nodeId='s4';if(!p.clinical.entered.includes('s4'))p.clinical.entered.push('s4');
      if(option.id.endsWith('E-013-c')&&!p.clinical.flags.includes('refusal_unsigned'))p.clinical.flags.push('refusal_unsigned');
      result.patch.patients=patients;
    }
  }
  const stage=({'E-132':1,'E-134':2,'E-136':3,'E-137':4,'E-138':5}as Record<string,number>)[e.id];
  if(stage){
    const stageFlags=['','药代-1餐叙','药代-2讲课费','药代-3挂名','药代-4统方','药代-5回扣'];
    if(actual.flags?.includes(stageFlags[stage])){s.drugStage=stage;s.drugNextDay=r.day+2+Math.floor(runRandom(r,`drug-next:${option.id}`)*2);}
    else if(!actual.flags?.includes('药代-上交')){s.drugStage=Math.max(0,stage-1);s.drugCooldownUntil=r.day+3;s.drugNextDay=r.day+3;s.activeFacts[`rep-recontact-due:${s.drugStage}`]={day:r.day+3,source:option.id};}
  }
  // These invitations require a fact acquired during this very settlement.
  // Waiting for tomorrow's phase builder would lose the source's same-day window.
  for(const nextId of [actual.flags?.includes('药代-1餐叙')?'E-133':'',actual.flags?.includes('药代-2讲课费')?'E-135':''].filter(Boolean)){
    if(s.seen[nextId]!==undefined||Object.values(s.published).some(c=>(c as Partial<EventCard>).authoredEventId===nextId))continue;
    const match=chooseBinding(r,s,EVENT_BY_ID[nextId],ec.eventBinding.phase);if(!match)continue;
    let next:Card=prepareTalentEvent(r,eventToCard(EVENT_BY_ID[nextId],match.binding,match.context));
    if(nextId==='E-135'&&!s.chains.some(c=>c.chain==='BTF-004'&&c.status!=='closed')){
      const chain=startButterfly('BTF-004',`${r.id}:BTF-004:E-135`,{actorId:'zhou',projectId:`${r.id}:research-project`,datasetId:`${r.id}:slides-source`,sponsorId:'ye',recipientIds:['player','zhou']},'N01');s.chains.push(chain);
      const graphCard=makeButterflyCard(r,s,chain,ec.eventBinding.phase);if(graphCard){graphCard.authoredEventId=nextId;next=graphCard;}else s.chains.splice(s.chains.indexOf(chain),1);
    }
    next.shiftPhase=ec.eventBinding.phase;s.published[next.id]=next;result.cards.push(next);
  }
  if(e.id==='E-005'&&success){
    if(option.id.endsWith('E-005-a'))addLateOutpatient(r,s,result,option.id);
    if(actual.flags?.includes('复诊-加号'))s.activeFacts['late-outpatient-due']={day:r.day+1,source:option.id};
  }
  if(e.id==='E-026'&&success&&option.id.endsWith('E-026-c')){
    const parent=r.patients.find(p=>p.uid===card.patientId);if(parent)registerSon(r,s,result,parent,option.id);
  }
  if(e.id==='E-043'&&success&&!option.id.endsWith('E-043-b')){
    const patients=structuredClone(result.patch.patients??r.patients);
    for(const bound of ec.eventBinding.patients?.slice(0,3)??[]){
      const p=patients.find(p=>p.uid===bound.id),assignment=s.clinicalAssignments?.find(a=>a.patientId===bound.id&&a.owner==='peer');if(!p||!assignment)continue;
      // Settle each original team's incurred balance before responsibility
      // moves. A free conversation must never act as an implicit invoice.
      const billingRun={...r,authored:s};
      beginBudgetSettlement(billingRun,p);
      assignment.teamCharged=Math.max(assignment.teamCharged,Math.max(0,patientLiability(billingRun,p)-p.charged));
      finishBudgetSettlement(billingRun,p);
      assignment.cover={day:r.day,source:option.id};
      if(option.id.endsWith('E-043-a')){
        const ward=makeWardCard({...r,authored:s},p);ward.shiftPhase='查房';ward.text=`${p.name}今天交由你接管。交班时已经为这张床留出一个查房行动。\n${ward.text}`;
        ward.options=ward.options.map(o=>o.id.endsWith(':review')?{...o,ap:0,minutes:0,effects:{...o.effects,stamina:0},hint:'接管时已经支付本次查房的行动与体力。'}:o);result.cards.push(ward);
      }else p.caredDay=r.day;
    }
    result.patch.patients=patients;
  }
  if(e.id==='E-144'&&success){s.published[card.id]=structuredClone(card);schedulePeerReferral(s,option.id,r.day);}
  if(e.id==='E-024'&&card.patientId&&!option.id.endsWith('E-024-a'))s.activeFacts[`pharmacy-held:${card.patientId}`]={day:r.day,source:option.id};
  if(e.id==='E-162'&&success&&!option.id.endsWith('E-162-b')&&card.patientId){
    const work=structuredClone(r),p=work.patients.find(p=>p.uid===card.patientId);
    if(p){assignBed(work,p);p.active=true;p.admitted=r.day;result.patch.patients=work.patients;result.patch.facts=work.facts;}
    s.activeFacts['低标入院']={day:r.day,source:option.id};
    result.effects.push({id:`${option.id}:lowered-admission`,scope:card.scope,effects:{hazards:[{type:'R',weight:15,reason:'为病组收入降低住院指征',norm:'根据实际病情确定住院必要性',causal:false}]},text:'这次患者在没有充分住院指征的情况下被收住院，后续稽核会重点核对收治依据。'});
  }
  if(e.id==='E-161'&&success&&!option.id.endsWith('E-161-b')&&card.patientId){
    const p=r.patients.find(p=>p.uid===card.patientId),group=p?(p.preset??CASES.find(c=>c.id===p.caseId))?.dipGroup:undefined;
    if(group)s.dipPolicy={group,started:r.day,sequence:r.journal.length,patientId:card.patientId,source:option.id};
  }
  applyNewModifiers(r,s,result,s.ledger.modifiers.slice(before),card.scope,option.id);
  if(e.id==='E-100'&&s.ledger.modifiers.slice(before).some(m=>m.kind==='cash-pressure'&&(m.value??0)>=5))s.activeFacts[`icu-pressure:${r.day}`]={day:r.day,source:option.id};
  // Authored risk reductions are compiled into the selected branch's Effects.
  // Applying raw prose again here would double the reduction and could apply
  // a delayed or conditional promise before it actually takes place.
  if(e.id==='E-180'){s.paperDeadline=o.id.endsWith('E-180-b')&&success?13:11;}
  if(e.id==='E-054'||e.id==='E-040'){
    const chain=s.chains.find(c=>c.chain==='BTF-001'&&c.status!=='closed');
    if(chain&&card.patientId&&!chain.subjects.patientId){chain.subjects.patientId=card.patientId;chain.scope={kind:'patient',id:card.patientId};}
  }
  const targets=eventRiskTargets(e,{...o,effects:actual},ec.eventBinding);
  // The first scope was already applied by the game; add only the other affected patients.
  targets.filter(t=>!scopeMatches(t.scope,card.scope)).forEach((t,i)=>result.effects.push({id:`${option.id}:other-patient:${i}`,scope:t.scope,effects:{hazards:t.hazards},text:option.result}));
  if(card.scope.kind==='project'&&targets[0]&&targets[0].hazards.some((h,i)=>h.weight!==(actual.hazards?.[i]?.weight??0))){
    result.effects.push({id:`${option.id}:other-research-consents`,scope:card.scope,effects:{hazards:targets[0].hazards.map((h,i)=>({...h,weight:h.weight-(actual.hazards?.[i]?.weight??0)}))},text:success?option.result:option.check?.failureText??option.result});
  }
  const participant=s.participants.find(p=>p.id===card.patientId);
  if(participant){
    participant.charges=Math.max(0,participant.charges+(actual.bill??0));
    const excess=Math.max(0,participant.charges-participant.budget),change=excess-participant.charged;
    participant.charged=excess;
    if(change>0){s.pressureCharges??=[];s.pressureCharges.push({day:r.day,amount:change,source:`${option.id}:event-patient-bill`});}
    if(change)result.effects.push({id:`${option.id}:event-patient-bill`,scope:card.scope,effects:{cash:-change},text:change>0?'这次诊疗费用超过病组预算，你已支付超出的部分。':'诊疗账单已经更正，多收的自付费用已退回你的余额。'});
  }
  return result;
}

/** Call at phase completion (and final=true at any early ending). */
export function settleAuthoredEvents(r:AuthoredRun,phase:EventPhase,final=false):DirectorResult{
  const s=initialize(r),result=freshResult(s),key=`settled:${r.day}:${phase}:${final}`;
  if(s.scheduled.includes(key))return result;s.scheduled.push(key);
  if(final)for(const [id,due]of Object.entries(s.activeFacts))if(id.startsWith('rep-recontact-due:'))s.endNotes.push(`叶茗约定第${due.day}天再联络。轮转结束时，这次新邀请尚未接受，没有计入收款。`);
  const facts=Object.keys(factsFor(r,s));
  facts.push(...r.patients.filter(p=>!p.active).map(p=>`patient-discharged:${p.uid}`));
  const settled=settleEventLedger(s.ledger,r.day,phase,facts,key=>runRandom(r,key),final);
  s.ledger=settled.ledger;s.endNotes.push(...settled.epilogue);
  if(phase==='结算'||final)result.effects.push(...settleButterflyAccounts(r,s));
  if(final)for(const appointment of s.appointments??[]){
    if(appointment.arrived)continue;
    const person=r.patients.find(p=>p.uid===appointment.patientId)?.name;
    s.endNotes.push(appointment.source==='E-032'?`${person??'孩子'}的复诊约在第 ${appointment.day} 天，轮转结束时这次评估尚未进行。`:`表姨介绍的孩子已约第 ${appointment.day} 天来门诊，轮转结束时尚未接诊。`);
  }
  if(final)for(const note of pendingPeerReferralNotes({...r,authored:s}))s.endNotes.push(`${note}轮转结束时尚未接诊。`);
  for(const [uid,refusal]of Object.entries(s.refusals??{})){
    if(refusal.resolved)continue;
    const p=r.patients.find(p=>p.uid===uid);if(!p)continue;
    if(refusedAssessmentCompleted(p)){refusal.resolved='assessment';continue;}
    if(p.damage>=2){refusal.resolved='known-damage';continue;}
    if(r.facts[`night-telephone:${uid}`]){refusal.resolved='telephone';continue;}
    if(r.day<=refusal.day)continue;
    const deteriorated=runRandom(r,`refused-assessment-course:${uid}`)<.2;
    refusal.resolved=deteriorated?'deteriorated':'stable';
    const text=deteriorated?`${p.name}的随访回报：病情出现严重恶化，此前拒绝的腰穿仍未完成。知情拒绝记录与已经实施的治疗一并保留，后续需分别核对疾病进展和实际诊疗经过。`:`${p.name}的随访回报暂未发现新的严重损害。此前的拒绝检查记录保留，仍需根据病情继续评估。`;
    result.effects.push({id:`${refusal.source}:refusal-followup`,scope:{kind:'patient',id:uid},effects:{...(deteriorated?{damage:2-p.damage}:{}),flags:[`clinical:${uid}:informed-refusal-followup-${refusal.resolved}`]},text});
  }
  if(s.dipPolicy)for(const p of r.patients){
    const policy=s.dipPolicy,marker=`dip-cheaper-policy:${p.uid}`;
    if(p.uid===policy.patientId||s.activeFacts[marker]||(p.preset??CASES.find(c=>c.id===p.caseId))?.dipGroup!==policy.group)continue;
    const treated=r.journal.some((entry,index)=>index>=(policy.sequence??0)&&entry.scope.kind==='patient'&&entry.scope.id===p.uid&&entry.day>=policy.started&&entry.operation==='treatment');
    if(!treated)continue;s.activeFacts[marker]={day:r.day,source:policy.source};
    result.effects.push({id:marker,scope:{kind:'patient',id:p.uid},effects:{hazards:[{type:'R',weight:5,reason:'沿用同病组的低价次优用药安排',norm:'同类患者仍需逐一核对方案是否等效',causal:false}]},text:`${p.name}的同类治疗沿用了已接受的低价方案，病历仍需说明替代药的适用依据。`});
  }
  for(const e of settled.effects){
    if(e.id.includes(':REP-RECONTACT:')&&e.id.endsWith(':next-week'))s.benefitsReceived=(s.benefitsReceived??0)+Math.max(0,e.effects.cash??0);
    const sourceId=e.id.match(/E-\d{3}/)?.[0];if(sourceId&&PRESSURE_CHARGE_EVENTS.includes(sourceId as typeof PRESSURE_CHARGE_EVENTS[number])&&(e.effects.cash??0)<0){s.pressureCharges??=[];s.pressureCharges.push({day:r.day,amount:-e.effects.cash!,source:e.id});}
    result.effects.push({id:e.id,scope:e.scope,effects:e.effects,text:e.description});activateFacts(s,e.effects,r.day,e.id);
    if(e.effects.flags?.includes('peer-sick-leave')&&!s.actor.liAwayDays.includes(r.day))s.actor.liAwayDays.push(r.day);
    if(e.effects.flags?.includes('qualification-exam-failed'))s.ledger.modifiers.push({id:`${e.id}:supervised-prescriptions`,scope:e.scope,kind:'formula',target:'supervised-prescriptions',value:1,starts:r.day,expires:14,description:'你每次门诊接诊都要多花 1 点行动值，处方还需要上级医生签字。'});
  }
  if(phase==='门诊'&&!final&&!isFullDayLeave(r)&&s.seen['E-005']===undefined){
    const event=EVENT_BY_ID['E-005'],match=chooseBinding(r,s,event,phase);
    if(match&&runRandom(r,`late-outpatient:${r.day}`)<Math.min(1,eventWeight(event,match.context)/8)){
      if(match.extra&&!s.participants.some(p=>p.id===match.extra!.id))s.participants.push(match.extra);
      const card=prepareTalentEvent(r,eventToCard(event,match.binding,match.context));s.published[card.id]=card;result.cards.push(card);
    }
  }
  if(phase==='日终'){
    if(factsFor(r,s)['家庭-车祸-ICU中']&&r.day>(s.seen['E-099']??r.day)&&!s.activeFacts[`icu-pressure:${r.day}`]){Object.assign(s,changeCashPressure(r,s,5));s.activeFacts[`icu-pressure:${r.day}`]={day:r.day,source:`icu-daily:${r.day}`};}
    Object.assign(s,changeCashPressure(r,s,-talentPressureDecay(eventTalentContext(r))));
    const tuning=eventTuning(s.ledger,r.day);
    if(tuning.sleep<1)result.patch.vitals={...r.vitals,stamina:Math.floor(r.caps.stamina*tuning.sleep)};
    if(s.leaveUntil!==undefined&&s.leaveUntil>r.day)result.patch.skipNextDay=true;
    if(s.leaveUntil===r.day){s.returnedFromLeave=r.day+1;delete s.leaveUntil;}
    for(let i=0;i<s.chains.length;i++){
      let chain=s.chains[i];
      for(const commitment of chain.commitments.filter(c=>c.status==='accepted')){
        const shiftWork=/cover_accepted/.test(commitment.type);
        const actualShiftComplete=shiftWork&&commitment.due===r.day&&extraShiftCompleted(r,s);
        if(actualShiftComplete){
          const w=authoredGraphWorld(r,s,chain,phase);w.actorAvailable=true;w.facts=[...w.facts,`completed:${commitment.id}`];
          chain=completeButterflyCommitment(chain,commitment.id,w);
        }
      }
      s.chains[i]=chain;
    }
    if(extraShiftCompleted(r,s)&&!s.activeFacts[`extra-night-paid:${r.day}`]){
      s.activeFacts[`extra-night-paid:${r.day}`]={day:r.day,source:key};
      result.effects.push({id:`${r.id}:${r.day}:shift-completed`,scope:{kind:'personal',id:r.id},effects:{san:-RULES.extraShift.completionSan,relations:{peer:RULES.extraShift.peerFavor}},text:extraShiftPlan(s,r.day).partial?'约定时段内的患者已经处理完。李恂接回剩下的班次，确认这次替班已完成。夜诊绩效已随各次接诊结算。':'约定的夜诊和突发事项已经处理完，李恂确认收到交班。这次替班已完成，夜诊绩效已随各次接诊结算。'});
    }
  }
  if(final){
    s.endNotes.push(...familyInvoiceNotes(s));
    for(const asset of s.ledger.modifiers.filter(m=>m.kind==='pending-asset'))s.endNotes.push((asset.value??0)>0?`尚有 ${asset.value} 元未接受的待处理款，未计入可用余额，也未抵扣任何欠款。退回结果尚未确认。`:'尚有未接受的物品保留在待处理清单，未计入收入或可售资产。');
    // A carried court notice may have been answered after leaving the ward.
    s.sceneAgenda=s.sceneAgenda?.filter(item=>!s.published[item.cardId]?.options.some(o=>r.committed.includes(o.id)));
    s.endNotes.push(...pendingSceneNotes(s));
    if(s.activeFacts['飞检-未整改']&&!s.activeFacts['audit-unrectified-counted']){
      s.activeFacts['audit-unrectified-counted']={day:r.day,source:key};
      result.effects.push({id:`${r.id}:unrectified-audit`,scope:{kind:'project',id:`${r.id}:audit-project`},effects:{hazards:[{type:'F',weight:5,reason:'约谈后未提交整改报告',norm:'按时提交真实整改与自查材料',causal:false}]},text:'整改报告没有提交，稽核组将这项未履行事项一并列入结论。'});
    }
    for(const token of s.trolley?.tokens.filter(t=>!t.resolved)??[])s.endNotes.push(`${token.object}仍待${token.actor}与你核对。原件已经保留，未答的问题仍列在清单上。`);
    for(let i=0;i<s.chains.length;i++){
      const chain=s.chains[i],w=authoredGraphWorld(r,s,chain,phase);w.final=true;
      s.chains[i]=routeButterfly(chain,w);
      const view=butterflyResolutionView(s.chains[i],w);s.endNotes.push(`${view.title}：${view.text}`);
      if(chain.facts.some(f=>f.type==='privacy_scope_requested'))s.endNotes.push(chain.facts.some(f=>f.type==='privacy_scope_limited')?'复核方已限定无关私人材料的接收范围。原件仍封存，涉及争议的事实继续核对。':'限定私人材料接收范围的申请尚未获准。原件与未决事项仍保留，没有记录成已经限制传播。');
      if(chain.receivable>0)s.endNotes.push(`李恂尚欠你 ${chain.receivable} 元，约定归还日为第 ${receivableDue(chain)} 天。未到账的钱没有计入余额。`);
      if(chain.privateDebt>0)s.endNotes.push(`叶茗的私人借款尚余 ${chain.privateDebt} 元，约定归还日为第 ${privateDebtDue(chain)} 天；这笔无息借款与信用贷款分别记账。`);
      if(chain.facts.some(f=>f.type==='unearned_project_benefits_waived'))s.endNotes.push('你已放弃这次合作中尚未兑现的报酬。实际收到的款项、原有欠款和已经交出的资料仍留在各自记录中。');
    }
  }
  return result;
}

export const authoredTuning=(r:AuthoredRun,scope?:Scope)=>{
  const s=initialize(r),facts=[...Object.keys(factsFor(r,s)),...r.patients.filter(p=>!p.active).map(p=>`patient-discharged:${p.uid}`)];
  return eventTuning(s.ledger,r.day,scope,facts);
};
export const authoredQualifiers=(r:AuthoredRun,phase:EventPhase,p?:Patient)=>contextFor(r,initialize(r),phase,p).qualifiers??[];
/** Direct terminal scenes; candidate endings remain the responsibility of the ending arbiter. */
export function authoredRequestedEnding(r:AuthoredRun,card:Card,option:Option,success:boolean):string|undefined{
  if(!('authoredEventId'in card))return;
  const id=(card as EventCard).authoredEventId,index=(card as EventCard).options.findIndex(o=>o.id===option.id);
  if(id==='E-200')return index===1&&success?undefined:index===2&&r.relations.family>=3?'X24':'X21';
  if(id==='E-201')return index===1&&success?undefined:'X22';
  if(id==='E-202')return'X23';
  if(id==='E-205'&&(index===0||index===1&&!success))return'X24';
  if(id==='E-208')return'X06';
  if(id==='E-209'){const f=factsFor(r,initialize(r));return f['统方']||f['回扣']||r.facts['prescriptions-exported']||r.facts['kickback-received']?'X32':'X31';}
  return undefined;
}
/** Read-only inspection for selection tests and the player's currently available encounter list. */
export function eligibleAuthoredEvents(r:AuthoredRun,phase:EventPhase){const s=initialize(r);return AUTHORED_EVENTS.flatMap(event=>{const match=chooseBinding(r,s,event,phase);return match?[{event,...match}]:[];});}
export const documentedQualifierInventory=()=>[...new Set(AUTHORED_EVENTS.flatMap(e=>e.requiredQualifiers))].map(qualifier=>({qualifier,events:AUTHORED_EVENTS.filter(e=>e.requiredQualifiers.includes(qualifier)).map(e=>e.id),provider:/认知障碍|恶性或终末期|孕产|他人管的病人死亡/.test(qualifier)?'documented-event-participant':'run-clinical-actor-state'}));
