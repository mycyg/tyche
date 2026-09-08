import { ENTITY_BY_ID, PRESET_BY_ID } from '../content/patients';
import { entityScenario } from '../content/patients/scenarios';
import { RULES } from '../game/rules';
import type { Patient, Run } from '../game/types';
import { patientBody } from './patients';

/** Scenic walking is opt-in. These authored scenarios have no requirement for
 * immobility, an escort or acute monitoring once the daily review is complete.
 * Other cases keep their bedside representation until a specific mobility
 * state is authored; a low damage counter is never permission to walk. */
const WALKING_CASES = new Set([
  'C-002', 'C-008', 'C-009', 'C-010', 'C-011', 'C-028', 'C-029',
  'C-047', 'C-048', 'C-052', 'C-059', 'C-062', 'C-074', 'C-075',
  'C-093', 'C-094', 'C-125', 'C-129', 'C-131', 'C-193', 'C-195', 'C-208',
]);

export function patientCanWalk(r: Pick<Run, 'day'>, patient: Patient): boolean {
  if (!patient.active || !patient.inpatient || patient.damage !== 0
    || !Number.isFinite(patient.stability) || patient.stability < RULES.ward.stabilityNeed
    || patient.caredDay !== r.day || !patient.settled) return false;
  const body = patientBody(patient);
  // The available routes are unaccompanied. Children and patients requiring
  // assistance need an authored escorted route before using those sprites.
  if (body.age === undefined || body.age < 18 || body.sex === undefined || body.pregnant) return false;
  const preset = PRESET_BY_ID.get(patient.caseId);
  if (!preset || !WALKING_CASES.has(preset.id) || preset.severity > 1 || patient.preset?.critical) return false;
  if (patient.clinical && !patient.clinical.outcomeId
    || patient.presetNode && !patient.presetResolved) return false;
  const entity = patient.preset?.entityProfile ?? ENTITY_BY_ID.get(patient.entityId ?? patient.preset?.entityId ?? '');
  const contexts = [...preset.constraints.scenario.context, ...(entity ? entityScenario(entity).context : [])];
  if (contexts.includes('long-term-bedridden') || contexts.includes('nasogastric-feeding')) return false;
  if (entity?.flags.some(flag => ['认知障碍', '被押送'].includes(flag))) return false;
  return true;
}
