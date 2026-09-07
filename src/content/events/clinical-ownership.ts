import type {Patient,Run} from '../../game/types';
import {currentClinicalHandoff,handoffLabel}from '../../game/clinical-handoff';

export interface ClinicalAssignment {
 patientId:string;owner:'chief'|'peer';day:number;source:'E-043'|'E-053';
 teamCharged:number;cover?:{day:number;source:string};
}
export interface FamilyRegistration {parentId:string;patientId:string;day:number;source:string;relation:'son'}
export function clinicalAssignment(r:Pick<Run,'authored'>,p:Pick<Patient,'uid'>){return r.authored?.clinicalAssignments?.find(a=>a.patientId===p.uid);}
export function isPlayerResponsibleForPatient(r:Pick<Run,'authored'|'day'>,p:Pick<Patient,'uid'>):boolean{
 if(currentClinicalHandoff(r,p))return false;
 const a=clinicalAssignment(r,p);return !a||a.cover?.day===r.day;
}
export function clinicalTeamLabel(r:Pick<Run,'authored'|'day'>,p:Pick<Patient,'uid'>):string{
 const handoff=currentClinicalHandoff(r,p);if(handoff)return handoffLabel(handoff);
 const a=clinicalAssignment(r,p);return !a?'你负责':a.cover?.day===r.day?'同事组 · 今日由你接管':a.owner==='chief'?'主任组':'同事组';
}
/** Team payments never become the player's old debt when cover starts. */
export function playerBillableLiability(r:Pick<Run,'authored'>,p:Patient,total:number):number{
 return Math.max(0,total-(clinicalAssignment(r,p)?.teamCharged??0));
}
/** Budget corrections refund the payer who actually paid first; never mint a
 * player refund out of another team's contribution. */
export function reconcileTeamCharge(r:Pick<Run,'authored'>,p:Patient,total:number):void{
 const a=clinicalAssignment(r,p);if(a)a.teamCharged=Math.min(a.teamCharged,Math.max(0,total));
}
