import type {Patient,Run}from './types';
import {getClinicalGraph}from '../content/clinical';

/** Hospital stays explicitly stated at first contact in the case source.
 * Symptom duration, postoperative day and a future outcome are not admission dates. */
export const CLINICAL_ENTRY_STAY:Readonly<Record<string,number>>={C004:5,C010:2,C012:3,C014:5,C020:9};
export function clinicalAdmissionDay(caseId:string,encounterDay:number):number {
  return encounterDay-(CLINICAL_ENTRY_STAY[caseId]??1)+1;
}

/** The funding group is not the patient's current location. Night calls may
 * concern an existing inpatient; a clinic patient is not admitted in advance. */
export function clinicalEntryLocation(caseId:string):'ward'|'observation'|'outpatient'|undefined {
  const graph=getClinicalGraph(caseId);if(!graph)return;
  if(graph.setting.startsWith('病区')||CLINICAL_ENTRY_STAY[caseId])return 'ward';
  return graph.setting.startsWith('门诊')?'outpatient':'observation';
}
export function underObservation(r:Pick<Run,'facts'>,p:Patient):boolean {
  return p.active&&!p.inpatient&&!!r.facts[`observation:${p.uid}`];
}
const ADMISSION_ACTIONS:Readonly<Record<string,Readonly<Record<string,string>>>>={
  C003:{s4_pci:'cathlab_activated',s4_ccu:'delayed_reperfusion',s4_ccu_no_cath:'delayed_reperfusion'},
  C005:{s4_admit_lmwh:'admitted',s4_admit_wait:'admitted'},
  C007:{s4_admit_ivig:'ivig_ordered'},C008:{s5_picu:'admitted'},
  C011:{s5_icu:'icu'},C013:{s5_admit:'delayed_transfer'},C019:{s5_admit:'admitted_by_risk'},
};
export function completedAdmissionChoice(p:Patient):string|undefined {
  if(!p.clinical||p.damage>=3)return;
  return Object.entries(ADMISSION_ACTIONS[p.caseId]??{}).find(([id,flag])=>p.clinical!.choices.includes(id)&&p.clinical!.flags.includes(flag))?.[0];
}
/** Repair recognizable generated entry-day dates only. Manual historical dates,
 * already paid bills and completed medical events are not rewritten. */
export function repairLegacyClinicalAdmission(r:Run):void {
  for(const p of r.patients) {
    const stay=CLINICAL_ENTRY_STAY[p.caseId];
    if(!stay||stay===1||p.preset)continue;
    const encounter=Number(p.uid.match(/^D(\d+)-C\d{3}-/)?.[1]);
    if(!Number.isInteger(encounter)||encounter<1||encounter>r.day||p.admitted!==encounter)continue;
    p.admitted=clinicalAdmissionDay(p.caseId,encounter);
    p.expectedDays+=stay-1;
  }
}
