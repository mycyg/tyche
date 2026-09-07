import type { Effects, Scope } from '../../game/types';
import type { EventCard, EventLedger, EventPhase,EventBinding,EventModifier,DelayedEffect } from './types';
import { mergeEventEffects,authoredChoiceEffects } from './catalog';

export const createEventLedger = (): EventLedger => ({ commits: [], pending: [], applied: [], modifiers: [], facts: [] });
/** Shared scheduling for ordinary events and graph choices. It does not invent
 * an E-event outcome for a graph-only interaction. */
export function scheduleEventClauses(ledger:EventLedger,clauses:{deferred:DelayedEffect[];modifiers:EventModifier[]},binding:Pick<EventBinding,'scope'|'day'|'instanceId'>,key:string):EventLedger{
 const next=structuredClone(ledger);
 for(const d of clauses.deferred)for(let i=0;i<(d.repetitions??1);i++){
  const id=`${key}:${d.id}:${i}`;
  if(next.pending.some(p=>p.id===id)||next.applied.includes(id))continue;
  next.pending.push({...d,id,scope:binding.scope,...(d.until&&binding.scope.kind==='patient'?{until:d.until.map(f=>f==='patient-discharged'?`${f}:${binding.scope.id}`:f)}:{}),...(d.requires&&binding.scope.kind==='patient'?{requires:d.requires.map(f=>f==='patient-discharged'?`${f}:${binding.scope.id}`:f)}:{}),due:(d.day??binding.day+d.delay)+i});
 }
 for(const m of clauses.modifiers){
  const id=`${key}:${m.id}`;if(next.modifiers.some(item=>item.id===id))continue;
  const leave=m.kind==='leave',full=leave&&(m.value??1)>=1;
  const offset=m.startsAfter??(full||m.kind==='night-shift'?1:0);
  const starts=m.startsOn??binding.day+offset,duration=m.days??(leave?Math.max(1,Math.ceil(m.value??1)):14);
  const until=m.until?.map(f=>f==='patient-discharged'&&binding.scope.kind==='patient'?`${f}:${binding.scope.id}`:f);
  next.modifiers.push({...m,...(until?{until}:{}),id,scope:['outpatientHazardR','nightSanPenalty'].includes(m.target??'')?{kind:'personal',id:binding.instanceId}:binding.scope,starts,expires:starts+duration-1});
 }
 return next;
}
/** Supplement the base game's atomic choice commit with sourced delayed effects. */
export function recordEventChoice(ledger: EventLedger, card: EventCard, choiceId: string, success: boolean): EventLedger {
  const key = `${card.id}:${choiceId}`;
  if (ledger.commits.includes(key)) return ledger;
  const option = card.options.find(o => o.id === choiceId);
  if (!option) throw new Error(`Choice does not belong to ${card.id}`);
  let next = structuredClone(ledger);const binding = card.eventBinding;
  next.commits.push(key);
  (next.outcomes??=[]).push({eventId:card.authoredEventId,choiceId,success,scope:binding.scope,day:binding.day});
  const deferred = [...option.deferred.filter(d => success || !d.id.includes(':pass:')), ...(!success ? option.failureDeferred ?? [] : [])];
  const modifiers = [...option.modifiers.filter(d => success || !d.id.includes(':pass:')), ...(!success ? option.failureModifiers ?? [] : [])];
  next=scheduleEventClauses(next,{deferred,modifiers},binding,key);
  const emitted=authoredChoiceEffects(option,success).flags??[];
  for (const id of new Set(emitted)) next.facts.push({ id, scope: binding.scope, source: key, day: binding.day, knownBy: ['player', ...(binding.actorId ? [binding.actorId] : [])] });
  return next;
}
export interface DueEventEffect { id: string; scope: Scope; effects: Effects; description: string }
/** Due commitments are consumed once. Late/ending settlement reports them rather than losing them. */
export function settleEventLedger(ledger: EventLedger, day: number, phase: EventPhase, facts: readonly string[], draw: (key: string) => number, final = false): { ledger: EventLedger; effects: DueEventEffect[]; epilogue: string[] } {
  const next = structuredClone(ledger), effects: DueEventEffect[] = [], epilogue: string[] = [];
  const remaining: EventLedger['pending'] = [];
  for (const d of next.pending) {
    if (next.applied.includes(d.id)) continue;
    if (d.until?.some(f => facts.includes(f))) { next.applied.push(d.id); continue; }
    if (d.due <= day && (!d.requires||d.requires.every(f=>facts.includes(f))) && (d.phase === phase || final || d.due < day)) {
      next.applied.push(d.id);
      if (d.probability === undefined || draw(d.id) < d.probability) effects.push({ id: d.id, scope: d.scope, effects: d.effects, description: d.description });
      else if(d.otherwiseEffects)effects.push({id:d.id,scope:d.scope,effects:d.otherwiseEffects,description:d.otherwiseDescription??d.description});
    } else if (final) {
      epilogue.push(`第 ${d.due} 天待办：${d.description}`);
      next.applied.push(d.id);
    } else remaining.push(d);
  }
  next.pending = remaining;
  // Escrow is property awaiting a decision, not a buff that expires on a date.
  next.modifiers = next.modifiers.filter(m => (m.kind==='pending-asset'||m.expires >= day)&&!m.until?.some(f=>facts.includes(f)));
  return { ledger: next, effects, epilogue };
}
export const aggregateEventEffects = (effects: DueEventEffect[], scope: Scope): Effects => effects.filter(e => e.scope.kind === scope.kind && e.scope.id === scope.id).reduce((a, e) => mergeEventEffects(a, e.effects), {});
