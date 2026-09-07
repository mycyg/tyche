import type {Patient,Run} from '../game/types';
import type {Occupant} from './occupants';
import {clinicalAssignment,clinicalTeamLabel,isPlayerResponsibleForPatient} from '../content/events/clinical-ownership';
export function patientPlacard(r:Pick<Run,'day'>&Partial<Pick<Run,'journal'|'authored'>>,patient:Patient):{name:string;status:string} {
 const place=patient.inpatient?`${patient.bed} 床`:'留观';
 if(clinicalAssignment(r,patient)&&!isPlayerResponsibleForPatient(r,patient))return {name:patient.name,status:`${place} · ${clinicalTeamLabel(r,patient)}`};
 const deferred=r.journal?.some(e=>e.day===r.day&&e.scope.kind==='patient'&&e.scope.id===patient.uid&&e.id===`ward:${patient.uid}:${r.day}:wait`);
 const state=patient.caseId==='C020'&&patient.damage===3&&!patient.clinical?.flags.includes('body_transferred')&&!patient.clinical?.outcomeId?'遗体待移送':patient.damage===3||patient.caseId==='C020'?'死亡记录核查':patient.caredDay===r.day?'今日已巡视':deferred?'本班暂未复核':'待巡视';
 return {name:patient.name,status:`${place} · ${state}`};
}
export function placardPosition(place:Occupant['place'],camera:{x:number;y:number;scale:number},viewport:{width:number;height:number}) {
 const x=(place.x+place.width/2-camera.x)*camera.scale,y=(place.y+place.height+5-camera.y)*camera.scale;
 const width=Math.max(84,Math.min(124,90*camera.scale));
 return {x,y,width,visible:x>=width/2&&x<=viewport.width-width/2&&y>=0&&y+44<=viewport.height};
}
