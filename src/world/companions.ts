import { ENTITY_BY_ID } from '../content/patients';
import type { Patient } from '../game/types';
import { patientBody, patientPresence } from './patients';

export interface CompanionProfile {
  role: string;
  sex: '男' | '女' | 'unknown';
  ageGroup: 'young' | 'adult' | 'older';
  outside: boolean;
}

/** Read the actual accompaniment saved with this patient. A telephone contact
 * is not a visitor, and a case's possible variants do not establish presence. */
export function patientCompanions(patient: Patient): CompanionProfile[] {
  const entity = patient.preset?.entityProfile ?? ENTITY_BY_ID.get(patient.entityId ?? patient.preset?.entityId ?? '');
  const presence = !patient.preset && !entity ? patientPresence(patient.caseId) : undefined;
  const role = patient.preset?.companion ?? entity?.companion ?? presence?.familyRole ?? '';
  if (!role || /^(无|本人|患者|患儿)$|电话|远程|不在场/.test(role)) return [];
  const description = presence?.appearance ?? entity?.flagDescription ?? '';
  const patientAge = patientBody(patient).age;
  const roles = role === '父母' ? ['母亲', '父亲'] : role === '母亲与母亲的男友' ? ['母亲', '母亲的男友'] : [role];
  return roles.map(role => {
    const female = /母亲|祖母|外婆|奶奶|女儿|妻子|姐姐|妹妹/.test(role) && !role.includes('男友');
    const male = /父亲|祖父|外公|爷爷|儿子|丈夫|男友|哥哥|弟弟/.test(role);
    const sex = female ? '女' : male ? '男' : 'unknown';
    let ageGroup: CompanionProfile['ageGroup'] = 'adult';
    // These are art age bands, not invented ages added to the medical record.
    if (/祖辈|祖母|祖父|外公|外婆|年长|老年/.test(role + description)) ageGroup = 'older';
    else if (/父亲|母亲/.test(role) && patientAge !== undefined && patientAge >= 38) ageGroup = 'older';
    else if (/配偶|妻子|丈夫/.test(role) && patientAge !== undefined && patientAge >= 65) ageGroup = 'older';
    else if (/孙辈|同学/.test(role) && patientAge !== undefined && (role === '孙辈' && patientAge < 85 || role === '同学' && patientAge < 18)) ageGroup = 'young';
    if (/年轻|中年/.test(description)) ageGroup = 'adult';
    return { role, sex, ageGroup, outside: /门外/.test(description) };
  });
}

/** A listed contact is not a permanent bedside visitor. Reserve scenic
 * attendance for a dependent patient or a stated professional caregiver. */
export function companionCarePriority(patient: Patient): number {
  const profiles = patientCompanions(patient);
  if (!profiles.length) return 0;
  const age = patientBody(patient).age;
  if (age !== undefined && age < 13) return 80;
  const entity = patient.preset?.entityProfile ?? ENTITY_BY_ID.get(patient.entityId ?? patient.preset?.entityId ?? '');
  const presence = !patient.preset && !entity ? patientPresence(patient.caseId) : undefined;
  const context = `${entity?.occupation ?? ''} ${entity?.flags.join(' ') ?? ''} ${entity?.flagDescription ?? ''} ${presence?.appearance ?? ''}`;
  if (/长期卧床|生活不能自理|认知障碍|轮椅|搀扶/.test(context)) return 70;
  if (profiles.some(p => /护工|照护员/.test(p.role))) return 60;
  return 0;
}
