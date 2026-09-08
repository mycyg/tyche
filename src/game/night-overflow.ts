import type {Card,Option,Run} from './types';
import {RULES} from './rules';
import {PRESET_BY_ID} from '../content/patients';
import {CASES} from './catalog';
import {runRandom} from './run-random';
import {authoredRefusalRiskBonus} from './director';
import {isNewNightClinicalIncident} from '../content/events/night-incidents';

export function nightTelephoneId(card:Card):string{return `${card.id}:night-telephone`;}
/** The limit applies to a newly arriving emergency, not a patient whose
 * assessment is already in progress. Reading a chart is not a bedside visit. */
export function nightTelephoneRequired(r:Run,card:Card):boolean {
  if(card.kind!=='night'||!card.patientId||r.nightMinutes>0||'patientGate'in card)return false;
  if(card.clinicalGraph?.caseId==='C020')return false;
  if('authoredEventId'in card)return isNewNightClinicalIncident(card,r);
  // A night-time conversation or allocation dilemma has its own options. It
  // is not a newly arriving emergency merely because it names a patient.
  if('trolley'in card||'butterfly'in card)return false;
  if(!card.clinicalGraph&&!card.presetNode&&!card.caseId)return false;
  return !r.facts[`night-started:${card.patientId}`];
}
export function nightTelephoneOption(card:Card):Option {
  const incident='authoredEventId'in card&&card.authoredEventId==='E-012';
  return {id:nightTelephoneId(card),label:'电话交代当前情况，请二线到场接手',ap:0,cost:0,minutes:RULES.nightTelephone.minutes,
    result:'夜班时间已经用尽，你先通过电话交代情况，请二线到场协助。此时还没有完成床旁评估或整体交班签收，未完成事项仍在你的清单中；这次响应延误保留在接诊记录里。',
    hint:'没有完成查体、检查或治疗，不计为正常接诊绩效。',mechanics:{operation:'other',quality:'incorrect'},
    effects:{hazards:[{type:'R',weight:RULES.nightTelephone.risk,reason:incident?'夜班预算耗尽，患者跌倒后仅获电话处置，床旁评估延误':'夜班预算耗尽，新到急诊仅获电话处置，床旁评估延误',norm:'急诊接诊与交接应及时完成，电话交代不能替代必要的床旁评估',causal:false}]}};
}
export function nightTelephoneDeteriorates(r:Run,card:Card):boolean {
  const p=r.patients.find(p=>p.uid===card.patientId);if(!p)return false;
  const incident=isNewNightClinicalIncident(card,r);
  const hidden=incident||(PRESET_BY_ID.get(p.caseId)?.hasHidden??CASES.find(c=>c.id===p.caseId)?.critical??false);
  const key=incident?`night-telephone-incident:${card.id}`:`night-telephone-course:${p.uid}`;
  return hidden&&runRandom(r,key)<Math.min(1,RULES.nightTelephone.seedChance+(incident?0:authoredRefusalRiskBonus(r,p.uid)));
}
