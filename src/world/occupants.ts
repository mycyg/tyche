import { awaitingBed } from '../game/cards';
import type { Card, Patient, Run } from '../game/types';
import { BED_PLACES, TEMPORARY_BEDS } from './scene';

type Place = Pick<typeof BED_PLACES[number], 'x' | 'y' | 'width' | 'height' | 'depth' | 'target'>;
export interface Occupant { patient: Patient; place: Place }

/** Rendering is a projection of current care, never a second bed allocation. */
export function worldOccupants(r: Run, encounters: Card[]): Occupant[] {
  const result: Occupant[] = [];
  for (const patient of r.patients.filter(p => p.active && p.inpatient)) {
    const place = BED_PLACES.find(b => b.bed === patient.bed);
    if (place) result.push({ patient, place });
  }
  const emergencies = new Set(encounters.filter(c => c.kind === 'night').map(c => c.patientId));
  for (const room of ['observation', 'er']) {
    const patients = r.patients.filter(p => room === 'observation'
      ? awaitingBed(r, p) : p.active && !p.inpatient && emergencies.has(p.uid));
    const places = TEMPORARY_BEDS.filter(b => b.room === room);
    patients.slice(0, places.length).forEach((patient, index) => {
      if (!result.some(o => o.patient.uid === patient.uid)) result.push({ patient, place: places[index] });
    });
  }
  return result;
}
