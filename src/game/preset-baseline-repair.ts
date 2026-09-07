import {ENTITY_BY_ID,PRESET_BY_ID,instantiatePreset} from '../content/patients';
import type {Run} from './types';

/** Earlier presentation formatting mistook measured mmol/L for a prescription
 * amount, leaving e.g. “Na /L”. Repair only this recognizable loss of baseline
 * evidence. Saved choices, acquired reports, dice, bills and results are history. */
export function repairLegacyPresetBaselines(r:Run):void {
 for(const p of r.patients){
  const saved=p.preset,source=saved&&PRESET_BY_ID.get(saved.id),entity=saved&&(saved.entityProfile??ENTITY_BY_ID.get(saved.entityId));
  if(!saved||!source||!entity||!/(?:^|[\s,，；;：:<>=≤≥])\/(?:d?L)\b/i.test(saved.complaint))continue;
  if(!/\d+(?:\.\d+)?\s*(?:mmol|[μµu]mol|mg|g|I?U)\/(?:d?L)\b/i.test(source.presentation))continue;
  let restored:string;
  try{restored=instantiatePreset(source,entity,p.uid,saved.period).complaint;}catch{continue;}
  const damaged=saved.complaint;if(restored===damaged)continue;
  saved.complaint=restored;
  // Replace only the old complaint substring; retain encounter dialogue,
  // already shown talent hints and later text on the surrounding scene.
  for(const scene of saved.steps)if(scene.text.includes(damaged))scene.text=scene.text.replace(damaged,restored);
  for(const card of r.queue)if(card.patientId===p.uid&&card.text.includes(damaged))card.text=card.text.replace(damaged,restored);
 }
}
