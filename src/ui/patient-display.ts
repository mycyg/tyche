import { awaitingBed, patientCase } from '../game/cards';
import { clinicalDisposition } from '../game/clinical-disposition';
import {clinicalEntryLocation,underObservation}from '../game/clinical-admission';
import type { Patient, Run } from '../game/types';
import { clinicalTeamLabel } from '../content/events/clinical-ownership';

/** Location and elapsed time come from this encounter's committed records.
 * A released bed is not a new emergency visit, and later follow-up notes do
 * not extend a completed admission. Missing legacy dates stay unknown. */
export function patientDisplay(r: Pick<Run, 'day'|'journal'|'facts'|'authored'>, p: Patient) {
  const disposition = clinicalDisposition(p);
  const status = p.active ? p.damage >= 3 ? '遗体待移送' : p.inpatient ? '在院' : '就诊中'
    : p.damage >= 3 ? '死亡病例' : disposition.kind === 'transfer' ? '已转院'
    : disposition.kind === 'self-transfer' ? '自行离院'
    : p.dischargedDay !== undefined || disposition.kind === 'home' ? '已出院' : '已结束';
  const waiting = p.active && (awaitingBed(r as Run, p)||underObservation(r,p));
  const place = !p.active ? `${status} · 病历记录` : p.bed ? `${p.bed} 床`
    : waiting ? '留观区' : p.caseId === 'C020' ? '善后交接'
    : clinicalEntryLocation(p.caseId)==='outpatient'||patientCase(p).dipGroup.includes('门诊') ? '门诊诊位' : '急诊诊位';
  let lastDay: number | undefined = p.active ? r.day : p.dischargedDay;
  if (!p.active && lastDay === undefined && p.clinical?.outcomeId) {
    const lastChoice = p.clinical.choices.at(-1);
    const notes = r.journal.filter(e => e.scope.kind === 'patient' && e.scope.id === p.uid);
    const completed = lastChoice ? notes.find(e => e.clinicalChoice === lastChoice ||
      e.id.startsWith(`${p.uid}:graph:${lastChoice}:`) && /^\d+$/.test(e.id.slice(`${p.uid}:graph:${lastChoice}:`.length))) : undefined;
    lastDay = completed?.day;
  }
  const stay = lastDay === undefined ? undefined : Math.max(1, lastDay - p.admitted + 1);
  const hadAdmission=p.inpatient||clinicalEntryLocation(p.caseId)==='ward'||!!r.facts[`clinical-admission:${p.uid}`];
  const care = hadAdmission ? '住院' : waiting||clinicalEntryLocation(p.caseId)==='observation' ? '留观' : '就诊';
  return { status, place, stay, care, lastDay, team:clinicalTeamLabel(r,p),
    duration: stay === undefined ? '结束日期未登记' : p.active ? `${care}第 ${stay} 天` : `本次${care} ${stay} 天` };
}
