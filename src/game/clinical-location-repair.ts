import {clinicalDisposition} from './clinical-disposition';
import type {Run} from './types';

/** Repair only obsolete bed occupancy after a source-proven terminal departure.
 * Queue/cursor and medical or monetary history remain intact. A stale ward card
 * can then use the engine's zero-cost closed-bed handoff instead of disappearing
 * underneath an active play/roll transaction. */
export function repairLegacyClinicalLocations(r:Run):void {
 for(const p of r.patients){
  const disposition=clinicalDisposition(p);
  if(!['transfer','self-transfer','home'].includes(disposition.kind))continue;
  p.active=false;p.inpatient=false;p.bed=0;
  delete r.facts[`awaiting-bed:${p.uid}`];
  delete r.facts[`observation:${p.uid}`];
  // No legacy dischargedDay: the authored graph already owns its outcome and
  // follow-up. Adding it would schedule a second, unrelated readmission roll.
 }
}
