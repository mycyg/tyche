import {describe,expect,it} from 'vitest';
import {clinicalGraphs,getClinicalGraph,initialGraphState,advanceClinicalGraph,getAvailableGraphOptions,canContinueGraph} from '../content/clinical';
import {CLINICAL_DISPOSITION_AUDIT,CLINICAL_DISPOSITION_RULES,clinicalDisposition} from './clinical-disposition';
import type {Patient} from './types';

function patient(caseId:string,choices:string[]=[],flags:string[]=[],outcomeId='o_good',variants:string[]=[]):Pick<Patient,'caseId'|'clinical'|'damage'>{
 const state=initialGraphState(getClinicalGraph(caseId)!,'disposition-proof');
 return {caseId,damage:0,clinical:{...state,choices,flags,outcomeId,variants}};
}
function play(caseId:string,path:string,variants?:string[]){
 const graph=getClinicalGraph(caseId)!;let state=initialGraphState(graph,'disposition-proof');if(variants)state.variants=variants;
 for(const id of path.split(' ')){
  let guard=0;
  while(!getAvailableGraphOptions(graph,state).some(o=>o.id===id)&&canContinueGraph(graph,state)&&guard++<15)state=advanceClinicalGraph(graph,state,'continue').state;
  expect(getAvailableGraphOptions(graph,state).map(o=>o.id),`${caseId}/${state.nodeId}`).toContain(id);
  state=advanceClinicalGraph(graph,state,id,true).state;
 }
 let guard=0;while(!state.outcomeId&&canContinueGraph(graph,state)&&guard++<15)state=advanceClinicalGraph(graph,state,'continue').state;
 expect(state.outcomeId).toBeDefined();return {caseId,damage:0,clinical:state};
}

describe('source-proven terminal clinical disposition',()=>{
 it('audits every full graph and every explicit rule references existing source actions, outcomes and variants',()=>{
  expect(Object.keys(CLINICAL_DISPOSITION_AUDIT).sort()).toEqual(clinicalGraphs.map(g=>g.id).sort());
  for(const graph of clinicalGraphs){
   const ids=graph.nodes.flatMap(n=>n.options.map(o=>o.id));
   for(const rule of CLINICAL_DISPOSITION_RULES[graph.id]){
    for(const id of rule.options)expect(ids,graph.id).toContain(id);
    for(const id of rule.outcomes??[])expect(graph.outcomes.map(o=>o.id),graph.id).toContain(id);
    for(const id of rule.variants??[])expect(graph.variants.map(v=>v.id),graph.id).toContain(id);
   }
  }
 });
 it('C013 full CTA/control/ambulance transfer/record path proves actual transfer rather than tomorrow’s plan',()=>{
  const p=play('C013','s1_bp_both s2_ecg_ddimer s3_cta s4_control s5_transfer s6_record');
  expect(p.clinical.outcomeId).toBe('o_good');
  expect(clinicalDisposition(p)).toMatchObject({kind:'transfer',destination:'上级医院血管外科',sourceOptions:['s5_transfer']});
 });
 it.each([
  ['C013',['s5_inform'],['informed']],
  ['C013',['s5_admit'],['delayed_transfer']],
  ['C013',['s5_transfer'],[]],
  ['C013',[],['transferred']],
  ['C010',['s5_icu'],['icu_called']],
  ['C012',['s3_urgent'],['surgery_called']],
  ['C015',['s4_oral'],['oral_stepdown']],
  ['C016',['s3_psych','s4_family'],['psych_called','family_informed']],
 ] as const)('%s consultation, consent, later discharge narration or incomplete proof does not clear a bed',(id,choices,flags)=>{
  expect(clinicalDisposition(patient(id,[...choices],[...flags])).kind).toBe('stay');
 });
 it('requires an existing terminal outcome and matching patient identity',()=>{
  const p=patient('C013',['s5_transfer'],['transferred']);
  delete p.clinical!.outcomeId;expect(clinicalDisposition(p).kind).toBe('stay');
  p.clinical!.outcomeId='unknown';expect(clinicalDisposition(p).kind).toBe('stay');
  p.clinical!.outcomeId='o_good';p.caseId='C001';expect(clinicalDisposition(p).kind).toBe('stay');
 });
 it('self-driving is not a completed monitored referral',()=>{
  const p=play('C013','s1_bp_both s2_ecg_ddimer s3_cta s4_control s5_self');
  expect(clinicalDisposition(p)).toMatchObject({kind:'self-transfer',planned:false,sourceOptions:['s5_self']});
 });
 it('C019 requires a hospital without a chamber and completed arrangement AND handoff',()=>{
  const p=patient('C019',['s5_hbo_yes','s6_handoff'],['hbo_arranged','handoff_done'],'o_hbo',['no_chamber']);
  expect(clinicalDisposition(p).kind).toBe('transfer');
  p.clinical!.variants=['onsite'];expect(clinicalDisposition(p).kind).toBe('stay');
  p.clinical!.variants=['no_chamber'];p.clinical!.flags=['hbo_arranged'];expect(clinicalDisposition(p).kind).toBe('stay');
 });
 it('observed discharge and premature discharge remain distinct without changing injuries or the historical choices',()=>{
  const observed=play('C006','s1_glucose s2_d50 s3_history s3_infusion s4_observe s5_endo_referral s6_note');
  expect(clinicalDisposition(observed)).toMatchObject({kind:'home',planned:true});
  const early=play('C006','s1_glucose s2_d50 s3_discharge');early.damage=2;
  const before=JSON.stringify(early);
  expect(clinicalDisposition(early)).toMatchObject({kind:'home',planned:false});
  expect(JSON.stringify(early)).toBe(before);
 });
 it('an existing death is not retrospectively reclassified as a successful transfer or recovery',()=>{
  const p=patient('C013',['s5_transfer'],['transferred']);p.damage=3;
  expect(clinicalDisposition(p).kind).toBe('death-review');
  expect(p.damage).toBe(3);
  const q=patient('C005',['s4_outpatient'],['sent_home'],'o_worst');
  expect(clinicalDisposition(q).kind).toBe('home');expect(q.damage).toBe(0);
 });
 it('C011 actual hypoxic priority outcome overrides early-discharge intent and keeps inpatient care',()=>{
  const p=play('C011','s1_skip s2_quick_test s4_steroid_first s5_observe30');p.damage=2;
  expect(p.clinical.flags).toContain('early_discharge');expect(p.clinical.outcomeId).toBe('o_hypoxic');
  expect(clinicalDisposition(p).kind).toBe('stay');
  const home=play('C011','s1_skip s2_quick_test s4_epi_im s5_observe30');
  expect(home.clinical.outcomeId).toBe('o_biphasic');expect(clinicalDisposition(home).kind).toBe('home');
 });
});
