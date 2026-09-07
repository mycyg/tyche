import { awaitingBed } from '../game/cards';
import {underObservation}from '../game/clinical-admission';
import type { Card, Patient, Run } from '../game/types';
import { BED_PLACES, TEMPORARY_BEDS, CORRIDOR_BED_PLACE } from './scene';
import {ROOMS}from './layout';

type Place = Pick<typeof BED_PLACES[number], 'x' | 'y' | 'width' | 'height' | 'depth' | 'target'>;
export interface Occupant { patient: Patient; place: Place }
export interface WaitingPatients {id:string;room:'observation'|'er';label:string;patients:Patient[];place:Place;}
export function temporaryPatients(r:Run,encounters:Card[],room:'observation'|'er'):Patient[]{
  const emergencies=new Set(encounters.filter(c=>c.kind==='night').map(c=>c.patientId));
  return r.patients.filter(p=>p.active&&!p.inpatient&&hasArrived(r,p,encounters)&&(room==='er'?emergencies.has(p.uid):!emergencies.has(p.uid)&&(awaitingBed(r,p)||underObservation(r,p))));
}
/** Night encounters are planned before the shift, but have not yet arrived.
 * A pre-existing ward patient (including C020) remains in their actual bed. */
function hasArrived(r:Run,p:Patient,encounters:Card[]):boolean{
  const dueTonight=p.uid.startsWith(`D${r.day}-`)&&/-night\d+$/.test(p.uid)&&p.admitted>=r.day;
  return !dueTonight||encounters.some(c=>c.patientId===p.uid)||!!r.facts[`night-started:${p.uid}`]
    ||!!r.talentMemory?.firstContacts.includes(p.uid)||!!p.clinical?.choices.length;
}
const hasCorridorPlacement=(r:Run,p:Patient)=>p.active&&p.inpatient&&p.bed===17&&(
  !!r.facts[`corridor-bed:${p.uid}`]||r.authored?.legacyBedNumbers?.some(entry=>entry.patientId===p.uid&&entry.bed===17&&entry.source==='schema-1-before-authored')
);
export const corridorBedInUse=(r:Run)=>r.patients.some(p=>hasCorridorPlacement(r,p));
export function patientWorldBed(r:Run,p:Patient) {
  return p.bed===17
    ? hasCorridorPlacement(r,p)?CORRIDOR_BED_PLACE:undefined
    : BED_PLACES.find(b=>b.bed===p.bed);
}

/** Rendering is a projection of current care, never a second bed allocation. */
export function worldOccupants(r: Run, encounters: Card[]): Occupant[] {
  const result: Occupant[] = [];
  for (const patient of r.patients.filter(p => p.active && p.inpatient && hasArrived(r,p,encounters))) {
    const place = patientWorldBed(r,patient);
    if (place) result.push({ patient, place });
  }
  for (const room of ['observation', 'er'] as const) {
    const patients = temporaryPatients(r,encounters,room);
    const places = TEMPORARY_BEDS.filter(b => b.room === room);
    patients.slice(0, places.length).forEach((patient, index) => {
      if (!result.some(o => o.patient.uid === patient.uid)) result.push({ patient, place: places[index] });
    });
  }
  return result;
}

/** A full treatment bay has an explicit waiting roster. Overflow never shares
 * one painted mattress or vanishes from the map's interaction targets. */
export function worldWaitingPatients(r:Run,encounters:Card[]):WaitingPatients[]{
  return(['observation','er']as const).flatMap(room=>{
    const places=TEMPORARY_BEDS.filter(p=>p.room===room),patients=temporaryPatients(r,encounters,room).slice(places.length);
    if(!patients.length)return[];
    const layout=ROOMS.find(p=>p.id===room)!;
    const target={x:layout.target.x+132,y:460};
    return[{id:`waiting:${room}`,room,label:room==='er'?'急救室待接诊':'留观候床',patients,place:{x:target.x-45,y:target.y-49,width:90,height:44,depth:target.y,target}}];
  });
}
