import type { Effects, Option } from '../../game/types';

export type GraphCondition =
  | { all: GraphCondition[] } | { any: GraphCondition[] } | { not: GraphCondition }
  | { flag: string } | { choice: string } | { entered: string }
  | { variant: string } | { minutes: { min?: number; max?: number } }
  | { noCausal: true } | { count: { flags: string[]; min: number } } | { always: true };
export interface GraphSource { file: string; section: string; line: number; raw: string }
export interface GraphEffectRule { when?: GraphCondition; on?: 'always' | 'success' | 'failure'; effects: Effects }
export interface GraphTransition { when: GraphCondition; next: string }
export interface GraphOption extends Option {
  source: GraphSource;
  requires?: GraphCondition;
  rules: GraphEffectRule[];
  reports: string[];
  successText?: string;
  resultVariants?: { when: GraphCondition; text: string }[];
  failureNext?: string;
  successNext?: string;
  /** Zero-cost mandatory information check; host begins its normal pending-die UI. */
  automatic?: boolean;
  checkWhen?: GraphCondition;
  mechanicsVariants?: {when:GraphCondition;mechanics:Partial<NonNullable<Option['mechanics']>>}[];
  /** Interrupt once after the action, then resume its already-resolved transition. */
  followUp?: { node: string; onceFlag: string };
  transitions?: GraphTransition[];
  retry?: { max: number; dcIncrease: number; exhaustedNext?: string };
  modifiers?: { when: GraphCondition; minutes?: number; dc?: number; advantage?: boolean; ap?: number; cost?: number; label?: string }[];
  system?: boolean;
}
export interface ClinicalNode {
  id: string; title: string; text: string; source: GraphSource;
  kind: 'single' | 'multi' | 'auto'; min: number; max: number; exit: string;
  options: GraphOption[];
  /** Immediate exits for legacy optional-action nodes; other multi choices stay until Continue. */
  exitOn?: string[];
  enterEffects?: GraphEffectRule[];
  exitEffects?: GraphEffectRule[];
  transitions?: GraphTransition[];
  textVariants?: { when: GraphCondition; text: string }[];
}
export interface ClinicalReport {
  id: string; title: string; full: string; skimmed: string;
  source: GraphSource; when: GraphCondition; afterNode?: string;
}
export interface ClinicalOutcome {
  id: string; title: string; priority: number; severity: number; seed: boolean;
  condition: GraphCondition; text: string; source: GraphSource;
  textVariants?: { when: GraphCondition; text: string }[];
  effects?: Effects; supplemental?: boolean;
}
export interface ClinicalGraph {
  id: string; title: string; department: string; setting: string;
  budget: number; dipGroup?:string; source: GraphSource;
  presentation: { complaint: string; history: string[]; vitals: string; appearance: string };
  variants: { id: string; title: string; group: string; weight: number }[];
  nodes: ClinicalNode[]; reports: ClinicalReport[]; outcomes: ClinicalOutcome[];
  tribunal: Record<string, string>;
  flagConsumers: Record<string, { kind: 'outcome' | 'report' | 'record' | 'tribunal' | 'condition'; id: string }[]>;
  environment: { time: string; fatigue: string; san: string; text: string }[];
  normalizationNotes: string[];
}
export interface ClinicalGraphState {
  caseId: string; nodeId: string; variants: string[]; flags: string[];
  choices: string[]; entered: string[]; selected: Record<string, string[]>;
  attempts: Record<string, number>; minutes: number; ap: number; cost: number;
  causalChoices: string[]; outcomeId?: string;
  resumeNodes?: {nodeId:string;preserveSelected:boolean}[];
}
export interface GraphAdvance {
  state: ClinicalGraphState; effects: Effects[]; option?: GraphOption;
  text: string; actionText: string; reports: ClinicalReport[]; outcome?: ClinicalOutcome;
}
