import type { ClinicalGraphState } from '../content/clinical/types';
import type { InstantiatedPreset } from '../content/patients/types';
import type { EventPhase } from '../content/events/types';
import type { AuthoredDirectorState } from './director';
import type { TalentMemory, TalentOperation, TalentActor, TalentCheckContext } from './talents';
export type Vital = "stamina" | "san" | "emotion";
export type Relation = "chief" | "nurse" | "peer" | "family";
export type Skill =
  | "observe"
  | "clinical"
  | "record"
  | "persuade"
  | "comfort"
  | "endure";
export type HazardType = "R" | "C" | "D" | "F";
export type Scope = { kind: "patient" | "project" | "personal"; id: string };
export interface HazardInput {
  type: HazardType;
  weight: number;
  reason: string;
  norm: string;
  causal: boolean;
}
export interface Hazard extends HazardInput {
  id: string;
  day: number;
  scope: Scope;
  choiceId: string;
  choice: string;
  originalWeight?:number;
  mitigations?:{source:string;day:number;amount:number}[];
}
export interface Effects {
  stamina?: number;
  san?: number;
  emotion?: number;
  reputation?: number;
  damage?: number;
  mitigate?: number;
  cash?: number;
  debt?: number;
  privateDebt?: number;
  receivable?: number;
  income?: number;
  cashPressure?:number;
  apAllowance?:number;
  hazardRelief?:Partial<Record<HazardType,number>>;
  depression?: number;
  flags?: string[];
  clear?: string[];
  hazards?: HazardInput[];
  relations?: Partial<Record<Relation, number>>;
  caps?: Partial<Record<Vital, number>>;
  ap?: number;
  stability?: number;
  patience?: number;
  discharge?: boolean;
  plannedDischarge?: boolean;
  care?: boolean;
  bill?: number;
}
export interface Condition {
  all?: string[];
  any?: string[];
  none?: string[];
  cash?: number;
  relation?: [Relation, number];
}
export interface Check {
  skill: Skill;
  dc: number;
  purpose?: string;
  failureHint?: string;
  failure: Effects;
  failureText: string;
}
export interface Option {
  chanceCheck?: {successAtLeast:number};
  talentAction?: 'chart-review'|'full-review'|'norm-quote'|'relative-loan'|'transfer'|'conceal'|'counselling'|'gastroscopy'|'family-clear'|'leave-group'|'day-off'|'late-record';
  talentTarget?: string;
  automatic?:boolean;
  mechanics?: { operation:TalentOperation; checkOperation?:TalentOperation; actor?:TalentActor; quality?:'correct'|'neutral'|'incorrect'; unsignedConsent?:boolean; consultWaitMinutes?:number };
  id: string;
  interaction?: 'hallucination' | 'recheck' | 'transfer' | 'graph-continue' | 'ability' | 'defer';
  clinicalChoice?: string;
  label: string;
  ap: number;
  minutes: number;
  cost: number;
  result: string;
  effects: Effects;
  next?: string;
  when?: Condition;
  check?: Check;
  hint?: string;
}
export interface Scene {
  id: string;
  title: string;
  text: string;
  options: Option[];
}
export interface ClinicalCase {
  id: string;
  title: string;
  department: string;
  age: number;
  sex: string;
  complaint: string;
  history: string[];
  findings: string[];
  dipGroup: string;
  budget: number;
  baseCost: number;
  critical: boolean;
  steps: Scene[];
}
export interface Story extends Scene {
  actor: string;
  day: number;
  after?: string;
  when?: Condition;
  scope?: Scope;
  chain: string;
  variants?: { when: Condition; text: string }[];
}
export interface Card extends Scene {
  billing?: 'spending';
  shiftPhase?: EventPhase;
  clinicalGraph?: {caseId: string; nodeId: string};
  presetNode?: string;
  kind: "clinical" | "ward" | "story" | "quick" | "night" | "rest" | "audit";
  actor?: string;
  scope: Scope;
  patientId?: string;
  caseId?: string;
  last?: boolean;
  chain?: string;
}
export interface Patient {
  clinical?: ClinicalGraphState;
  entityId?: string;
  preset?: InstantiatedPreset;
  presetNode?: string;
  presetResolved?: boolean;
  uid: string;
  caseId: string;
  name: string;
  bed: number;
  admitted: number;
  expectedDays: number;
  budget: number;
  initialBudget: number;
  spent: number;
  /** New admissions retain the quoted daily basis; old bills are not repriced. */
  dailyBaseCost?:number;
  charged: number;
  /** Settled shortfall principal exempt from a later B24 surcharge. */
  budgetSurchargeExempt?:number;
  stability: number;
  patience: number;
  damage: number;
  mitigated: number;
  active: boolean;
  inpatient: boolean;
  caredDay: number;
  explainedDay: number;
  planned: boolean;
  dischargedDay?: number;
  readmitted?: boolean;
  settled: boolean;
}
export interface Fact {
  day: number;
  source: string;
  sequence: number;
}
export interface DeferredPatientWork {
  patientId:string;source:string;created:number;due:number;
  reason:'ap-empty'|'half-leave';cards:Card[];
}
export interface Entry {
  operation?: NonNullable<Option['mechanics']>['operation'];
  clinicalChoice?: string;
  talentAction?: Option['talentAction'];
  id: string;
  day: number;
  title: string;
  choice: string;
  result: string;
  scope: Scope;
  flags: string[];
}
export interface PatientCheckMember {
  party:string;
  dice:number[];
  mode:'normal'|'advantage'|'disadvantage';
  face:number;
  modifier:number;
  dc:number;
  success:boolean;
  critical:'success'|'failure'|null;
}
export interface CheckTerm {id:string;label:string;value:number;}
export interface Roll {
  modifierSources?:CheckTerm[];
  difficultySources?:CheckTerm[];
  group?:{rule:'all';members:[PatientCheckMember,PatientCheckMember]};
  chance?: boolean;
  blockedReason?: string;
  advantage?:boolean;
  critical?:'success'|'failure'|null;
  revision?:number;
  id: string;
  kind: "day" | "choice" | "tribunal";
  face: number;
  modifier: number;
  dc: number;
  success: boolean;
  label: string;
  second?: number;
}
export interface Feedback {
  sourceCardId?: string;
  title: string;
  text: string;
  changes: string[];
  next: "play" | "check" | "day";
}
export interface Ending {
  annexIds?: string[];
  id: string;
  title: string;
  category: string;
  decision: string;
  epilogue: string;
  annexes: string[];
  court: boolean;
}
export interface Meta {
  clinicalPatients?:string[];
  entities?:string[];
  debuffs?:string[];
  extraRedraws?:number;
  depressionRank?:number;
  insight?:number;
  usedTalents?:string[];
  attendingUnlocked?:boolean;
  fourthSlot?:boolean;
  rerollToken?:boolean;
  archiveTraps?:string[];
  seedHistory?:{runId:string;caseId:string;trapId:string}[];
  schema: 1;
  xp: number;
  runs: number;
  rewarded: string[];
  endings: string[];
  cases: string[];
  scenes: string[];
  skills: Record<Skill, number>;
  caps: Record<Vital, number>;
  cashRank: number;
}
export interface Run {
  emergency?: { cardId:string; vital:Vital; resolved:boolean; occurred?:{day:number;phase:EventPhase}; resume:{phase:ResumePhase;roll?:Roll;feedback?:Feedback;pendingCheck?:Run['pendingCheck']} };
  sanBreaks?:number;
  talentMemory?:TalentMemory;
  priorSeeds?:{runId:string;caseId:string;trapId:string}[];
  metaRerolls?:number;
  archiveTraps?:string[];
  budgetCharges?:{day:number;amount:number;patientId:string;source:string}[];
  incomeHistory?:{day:number;amount:number}[];
  deferredWork?:DeferredPatientWork[];
  pendingCheck?:{kind:'choice'|'day';day:number;cardId?:string;optionId?:string;context:TalentCheckContext;rerolls:number};
  authored?: AuthoredDirectorState;
  shiftPhase?: EventPhase;
  schema: 1;
  id: string;
  seed: string;
  name: string;
  day: number;
  difficulty: "rotation" | "attending";
  /** "collapse" is a legacy save marker only: no code path enters it, and
   * storage migrates it to the recorded resume phase on load. */
  phase:
    | "play"
    | "feedback"
    | "roll"
    | "debuff"
    | "funding"
    | "collapse"
    | "tribunal"
    | "ending";
  vitals: Record<Vital, number>;
  caps: Record<Vital, number>;
  relations: Record<Relation, number>;
  ap: number;
  borrowed: number;
  overtime: number;
  cash: number;
  debt: number;
  privateDebt: number;
  receivable: number;
  income: number;
  interest: number;
  uncoveredDays: number;
  reputation: number;
  depression: number;
  talents: string[];
  debuffs: string[];
  skills: Record<Skill, number>;
  coffee: number;
  nap: boolean;
  exhausted: number;
  emotionalBreaks: number;
  skipNextDay: boolean;
  nightMinutes: number;
  nightBudget: number;
  patients: Patient[];
  queue: Card[];
  cursor: number;
  facts: Record<string, Fact>;
  journal: Entry[];
  hazards: Hazard[];
  committed: string[];
  feedback?: Feedback;
  roll?: Roll;
  offered: string[];
  debuffPicks: number;
  streak: number;
  ending?: Ending;
  tribunalResponse?: string;
  pendingResume?: ResumePhase;
  world?: { x: number; y: number; facing: number; day: number };
}
export type ResumePhase = 'play' | 'feedback' | 'roll' | 'debuff' | 'tribunal';
export type Action =
  | { type: "focus"; id: string }
  | { type: "choose"; id: string }
  | { type: "continue" }
  | { type: "ack-roll" }
  | { type: "reroll" }
  | { type: "debuff"; id: string }
  | { type: "borrow" }
  | { type: "coffee" }
  | { type: "nap" }
  | { type: "fund"; method: "credit" | "family" | "asset" | "gray" | "stop" }
  /** Legacy action kept for old callers; the engine rejects it. */
  | { type: "collapse"; method: "help" | "report" | "clinic" }
  | { type: "resign" }
  | { type: "testify"; response: "facts" | "admit" | "silent" };
export interface Talent {
  id: string;
  name: string;
  family: string;
  benefit: string;
  price: string;
}
export interface Debuff {
  id: string;
  name: string;
  text: string;
  permanent?: boolean;
}
