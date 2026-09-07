import type {Card,Run}from '../../game/types';

/** 13/01 E012 is a new fall, independently timed even for an existing inpatient.
 * E014 is discovery of an earlier departure; E165 is ongoing drug approval.
 * Neither is a newly arrived clinical emergency. Personal collapse E197–204 is
 * the clinician's own acute event, not a new patient's emergency. */
export const NEW_NIGHT_CLINICAL_EVENT_IDS=['E-012']as const;
export function isNewNightClinicalIncident(card:Card,r:Run):boolean{
  const source=(card as Card&{authoredEventId?:string}).authoredEventId;
  return source==='E-012'&&(card.shiftPhase==='夜班'||card.kind==='night')&&!!card.patientId&&
    r.patients.some(p=>p.uid===card.patientId)&&!r.facts[`night-incident-started:${card.id}`];
}
/** Use the encounter ID, not first-ever contact with this patient. */
export const nightClinicalIncidentKey=(card:Card)=>`night-incident-started:${card.id}`;
