import type { Meta, Run } from './types';
import {fixedClinicalPatientId} from '../content/clinical/patient-identities';

/** Collection credit follows actual contact, never a generated bed or a queued
 * event. Settled cases retain compatibility with completed older save files. */
export function encounteredCollections(r:Pick<Run,'patients'|'journal'|'talentMemory'>):{patientIds:string[];cases:string[];entities:string[];clinicalPatients:string[]} {
  const touched=new Set(r.talentMemory?.firstContacts??[]);
  for(const entry of r.journal) {
    if(entry.scope.kind!=='patient')continue;
    if(entry.operation||entry.clinicalChoice||entry.talentAction||entry.id.startsWith(`contact:${entry.scope.id}:`))touched.add(entry.scope.id);
  }
  const patients=r.patients.filter(p=>{
    // Initial census and handover patients may have been treated by a previous
    // shift. That is not proof that this player met them. Only legacy saves
    // without contact tracking use a settled non-handover encounter as evidence.
    const legacySettled=!r.talentMemory&&p.settled&&!/-(?:census|handover)\d+$/.test(p.uid);
    return touched.has(p.uid)||legacySettled||!!p.clinical?.choices.length;
  });
  return {
    patientIds:[...new Set(patients.map(p=>p.uid))],
    cases:[...new Set(patients.map(p=>p.caseId))],
    entities:[...new Set(patients.flatMap(p=>p.entityId?[p.entityId]:[]))],
    clinicalPatients:[...new Set(patients.flatMap(p=>{const id=fixedClinicalPatientId(p);return id?[id]:[];}))],
  };
}

/** A collected case title is not identity evidence. Recover only a rewarded
 * retained run's actual contact with the exact named chart patient. No XP grant. */
export function recoverClinicalPatientCollection(meta:Meta,run:Run|null):void {
  if(!run||!run.ending||!meta.rewarded.includes(run.id))return;
  const found=encounteredCollections(run).clinicalPatients;
  if(found.length)meta.clinicalPatients=[...new Set([...(meta.clinicalPatients??[]),...found])];
}
