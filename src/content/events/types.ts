import type { Card, Effects, Option, Scope } from '../../game/types';

export type EventPhase = '交班' | '查房' | '门诊' | '结算' | '夜班' | '日终';
export interface EventSource { path: string; sha256: string; line?: number }
export interface EventContext {
  day: number;
  phase: EventPhase;
  night?: boolean;
  stamina?: number; san?: number; emotion?: number; depression?: number;
  cash?: number; debt?: number; pressure?: number; reputation?: number;
  overspend?: number; interest?: number; income?: number;
  paperDeadline?: number;
  relations?: { chief?: number; nurse?: number; peer?: number; family?: number };
  facts: Readonly<Record<string, boolean | number | { day: number }>>;
  seen?: Readonly<Record<string, number>>;
  /** Exact present-tense clinical/actor predicates, supplied from bound world state. */
  qualifiers?: readonly string[];
  scope?: Scope;
}
export interface EventBinding {
  scope: Scope; patientId?: string; instanceId: string; day: number; phase: EventPhase;
  patientName?: string; bed?: number;
  actorId?: string; projectId?: string;
  /** Additional exact patient instances for an authored multi-patient incident. */
  patients?: { id: string; bed: number; name?: string }[];
}
export interface DelayedEffect {
  id: string;
  delay: number;
  day?: number;
  phase: EventPhase;
  effects: Effects;
  repetitions?: number;
  until?: string[];
  probability?: number;
  requires?: string[];
  otherwiseEffects?:Effects;
  otherwiseDescription?:string;
  description: string;
}
export interface EventModifier {
  id: string;
  kind: 'sleep' | 'skill' | 'workload' | 'cash-pressure' | 'night-shift' | 'leave' | 'pending-asset' | 'followup' | 'formula' | 'recover';
  value?: number;
  days?: number;
  target?: string;
  startsAfter?: number;
  /** Absolute rotation day; takes precedence over a relative offset. */
  startsOn?: number;
  factor?: number;
  until?: string[];
  description: string;
}
export interface EventOption extends Option {
  /** A raw natural d20 threshold; check supplies feedback/effects, never skill bonuses. */
  chanceCheck?:{successAtLeast:number};
  /** Complete failure effects. check.failure remains the historical delta contract. */
  failureTotal?: Effects;
  consequence: string;
  deferred: DelayedEffect[];
  modifiers: EventModifier[];
  failureDeferred?: DelayedEffect[];
  failureModifiers?: EventModifier[];
  emittedFacts: string[];
}
export interface AuthoredEvent {
  id: string; title: string; text: string;
  trigger: string; weight: number; category: number;
  followup: string; source: EventSource;
  options: EventOption[];
  phases: EventPhase[];
  requiredQualifiers: string[];
  repeatable: boolean;
  exclusiveGroup?: string;
  /** A repeat that needs a measured change, such as another ¥10,000 of debt. */
  repeatEvery?: { resource: keyof Effects; amount: number };
  scopeKind: Scope['kind'];
  onEnter: Effects;
}
export interface EventCard extends Card {
  authoredEventId: string;
  eventBinding: EventBinding;
  options: EventOption[];
  onEnter: Effects;
}
export interface EventLedger {
  outcomes?: {eventId:string;choiceId:string;success:boolean;scope:Scope;day:number}[];
  commits: string[];
  pending: (DelayedEffect & { scope: Scope; due: number })[];
  applied: string[];
  modifiers: (EventModifier & { scope: Scope; starts: number; expires: number })[];
  facts: { id: string; scope: Scope; source: string; day: number; knownBy: string[] }[];
}
