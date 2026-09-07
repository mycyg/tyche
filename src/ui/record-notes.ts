import { patientCase } from '../game/cards';
import { fullGraph, visibleClinicalReports } from '../game/clinical';
import { authoredPatientReports } from '../content/events/critical-values';
import type { Entry, Option, Patient, Run } from '../game/types';

export type NoteCategory = 'history' | 'examination' | 'treatment';
type RecordedAction = Pick<Entry, 'operation' | 'talentAction'>;

/** Source presentation is already known at arrival. Do not replace this with
 * unlockable graph reports, hidden preset facts, or later clinical outcomes. */
export function patientBaseline(p: Patient) {
  const clinical = patientCase(p);
  return { history: clinical?.history ?? [], observations: clinical?.findings ?? [] };
}

/** A laboratory phone notification has its own patient and collection day.
 * It must not replace a graph's earlier specimen or unlock an unperformed test. */
export function patientReports(r:Run,p:Patient) {
  return [...visibleClinicalReports(r,p),...authoredPatientReports(r,p).map(report=>({...report,skimmed:report.full,skimmedNow:false}))];
}

/** These encounter IDs are produced only by buildDay's previous-shift handover.
 * The summary records that source; it does not manufacture current lab values
 * or grant credit for unperformed player actions. */
export function priorShiftHandover(p:Pick<Patient,'uid'>):string|undefined {
  if(/-census\d+$/.test(p.uid))return '原班交接：急性期处置已完成，接下来继续观察并评估恢复情况。具体已执行医嘱与复查结果未随交接转入本页；不能据此认定化验已恢复正常。';
  if(/-handover\d+$/.test(p.uid))return '接收交班：患者已接受初步处置，后续观察由本班跟进。具体已执行医嘱与复查结果需要核实，不把口头交接当作新的检查报告。';
}

/** New saves carry the action metadata at commitment. For older saves, resolve
 * exact authored IDs; an unknown note is never promoted to a test result by its
 * label, step number, or a later action from another patient. */
function recordedAction(r: Run, p: Patient, entry: Entry): RecordedAction {
  if (entry.operation || entry.talentAction) return entry;
  const options = [...r.queue.filter(c => c.patientId === p.uid).flatMap(c => c.options),
    ...(patientCase(p)?.steps.flatMap(s => s.options) ?? [])];
  let option: Option | undefined = options.find(o => o.id === entry.id || `${p.uid}:${o.id}` === entry.id);
  if (!option && p.clinical) {
    const prefix = `${p.uid}:graph:`;
    if (entry.id.startsWith(prefix)) {
      const key = entry.id.slice(prefix.length);
      option = fullGraph(p.caseId)?.nodes.flatMap(n => n.options).find(o =>
        key.startsWith(`${o.id}:`) && /^\d+$/.test(key.slice(o.id.length + 1)));
    }
  }
  if (option) return { operation: option.mechanics?.operation, talentAction: option.talentAction };
  // These stable ability identifiers describe a source, not a completed test.
  if (entry.id.endsWith(':ability:chart-review')) return { talentAction: 'chart-review' };
  if (entry.id.endsWith(':ability:full-review')) return { talentAction: 'full-review' };
  return {};
}

export function patientNoteCategory(r: Run, p: Patient, entry: Entry): NoteCategory {
  if (entry.scope.kind !== 'patient' || entry.scope.id !== p.uid) return 'treatment';
  const action = recordedAction(r, p, entry);
  if (action.talentAction === 'chart-review' || action.operation === 'history') return 'history';
  if (action.talentAction === 'full-review' || ['observe', 'exam', 'full-exam'].includes(action.operation ?? '')) return 'examination';
  return 'treatment';
}

export function patientNotes(r: Run, p: Patient) {
  const notes: Record<NoteCategory, Entry[]> = { history: [], examination: [], treatment: [] };
  for (const entry of r.journal) if (entry.scope.kind === 'patient' && entry.scope.id === p.uid) notes[patientNoteCategory(r, p, entry)].push(entry);
  return notes;
}
