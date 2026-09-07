import type { Effects } from '../../game/types';
import type { ClinicalGraph, ClinicalGraphState, GraphCondition, GraphEffectRule, GraphAdvance, ClinicalOutcome } from './types';

export function graphCondition(condition: GraphCondition | undefined, state: ClinicalGraphState): boolean {
  if(!condition)return true;
  if('all'in condition)return condition.all.every(c=>graphCondition(c,state));
  if('any'in condition)return condition.any.some(c=>graphCondition(c,state));
  if('not'in condition)return !graphCondition(condition.not,state);
  if('flag'in condition)return state.flags.includes(condition.flag);
  if('choice'in condition)return state.choices.includes(condition.choice);
  if('entered'in condition)return state.entered.includes(condition.entered);
  if('variant'in condition)return state.variants.includes(condition.variant);
  if('minutes'in condition)return state.minutes>=(condition.minutes.min??0)&&state.minutes<=(condition.minutes.max??Infinity);
  if('count'in condition)return condition.count.flags.filter(f=>state.flags.includes(f)).length>=condition.count.min;
  if('noCausal'in condition)return state.causalChoices.every(id=>state.flags.includes(`mitigated:${id}`));
  return true;
}
function hash(seed: string): number {let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function initialGraphState(graph:ClinicalGraph,seed:string):ClinicalGraphState {
  const groups=[...new Set(graph.variants.map(v=>v.group))];const variants:string[]=[];
  for(const group of groups){const options=graph.variants.filter(v=>v.group===group);const sum=options.reduce((s,v)=>s+v.weight,0);let ticket=hash(`${seed}:${graph.id}:${group}`)%sum;for(const v of options){ticket-=v.weight;if(ticket<0){variants.push(v.id);break;}}}
  return {caseId:graph.id,nodeId:graph.nodes[0].id,variants,flags:[],choices:[],entered:[graph.nodes[0].id],selected:{},attempts:{},minutes:0,ap:0,cost:0,causalChoices:[]};
}
export function getAvailableGraphOptions(graph:ClinicalGraph,state:ClinicalGraphState){
  const node=graph.nodes.find(n=>n.id===state.nodeId);if(!node||state.outcomeId)return [];
  return node.options.filter(o=>!o.system&&graphCondition(o.requires,state)&&(!(state.selected[node.id]??[]).includes(o.id)||(o.retry&&state.attempts[o.id]<o.retry.max&&state.flags.includes(`retry:${o.id}`)))).map(o=>{
    const option=structuredClone(o);
    for(const variant of o.mechanicsVariants??[])if(graphCondition(variant.when,state)&&option.mechanics)option.mechanics={...option.mechanics,...variant.mechanics};
    for(const modifier of o.modifiers??[])if(graphCondition(modifier.when,state)){if(modifier.minutes!==undefined)option.minutes=modifier.minutes;if(modifier.ap!==undefined)option.ap=modifier.ap;if(modifier.cost!==undefined)option.cost=modifier.cost;if(modifier.label!==undefined)option.label=modifier.label;if(modifier.dc!==undefined&&option.check)option.check.dc+=modifier.dc;}
    if(option.check&&option.retry)option.check.dc+=(state.attempts[o.id]??0)*option.retry.dcIncrease;
    if(option.checkWhen&&!graphCondition(option.checkWhen,state))delete option.check;
    return option;
  });
}
export function getAutomaticGraphOption(graph:ClinicalGraph,state:ClinicalGraphState){return getAvailableGraphOptions(graph,state).find(o=>o.automatic);}
export function canContinueGraph(graph:ClinicalGraph,state:ClinicalGraphState){const node=graph.nodes.find(n=>n.id===state.nodeId);return !!node&&node.kind==='multi'&&(state.selected[node.id]?.length??0)>=node.min&&!state.outcomeId;}
export function resolveGraphOutcome(graph:ClinicalGraph,state:ClinicalGraphState):ClinicalOutcome|undefined {
  return [...graph.outcomes].sort((a,b)=>b.priority-a.priority).find(o=>graphCondition(o.condition,state));
}
export function getAvailableGraphReports(graph:ClinicalGraph,state:ClinicalGraphState){return graph.reports.filter(r=>graphCondition(r.when,state)&&(!r.afterNode||state.entered.includes(r.afterNode)));}
export function advanceClinicalGraph(graph:ClinicalGraph,previous:ClinicalGraphState,optionId:string,success=true,actualCosts?:{minutes?:number;ap?:number;cost?:number}):GraphAdvance {
  if(previous.outcomeId)throw new Error('病例已经结算');
  const state=structuredClone(previous);const effects:Effects[]=[];let text='';let actionText='';
  const node=graph.nodes.find(n=>n.id===state.nodeId);if(!node)throw new Error(`Unknown node ${state.nodeId}`);
  const apply=(effect:Effects,origin:string)=>{effects.push(structuredClone(effect));state.flags=[...new Set([...state.flags.filter(f=>!effect.clear?.includes(f)),...(effect.flags??[])])];if(effect.hazards?.some(h=>h.causal)&&!state.causalChoices.includes(origin))state.causalChoices.push(origin);};
  const rules=(list:GraphEffectRule[]|undefined,origin:string)=>{for(const rule of list??[])if((!rule.on||rule.on==='always'||rule.on===(success?'success':'failure'))&&graphCondition(rule.when,state))apply(rule.effects,origin);};
  const option=optionId==='continue'?undefined:getAvailableGraphOptions(graph,state).find(o=>o.id===optionId);
  let next=node.exit;
  if(!option){if(optionId!=='continue'||!canContinueGraph(graph,state))throw new Error('此刻不能继续');}
  else {
    state.choices.push(option.id);state.selected[node.id]??=[];if(!state.selected[node.id].includes(option.id))state.selected[node.id].push(option.id);
    state.attempts[option.id]=(state.attempts[option.id]??0)+1;state.flags=state.flags.filter(f=>f!==`retry:${option.id}`);
    state.minutes+=actualCosts?.minutes??option.minutes;state.ap+=actualCosts?.ap??option.ap;state.cost+=actualCosts?.cost??option.cost;
    apply(option.effects,option.id);rules(option.rules,option.id);
    if(option.check&&!success)apply(option.check.failure,option.id);
    const variantResult=option.resultVariants?.find(v=>graphCondition(v.when,state));
    text=option.check&&!success?option.check.failureText:variantResult?.text??[option.result,success?option.successText:''].filter(Boolean).join('\n');
    actionText=text;
    next=option.transitions?.find(t=>graphCondition(t.when,state))?.next??(success?option.successNext:option.failureNext)??option.next??node.exit;
    if(option.check&&!success&&option.retry){
      if(state.attempts[option.id]<option.retry.max){next=node.id;state.flags.push(`retry:${option.id}`);}
      else next=option.retry.exhaustedNext??option.failureNext??node.exit;
    }
    if(node.kind==='multi'&&!next.startsWith('o_')&&next!=='outcomes'&&!node.exitOn?.includes(option.id))next=state.selected[node.id].length>=node.max?node.exit:node.id;
    if(node.kind==='single'&&next===node.id&&getAvailableGraphOptions(graph,state).length===0)next=node.exit;
  }
  if(next!==node.id)rules(node.exitEffects,`${node.id}:exit`);
  if(option?.followUp&&!state.flags.includes(option.followUp.onceFlag)){
    state.flags.push(option.followUp.onceFlag);state.resumeNodes??=[];
    state.resumeNodes.push({nodeId:next,preserveSelected:next===node.id});next=option.followUp.node;
  }
  let guard=0;
  while(next!==state.nodeId&&guard++<30){
    let preserveSelected=false;
    if(next==='resume'){
      const resume=state.resumeNodes?.pop();if(!resume)throw new Error(`${graph.id}: missing interrupted transition`);
      next=resume.nodeId;preserveSelected=resume.preserveSelected;
    }
    if(next==='outcomes'||next.startsWith('o_')){
      if(next.startsWith('o_'))state.flags.push(`direct:${next}`);
      const outcome=resolveGraphOutcome(graph,state);if(!outcome)throw new Error(`${graph.id}: no outcome`);
      state.outcomeId=outcome.id;state.nodeId=outcome.id;
      if(outcome.effects)apply(outcome.effects,outcome.id);
      text=outcome.textVariants?.find(v=>graphCondition(v.when,state))?.text??outcome.text;
      break;
    }
    state.nodeId=next;state.entered.push(next);if(!preserveSelected)state.selected[next]=[];
    const entering=graph.nodes.find(n=>n.id===next);if(!entering)throw new Error(`Missing graph transition ${next}`);
    rules(entering.enterEffects,`${entering.id}:entry`);
    if(entering.kind!=='auto')break;
    next=entering.transitions?.find(t=>graphCondition(t.when,state))?.next??entering.exit;
  }
  const priorReports=new Set(getAvailableGraphReports(graph,previous).map(r=>r.id));
  const reports=getAvailableGraphReports(graph,state).filter(r=>!priorReports.has(r.id));
  return {state,effects,option,text,actionText,reports,outcome:graph.outcomes.find(o=>o.id===state.outcomeId)};
}
export const resolveGraphNext=advanceClinicalGraph;
