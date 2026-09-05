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
  id: string;
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
  kind: "clinical" | "ward" | "story" | "quick" | "night" | "rest" | "audit";
  actor?: string;
  scope: Scope;
  patientId?: string;
  caseId?: string;
  last?: boolean;
  chain?: string;
}
export interface Patient {
  uid: string;
  caseId: string;
  name: string;
  bed: number;
  admitted: number;
  expectedDays: number;
  budget: number;
  initialBudget: number;
  spent: number;
  charged: number;
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
export interface Entry {
  id: string;
  day: number;
  title: string;
  choice: string;
  result: string;
  scope: Scope;
  flags: string[];
}
export interface Roll {
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
  title: string;
  text: string;
  changes: string[];
  next: "play" | "check" | "day" | "ending";
}
export interface Ending {
  id: string;
  title: string;
  category: string;
  decision: string;
  epilogue: string;
  annexes: string[];
  court: boolean;
}
export interface Meta {
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
  schema: 1;
  id: string;
  seed: string;
  name: string;
  day: number;
  difficulty: "rotation" | "attending";
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
  pendingResume?: "feedback" | "roll";
  world?: { x: number; y: number; facing: number; day: number };
}
export type Action =
  | { type: "focus"; id: string }
  | { type: "choose"; id: string }
  | { type: "continue" }
  | { type: "ack-roll" }
  | { type: "debuff"; id: string }
  | { type: "borrow" }
  | { type: "coffee" }
  | { type: "nap" }
  | { type: "fund"; method: "credit" | "family" | "asset" | "stop" }
  | { type: "collapse"; method: "help" | "report" | "clinic" }
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
