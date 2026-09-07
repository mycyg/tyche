import type {Patient,Run}from './types';

/** An existing inpatient profile is not an unstarted acute-care graph. The
 * admission ledger and any graph actually opened must both be complete. */
export function patientAssessmentComplete(p:Pick<Patient,'settled'|'clinical'|'presetNode'|'presetResolved'>):boolean{
 return p.settled&&(!p.clinical||!!p.clinical.outcomeId)&&(!p.presetNode||!!p.presetResolved);
}

/** A request, a failed negotiation or an inactive bed alone is not a transfer
 * receipt. Preserve the unfinished source chart after an actual transfer. */
export function confirmedLocalCareTransfer(r:Pick<Run,'day'|'facts'|'committed'>,p:Patient):boolean{
 const receipt=r.facts[`local-care-transferred:${p.uid}`];
 return !!receipt&&receipt.day===r.day&&r.committed.includes(receipt.source)&&!p.active&&!p.inpatient&&p.bed===0;
}
