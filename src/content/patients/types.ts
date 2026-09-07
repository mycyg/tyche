import type { ClinicalCase, HazardInput, Scene } from '../../game/types';
import type { PresetScenario } from './scenarios';

export type PatientPeriod = '门诊' | '病区' | '夜班';
export type PatientCategory = '呼吸' | '心血管' | '消化' | '内分泌' | '肾' | '神经' | '外科' | '儿科' | '妇产' | '中毒' | '创伤' | '精神' | '感染' | '血液';
export interface PatientEntity {
  id: string; name: string; age: string; ageYears: number; sex: '男' | '女';
  occupation: string; companion: string; payment: string; personality: string;
  concealment: number; concealedFact: string; complaintTendency: number;
  adherence: '低' | '中' | '高'; dialogue: string; categories: PatientCategory[];
  periods: PatientPeriod[]; flags: string[]; flagDescription: string;
  portraitArchetype: 'infant' | 'child-boy' | 'child-girl' | 'young-man' | 'young-woman' | 'adult-man' | 'adult-woman' | 'elder-man' | 'elder-woman';
  transferred: boolean; source: string; original: boolean;
}
export interface PresetConstraints {
  ageMin: number; ageMax: number; sex: '男' | '女' | '不限';
  categories: PatientCategory[]; periods: PatientPeriod[];
  requiredFlags: string[]; forbiddenFlags: string[];
  scenario: PresetScenario;
  presetId: string;
}
export interface PresetSource {
  id: string; title: string; period: PatientPeriod; presentation: string;
  hidden: string; traps: string; pathway: string; reference: string; dip: string;
  minutes: number; severity: number; compatibility: string; variants: string; source: string;
  performanceGood?: number;
}
export interface CasePreset extends PresetSource {
  performanceGood: number;
  department: string; constraints: PresetConstraints; budget: number;
  expectedDays: number; baseCost: number; hiddenFact: string; hasHidden: boolean;
  hazards: HazardInput[]; scenes: Scene[]; entry: string;
  /** Option IDs in a complete safe route; used by content traversal and voice collection. */
  safeRoute: string[]; echoFlags: { success: string; pending: string; resolved: string };
  /** Flags that must all be set before this preset's own risks count as closed,
   * and the sentence to show for each one that is still missing. The two arrays
   * are parallel: `pending[i]` explains the absence of `requires[i]`. */
  riskClosure: { requires: string[]; pending: string[] };
}
export interface InstantiatedPreset extends ClinicalCase {
  performanceGood: number;
  entityId: string; presetId: string; expectedDays: number; period: PatientPeriod;
  companion: string; payment: string; portraitArchetype: PatientEntity['portraitArchetype'];
  entityProfile?: PatientEntity;
  revisit?: { previousPatientId: string; priorGood: boolean; nonAdherent: boolean };
}
