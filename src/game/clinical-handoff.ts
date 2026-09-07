import type {Card,Patient,Run}from './types';

export interface ClinicalHandoff {
  patientId:string;day:number;source:string;commitmentId:string;
  recipient:'li'|'cover-doctor';scope:'remaining-care'|'ward-review';
}

/** A signed transfer of today's work is not a diagnosis or a test result. */
export function currentClinicalHandoff(r:Pick<Run,'authored'|'day'>,p:Pick<Patient,'uid'>):ClinicalHandoff|undefined{
  return r.authored?.clinicalHandoffs?.find(h=>h.patientId===p.uid&&h.day===r.day);
}
export function isDirectPatientCare(card:Card):boolean{
  return ['clinical','quick','night','ward'].includes(card.kind)&&
    !['authoredEventId','sourceFollowup','butterfly','trolley','butterflyCommitment','butterflyMerge'].some(key=>key in card);
}
export function handoffLabel(h:ClinicalHandoff):string{
  return h.recipient==='li'?'李恂接管今日诊疗':'接班医生接管今日诊疗';
}
