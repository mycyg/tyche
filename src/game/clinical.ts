import { clinicalGraphs, initialGraphState, getAvailableGraphOptions, canContinueGraph, graphCondition, advanceClinicalGraph } from '../content/clinical';
import type { ClinicalGraph, ClinicalGraphState, GraphAdvance } from '../content/clinical';
import type { Card, Effects, Option, Patient, Run } from './types';
import { isSkimmed } from './perception';
import { actionMinutes, treatmentCost } from './costs';
import {runRandomKey} from './run-random';
import {clinicalNodeText,projectClinicalText} from '../content/clinical/player-copy';

export function fullGraph(caseId: string): ClinicalGraph | undefined {
  return clinicalGraphs.find(graph => graph.id === caseId);
}
export function beginClinical(r: Run, p: Patient): Card | undefined {
  const graph = fullGraph(p.caseId);
  if (!graph) return;
  p.clinical ??= initialGraphState(graph, `${r.seed}:${runRandomKey(r,p.uid)}`);
  return clinicalCard(r, p);
}
export function clinicalCard(r: Run, p: Patient): Card | undefined {
  const graph = fullGraph(p.caseId), state = p.clinical;
  if (!graph || !state || state.outcomeId) return;
  const node = graph.nodes.find(n => n.id === state.nodeId);
  if (!node) return;
  const project=(text:string)=>projectClinicalText(graph.id,text,p);
  const text = project(clinicalNodeText(node,state));
  const encounter=r.queue.find(c=>c.patientId===p.uid&&c.clinicalGraph);
  const options: Option[] = getAvailableGraphOptions(graph, state).map(option => ({
    id: `${p.uid}:graph:${option.id}:${state.attempts[option.id] ?? 0}`,
    label: project(option.label), ap:option.ap, minutes:option.minutes, cost:option.cost,
    result:project(option.result), check:option.check?{...option.check,purpose:option.check.purpose&&project(option.check.purpose),failureText:project(option.check.failureText)}:undefined, hint:option.hint&&project(option.hint), automatic:option.automatic, mechanics:option.mechanics,
    clinicalChoice: option.id,
    effects: scopedClinicalEffects(p, option.effects),
  }));
  if (canContinueGraph(graph, state)) options.push({
    id: `${p.uid}:graph:${node.id}:continue:${state.choices.length}:${r.journal.length}`, clinicalChoice: 'continue', interaction: 'graph-continue',
    label: '本轮操作已完成，继续处理', ap: 0, minutes: 0, cost: 0, result: '', effects: {},
  });
  return {
    id: `${p.uid}:graph:${node.id}:${state.choices.length}`, kind: encounter?.kind??(/-night/.test(p.uid) ? 'night' : 'clinical'),
    shiftPhase: encounter?.shiftPhase??(/-night/.test(p.uid) ? '夜班' : undefined),
    scope: { kind: 'patient', id: p.uid }, patientId: p.uid, caseId: p.caseId,
    clinicalGraph: { caseId: graph.id, nodeId: node.id }, title: node.title,
    text,
    options,
  };
}
/** Refresh only current clinical copy in old snapshots; pending dice, prices and identities survive. */
export function refreshClinicalCardCopy(r:Run,card:Card):Card {
  if(!card.clinicalGraph||!card.patientId)return card;
  const p=r.patients.find(p=>p.uid===card.patientId);
  if(!p?.clinical||p.clinical.nodeId!==card.clinicalGraph.nodeId||p.clinical.outcomeId)return card;
  const fresh=clinicalCard(r,p);
  if(!fresh)return card;
  // These source-backed notices were appended at actual contact. Preserve only
  // ledger-confirmed text present on this card, not arbitrary old source prose.
  const notices=r.journal.filter(entry=>entry.scope.id===p.uid&&
    (entry.id.startsWith(`contact:${p.uid}:`)||entry.id.startsWith(`archive-notice:${p.uid}:`))&&
    !!entry.result&&card.text.includes(entry.result)).map(entry=>entry.result);
  const text=[fresh.text,...new Set(notices.filter(text=>!fresh.text.includes(text)))].join('\n');
  return {...card,title:fresh.title,text,options:card.options.map(option=>{
    const copy=fresh.options.find(candidate=>candidate.clinicalChoice===option.clinicalChoice);
    if(!option.clinicalChoice||!copy)return option;
    return {...option,label:copy.label,result:copy.result,hint:copy.hint,
      check:option.check&&copy.check?{...option.check,purpose:copy.check.purpose,failureText:copy.check.failureText}:option.check};
  })};
}
export function scopedClinicalEffects(p: Patient, effects: Effects): Effects {
  return { ...effects,
    flags: effects.flags?.map(id => `clinical:${p.uid}:${id}`),
    clear: effects.clear?.map(id => `clinical:${p.uid}:${id}`),
  };
}
export function progressClinical(r: Run, p: Patient, option: Option, success: boolean, paidMinutes?:number, paidAp?:number): GraphAdvance {
  const graph = fullGraph(p.caseId);
  if (!graph || !p.clinical || !option.clinicalChoice) throw new Error('Missing clinical graph state');
  const card = r.queue[r.cursor];
  const result = advanceClinicalGraph(graph, p.clinical, option.clinicalChoice, success, {
    minutes: paidMinutes ?? actionMinutes(r, option, card), ap: paidAp ?? (card?.kind === 'night' ? 0 : option.ap), cost: treatmentCost(r, option),
  });
  p.clinical = result.state;
  return {...result,text:projectClinicalText(graph.id,result.text,p),actionText:projectClinicalText(graph.id,result.actionText,p),reports:result.reports.map(report=>({...report,full:projectClinicalText(graph.id,report.full,p),skimmed:projectClinicalText(graph.id,report.skimmed,p)}))};
}
export function visibleClinicalReports(r: Run, p: Patient) {
  const graph = fullGraph(p.caseId), state = p.clinical;
  if (!graph || !state) return [];
  return graph.reports.filter(report => graphCondition(report.when, state) && (!report.afterNode || state.entered.includes(report.afterNode)))
    .map(report => ({ ...report,full:projectClinicalText(graph.id,report.full,p),skimmed:projectClinicalText(graph.id,report.skimmed,p), skimmedNow: isSkimmed(r, `${p.uid}:${report.id}`) }));
}
export function validClinicalState(value: unknown): value is ClinicalGraphState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>, graph = typeof x.caseId === 'string' ? fullGraph(x.caseId) : undefined;
  const strings = (v: unknown) => Array.isArray(v) && v.length < 1000 && v.every(item => typeof item === 'string');
  const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const record = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  return !!graph && typeof x.nodeId === 'string' && [...graph.nodes, ...graph.outcomes].some(n => n.id === x.nodeId) &&
    ['variants','flags','choices','entered','causalChoices'].every(k => strings(x[k])) &&
    ['minutes','ap','cost'].every(k => numeric(x[k])) && record(x.selected) && Object.values(x.selected as object).every(strings) &&
    record(x.attempts) && Object.values(x.attempts as object).every(numeric) &&
    (x.outcomeId === undefined || graph.outcomes.some(o => o.id === x.outcomeId));
}
