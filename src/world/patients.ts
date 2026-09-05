import a from '../patient-presence-a.json';
import b from '../patient-presence-b.json';
export const PATIENT_PRESENCE = [...a, ...b];
export function patientPresence(caseId: string) { return PATIENT_PRESENCE.find(p => p.caseId === caseId); }
export function patientArtIndex(caseId: string) { return Math.max(0, Number(caseId.slice(1)) - 1); }
