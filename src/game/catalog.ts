import a from '../clinical-a.json';
import b from '../clinical-b.json';
import type { ClinicalCase, Talent, Debuff } from './types';
import { TALENT_DEFINITIONS, DEBUFF_DEFINITIONS } from '../content/talents';
import { CLINICAL_IDENTITIES } from '../content/clinical/identity';
import clinicalGraphs from '../content/clinical/graphs.json';
import type {ClinicalGraph}from '../content/clinical/types';
import {RULES}from './rules';
export const CASES:ClinicalCase[]=[...a,...b].map(c=>{
  const identity=CLINICAL_IDENTITIES[c.id],graph=clinicalGraphs.find(g=>g.id===c.id)! as unknown as ClinicalGraph,presentation=graph.presentation;
  return {...c,budget:graph.budget,baseCost:Math.round(graph.budget*(graph.setting.startsWith('病区')||graph.dipGroup?.startsWith('住院')?RULES.billing.inpatientBaseRate:RULES.billing.outpatientBaseRate)),dipGroup:graph.dipGroup||c.dipGroup,age:identity.age,sex:identity.sex,complaint:presentation.complaint,history:presentation.history,
    findings:[presentation.vitals,presentation.appearance].filter(Boolean)};
}) as ClinicalCase[];
export const TALENTS:Talent[]=TALENT_DEFINITIONS;
export const DEBUFFS:Debuff[]=DEBUFF_DEFINITIONS;
