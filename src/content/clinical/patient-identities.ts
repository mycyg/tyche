import presenceA from '../../patient-presence-a.json';
import presenceB from '../../patient-presence-b.json';
import {CLINICAL_IDENTITIES} from './identity';
import type {Patient} from '../../game/types';

/** Separate named chart identities, not aliases for the 11-library P entities.
 * A later generated person with the same case graph has a different identity.
 * C019 is the mother's chart; the other two family members stay in its presentation. */
export const CLINICAL_PATIENTS=[...presenceA,...presenceB].map(p=>({
 id:`CP-${p.caseId}`,caseId:p.caseId,name:p.name,...CLINICAL_IDENTITIES[p.caseId],
 source:{identity:p.caseId<='C010'?'patient-presence-a.json':'patient-presence-b.json',presentation:`04_病例库/${p.caseId}`},
}));
export const CLINICAL_PATIENT_BY_ID=new Map(CLINICAL_PATIENTS.map(p=>[p.id,p]));
export function fixedClinicalPatientId(patient:Pick<Patient,'caseId'|'name'|'entityId'|'preset'>):string|undefined {
 if(patient.entityId||patient.preset)return;
 return CLINICAL_PATIENTS.find(p=>p.caseId===patient.caseId&&p.name===patient.name)?.id;
}
