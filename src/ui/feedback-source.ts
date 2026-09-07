import type {Run}from '../game/types';
import {patientCase}from '../game/cards';
import {clinicalVoiceActor}from './clinical-voice';
import {butterflyResultVoiceActor}from '../content/events/butterfly-cast';

/** The speaker belongs to the submitted encounter, not to the open map hotspot.
 * Acute interruptions and their resumed result each retain their own source. */
export function feedbackSource(r:Run) {
  if(!r.feedback)return undefined;
  if(r.feedback.sourceCardId)return r.queue.find(card=>card.id===r.feedback!.sourceCardId);
  // Legacy saves have no source id. Only exact committed text/choice evidence
  // may recover the portrait; otherwise display neutral narration.
  const entry=[...r.journal].reverse().find(entry=>entry.title===r.feedback!.title&&entry.result===r.feedback!.text);
  return entry?r.queue.find(card=>card.options.some(option=>option.id===entry.id)):undefined;
}

export function feedbackVoiceActor(r:Run):string|undefined {
 const card=feedbackSource(r),patient=r.patients.find(p=>p.uid===card?.patientId);
 const entry=[...r.journal].reverse().find(e=>e.title===r.feedback?.title&&e.result===r.feedback?.text);
 if(card&&'butterfly'in card&&entry)return butterflyResultVoiceActor(entry.id);
 if(!card?.clinicalGraph||!patient)return;
 // A combined multi-select result has no single speaker unless its prose names one.
 if(!entry?.clinicalChoice)return'narrator';
 return clinicalVoiceActor(patient.caseId,patientCase(patient).sex,entry.clinicalChoice);
}
