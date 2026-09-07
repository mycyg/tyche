import {clinicalGraphs} from '../src/content/clinical';
import type {ClinicalGraph,ClinicalGraphState,ClinicalNode,GraphOption} from '../src/content/clinical/types';
import type {Run} from '../src/game/types';

export interface SourceExit {
  caseId:string;nodeId:string;choiceId:string;exit:string;
  mode:'automatic-exit'|'folded-continue';flags:string[];
  source:{file:string;line:number};
}
export interface SourceExitWitness extends SourceExit {patientId:string;}

// Fail closed when an authored control gains behavior. A control with a bill,
// die, condition or independent effect is not equivalent to the runtime exit.
const CONTROL_FIELDS=new Set(['id','label','source','ap','minutes','cost','result','hint','effects','next','system','rules','reports','mechanics']);
function inertControl(option:GraphOption):boolean {
  if(Object.keys(option).some(key=>!CONTROL_FIELDS.has(key)))return false;
  if(option.ap!==0||option.minutes!==0||option.cost!==0||option.rules.length||option.reports.length)return false;
  if(Object.entries(option.effects).some(([key,value])=>key!=='flags'&&value!==0&&value!==false&&!(Array.isArray(value)&&value.length===0)))return false;
  const m=option.mechanics;
  return !m||Object.entries(m).every(([key,value])=>
    key==='operation'&&value==='other'||key==='actor'&&value==='patient'||key==='quality'&&value==='neutral');
}
function controlExit(graph:ClinicalGraph,node:ClinicalNode,option:GraphOption):SourceExit|undefined {
  if(!inertControl(option)||node.transitions?.length||node.exit===node.id)return;
  const flags=option.effects.flags??[];
  const auto=node.kind==='auto'&&node.options.length===1&&option.next===node.exit&&!flags.length;
  const delegated=new Set((node.exitEffects??[])
    .filter(rule=>(!rule.on||rule.on==='always')&&(!rule.when||'always'in rule.when))
    .flatMap(rule=>rule.effects.flags??[]));
  const folded=node.kind==='multi'&&option.system&&
    node.options.filter(o=>o.system).length===1&&
    (option.next===node.id||option.next===node.exit)&&flags.every(flag=>delegated.has(flag));
  if(!auto&&!folded)return;
  return {caseId:graph.id,nodeId:node.id,choiceId:option.id,exit:node.exit,
    mode:auto?'automatic-exit':'folded-continue',flags:[...flags],
    source:{file:option.source.file,line:option.source.line}};
}
export function sourceExitMap(graphs:readonly ClinicalGraph[]=clinicalGraphs):SourceExit[]{
  return graphs.flatMap(graph=>graph.nodes.flatMap(node=>node.options.flatMap(option=>{
    const exit=controlExit(graph,node,option);return exit?[exit]:[];
  })));
}

/** This is transition evidence, not a synthetic choice commit. Call only around
 * a real engine action. Unchanged or restored flags never establish an exit. */
export function graphExitWitnesses(graph:ClinicalGraph,before:ClinicalGraphState,after:ClinicalGraphState):SourceExit[]{
  if(before===after||before.caseId!==graph.id||after.caseId!==graph.id||before.outcomeId)return [];
  // Histories must extend the same graph execution, not a new patient or rewind.
  if(before.entered.some((id,i)=>after.entered[i]!==id)||before.choices.some((id,i)=>after.choices[i]!==id))return [];
  const entered=after.entered.slice(before.entered.length);
  const reaches=(exit:string,following:string|undefined)=>
    exit==='outcomes'?!!after.outcomeId&&after.nodeId===after.outcomeId&&following===undefined:
    exit.startsWith('o_')?after.outcomeId===exit&&following===undefined:following===exit;
  return sourceExitMap([graph]).filter(exit=>{
    if(exit.mode==='automatic-exit'){
      const at=entered.indexOf(exit.nodeId);
      return at>=0&&reaches(exit.exit,entered[at+1]);
    }
    if(before.nodeId!==exit.nodeId||after.nodeId===before.nodeId)return false;
    const node=graph.nodes.find(n=>n.id===exit.nodeId)!;
    const selected=after.selected[node.id]??[];
    return selected.length>=node.min&&selected.every(id=>after.choices.includes(id))&&
      exit.flags.every(flag=>after.flags.includes(flag))&&reaches(exit.exit,entered[0]);
  });
}
const graphById=new Map(clinicalGraphs.map(graph=>[graph.id,graph]));
export function sourceExitWitnesses(before:Run,after:Run):SourceExitWitness[]{
  if(before.id!==after.id)return [];
  return after.patients.flatMap(patient=>{
    const previous=before.patients.find(p=>p.uid===patient.uid&&p.caseId===patient.caseId);
    const graph=graphById.get(patient.caseId);
    if(!graph||!previous?.clinical||!patient.clinical)return [];
    return graphExitWitnesses(graph,previous.clinical,patient.clinical).map(exit=>({...exit,patientId:patient.uid}));
  });
}
