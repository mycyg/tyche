import type { Patient, Run } from '../../game/types';

/** Source 12 C-001/C-142 explicitly hide alcohol/ketone breath observations. C-068's alcohol
 * smell is already in admission prose; C-179 explicitly prohibits guessing an
 * exposure from smell. Neither creates a new T03 revelation. */
export const PRESET_SCENTS = {
  'C-001': {kind:'alcohol' as const,text:'近距离交谈时，能闻到患者呼气里的酒气。饮酒量、时间和用药仍需核对。',knownSuffix:'probe-2-passed'},
  'C-142': {kind:'ketone' as const,text:'患者呼气中有酮味。仍需结合血糖、血气与血酮等实际检查评估。',knownSuffix:'probe-2-passed'},
};
export function unrevealedPresetScent(r:Run,p:Patient) {
  if(!p.preset)return;
  const spec=PRESET_SCENTS[p.caseId as keyof typeof PRESET_SCENTS];if(!spec)return;
  const prefix=`preset:${p.caseId}:${p.uid}`;
  if(r.talentMemory?.smelledPatients.includes(p.uid)||r.facts[`${prefix}:scent-known`]||r.facts[`${prefix}:${spec.knownSuffix}`]||r.facts[`${prefix}:revealed`])return;
  // Older saves may retain the journal but not the corresponding fact cache.
  if(r.journal.some(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&e.flags.some(f=>[`${prefix}:scent-known`,`${prefix}:${spec.knownSuffix}`,`${prefix}:revealed`].includes(f))))return;
  return {...spec,flags:[`${prefix}:scent-known`,`${prefix}:key-fact-known`,`${prefix}:${spec.knownSuffix}`]};
}
