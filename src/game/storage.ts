import { hash } from "./random";
import { availableOptions, newMeta } from "./engine";
import { CASES, DEBUFFS, TALENTS } from "./catalog";
import type { Meta, PatientCheckMember, Run } from "./types";
import type { GuideState } from "../shared/guide-state";
import { getClinicalGraph } from '../content/clinical';
import { CASE_PRESETS, ENTITY_BY_ID, PRESET_BY_ID, isCompatible } from '../content/patients';
import { EVENT_BY_ID, BUTTERFLY_NODES, BUTTERFLY_MERGES, BUTTERFLY_RESOLUTIONS } from '../content/events';
import { aggregatePatientCheckMembers, patientCheckParties } from './patient-checks';
import { talentRollOutcome,validateTalentSelection } from './talents';
import {validArchiveTrap} from './trap-archive';
import {repairLegacyPresetBaselines} from './preset-baseline-repair';
import {repairLegacyClinicalLocations} from './clinical-location-repair';
import {repairLegacyClinicalAdmission}from './clinical-admission';
import {CLINICAL_PATIENT_BY_ID} from '../content/clinical/patient-identities';
import {recoverClinicalPatientCollection} from './encounters';
import {PRESSURE_CHARGE_EVENTS} from '../content/events/pressure';
import {authoredChoiceEffects}from '../content/events/catalog';
import type {EventOption}from '../content/events/types';
import {RULES}from './rules';
import {isResearchCollaboration}from '../content/events/butterfly';
import {patientReviewReceiptValid}from '../content/events/patient-review';
export interface Settings {
  sound: boolean;
  music?: boolean;
  voice?: boolean;
  musicVolume?: number;
  voiceVolume?: number;
  soundVolume?: number;
  visualInterference?: boolean;
  motion: boolean;
  largeText: boolean;
}
export interface Save {
  schema: 1;
  run: Run | null;
  meta: Meta;
  settings: Settings;
  guide?: GuideState;
}
export const SAVE_KEY = "tyche.save.1";
export const BACKUP_KEY = "tyche.backup.1";
export const SAVE_MAX_BYTES=3_000_000;
export interface SaveStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;}
/** UTF-8 encoding size, including the replacement character for lone surrogates. */
function utf8Bytes(value:string):number {
  let bytes=0;for(const char of value){const code=char.codePointAt(0)!;bytes+=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;}return bytes;
}
const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const finiteRecord = (x: unknown, keys: string[]) =>
  isRecord(x) &&
  keys.every((k) => typeof x[k] === "number" && Number.isFinite(x[k]));
const strings = (x: unknown): x is string[] =>
  Array.isArray(x) &&
  x.length <= 20000 &&
  x.every((v) => typeof v === "string" && v.length <= 10000);
const skills = ["observe", "clinical", "record", "persuade", "comfort", "endure"];
const relations = ["chief", "peer", "nurse", "family"];
const vitals = ["stamina", "san", "emotion"];
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const integer = (x: unknown): x is number => finite(x) && Number.isInteger(x);
const textFields = (x: Record<string, unknown>, keys: string[]) => keys.every(k => typeof x[k] === "string");
const boolFields = (x: Record<string, unknown>, keys: string[]) => keys.every(k => typeof x[k] === "boolean");
const optional = (x: Record<string, unknown>, key: string, valid: (value: unknown) => boolean) => x[key] === undefined || valid(x[key]);
const isText = (x: unknown) => typeof x === "string";
const isBool = (x: unknown) => typeof x === "boolean";
const member = (values: readonly string[]) => (x: unknown) => typeof x === "string" && values.includes(x);
const nonempty = (x:unknown):x is string => typeof x==='string'&&x.length>0&&x.length<=10000;
const nonnegative = (x:unknown):x is number => finite(x)&&x>=0;
const positive = (x:unknown):x is number => finite(x)&&x>0;
const count = (x:unknown):x is number => integer(x)&&x>=0;
const distinctStrings = (x:unknown):x is string[] => strings(x)&&new Set(x).size===x.length;
const list = (x:unknown,valid:(v:unknown)=>boolean,max=20000):x is unknown[] => Array.isArray(x)&&x.length<=max&&x.every(valid);
const dictionary = (x:unknown,valid:(v:unknown)=>boolean):x is Record<string,unknown> => isRecord(x)&&Object.keys(x).length<=20000&&Object.entries(x).every(([k,v])=>!['__proto__','constructor','prototype'].includes(k)&&nonempty(k)&&valid(v));
const phases=['交班','查房','门诊','结算','夜班','日终'] as const;
const resumePhases=['play','feedback','roll','debuff','tribunal'] as const;
const operations=['history','observe','exam','full-exam','comfort','persuade','record','rescue-record','initial-record','progress-record','consent','refusal-signature','consult','consult-wait','endure','day-end','treatment','other'];
const actors=['patient','family','chief','nurse','peer','other'];
const talentActions=['chart-review','full-review','norm-quote','relative-loan','transfer','conceal','counselling','gastroscopy','family-clear','leave-group','day-off','late-record'];
const caseId = member([...CASES.map(c => c.id), ...CASE_PRESETS.map(c=>c.id)]);
const scope = (x: unknown) => isRecord(x) && member(["patient", "project", "personal"])(x.kind) && nonempty(x.id);
const partialNumbers = (x: unknown, keys: string[]) => isRecord(x) && Object.entries(x).every(([key, value]) => keys.includes(key) && finite(value));
const hazardInput = (x: unknown) => isRecord(x) && member(["R", "C", "D", "F"])(x.type) && finite(x.weight) &&
  textFields(x, ["reason", "norm"]) && typeof x.causal === "boolean";
function effects(x: unknown): boolean {
  if (!isRecord(x)) return false;
  const numbers = ["stamina", "san", "emotion", "reputation", "damage", "mitigate", "cash", "debt", "privateDebt", "receivable", "income", "depression", "ap", "apAllowance", "cashPressure", "stability", "patience", "bill"];
  return numbers.every(k => optional(x, k, finite)) && ["flags", "clear"].every(k => optional(x, k, strings)) &&
    ["discharge", "plannedDischarge", "care"].every(k => optional(x, k, isBool)) &&
    optional(x, "relations", value => partialNumbers(value, relations)) && optional(x, "caps", value => partialNumbers(value, vitals)) &&
    optional(x, "hazards", value => Array.isArray(value) && value.every(hazardInput))&&optional(x,'hazardRelief',value=>partialNumbers(value,['R','C','D','F'])&&Object.values(value as Record<string,number>).every(nonnegative));
}
function condition(x: unknown): boolean {
  return isRecord(x) && ["all", "any", "none"].every(k => optional(x, k, strings)) && optional(x, "cash", finite) &&
    optional(x, "relation", value => Array.isArray(value) && value.length === 2 && member(relations)(value[0]) && finite(value[1]));
}
function check(x: unknown): boolean {
  return isRecord(x) && member(skills)(x.skill) && finite(x.dc) && effects(x.failure) && typeof x.failureText === "string" &&
    ["purpose", "failureHint"].every(k => optional(x, k, isText));
}
function option(x: unknown): boolean {
  return isRecord(x) && textFields(x, ["id", "label", "result"]) && finiteRecord(x, ["ap", "cost", "minutes"]) && effects(x.effects) &&
    ["next", "hint", "clinicalChoice", "talentTarget"].every(k => optional(x, k, isText)) && optional(x, "interaction", member(['hallucination', 'recheck', 'transfer', 'graph-continue','ability','defer'])) && optional(x, "check", check) && optional(x, "when", condition) &&
    optional(x,'automatic',isBool)&&optional(x,'talentAction',member(talentActions))&&optional(x,'mechanics',v=>mechanics(v)&&(!isRecord(v)||v.consultWaitMinutes===undefined||Number(v.consultWaitMinutes)<=Number(x.minutes)))&&optional(x,'consequence',isText)&&
    ['deferred','failureDeferred'].every(k=>optional(x,k,v=>list(v,delayedEffect)))&&['modifiers','failureModifiers'].every(k=>optional(x,k,v=>list(v,eventModifier)))&&optional(x,'emittedFacts',strings)&&
    optional(x,'failureTotal',effects)&&optional(x,'chanceCheck',v=>isRecord(v)&&integer(v.successAtLeast)&&v.successAtLeast>=1&&v.successAtLeast<=20);
}
function mechanics(x:unknown):boolean {return isRecord(x)&&member(operations)(x.operation)&&optional(x,'checkOperation',member(operations))&&optional(x,'actor',member(actors))&&optional(x,'quality',member(['correct','neutral','incorrect']))&&optional(x,'unsignedConsent',isBool)&&optional(x,'consultWaitMinutes',nonnegative);}
function delayedEffect(x:unknown):boolean {
  return isRecord(x)&&textFields(x,['id','description'])&&nonnegative(x.delay)&&member(phases)(x.phase)&&effects(x.effects)&&
    optional(x,'day',count)&&optional(x,'repetitions',v=>count(v)&&v>0)&&optional(x,'until',strings)&&optional(x,'probability',v=>finite(v)&&v>=0&&v<=1)&&
    optional(x,'requires',strings)&&optional(x,'otherwiseEffects',effects)&&optional(x,'otherwiseDescription',isText);
}
function eventModifier(x:unknown):boolean {
  return isRecord(x)&&textFields(x,['id','description'])&&member(['sleep','skill','workload','cash-pressure','night-shift','leave','pending-asset','followup','formula','recover'])(x.kind)&&
    optional(x,'value',finite)&&['days','startsAfter','startsOn','factor'].every(k=>optional(x,k,nonnegative))&&optional(x,'target',nonempty)&&optional(x,'until',strings);
}
function eventBinding(x:unknown):boolean {
  return isRecord(x)&&scope(x.scope)&&nonempty(x.instanceId)&&count(x.day)&&member(phases)(x.phase)&&['patientId','patientName','actorId','projectId'].every(k=>optional(x,k,nonempty))&&optional(x,'bed',count)&&
    optional(x,'patients',v=>list(v,p=>isRecord(p)&&nonempty(p.id)&&count(p.bed)&&optional(p,'name',nonempty),100));
}
function card(x:unknown):boolean {
  if(!isRecord(x)||!textFields(x,['id','title','text'])||!scope(x.scope)||!member(['clinical','ward','story','quick','night','rest','audit'])(x.kind)||!['actor','patientId','chain','presetNode'].every(k=>optional(x,k,nonempty))||!optional(x,'caseId',caseId)||!optional(x,'last',isBool)||!optional(x,'shiftPhase',member(phases))||!list(x.options,option,100)||(x.options as unknown[]).length===0)return false;
  const ids=(x.options as Record<string,unknown>[]).map(o=>o.id);if(new Set(ids).size!==ids.length)return false;
  if(!optional(x,'billing',member(['spending']))||!optional(x,'patientGate',v=>isRecord(v)&&textFields(v,['patientId','optionId','consentFlag','refusedFlag'])&&member(['self-pay','arrears'])(v.reason)&&v.patientId===x.patientId))return false;
  if(!optional(x,'clinicalGraph',v=>isRecord(v)&&nonempty(v.caseId)&&nonempty(v.nodeId)&&!!getClinicalGraph(v.caseId)?.nodes.some(n=>n.id===v.nodeId)&&v.caseId===x.caseId))return false;
  if(!optional(x,'clinicalResume',v=>isRecord(v)&&textFields(v,['patientId','nodeId'])&&v.patientId===x.patientId&&typeof x.authoredEventId==='string'))return false;
  if(!optional(x,'peerExamObservation',v=>isRecord(v)&&member(['meeting','record'])(v.stage)&&integer(v.workDay)&&v.workDay>=RULES.butterfly.peerExamPreludeStart&&v.workDay<=RULES.butterfly.peerExamPreludeEnd&&x.chain==='PEER-EXAM'&&nonempty(x.patientId)&&sameScope(x.scope,{kind:'patient',id:x.patientId})))return false;
  if(!optional(x,'sourceFollowup',v=>isRecord(v)&&member(['dispute','denial-record','superior-evidence','settlement','forgiveness','nurse-report','police-report','police-receipt'])(v.kind)&&nonempty(v.patientId)&&v.patientId===x.patientId&&sameScope(x.scope,{kind:'patient',id:v.patientId})&&(v.kind==='dispute'?integer(v.stage)&&v.stage>=1&&v.stage<=3:v.stage===undefined)))return false;
  if(!optional(x,'authoredEventId',v=>typeof v==='string'&&!!EVENT_BY_ID[v])||!optional(x,'eventBinding',eventBinding)||!optional(x,'onEnter',effects))return false;
  if(x.authoredEventId!==undefined&&x.butterfly===undefined){
    if(!isRecord(x.eventBinding)||x.eventBinding.instanceId!==x.id||!sameScope(x.scope,x.eventBinding.scope)||x.patientId!==x.eventBinding.patientId)return false;
    if(!(x.options as Record<string,unknown>[]).every(o=>typeof o.consequence==='string'&&list(o.deferred,delayedEffect)&&list(o.modifiers,eventModifier)&&strings(o.emittedFacts)))return false;
  }
  if(!optional(x,'butterfly',v=>isRecord(v)&&nonempty(v.chainStateId)&&nonempty(v.nodeId)&&BUTTERFLY_NODES.some(n=>n.id===v.nodeId)&&count(v.day)&&member(phases)(v.phase)))return false;
  if(!optional(x,'butterflyMerge',v=>{
    if(!isRecord(v)||!nonempty(v.mergeId)||!distinctStrings(v.chainStateIds)||v.chainStateIds.length===0||!count(v.day)||!member(phases)(v.phase))return false;
    const spec=BUTTERFLY_MERGES.find(m=>m.id===v.mergeId);if(!spec)return false;
    if(!optional(v,'familyBillId',id=>nonempty(id)&&v.mergeId==='XJ-01'))return false;
    if(!optional(v,'claimedCommitmentIds',ids=>distinctStrings(ids)&&v.mergeId==='XJ-01'))return false;
    if(v.claimedSceneIds===undefined&&v.continuations===undefined)return v.claimedCommitmentIds===undefined;
    if(!distinctStrings(v.claimedSceneIds)||!list(v.continuations,c=>isRecord(c)&&textFields(c,['chainStateId','sourceNode','targetNode'])&&(v.chainStateIds as string[]).includes(c.chainStateId as string)&&spec.continuations[c.sourceNode as string]===c.targetNode))return false;
    return v.continuations.length===v.chainStateIds.length&&new Set(v.continuations.map(c=>(c as Record<string,unknown>).chainStateId)).size===v.chainStateIds.length;
  }))return false;
  if(!optional(x,'butterflyCommitment',v=>isRecord(v)&&textFields(v,['chainStateId','commitmentId'])&&member(phases)(v.phase)))return false;
  if(!optional(x,'butterflyFinance',v=>isRecord(v)&&nonempty(v.chainStateId)))return false;
  if(!optional(x,'familyFundingContact',v=>isRecord(v)&&nonempty(v.familyBillId)&&x.chain==='FAMILY-FUNDING-CONTACT'&&x.kind==='story'))return false;
  if(!optional(x,'butterflyRoleDuty',v=>isRecord(v)&&nonempty(v.chainStateId)&&count(v.day)))return false;
  if(!optional(x,'butterflyPermission',v=>isRecord(v)&&nonempty(v.chainStateId)&&member(['limited-costs','public-explanation','joint-meeting','loan-terms','record-materials','research-witness','family-delegation','deadline-change','project-split','joint-statement','funding-review','privacy-scope'])(v.kind)))return false;
  if(!optional(x,'representativeRecontact',v=>isRecord(v)&&integer(v.stage)&&v.stage>=0&&v.stage<=5&&nonempty(v.priorChoiceId)&&integer(v.due)&&v.due>=1&&v.due<=30&&x.chain==='REP-RECONTACT'&&x.actor==='rep'&&x.kind==='story'&&x.patientId===undefined&&x.authoredEventId===undefined))return false;
  if(!optional(x,'glucoseTranscription',v=>isRecord(v)&&member(['report','write'])(v.stage)&&integer(v.reportDay)&&v.reportDay>=RULES.handoverTranscription.start&&v.reportDay<=RULES.handoverTranscription.end&&x.chain==='GLUCOSE-HANDOVER'&&x.kind==='story'&&nonempty(x.patientId)&&sameScope(x.scope,{kind:'patient',id:x.patientId})))return false;
  return true;
}
function sameScope(a:unknown,b:unknown):boolean {return isRecord(a)&&isRecord(b)&&a.kind===b.kind&&a.id===b.id;}
function butterflySubjects(x:unknown):boolean {
  return isRecord(x)&&nonempty(x.actorId)&&['patientId','projectId','datasetId','paymentId','recordId','shiftId','sponsorId','familyActorId','familyBillId','offerAssetId'].every(k=>optional(x,k,nonempty))&&optional(x,'recipientIds',distinctStrings);
}
function butterflyFact(x:unknown):boolean {
  return isRecord(x)&&textFields(x,['id','type','sourceChoiceId'])&&count(x.day)&&scope(x.scope)&&butterflySubjects(x.subjects)&&distinctStrings(x.knownBy)&&optional(x,'amount',finite)&&
    optional(x,'reviewEvidence',v=>isRecord(v)&&v.kind==='peer-exam'&&textFields(v,['statementChainId','absenceEntryId','recordEntryId','signatureEntryId','reportEntryId'])&&count(v.workDay))&&
    optional(x,'deadlineChanges',v=>list(v,c=>isRecord(c)&&member(['commitment','paper','family-bill'])(c.kind)&&nonempty(c.id)&&count(c.from)&&count(c.to)&&c.to>c.from&&isBool(c.family)))&&
    optional(x,'observations',v=>list(v,o=>isRecord(o)&&textFields(o,['actorId','source'])&&count(o.day)&&member(['present','delivered-record','direct-message'])(o.channel)));
}
function butterflyChain(x:unknown):boolean {
  if(!isRecord(x)||!optional(x,'entrySource',v=>v==='department-teaching'||v==='existing-complaint'))return false;
  if(!isRecord(x)||!nonempty(x.id)||!member(['BTF-001','BTF-002','BTF-003','BTF-004'])(x.chain)||!butterflySubjects(x.subjects)||!scope(x.scope)||!nonempty(x.cursor)||!distinctStrings(x.consumed)||!distinctStrings(x.consumedResources)||!list(x.facts,butterflyFact)||!['receivable','privateDebt','paid'].every(k=>nonnegative(x[k]))||!member(['active','dormant','closed'])(x.status))return false;
  const ownNodes=new Set(BUTTERFLY_NODES.filter(n=>n.id.startsWith(`${x.chain}:`)).map(n=>n.id));
  if(!ownNodes.has(x.cursor)||!x.consumed.every(id=>ownNodes.has(id)||id===`${x.chain}:LABOR`))return false;
  if(!optional(x,'resolution',v=>typeof v==='string'&&v.startsWith(`${x.chain}:` )&&BUTTERFLY_RESOLUTIONS.some(r=>r.id===v)))return false;
  if(!list(x.commitments,c=>isRecord(c)&&textFields(c,['id','type','actorId','task','source'])&&member(['accepted','completed','cancelled'])(c.status)&&nonnegative(c.due)&&optional(c,'completedDay',d=>count(d)&&c.status==='completed')&&optional(c,'resumeDay',d=>count(d)&&d>=1&&d<=15)))return false;
  if(!['receivableDueDay','privateDebtDueDay'].every(k=>optional(x,k,v=>count(v)&&v>0))||!optional(x,'receivableAttempts',v=>list(v,a=>isRecord(a)&&count(a.due)&&count(a.day)&&a.day>=a.due&&integer(a.roll)&&a.roll>=1&&a.roll<=20&&nonnegative(a.received))&&new Set((v as Record<string,unknown>[]).map(a=>a.due)).size===(v as unknown[]).length))return false;
  const subjects=x.subjects as Record<string,unknown>,subjectScope=x.scope as Record<string,unknown>;
  if(subjects.patientId!==undefined&&subjectScope.kind==='patient'&&subjects.patientId!==subjectScope.id||subjects.projectId!==undefined&&subjectScope.kind==='project'&&subjects.projectId!==subjectScope.id)return false;
  if(x.chain==='BTF-003'&&!subjects.patientId||x.chain==='BTF-004'&&!subjects.projectId)return false;
  if(x.entrySource==='existing-complaint'&&x.chain!=='BTF-003')return false;
  return new Set((x.facts as Record<string,unknown>[]).map(f=>f.id)).size===x.facts.length&&new Set((x.commitments as Record<string,unknown>[]).map(c=>c.id)).size===x.commitments.length;
}
function eventLedger(x:unknown):boolean {
  return isRecord(x)&&distinctStrings(x.commits)&&distinctStrings(x.applied)&&
    optional(x,'outcomes',v=>list(v,o=>isRecord(o)&&typeof o.eventId==='string'&&!!EVENT_BY_ID[o.eventId]&&nonempty(o.choiceId)&&isBool(o.success)&&scope(o.scope)&&count(o.day)))&&
    list(x.pending,p=>delayedEffect(p)&&isRecord(p)&&scope(p.scope)&&nonnegative(p.due))&&
    list(x.modifiers,m=>eventModifier(m)&&isRecord(m)&&scope(m.scope)&&nonnegative(m.starts)&&finite(m.expires)&&m.expires>=m.starts)&&
    list(x.facts,f=>isRecord(f)&&textFields(f,['id','source'])&&scope(f.scope)&&count(f.day)&&distinctStrings(f.knownBy))&&
    new Set((x.pending as Record<string,unknown>[]).map(p=>p.id)).size===(x.pending as unknown[]).length&&
    !(x.pending as Record<string,unknown>[]).some(p=>(x.applied as string[]).includes(p.id as string));
}
function eventParticipant(x:unknown):boolean {
  return isRecord(x)&&textFields(x,['id','name','sex','history','sourceEvent'])&&typeof x.sourceEvent==='string'&&!!EVENT_BY_ID[x.sourceEvent]&&member(['孕产','认知障碍','恶性终末期','他组死亡','普通门诊'])(x.category)&&
    optional(x,'entityId',v=>typeof v==='string'&&ENTITY_BY_ID.has(v))&&optional(x,'presetId',v=>typeof v==='string'&&PRESET_BY_ID.has(v))&&
    finite(x.age)&&x.age>=0&&x.age<=130&&count(x.bed)&&count(x.admitted)&&isBool(x.active)&&['charges','budget','charged'].every(k=>nonnegative(x[k]));
}
function authoredState(x:unknown):boolean {
  if(!isRecord(x)||x.schema!==1||!dictionary(x.seen,count)||!dictionary(x.activeFacts,f=>isRecord(f)&&count(f.day)&&nonempty(f.source))||!distinctStrings(x.scheduled)||!eventLedger(x.ledger)||!list(x.chains,butterflyChain,100)||!list(x.participants,eventParticipant,1000)||!dictionary(x.published,card)||!finite(x.pressure)||x.pressure<0||x.pressure>100||!strings(x.endNotes))return false;
  if(!isRecord(x.actor)||!nonnegative(x.actor.liCash)||!list(x.actor.liAwayDays,count,100)||!list(x.actor.zhouAwayDays,count,100)||!boolFields(x.actor,['liFalseStatementWilling','datasetHasProblem','sharedResearch']))return false;
  if(!optional(x,'sceneAgenda',v=>list(v,a=>isRecord(a)&&nonempty(a.cardId)&&count(a.due)&&member(phases)(a.phase),1000)&&new Set(v.map(a=>(a as Record<string,unknown>).cardId)).size===v.length))return false;
  if(!optional(x,'echoDays',v=>list(v,a=>isRecord(a)&&count(a.day)&&distinctStrings(a.cardIds),100)&&new Set(v.map(a=>(a as Record<string,unknown>).day)).size===v.length))return false;
  const published=x.published as Record<string,unknown>;
  if(((x.sceneAgenda??[])as {cardId:string}[]).some(a=>!published[a.cardId])||((x.echoDays??[])as {cardIds:string[]}[]).some(a=>a.cardIds.some(id=>!published[id])))return false;
  if(!['benefitsReceived','benefitsReturned','leaveUntil','returnedFromLeave','paperDeadline'].every(k=>optional(x,k,nonnegative)))return false;
  if(!optional(x,'legacyBedNumbers',v=>list(v,b=>isRecord(b)&&nonempty(b.patientId)&&integer(b.bed)&&b.bed>16&&b.source==='schema-1-before-authored',1000)&&new Set((v as Record<string,unknown>[]).map(b=>b.patientId)).size===(v as unknown[]).length))return false;
  if(!optional(x,'appointments',v=>list(v,a=>isRecord(a)&&nonempty(a.id)&&member(['E-032','E-109'])(a.source)&&a.id.endsWith(`${a.source}-c`)&&integer(a.day)&&a.day>=1&&a.day<=15&&optional(a,'patientId',nonempty)&&(a.source!=='E-032'||nonempty(a.patientId))&&optional(a,'arrived',isBool),1000)&&new Set((v as Record<string,unknown>[]).map(a=>a.id)).size===(v as unknown[]).length))return false;
  if(!optional(x,'peerReferrals',v=>list(v,a=>isRecord(a)&&nonempty(a.id)&&/E-144-[ac]$/.test(a.id)&&integer(a.due)&&a.due>=2&&a.due<=RULES.days+1&&member(['full','brief'])(a.mode)&&a.mode===(a.id.endsWith('-a')?'full':'brief')&&distinctStrings(a.patientIds)&&a.patientIds.length<=RULES.peerReferrals.patients,1)))return false;
  if(!optional(x,'refusals',v=>dictionary(v,f=>isRecord(f)&&integer(f.day)&&f.day>=1&&f.day<=14&&nonempty(f.source)&&/E-013-[ab]$/.test(f.source)&&optional(f,'resolved',member(['assessment','known-damage','telephone','stable','deteriorated'])))))return false;
  if(!optional(x,'clinicalAssignments',v=>list(v,a=>isRecord(a)&&nonempty(a.patientId)&&member(['chief','peer'])(a.owner)&&member(['E-043','E-053'])(a.source)&&a.source===(a.owner==='peer'?'E-043':'E-053')&&integer(a.day)&&a.day>=1&&a.day<=14&&nonnegative(a.teamCharged)&&optional(a,'cover',c=>isRecord(c)&&integer(c.day)&&c.day>=1&&c.day<=14&&nonempty(c.source)&&/E-043-[ac]$/.test(c.source)),1000)&&new Set((v as Record<string,unknown>[]).map(a=>a.patientId)).size===(v as unknown[]).length))return false;
  if(!optional(x,'clinicalHandoffs',v=>list(v,h=>isRecord(h)&&textFields(h,['patientId','source','commitmentId'])&&count(h.day)&&h.day>=1&&h.day<=14&&member(['li','cover-doctor'])(h.recipient)&&member(['remaining-care','ward-review'])(h.scope),1000)&&new Set((v as Record<string,unknown>[]).map(h=>`${h.patientId}:${h.day}`)).size===(v as unknown[]).length))return false;
  if(!optional(x,'familyRegistrations',v=>list(v,a=>isRecord(a)&&nonempty(a.parentId)&&nonempty(a.patientId)&&a.relation==='son'&&integer(a.day)&&a.day>=3&&a.day<=14&&nonempty(a.source)&&a.source.endsWith('E-026-c'),1000)&&new Set((v as Record<string,unknown>[]).map(a=>a.patientId)).size===(v as unknown[]).length))return false;
  if(!optional(x,'familyInvoices',v=>list(v,i=>isRecord(i)&&textFields(i,['id','sourceEventId','title'])&&!!EVENT_BY_ID[String(i.sourceEventId)]&&count(i.day)&&optional(i,'dueDay',d=>count(d)&&d>=Number(i.day))&&positive(i.requested)&&member(['decision-pending','delegated','declined','payment-pending','paid'])(i.status)&&optional(i,'choiceId',nonempty)&&optional(i,'adjustment',a=>isRecord(a)&&nonempty(a.choiceId)&&positive(a.from)&&positive(a.to)&&a.from>a.to&&a.to===i.requested&&count(a.day)&&a.day>=Number(i.day))&&optional(i,'payment',p=>isRecord(p)&&p.choiceId===i.choiceId&&positive(p.amount)&&count(p.day)&&optional(p,'paidDay',d=>count(d)&&d>=Number(p.day)))&&((i.status==='payment-pending'||i.status==='paid')===isRecord(i.payment))&&(i.status!=='paid'||isRecord(i.payment)&&count(i.payment.paidDay)))&&new Set((v as Record<string,unknown>[]).map(i=>i.id)).size===(v as unknown[]).length))return false;
  if(!optional(x,'pressureCharges',v=>list(v,c=>isRecord(c)&&integer(c.day)&&c.day>=1&&c.day<=15&&finite(c.amount)&&c.amount>0&&nonempty(c.source))))return false;
  if(!optional(x,'pressureBackground',v=>isRecord(v)&&nonnegative(v.raw)&&nonnegative(v.value)&&v.value<=v.raw))return false;
  if(!optional(x,'billingEpisodes',v=>list(v,e=>isRecord(e)&&nonempty(e.source)&&e.source.endsWith(':E-171-c')&&e.id===`${e.source}:billing-episode`&&e.sourceEvent==='E-171'&&nonempty(e.patientId)&&integer(e.day)&&e.day>=1&&e.day<=15&&e.kind==='claimed-readmission'&&e.continuousStay===true&&['spendingAtSplit','chargedAtSplit','budgetAtSplit','additionalBudget'].every(k=>nonnegative(e[k])),1000)&&new Set((v as Record<string,unknown>[]).map(e=>e.patientId)).size===(v as unknown[]).length))return false;
  const chains=x.chains as Record<string,unknown>[],participants=x.participants as Record<string,unknown>[];
  return new Set(chains.map(c=>c.id)).size===chains.length&&new Set(participants.map(p=>p.id)).size===participants.length&&Object.entries(x.published).every(([id,c])=>isRecord(c)&&id===c.id);
}
function talentState(x:unknown):boolean {
  if(!isRecord(x)||!['day','rerollsUsed','fullReviewsUsed','emotionalNights','saneNights','fullSleepNights','coffeeFreeDays','proactiveConsults','correctCare'].every(k=>count(x[k]))||!['firstContacts','intuitionReady','reviewedPatients','smelledPatients','quotedPatients','transferredPatients','beautifiedProjects','chiefKnowsProjects','processed'].every(k=>distinctStrings(x[k]))||!boolFields(x,['survivalUsed','permanentStomach']))return false;
  if(!dictionary(x.chartClues,distinctStrings)||!dictionary(x.gainedDay,count)||!dictionary(x.concealedPatients,v=>count(v)&&v>0)||!list(x.delayedRecords,d=>isRecord(d)&&textFields(d,['patientId','recordId'])&&count(d.dueDay)))return false;
  if((x.rerollsUsed as number)>1||(x.fullReviewsUsed as number)>5||x.fullReviewsUsed!==(x.reviewedPatients as string[]).length)return false;
  if(!(x.intuitionReady as string[]).every(id=>(x.firstContacts as string[]).includes(id)))return false;
  return Object.keys(x.gainedDay).every(member(DEBUFFS.map(d=>d.id)));
}
function pendingContext(x:unknown):boolean {return isRecord(x)&&member(operations)(x.operation)&&member(actors)(x.actor)&&optional(x,'patientId',nonempty)&&['advantage','disadvantage','archiveMatched'].every(k=>optional(x,k,isBool));}
function pendingCheck(x:unknown):boolean {return isRecord(x)&&member(['choice','day'])(x.kind)&&count(x.day)&&count(x.rerolls)&&pendingContext(x.context)&&['cardId','optionId'].every(k=>optional(x,k,nonempty))&&(x.kind!=='choice'||textFields(x,['cardId','optionId']));}
function feedback(x:unknown):boolean {return isRecord(x)&&textFields(x,['title','text'])&&member(['play','check','day','ending'])(x.next)&&strings(x.changes)&&optional(x,'sourceCardId',nonempty);}
function emergency(x:unknown):boolean {
  return isRecord(x)&&nonempty(x.cardId)&&member(vitals)(x.vital)&&isBool(x.resolved)&&isRecord(x.resume)&&member(resumePhases)(x.resume.phase)&&
    optional(x,'occurred',v=>isRecord(v)&&integer(v.day)&&v.day>=1&&v.day<=15&&member(phases)(v.phase))&&
    optional(x.resume,'roll',roll)&&optional(x.resume,'feedback',feedback)&&optional(x.resume,'pendingCheck',pendingCheck)&&
    (x.resume.phase!=='roll'||roll(x.resume.roll))&&(x.resume.phase==='roll'||x.resume.pendingCheck===undefined);
}
function seedHistory(x:unknown):boolean {return list(x,v=>isRecord(v)&&nonempty(v.runId)&&caseId(v.caseId)&&nonempty(v.trapId));}
function clinicalState(x:unknown):boolean {
  if(!isRecord(x)||!nonempty(x.caseId))return false;const g=getClinicalGraph(x.caseId);if(!g)return false;
  const nodes=new Set(g.nodes.map(n=>n.id)),options=new Set(g.nodes.flatMap(n=>n.options.map(o=>o.id))),variants=new Set(g.variants.map(v=>v.id)),ends=new Set(g.outcomes.map(o=>o.id));
  if(!nonempty(x.nodeId)||!nodes.has(x.nodeId)&&!ends.has(x.nodeId)||!['flags','variants','causalChoices'].every(k=>distinctStrings(x[k]))||!['choices','entered'].every(k=>strings(x[k]))||!['minutes','ap','cost'].every(k=>nonnegative(x[k])))return false;
  if(!(x.variants as string[]).every(id=>variants.has(id))||!(x.choices as string[]).every(id=>options.has(id))||!(x.entered as string[]).every(id=>nodes.has(id)))return false;
  // Historical original-source omissions can be repaired by scoped source flags;
  // option histories, selected choices and counters must still refer to real IDs.
  if(!dictionary(x.selected,v=>distinctStrings(v))||!Object.entries(x.selected).every(([node,ids])=>nodes.has(node)&&(ids as string[]).every(id=>g.nodes.find(n=>n.id===node)!.options.some(o=>o.id===id))))return false;
  if(!dictionary(x.attempts,count)||!Object.entries(x.attempts).every(([id,n])=>options.has(id)&&(n as number)>0))return false;
  const choices=x.choices as string[];if(!Object.entries(x.attempts).every(([id,n])=>choices.filter(c=>c===id).length===n))return false;
  if(!choices.every(id=>Object.hasOwn(x.attempts as object,id)))return false;
  if(!optional(x,'outcomeId',v=>typeof v==='string'&&ends.has(v)&&v===x.nodeId)||x.outcomeId===undefined&&ends.has(x.nodeId))return false;
  if(!optional(x,'resumeNodes',v=>list(v,item=>isRecord(item)&&typeof item.nodeId==='string'&&(nodes.has(item.nodeId)||ends.has(item.nodeId)||item.nodeId==='outcomes')&&isBool(item.preserveSelected)&&(!item.preserveSelected||nodes.has(item.nodeId)),10)))return false;
  return true;
}
function patient(x: unknown): boolean {
  return isRecord(x) && textFields(x, ["uid", "name"]) && caseId(x.caseId) &&
    finiteRecord(x, ["admitted", "expectedDays", "budget", "initialBudget", "spent", "charged", "stability", "patience", "damage", "mitigated", "caredDay", "explainedDay"]) &&
    integer(x.bed) && x.bed >= 0 && boolFields(x, ["active", "inpatient", "planned", "settled"]) &&
    optional(x, "dischargedDay", finite) && optional(x,'dailyBaseCost',nonnegative)&&optional(x,'budgetSurchargeExempt',nonnegative)&&optional(x, "readmitted", isBool) && optional(x, "clinical", clinicalState) &&
    optional(x, 'entityId', v => typeof v === 'string' && ENTITY_BY_ID.has(v)) && optional(x, 'presetNode', isText) && optional(x, 'presetResolved', isBool) &&
    optional(x, 'preset', v => instantiatedPreset(v,x));
}
function instantiatedPreset(v:unknown,p:Record<string,unknown>):boolean {
  if(!isRecord(v)||!nonempty(v.presetId)||!nonempty(v.entityId))return false;
  const preset=PRESET_BY_ID.get(v.presetId),entity=ENTITY_BY_ID.get(v.entityId);
  if(!preset||!entity||v.id!==v.presetId||p.caseId!==v.id||p.entityId!==v.entityId||!member(['门诊','病区','夜班'])(v.period)||!isCompatible(entity,preset,v.period as '门诊'|'病区'|'夜班'))return false;
  if(!textFields(v,['title','department','complaint','sex','dipGroup','companion','payment','portraitArchetype'])||!finiteRecord(v,['age','budget','baseCost','expectedDays'])||v.age!==entity.ageYears||v.sex!==entity.sex||v.portraitArchetype!==entity.portraitArchetype||!strings(v.history)||!strings(v.findings)||!isBool(v.critical))return false;
  if(!optional(v,'entityProfile',profile=>isRecord(profile)&&profile.id===entity.id&&profile.ageYears===entity.ageYears&&profile.sex===entity.sex&&profile.portraitArchetype===entity.portraitArchetype&&
    textFields(profile,['name','age','occupation','companion','payment','personality','concealedFact','dialogue','flagDescription','source'])&&
    nonnegative(profile.concealment)&&nonnegative(profile.complaintTendency)&&member(['低','中','高'])(profile.adherence)&&isBool(profile.transferred)&&isBool(profile.original)&&strings(profile.flags)&&
    list(profile.categories,member(['呼吸','心血管','消化','内分泌','肾','神经','外科','儿科','妇产','中毒','创伤','精神','感染','血液']))&&list(profile.periods,member(['门诊','病区','夜班']))))return false;
  if(!optional(v,'revisit',rv=>isRecord(rv)&&nonempty(rv.previousPatientId)&&isBool(rv.priorGood)&&isBool(rv.nonAdherent)))return false;
  if(!list(v.steps,s=>isRecord(s)&&textFields(s,['id','title','text'])&&list(s.options,option,100)&&(s.options as unknown[]).length>0,30)||v.steps.length===0)return false;
  const steps=v.steps as Record<string,unknown>[],ids=new Set(steps.map(s=>s.id)),prefix=`preset:${v.id}:${p.uid}:`,optionIds=new Set<string>();
  if(ids.size!==steps.length||!steps.every(s=>typeof s.id==='string'&&s.id.startsWith(prefix)))return false;
  if(!steps.every(s=>(s.options as Record<string,unknown>[]).every(o=>{if(typeof o.id!=='string'||!o.id.startsWith(prefix)||optionIds.has(o.id))return false;optionIds.add(o.id);return typeof o.next==='string'&&(ids.has(o.next)||o.next==='END');})))return false;
  return (p.presetNode===undefined||ids.has(p.presetNode)||p.presetNode==='END')&&(p.presetResolved!==true||p.presetNode==='END'||steps.some(s=>s.id===p.presetNode&&(s.options as Record<string,unknown>[]).some(o=>o.next==='END')));
}
function patientCheckGroup(x:unknown):boolean {
 if(!isRecord(x)||x.rule!=='all'||!list(x.members,m=>{
  if(!isRecord(m)||!nonempty(m.party)||!member(['normal','advantage','disadvantage'])(m.mode)||!list(m.dice,v=>integer(v)&&v>=1&&v<=20,2)||m.dice.length!==(m.mode==='normal'?1:2)||!finiteRecord(m,['face','modifier','dc'])||!isBool(m.success)||!(m.critical===null||member(['success','failure'])(m.critical)))return false;
  return m.face===(m.mode==='advantage'?Math.max(...m.dice as number[]):Math.min(...m.dice as number[]));
 },2)||x.members.length!==2)return false;
 const members=x.members as PatientCheckMember[];
 return members[0].party!==members[1].party&&members[0].modifier===members[1].modifier&&members[0].dc===members[1].dc&&members[0].mode===members[1].mode;
}
function roll(x: unknown): boolean {
  const face = (n: unknown) => integer(n) && n >= 1 && n <= 20;
  const terms=(v:unknown)=>list(v,t=>isRecord(t)&&textFields(t,['id','label'])&&finite(t.value),40);
  return isRecord(x) && textFields(x, ["id", "label"]) && member(["day", "choice", "tribunal"])(x.kind) &&
    face(x.face) && finiteRecord(x, ["modifier", "dc"]) && isBool(x.success) && optional(x, "second", face) &&
    optional(x,'modifierSources',v=>terms(v)&&(v as {value:number}[]).reduce((sum,t)=>sum+t.value,0)===x.modifier)&&
    optional(x,'difficultySources',v=>terms(v)&&(v as {value:number}[]).reduce((sum,t)=>sum+t.value,0)===x.dc)&&
    optional(x,'advantage',isBool)&&optional(x,'critical',v=>v===null||member(['success','failure'])(v))&&optional(x,'revision',count)&&optional(x,'blockedReason',nonempty)&&optional(x,'chance',isBool)&&
    (x.chance!==true||x.kind==='choice'&&x.modifier===0&&x.second===undefined&&x.advantage!==true&&x.critical===null&&(x.revision??0)===0&&x.blockedReason===undefined&&face(x.dc)&&x.success===((x.face as number)>=(x.dc as number)))&&
    optional(x,'group',patientCheckGroup)&&
    (x.group===undefined||x.kind==='choice'&&x.chance!==true&&x.blockedReason===undefined&&x.second===undefined&&x.advantage!==true&&(()=>{
      const members=(x.group as {members:PatientCheckMember[]}).members,aggregate=aggregatePatientCheckMembers(members);
      return x.modifier===members[0].modifier&&x.dc===members[0].dc&&x.face===aggregate.face&&x.success===aggregate.success&&x.critical===aggregate.critical;
    })())&&
    (x.blockedReason===undefined||x.kind==='choice'&&x.success===false&&x.critical===null)&&
    (x.advantage!==true||x.second!==undefined)&&(!(integer(x.second)&&integer(x.face))||(x.advantage===true?x.face>=x.second:x.face<=x.second));
}
function guide(x: unknown): boolean {
  return isRecord(x) && x.version === 1 && isBool(x.enabled) && strings(x.seen) && x.seen.length <= 7 &&
    x.seen.every(member(["welcome-seen", "bed-near", "chart-open", "choice-committed", "choice-roll-seen", "choice-without-check", "handoff-completed"]));
}
/** Membership checks are separate from shape checks: additional documented event
 * patients are registered actors even though they do not occupy Run.patients. */
function runReferences(r:Record<string,unknown>):boolean {
  const patients=r.patients as Record<string,unknown>[];
  const waiting=(r.deferredWork??[])as {patientId:string;source:string;created:number;due:number;cards:{id:string;patientId:string}[]}[];
  if(new Set(waiting.map(w=>w.patientId)).size!==waiting.length)return false;
  for(const w of waiting) {
    if(!patients.some(p=>p.uid===w.patientId)||w.created!==r.day||w.due!==w.created+1||!(r.committed as string[]).includes(w.source))return false;
    if(!w.cards.length||!w.cards.every(c=>c.patientId===w.patientId)||new Set(w.cards.map(c=>c.id)).size!==w.cards.length)return false;
    if((r.queue as {id:string}[]).some(c=>w.cards.some(d=>d.id===c.id)))return false;
  }
  if(isRecord(r.roll)&&isRecord(r.roll.group))for(const m of r.roll.group.members as PatientCheckMember[]){
    const outcome=talentRollOutcome({talents:r.talents as string[],debuffs:r.debuffs as string[],day:r.day as number},m.face,m.modifier,m.dc);
    if(m.success!==outcome.success||m.critical!==outcome.critical)return false;
  }
  for(const entry of r.journal as Record<string,unknown>[])if(entry.clinicalChoice!==undefined){
    if(!isRecord(entry.scope)||entry.scope.kind!=='patient')return false;
    const owner=patients.find(p=>p.uid===(entry.scope as Record<string,unknown>).id),graph=owner&&getClinicalGraph(owner.caseId as string);
    if(!graph||entry.clinicalChoice!=='continue'&&!graph.nodes.some(n=>n.options.some(o=>o.id===entry.clinicalChoice)))return false;
  }
  const authored=isRecord(r.authored)?r.authored:undefined;
  for(const p of patients)if(p.budgetSurchargeExempt!==undefined){
    const assignment=((authored?.clinicalAssignments??[])as Record<string,unknown>[]).find(a=>a.patientId===p.uid);
    if((p.budgetSurchargeExempt as number)>(p.charged as number)+Number(assignment?.teamCharged??0))return false;
  }
  const legacyBeds=(authored?.legacyBedNumbers??[])as Record<string,unknown>[];
  if(legacyBeds.some(b=>!patients.some(p=>p.uid===b.patientId)))return false;
  const legacyBed=(p:Record<string,unknown>)=>legacyBeds.some(b=>b.patientId===p.uid&&b.bed===p.bed&&b.source==='schema-1-before-authored');
  const corridor=patients.filter(p=>p.bed===17&&!legacyBed(p));
  // The published pre-director schema had unrestricted historical bed numbers.
  // Only absence of authored state qualifies; deleting world/guide is not a migration.
  if(authored&&(corridor.length>1||patients.some(p=>(p.bed as number)>17&&!legacyBed(p))))return false;
  for(const p of authored?corridor:[]){
    if(!p.active||!p.inpatient||!authored||!isRecord(authored.ledger))return false;
    const proof=(authored.ledger.outcomes as Record<string,unknown>[]|undefined)?.find(o=>o.eventId==='E-048'&&o.success===true&&String(o.choiceId).endsWith('E-048-a')&&isRecord(o.scope)&&o.scope.kind==='patient'&&o.scope.id===p.uid);
    if(!proof)return false;
    const entry=(r.journal as Record<string,unknown>[]).find(e=>e.id===`${proof.choiceId}:admission`&&e.day===proof.day&&isRecord(e.scope)&&e.scope.id===p.uid);
    const flag=(r.facts as Record<string,unknown>)[`corridor-bed:${p.uid}`];
    if(!entry||!isRecord(flag)||flag.source!==entry.id||flag.day!==entry.day)return false;
  }
  for(const charge of (r.budgetCharges??[]) as Record<string,unknown>[]) {
    const owner=patients.find(p=>p.uid===charge.patientId),source=charge.source as string,day=charge.day as number;
    if(!owner||day>(r.day as number)||day<(owner.admitted as number))return false;
    if(source===`ward-billing:${day}:${owner.uid}`)continue;
    const entries=(r.journal as Record<string,unknown>[]).filter(j=>j.id===source&&j.day===day);
    if(entries.length){if(!entries.some(j=>isRecord(j.scope)&&j.scope.kind==='patient'&&j.scope.id===owner.uid))return false;continue;}
    const applied=(r.facts as Record<string,Record<string,unknown>>)[`director-applied:${source}`];
    if(applied?.source===source&&applied.day===day)continue;
    // A committed option can occur more than once in this monetary ledger:
    // treatment and a later effect may each add a genuinely new budget gap.
    const card=(r.queue as Record<string,unknown>[]).find(c=>Array.isArray(c.options)&&c.options.some(o=>isRecord(o)&&o.id===source));
    if(card&&card.patientId===owner.uid&&(r.committed as string[]).some(id=>id===source||id===`${card.id}:${source}`))continue;
    return false;
  }
  if(authored) {
    const ledger=authored.ledger as Record<string,unknown>,commits=ledger.commits as string[],outcomes=(ledger.outcomes??[]) as Record<string,unknown>[];
    // Current ledgers namespace each choice by its actual card instance. Earlier
    // direct-choice ledgers are retained; suffix-only matching is not sufficient.
    const committedChoice=(id:string)=>commits.includes(id)||commits.includes(`${id.slice(0,id.lastIndexOf(':'))}:${id}`);
    for(const charge of (authored.pressureCharges??[]) as Record<string,unknown>[]) {
      const source=charge.source as string,day=charge.day as number;
      if(day>(r.day as number))return false;
      const direct=outcomes.find(o=>o.choiceId===source&&o.day===day);
      if(direct&&PRESSURE_CHARGE_EVENTS.includes(direct.eventId as typeof PRESSURE_CHARGE_EVENTS[number])&&committedChoice(source))continue;
      const applied=(r.facts as Record<string,Record<string,unknown>>)[`director-applied:${source}`];
      if(applied?.source!==source||applied.day!==day)return false;
      if(source.endsWith(':event-patient-bill')) {
        const choice=source.slice(0,-':event-patient-bill'.length);
        if(!committedChoice(choice)||!outcomes.some(o=>o.choiceId===choice&&o.day===day))return false;
      }else if(!(ledger.applied as string[]).includes(source)||!PRESSURE_CHARGE_EVENTS.some(id=>source.includes(`${id}:`)||source.includes(`${id}-`)))return false;
    }
    const actualPatients=new Set(patients.map(p=>p.uid));
    const published=authored.published as Record<string,Record<string,unknown>>;
    const chains=authored.chains as Record<string,unknown>[];
    const invoices=(authored.familyInvoices??[])as Record<string,unknown>[];
    for(const invoice of invoices){
      const card=published[invoice.id as string];
      if(!card||card.authoredEventId!==invoice.sourceEventId||!isRecord(card.eventBinding)||card.eventBinding.day!==invoice.day||(invoice.day as number)>(r.day as number))return false;
      const options=card.options as Record<string,unknown>[];
      if(invoice.choiceId!==undefined){
        const outcome=outcomes.find(o=>o.choiceId===invoice.choiceId),option=options.find(o=>o.id===invoice.choiceId);
        if(!outcome||!option||outcome.eventId!==invoice.sourceEventId||!committedChoice(invoice.choiceId as string)||(outcome.day as number)<(invoice.day as number)||(outcome.day as number)>(r.day as number))return false;
        if(invoice.payment){
          const p=invoice.payment as Record<string,unknown>;
          const effect=authoredChoiceEffects(option as unknown as EventOption,outcome.success as boolean);
          const expected=String(invoice.choiceId).endsWith('E-112-c')?Math.max(0,-(EVENT_BY_ID['E-111'].options[0].effects.cash??0)):Math.max(0,-(effect.cash??0));
          if(p.amount!==expected||p.day!==outcome.day||p.paidDay!==undefined&&(p.paidDay as number)>(r.day as number))return false;
        }
      }else if(invoice.status!=='decision-pending')return false;
      if(invoice.adjustment){
        const adjustment=invoice.adjustment as Record<string,unknown>;
        if(invoice.sourceEventId!=='E-105'||!(r.committed as string[]).includes(adjustment.choiceId as string)||(adjustment.day as number)>(r.day as number)||!chains.some(c=>isRecord(c.subjects)&&c.subjects.familyBillId===invoice.id&&(c.facts as Record<string,unknown>[]).some(f=>f.type==='optional_expense_reduced'&&f.day===adjustment.day)))return false;
      }
    }
    for(const chain of chains){
      const subjects=chain.subjects as Record<string,unknown>;
      if(subjects.familyBillId!==undefined&&!invoices.some(i=>i.id===subjects.familyBillId))return false;
      for(const fact of (chain.facts as Record<string,unknown>[]).filter(f=>f.deadlineChanges!==undefined)){
        if(fact.type!=='deadlines_may_extend'||(fact.day as number)>(r.day as number)||!(r.committed as string[]).includes(fact.sourceChoiceId as string))return false;
        const receipt=Object.values(published).find(c=>isRecord(c.butterflyPermission)&&c.butterflyPermission.kind==='deadline-change'&&c.butterflyPermission.chainStateId===chain.id&&(c.options as Record<string,unknown>[]).some(o=>o.id===fact.sourceChoiceId));
        if(!receipt||!String(fact.sourceChoiceId).endsWith(':ask'))return false;
        for(const change of fact.deadlineChanges as Record<string,unknown>[]){
          if((change.from as number)<(fact.day as number)||change.to!==(change.from as number)+RULES.butterfly.deadlineExtensionDays||change.family!==(change.kind==='family-bill'))return false;
          if(change.kind==='family-bill'&&!invoices.some(i=>i.id===change.id&&i.sourceEventId==='E-105'))return false;
          if(change.kind==='paper'&&!chains.some(c=>c.chain==='BTF-004'&&isRecord(c.subjects)&&c.subjects.projectId===change.id))return false;
          if(change.kind==='commitment'&&!chains.some(c=>(c.commitments as Record<string,unknown>[]).some(k=>k.id===change.id&&/verification|labor_exchange|clinical_explanation|contribution_division|source_delivery|source_preservation/.test(String(k.type)))))return false;
        }
      }
    }
    for(const handoff of (authored.clinicalHandoffs??[])as Record<string,unknown>[]){
      const chain=(authored.chains as Record<string,unknown>[]).find(c=>(c.commitments as Record<string,unknown>[]).some(k=>k.id===handoff.commitmentId));
      const commitment=chain&&(chain.commitments as Record<string,unknown>[]).find(c=>c.id===handoff.commitmentId);
      if(!actualPatients.has(handoff.patientId)||!chain||!commitment||!isRecord(chain.subjects)||chain.subjects.patientId!==handoff.patientId||commitment.status!=='completed'||commitment.completedDay!==handoff.day||!String(commitment.type).includes('handoff')||(handoff.day as number)>(r.day as number))return false;
      if(handoff.recipient!==(String(commitment.type).match(/alternative|successor/)?'cover-doctor':'li'))return false;
      const card=Object.values(authored.published as Record<string,Record<string,unknown>>).find(c=>isRecord(c.butterflyCommitment)&&c.butterflyCommitment.commitmentId===handoff.commitmentId&&(c.options as Record<string,unknown>[]).some(o=>o.id===handoff.source));
      if(!card||!(r.committed as string[]).includes(handoff.source as string)||!String(handoff.source).endsWith(':complete'))return false;
    }
    for(const a of (authored.clinicalAssignments??[])as Record<string,unknown>[]){
      const p=patients.find(p=>p.uid===a.patientId);
      if(!p||a.day!==p.admitted||(a.day as number)>(r.day as number)||!String(p.uid).startsWith(`${r.id}:team:${a.source}:${a.day}:`))return false;
      if(a.cover){const cover=a.cover as Record<string,unknown>,entry=outcomes.find(o=>o.choiceId===cover.source);
        if(a.owner!=='peer'||!committedChoice(cover.source as string)||!entry||entry.eventId!=='E-043'||entry.success!==true||entry.day!==cover.day||(cover.day as number)>(r.day as number))return false;
        const offered=Object.values(authored.published as Record<string,Record<string,unknown>>).find(c=>(c.options as Record<string,unknown>[]).some(o=>o.id===cover.source));
        if(!offered||!isRecord(offered.eventBinding)||!Array.isArray(offered.eventBinding.patients)||!(offered.eventBinding.patients as Record<string,unknown>[]).some(x=>x.id===p.uid))return false;
      }
    }
    for(const a of (authored.familyRegistrations??[])as Record<string,unknown>[]){
      const parent=patients.find(p=>p.uid===a.parentId),son=patients.find(p=>p.uid===a.patientId),entry=outcomes.find(o=>o.choiceId===a.source);
      if(!parent||!son||a.day!==son.admitted||!committedChoice(a.source as string)||!entry||entry.eventId!=='E-026'||entry.success!==true||entry.day!==a.day||!sameScope(entry.scope,{kind:'patient',id:parent.uid}))return false;
      const parentCase=parent.preset??CASES.find(c=>c.id===parent.caseId),sonCase=son.preset??CASES.find(c=>c.id===son.caseId);
      if(!isRecord(parentCase)||!isRecord(sonCase)||sonCase.sex!=='男'||!finite(parentCase.age)||!finite(sonCase.age)||sonCase.age>parentCase.age-18||son.uid!==`${parent.uid}:E-026-son`)return false;
    }
    for(const episode of (authored.billingEpisodes??[]) as Record<string,unknown>[]) {
      const owner=patients.find(p=>p.uid===episode.patientId),source=episode.source as string;
      if(!owner||(episode.day as number)>(r.day as number)||(episode.day as number)<(owner.admitted as number)||episode.additionalBudget!==(owner.initialBudget??episode.budgetAtSplit)||!committedChoice(source))return false;
      const outcome=outcomes.find(o=>o.choiceId===source);
      if(!outcome||outcome.eventId!=='E-171'||outcome.success!==true||outcome.day!==episode.day||!sameScope(outcome.scope,{kind:'patient',id:owner.uid}))return false;
      const applied=(r.facts as Record<string,Record<string,unknown>>)[`director-applied:${episode.id}`];
      if(applied?.source!==episode.id||applied.day!==episode.day)return false;
      if(!(r.journal as Record<string,unknown>[]).some(j=>j.id===episode.id&&j.day===episode.day&&sameScope(j.scope,{kind:'patient',id:owner.uid})))return false;
    }
    for(const appointment of (authored.appointments??[]) as Record<string,unknown>[]) {
      if(!committedChoice(appointment.id as string)||appointment.patientId!==undefined&&!actualPatients.has(appointment.patientId))return false;
      const entry=outcomes.find(o=>o.choiceId===appointment.id);
      if(entry&&(entry.eventId!==appointment.source||appointment.day!==(entry.day as number)+1||appointment.patientId!==undefined&&(entry.scope as Record<string,unknown>).id!==appointment.patientId))return false;
    }
    for(const referral of (authored.peerReferrals??[]) as Record<string,unknown>[]) {
      const entry=outcomes.find(o=>o.choiceId===referral.id);
      if(!committedChoice(referral.id as string)||!entry||entry.eventId!=='E-144'||entry.success!==true||referral.due!==(entry.day as number)+1||(entry.day as number)>(r.day as number))return false;
      for(const [index,uid]of (referral.patientIds as string[]).entries()) {
        const p=patients.find(p=>p.uid===uid);
        if(!p||!isRecord(p.preset)||p.preset.period!=='门诊'||(p.admitted as number)<(referral.due as number)||(p.admitted as number)>(r.day as number)||uid!==`D${p.admitted}-${p.caseId}-quick-peer-referral-${referral.due}-${index}`)return false;
        if(!(p.preset.steps as Record<string,unknown>[]).some(step=>step.id===`preset:${p.caseId}:${uid}:peer-referral`))return false;
      }
    }
    for(const [uid,refusal]of Object.entries((authored.refusals??{}) as Record<string,Record<string,unknown>>)) {
      if(!actualPatients.has(uid)||!committedChoice(refusal.source as string)||(refusal.day as number)>(r.day as number))return false;
      const entry=outcomes.find(o=>o.choiceId===refusal.source);
      if(entry&&(entry.eventId!=='E-013'||entry.day!==refusal.day||(entry.scope as Record<string,unknown>).kind!=='patient'||(entry.scope as Record<string,unknown>).id!==uid||String(refusal.source).endsWith('E-013-b')&&entry.success!==false))return false;
    }
  }
  const participants=(authored?.participants??[]) as Record<string,unknown>[];
  const patientIds=new Set([...patients.map(p=>p.uid),...participants.map(p=>p.id)]);
  if(patientIds.size!==patients.length+participants.length)return false;
  const chains=(authored?.chains??[]) as Record<string,unknown>[],chainIds=new Set(chains.map(c=>c.id));
  if(authored)for(const chain of chains)for(const fact of chain.facts as Record<string,unknown>[]){
    if(fact.reviewEvidence!==undefined||fact.type==='patient_review_received'){
      const run=r as unknown as Run;
      if(!patientReviewReceiptValid(run,run.authored!,chain as unknown as NonNullable<Run['authored']>['chains'][number],fact as unknown as NonNullable<Run['authored']>['chains'][number]['facts'][number]))return false;
    }
  }
  // Exact current-run project instances emitted by director.bindEvent / audit
  // followups and makeTrolleyCard. These are distinct responsibility scopes:
  // an audit or prescription review must not be rewritten as research merely
  // to satisfy persistence. Arbitrary suffixes and other runs remain invalid.
  const projects=new Set<unknown>(['research-project','representative-account','audit-project','audit','prescription-review'].map(suffix=>`${r.id}:${suffix}`));
  for(const chain of chains)if(isRecord(chain.subjects)&&chain.subjects.projectId)projects.add(chain.subjects.projectId);
  // Handoff scope describes the work transferred, not an evidence owner. These
  // exact records already have shape, patient and signed-receipt checks above.
  const handoffs=new Set((authored?.clinicalHandoffs??[])as unknown[]);
  const walk=(value:unknown,depth=0):boolean=>{
    if(depth>60)return false;
    if(Array.isArray(value))return value.every(v=>walk(v,depth+1));
    if(!isRecord(value))return true;
    if(value.scope!==undefined&&!handoffs.has(value)){if(!scope(value.scope))return false;const s=value.scope as Record<string,unknown>;if(s.kind==='patient'&&!patientIds.has(s.id)||s.kind==='project'&&!projects.has(s.id))return false;}
    if(value.patientId!==undefined&&!patientIds.has(value.patientId))return false;
    if(value.projectId!==undefined&&!projects.has(value.projectId))return false;
    return Object.values(value).every(v=>walk(v,depth+1));
  };
  if(!walk(r))return false;
  const cards:Record<string,unknown>[]=[...(r.queue as Record<string,unknown>[]),...Object.values(authored?.published??{}) as Record<string,unknown>[],...waiting.flatMap(w=>w.cards)];
  for(const c of cards){
    if(isRecord(c.representativeRecontact)){
      const contact=c.representativeRecontact,prior=contact.priorChoiceId as string;
      if(c.id!==`${r.id}:REP-RECONTACT:${contact.stage}:${contact.due}:${prior}`||!sameScope(c.scope,{kind:'project',id:`${r.id}:representative-account`})||!(r.committed as string[]).includes(prior))return false;
      const priorEntry=(r.journal as Record<string,unknown>[]).find(e=>e.id===prior);if(!priorEntry||Number(priorEntry.day)>=Number(contact.due))return false;
    }
    if(c.clinicalResume!==undefined){
      if(!isRecord(c.clinicalResume))return false;
      const resume=c.clinicalResume,p=patients.find(p=>p.uid===resume.patientId);
      if(!p||!sameScope(c.scope,{kind:'patient',id:p.uid})||c.patientId!==p.uid)return false;
      // Published event cards retain their original resume point after the
      // patient advances. Validate ownership and the authored node, not equality
      // with today's cursor; event-only participants cannot own a care graph.
      const validNode=isRecord(p.clinical)?getClinicalGraph(p.caseId as string)?.nodes.some(n=>n.id===resume.nodeId):
        isRecord(p.preset)&&(p.preset.steps as Record<string,unknown>[]).some(n=>n.id===resume.nodeId);
      if(!validNode)return false;
    }
    if(isRecord(c.eventBinding)){
      const binding=c.eventBinding;if(!sameScope(c.scope,binding.scope))return false;
      if(isRecord(binding.scope)&&binding.scope.kind==='patient'&&binding.patientId!==binding.scope.id)return false;
      if(isRecord(binding.scope)&&binding.scope.kind==='project'&&binding.projectId!==undefined&&binding.projectId!==binding.scope.id)return false;
      if(Array.isArray(binding.patients)){const ids=binding.patients.map(p=>(p as Record<string,unknown>).id);if(new Set(ids).size!==ids.length||!ids.every(id=>patientIds.has(id)))return false;}
    }
    for(const key of ['butterfly','butterflyCommitment','butterflyPermission','butterflyFinance','butterflyRoleDuty'])if(isRecord(c[key])&&!chainIds.has(c[key].chainStateId))return false;
    if(isRecord(c.familyFundingContact)&&(!sameScope(c.scope,{kind:'personal',id:r.id})||!((authored?.familyInvoices??[])as Record<string,unknown>[]).some(b=>b.id===(c.familyFundingContact as Record<string,unknown>).familyBillId)))return false;
    if(isRecord(c.butterflyMerge)&&!(c.butterflyMerge.chainStateIds as string[]).every(id=>chainIds.has(id)))return false;
    if(isRecord(c.butterflyMerge)&&c.butterflyMerge.familyBillId!==undefined&&!((authored?.familyInvoices??[])as Record<string,unknown>[]).some(b=>b.id===(c.butterflyMerge as Record<string,unknown>).familyBillId))return false;
    if(isRecord(c.butterflyMerge)&&c.butterflyMerge.continuations!==undefined){
      const merge=c.butterflyMerge,claims=merge.continuations as Record<string,unknown>[];
      if(!claims.every(claim=>{const chain=chains.find(x=>x.id===claim.chainStateId);return chain&&String(claim.sourceNode).startsWith(`${chain.chain}:`);} ))return false;
      if(Array.isArray(merge.claimedCommitmentIds)&&!merge.claimedCommitmentIds.every(id=>chains.some(chain=>claims.some(claim=>claim.chainStateId===chain.id&&claim.sourceNode==='BTF-004:LABOR')&&(chain.commitments as Record<string,unknown>[]).some(k=>k.id===id&&isResearchCollaboration(String(k.type))))))return false;
      for(const id of merge.claimedSceneIds as string[]){
        const source=cards.find(source=>source.id===id);if(!source)return false;
        if(isRecord(source.butterfly)){
          const node=source.butterfly;
          if(!claims.some(claim=>claim.chainStateId===node.chainStateId&&claim.sourceNode===node.nodeId))return false;
        }else if(isRecord(source.butterflyCommitment)){
          const task=source.butterflyCommitment;
          if(!claims.some(claim=>claim.chainStateId===task.chainStateId&&claim.sourceNode==='BTF-004:LABOR'))return false;
          const chain=chains.find(chain=>chain.id===task.chainStateId);
          if(!(chain?.commitments as Record<string,unknown>[]).some(k=>k.id===task.commitmentId&&isResearchCollaboration(String(k.type))))return false;
        }else return false;
      }
    }
    if(isRecord(c.butterflyCommitment)){const b=c.butterflyCommitment;const chain=chains.find(x=>x.id===b.chainStateId);if(!(chain?.commitments as Record<string,unknown>[]).some(item=>item.id===b.commitmentId))return false;}
    if(c.clinicalGraph!==undefined){const p=patients.find(p=>p.uid===c.patientId);if(!p||!isRecord(p.clinical)||(c.clinicalGraph as Record<string,unknown>).caseId!==p.caseId||!sameScope(c.scope,{kind:'patient',id:p.uid}))return false;}
    if(c.presetNode!==undefined){const p=patients.find(p=>p.uid===c.patientId);if(!p||!isRecord(p.preset)||!(p.preset.steps as Record<string,unknown>[]).some(s=>s.id===c.presetNode))return false;}
  }
  for(const p of patients)if(isRecord(p.clinical)&&p.clinical.caseId!==p.caseId)return false;
  for(const p of patients)if(isRecord(p.preset)&&isRecord(p.preset.revisit)&&(!patientIds.has(p.preset.revisit.previousPatientId)||p.preset.revisit.previousPatientId===p.uid))return false;
  if(isRecord(r.talentMemory)){
    const m=r.talentMemory;if((m.day as number)>(r.day as number))return false;
    for(const key of ['firstContacts','intuitionReady','reviewedPatients','smelledPatients','quotedPatients','transferredPatients'])if(!(m[key] as string[]).every(id=>patientIds.has(id)))return false;
    if(!Object.keys(m.chartClues as object).every(id=>patientIds.has(id))||!Object.keys(m.concealedPatients as object).every(id=>patientIds.has(id)))return false;
    for(const key of ['beautifiedProjects','chiefKnowsProjects'])if(!(m[key] as string[]).every(id=>projects.has(id)))return false;
  }
  if(isRecord(r.pendingCheck)){
    const p=r.pendingCheck,rollValue=r.roll;if(!isRecord(rollValue)||p.day!==r.day||p.kind!==rollValue.kind||(rollValue.revision??0)!==p.rerolls)return false;
    if(r.phase!=='roll'&&!(r.phase==='funding'&&r.pendingResume==='roll'))return false;
    if(p.kind==='choice'){
      const card=(r.queue as Record<string,unknown>[])[r.cursor as number];if(!card||card.id!==p.cardId||rollValue.id!==p.optionId||(p.context as Record<string,unknown>).patientId!==card.patientId)return false;
      // Abilities are deterministic projections of saved talent/actor state and
      // need not be duplicated into the authored card's original option array.
      const o=(card.options as Record<string,unknown>[]).find(o=>o.id===p.optionId)??availableOptions(r as unknown as Run).find(o=>o.id===p.optionId);if(!o||!option(o)||!o.check&&!o.chanceCheck)return false;
      if(rollValue.chance===true){if(!isRecord(o.chanceCheck)||o.chanceCheck.successAtLeast!==rollValue.dc||p.rerolls!==0)return false;}
      else if(o.chanceCheck)return false;
      if(isRecord(rollValue.group)){
        const parties=patientCheckParties(r as unknown as Run,(r as unknown as Run).patients.find(patient=>patient.uid===card.patientId),o as unknown as import('./types').Option);
        if(!parties||(rollValue.group.members as PatientCheckMember[]).some((m,i)=>m.party!==parties[i]))return false;
      }
      if((r.committed as string[]).some(id=>id===o.id||id===`${card.id}:${o.id}`))return false;
    } else if(rollValue.id!==`day:${r.day}`)return false;
    if(rollValue.blockedReason!==undefined&&((p.context as Record<string,unknown>).operation!=='history'||p.rerolls!==0))return false;
    if(rollValue.critical!==undefined&&rollValue.blockedReason===undefined&&rollValue.chance!==true&&rollValue.group===undefined){
      const critical=rollValue.face===20?'success':rollValue.face===1||(r.talents as string[]).includes('T22')&&rollValue.face===2?'failure':null;
      if(rollValue.critical!==critical)return false;
      const success=critical==='success'||critical!=='failure'&&(rollValue.face as number)+(rollValue.modifier as number)>=(rollValue.dc as number);
      if(rollValue.success!==success)return false;
    }
  }
  if(isRecord(r.emergency)){
    const e=r.emergency,resume=e.resume as Record<string,unknown>,queue=r.queue as Record<string,unknown>[];
    if(isRecord(e.occurred)&&e.occurred.day!==r.day)return false;
    if(r.phase==='ending'||!queue.some(c=>c.id===e.cardId)||e.resolved===true&&r.phase!=='feedback')return false;
    if(e.resolved===false&&queue[r.cursor as number]?.id!==e.cardId)return false;
    if(isRecord(resume.pendingCheck)){
      const pending=resume.pendingCheck;
      const restoredCursor=pending.kind==='choice'?queue.findIndex(c=>c.id===pending.cardId):r.cursor;
      if(!runReferences({...r,emergency:undefined,phase:resume.phase,roll:resume.roll,pendingCheck:resume.pendingCheck,cursor:restoredCursor}))return false;
    }
  }
  return true;
}
function isRun(x: unknown): x is Run {
  if (
    !isRecord(x) ||
    x.schema !== 1 ||
    typeof x.id !== "string" ||
    typeof x.seed !== "string" ||
    typeof x.name !== "string" ||
    !member(["rotation", "attending"])(x.difficulty) ||
    !boolFields(x, ["nap", "skipNextDay"]) ||
    !optional(x, "tribunalResponse", isText) ||
    !optional(x, "pendingResume", member(resumePhases)) || !optional(x,'sanBreaks',count) ||
    !optional(x,'shiftPhase',member(phases))||!optional(x,'authored',authoredState)||!optional(x,'talentMemory',talentState)||!optional(x,'pendingCheck',pendingCheck)||!optional(x,'emergency',emergency)||
    !optional(x,'priorSeeds',seedHistory)||!optional(x,'metaRerolls',v=>count(v)&&v<=1)||!optional(x,'archiveTraps',v=>distinctStrings(v)&&v.every(id=>validArchiveTrap(id)))||
    !optional(x,'budgetCharges',v=>list(v,c=>isRecord(c)&&integer(c.day)&&c.day>=1&&c.day<=15&&finite(c.amount)&&c.amount>0&&nonempty(c.patientId)&&nonempty(c.source)))||
    !optional(x,'incomeHistory',v=>list(v,c=>isRecord(c)&&integer(c.day)&&c.day>=1&&c.day<=Math.min(Number(x.day),14)&&finite(c.amount),14)&&new Set(v.map(c=>(c as Record<string,unknown>).day)).size===v.length)
  )
    return false;
  const relationValues = x.relations;
  if (!isRecord(relationValues) || !relations.every(key => {
    const value = relationValues[key];
    return finite(value) && value >= 0 && value <= 5;
  })) return false;
  if (!optional(x, "world", value => isRecord(value) && finiteRecord(value, ["x", "y"]) &&
    (value.x as number) >= 0 && (value.x as number) <= 1536 && (value.y as number) >= 0 && (value.y as number) <= 512 &&
    integer(value.facing) && value.facing >= 0 && value.facing <= 3 && integer(value.day) && value.day >= 1 && value.day <= 15)) return false;
  if (
    ![
      "play",
      "feedback",
      "roll",
      "debuff",
      "funding",
      "tribunal",
      "ending",
    ].includes(String(x.phase))
  )
    return false;
  if (
    !finiteRecord(x, [
      "day",
      "ap",
      "borrowed",
      "overtime",
      "cash",
      "debt",
      "privateDebt",
      "receivable",
      "income",
      "interest",
      "uncoveredDays",
      "reputation",
      "depression",
      "coffee",
      "exhausted",
      "emotionalBreaks",
      "nightMinutes",
      "nightBudget",
      "cursor",
      "debuffPicks",
      "streak",
    ])
  )
    return false;
  if (
    !finiteRecord(x.vitals, ["stamina", "san", "emotion"]) ||
    !finiteRecord(x.caps, ["stamina", "san", "emotion"]) ||
    !finiteRecord(x.relations, ["chief", "peer", "nurse", "family"]) ||
    !finiteRecord(x.skills, [
      "observe",
      "clinical",
      "record",
      "persuade",
      "comfort",
      "endure",
    ])
  )
    return false;
  if (
    ![x.talents, x.debuffs, x.offered, x.committed].every(strings) ||
    !isRecord(x.facts) ||
    !Object.values(x.facts).every(f => isRecord(f) && finiteRecord(f, ["day", "sequence"]) && typeof f.source === "string") ||
    !(x.talents as string[]).every(member(TALENTS.map(t => t.id))) ||
    (x.talents as string[]).length>0&&validateTalentSelection(x.talents as string[],true).length>0 ||
    ![...(x.debuffs as string[]), ...(x.offered as string[])].every(member(DEBUFFS.map(d => d.id)))
  )
    return false;
  if (
    !Array.isArray(x.queue) ||
    x.queue.length > 200 ||
    !x.queue.every(card)
  )
    return false;
  if (
    !Array.isArray(x.patients) ||
    !x.patients.every(patient)
  )
    return false;
  const patientIds = new Set((x.patients as Record<string, unknown>[]).map(p => p.uid));
  if (patientIds.size !== x.patients.length) return false;
  if(!optional(x,'deferredWork',value=>list(value,w=>isRecord(w)&&nonempty(w.patientId)&&nonempty(w.source)&&count(w.created)&&count(w.due)&&member(['ap-empty','half-leave'])(w.reason)&&list(w.cards,card,200),200)))return false;
  if (
    !Array.isArray(x.journal) ||
    !Array.isArray(x.hazards) ||
    !x.journal.every(
      (j) =>
        isRecord(j) &&
        typeof j.id === "string" &&
        typeof j.title === "string" &&
        typeof j.choice === "string" &&
        typeof j.result === "string" &&
        strings(j.flags) &&
        finite(j.day) && scope(j.scope)&&optional(j,'operation',member(operations))&&optional(j,'clinicalChoice',nonempty)&&optional(j,'talentAction',member(talentActions)),
    ) ||
    !x.hazards.every(
      (h) =>
        isRecord(h) &&
        hazardInput(h) && textFields(h, ["id", "choiceId", "choice"]) &&
        scope(h.scope) &&
        finiteRecord(h, ["day", "weight"])&&optional(h,'originalWeight',nonnegative)&&
        optional(h,'mitigations',v=>list(v,m=>isRecord(m)&&nonempty(m.source)&&count(m.day)&&finite(m.amount)&&m.amount>0))&&
        (h.mitigations===undefined||finite(h.originalWeight)&&Math.abs(h.originalWeight-Number(h.weight)-(h.mitigations as {amount:number}[]).reduce((sum,m)=>sum+m.amount,0))<1e-7),
    )
  )
    return false;
  if (
    x.feedback !== undefined &&
    !feedback(x.feedback)
  )
    return false;
  if (
    x.roll !== undefined &&
    !roll(x.roll)
  )
    return false;
  if (
    x.ending !== undefined &&
    (!isRecord(x.ending) ||
      typeof x.ending.id !== "string" ||
      typeof x.ending.title !== "string" ||
      typeof x.ending.decision !== "string" ||
      typeof x.ending.epilogue !== "string" ||
      typeof x.ending.category !== "string" || typeof x.ending.court !== "boolean" || !strings(x.ending.annexes)||!optional(x.ending,'annexIds',distinctStrings))
  )
    return false;
  if (
    (x.phase === "roll" && !x.roll) ||
    (x.phase === "ending" && !x.ending) ||
    (x.phase === "feedback" && !x.feedback)
  )
    return false;
  return (
    integer(x.day) && integer(x.cursor) && (x.day as number) >= 1 &&
    (x.day as number) <= 15 &&
    (x.cursor as number) >= 0 &&
    (x.cursor as number) <= x.queue.length&&runReferences(x)
  );
}
/** Development diagnostics, not serialized and not exposed as patient prose. */
export function storageRunIssues(value:unknown):string[] {
  if(!isRecord(value))return ['run'];const r=value,issues:string[]=[];
  for(const [key,validator] of [['authored',authoredState],['talentMemory',talentState],['pendingCheck',pendingCheck],['roll',roll],['emergency',emergency]] as const)if(!optional(r,key,validator))issues.push(key);
  if(Array.isArray(r.queue))r.queue.forEach((c,i)=>{if(!card(c))issues.push(`queue.${i}`);});
  if(Array.isArray(r.patients))r.patients.forEach((p,i)=>{if(!patient(p))issues.push(`patients.${i}`);});
  if(isRecord(r.authored)){
    const a=r.authored;if(!eventLedger(a.ledger))issues.push('authored.ledger');
    if(Array.isArray(a.chains))a.chains.forEach((c,i)=>{if(!butterflyChain(c))issues.push(`authored.chains.${i}`);});
    if(isRecord(a.published))for(const [id,c] of Object.entries(a.published))if(!card(c))issues.push(`authored.published.${id}`);
  }
  try{if(!runReferences(r))issues.push('references');}catch{issues.push('references-shape');}
  if(!issues.length&&!isRun(r))issues.push('run-base');return issues;
}
export function emptySave(): Save {
  return {
    schema: 1,
    run: null,
    meta: newMeta(),
    settings: { sound: true, music: true, voice: true, musicVolume: .4, voiceVolume: .85, soundVolume: .5, visualInterference: true, motion: true, largeText: false },
  };
}
/** Saves from the published build could stop in a "collapse" panel. That
 * panel no longer exists: resume the recorded phase and let the engine's
 * acute-event interruption handle the zero vital on the next action. */
export function migrateLegacyCollapse(run:Record<string,unknown>):void {
  if(run.phase!=='collapse')return;
  const resume=member(resumePhases)(run.pendingResume)?run.pendingResume:'play';
  run.phase=resume==='feedback'&&!isRecord(run.feedback)?'play':resume==='roll'&&!isRecord(run.roll)?'play':resume;
  delete run.pendingResume;
  if(run.phase!=='roll'){delete run.roll;delete run.pendingCheck;}
  if(run.phase!=='feedback')delete run.feedback;
}
export function encode(save: Save): string {
  const payload = JSON.stringify(save);
  return JSON.stringify({ tyche: 1, checksum: hash(payload), payload });
}
export function decode(text: string): Save {
  if (text.length > SAVE_MAX_BYTES||utf8Bytes(text)>SAVE_MAX_BYTES) throw new Error("存档超过大小限制。");
  const envelope = JSON.parse(text);
  if (
    !isRecord(envelope) ||
    envelope.tyche !== 1 ||
    typeof envelope.payload !== "string" ||
    hash(envelope.payload) !== envelope.checksum
  )
    throw new Error("存档校验失败，文件可能不完整。");
  const s = JSON.parse(envelope.payload);
  if(isRecord(s)&&isRecord(s.run))migrateLegacyCollapse(s.run);
  if (
    !isRecord(s) ||
    s.schema !== 1 ||
    (s.run !== null && !isRun(s.run)) ||
    !isRecord(s.meta) ||
    s.meta.schema !== 1 ||
    !finiteRecord(s.meta, ["xp", "runs", "cashRank"]) ||
    !['insight'].every(k=>optional(s.meta as Record<string,unknown>,k,count))||
    !['attendingUnlocked','fourthSlot','rerollToken'].every(k=>optional(s.meta as Record<string,unknown>,k,isBool))||
    !optional(s.meta,'usedTalents',v=>distinctStrings(v)&&v.every(member(TALENTS.map(t=>t.id))))||!optional(s.meta,'seedHistory',seedHistory)||
    !optional(s.meta,'archiveTraps',v=>distinctStrings(v)&&v.every(id=>validArchiveTrap(id,true)))||
    !optional(s.meta,'entities',v=>distinctStrings(v)&&v.every(id=>ENTITY_BY_ID.has(id)))||
    !optional(s.meta,'clinicalPatients',v=>distinctStrings(v)&&v.every(id=>CLINICAL_PATIENT_BY_ID.has(id)))||
    !optional(s.meta,'debuffs',v=>distinctStrings(v)&&v.every(member(DEBUFFS.map(d=>d.id))))||
    !optional(s.meta,'extraRedraws',v=>count(v)&&v<=5)||!optional(s.meta,'depressionRank',v=>count(v)&&v<=2)||
    !finiteRecord(s.meta.skills, [
      "observe",
      "clinical",
      "record",
      "persuade",
      "comfort",
      "endure",
    ]) ||
    !finiteRecord(s.meta.caps, ["stamina", "san", "emotion"]) ||
    ![s.meta.endings, s.meta.cases, s.meta.scenes, s.meta.rewarded].every(
      strings,
    ) ||
    !isRecord(s.settings) ||
    !['music', 'voice', 'visualInterference'].every(k => optional(s.settings as Record<string, unknown>, k, isBool)) ||
    !['musicVolume', 'voiceVolume', 'soundVolume'].every(k => optional(s.settings as Record<string, unknown>, k, v => finite(v) && v >= 0 && v <= 1)) ||
    !optional(s, "guide", guide) ||
    !["sound", "motion", "largeText"].every(
      (k) => typeof (s.settings as Record<string, unknown>)[k] === "boolean",
    )
  )
    throw new Error("存档格式不受支持。");
  const save=s as unknown as Save;
  if(save.run){repairLegacyPresetBaselines(save.run);repairLegacyClinicalLocations(save.run);repairLegacyClinicalAdmission(save.run);}
  recoverClinicalPatientCollection(save.meta,save.run);
  return save;
}
export function load(storage: Pick<SaveStorage, "getItem"> | undefined): {
  save: Save;
  warning: string;
} {
  if (!storage)
    return {
      save: emptySave(),
      warning: "浏览器存储不可用。请导出存档保留进度。",
    };
  let damaged=false;
  try {
    const text = storage.getItem(SAVE_KEY);
    if (text) return { save: decode(text), warning: "" };
  } catch {
    damaged=true;
    /* recover from one verified prior save */
  }
  try {
    const backup = storage.getItem(BACKUP_KEY);
    if (backup)
      return { save: decode(backup), warning: "已从上一份存档恢复。" };
  } catch {
    damaged=true;
    /* preserve damaged data until explicit player action */
  }
  return { save: emptySave(), warning: damaged?"存档无法读取，原始数据未被改动。请尝试导入已导出的备份。":"" };
}
export function persist(
  save: Save,
  storage: SaveStorage,
): string {
  let next: string;
  try {
    next = encode(save);
    // A malformed current run must never replace the last healthy save/backup.
    decode(next);
  } catch {
    // The in-memory state itself failed the encode/decode round trip; writing it would
    // only overwrite a healthy save with a broken one, so this returns before touching storage.
    return "本次进度未通过校验，未写入浏览器。游戏仍可继续，请导出存档。";
  }
  try {
    const previous = storage.getItem(SAVE_KEY);
    if (previous) {
      try {
        decode(previous);
        storage.setItem(BACKUP_KEY, previous);
      } catch {
        /* do not replace a healthy backup with corrupt data */
      }
    }
    storage.setItem(SAVE_KEY, next);
    return "";
  } catch {
    // The data was valid; the browser's storage itself refused the write (quota, private mode, disabled).
    return "进度未写入浏览器（存储空间不足或不可用）。游戏仍可继续，请导出存档。";
  }
}
