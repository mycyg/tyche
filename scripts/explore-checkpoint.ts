import {act,availableEncounters,availableOptions,currentCard}from '../src/game/engine';
import {talentRerollsRemaining}from '../src/game/talents';
import {talentContext}from '../src/game/traits';
import type {Action,Card,Run}from '../src/game/types';

export interface CheckpointVisit{before:Run;after:Run;action:Action;path:Action[];}
export interface CheckpointFailure{path:Action[];attempted:Action;error:string;state:Run;}
const chainId=(c:Card|undefined)=>(c as Card&{butterfly?:{chainStateId:string}}|undefined)?.butterfly?.chainStateId;
/** Branch only from a real reached state. Every edge uses the public command
 * API. No resources, dice, patient flags or node IDs are written by the search.
 * These are reachability prefixes, not extra completed runs or earned XP. */
export function exploreCheckpoint(root:Run,limit:number,visit:(v:CheckpointVisit)=>void,
 priority:(r:Run,c:Card,action:Action)=>number=()=>0,done:()=>boolean=()=>false):{steps:number;failures:CheckpointFailure[]}{
 const origin=currentCard(root),patientId=origin?.patientId,chain=chainId(origin);
 const failures:CheckpointFailure[]=[];let steps=0;
 if(root.phase!=='play'||!origin||limit<1)return{steps,failures};
 const activePath=new Set<string>();
 function walk(r:Run,path:Action[]):void{
  if(steps>=limit||done()||path.length>=96||r.phase==='ending'||r.day!==root.day)return;
  const current=currentCard(r);
  let actions:Action[]=[];
  if(r.phase==='play'){
   if(!current)return;
   const matches=(c:Card)=>patientId?c.patientId===patientId:chain?chainId(c)===chain:c.id===origin!.id;
   if(!r.emergency&&!matches(current)){
    const focus=availableEncounters(r).find(matches);
    if(focus)actions=[{type:'focus',id:focus.id}];else return;
   }else{
    actions=availableOptions(r).filter(o=>!o.talentAction&&o.interaction!=='hallucination'&&o.interaction!=='defer')
      .map(o=>({type:'choose',id:o.id}as Action));
    actions.sort((a,b)=>priority(r,current,b)-priority(r,current,a));
   }
  }else if(r.phase==='feedback')actions=[{type:'continue'}];
  else if(r.phase==='roll'&&r.pendingCheck?.kind==='choice'){
   actions=[{type:'ack-roll'}];
   if(!r.roll?.chance&&!r.roll?.blockedReason&&talentRerollsRemaining(talentContext(r))+(r.metaRerolls??0)>0)actions.push({type:'reroll'});
  }else if(r.phase==='funding')actions=[{type:'fund',method:!r.facts['asset-sold']?'asset':!r.facts['family-funding']?'family':'credit'}];
  else return;
  for(const action of actions){
   if(steps>=limit||done()||failures.length>=3)break;
   const cycle=JSON.stringify([r.phase,r.cursor,current?.id,action,r.pendingCheck?.rerolls,r.committed.length]);
   if(activePath.has(cycle))continue;
   steps++;let next:Run;
   try{
    next=act(r,action);
    if(next===r)throw new Error('An offered checkpoint action made no transition');
    const suffix=[...path,action];visit({before:r,after:next,action,path:suffix});
    activePath.add(cycle);walk(next,suffix);activePath.delete(cycle);
   }catch(error){failures.push({path,attempted:action,error:String(error),state:r});}
  }
 }
 walk(root,[]);return{steps,failures};
}
