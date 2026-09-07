import a from '../patient-presence-a.json';
import b from '../patient-presence-b.json';
import { ENTITY_BY_ID } from '../content/patients';
import type { Patient } from '../game/types';
import { CLINICAL_IDENTITIES } from '../content/clinical/identity';
export const PATIENT_PRESENCE = [...a, ...b];
export function patientPresence(caseId: string) { return PATIENT_PRESENCE.find(p => p.caseId === caseId); }
export function patientArtIndex(caseId: string) { return /^C0(?:0[1-9]|1[0-9]|20)$/.test(caseId)?Number(caseId.slice(1))-1:0; }
export interface PatientArt {index:number;atlas:'original'|'extended';columns:5|4;rows:4|2}
export type PatientArtIdentity=Pick<Patient,'caseId'|'entityId'|'preset'>;
const original=(index:number):PatientArt=>({index,atlas:'original',columns:5,rows:4});
const extended=(index:number):PatientArt=>({index,atlas:'extended',columns:4,rows:2});
// Physical identities depicted in the original atlas, independent of case IDs.
const adultPortraits={男:[{index:15,age:31},{index:1,age:48},{index:12,age:52},{index:5,age:54},{index:14,age:58},{index:8,age:63},{index:16,age:63},{index:2,age:67},{index:11,age:76}],女:[{index:10,age:24},{index:4,age:32},{index:18,age:36},{index:17,age:39},{index:9,age:59},{index:3,age:71}]};
export function patientArt(patient:PatientArtIdentity):PatientArt {
  const fixed=CLINICAL_IDENTITIES[patient.caseId];
  const entity=patient.preset?.entityProfile??ENTITY_BY_ID.get(patient.entityId??patient.preset?.entityId??'');
  const age=fixed?.age??patient.preset?.age??entity?.ageYears,sex=fixed?.sex??patient.preset?.sex??entity?.sex;
  if(age===undefined||!Number.isFinite(age)||age<0||sex!=='男'&&sex!=='女')return original(15);
  // Only an established pregnancy flag changes the body silhouette. Lactation,
  // a possible pregnancy or the gynaecology department alone does not.
  if(sex==='女'&&(fixed?.pregnant||entity?.flags.includes('孕晚期')))return extended(age>=38?7:6);
  if(age<1)return extended(sex==='男'?0:1);
  if(age<6)return original(sex==='男'?0:6);
  if(age<13)return extended(sex==='男'?2:4);
  if(age<18)return extended(sex==='男'?3:5);
  const pool=adultPortraits[sex],distance=Math.min(...pool.map(p=>Math.abs(p.age-age))),matches=pool.filter(p=>Math.abs(p.age-age)===distance);
  const identity=entity?.id??patient.entityId??patient.caseId;
  const variation=[...identity].reduce((sum,c)=>sum+c.charCodeAt(0),0)%matches.length;
  return original(matches[variation].index);
}
export function patientArtFile(art:PatientArt,kind:'portrait'|'bedside'|'world'):string {
  // A portrait must not invent a parent or guardian. The infant bedside
  // silhouettes depict the baby alone, unlike the paired adult portrait cells.
  if(art.atlas==='extended'&&art.index<2&&kind==='portrait')return 'extended-bedside.webp';
  return art.atlas==='extended'?({portrait:'extended-portraits.webp',bedside:'extended-bedside.webp',world:'extended-bed-patients.webp'} as const)[kind]:({portrait:'patient-portraits.webp',bedside:'bedside-patients.webp',world:'bed-patients.webp'} as const)[kind];
}
