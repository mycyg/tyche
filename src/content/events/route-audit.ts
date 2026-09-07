import {act,availableOptions,currentCard,newMeta,startRun}from '../../game/engine';
import type {Action,Run}from '../../game/types';
import {select}from '../../../scripts/simulate';
import {worldCoffeeOffering}from '../../world/refreshments';

export type AuthoredRoutePolicy='representative'|'research';
/** A play policy chooses only options the real engine currently offers. No
 * patient, result, relationship, fact or resource is injected after startRun. */
export function runAuthoredRoute(seed:string,policy:AuthoredRoutePolicy,veteran=false){
 const meta=newMeta();
 if(veteran){meta.caps={stamina:3,san:3,emotion:3};meta.cashRank=3;for(const key of Object.keys(meta.skills))(meta.skills as Record<string,number>)[key]=3;}
 let r=startRun(seed,'程医生',['T11','T16','T17'],meta),steps=0;
 const planned=['E-131-a','E-132-a','E-133-b','E-134-a','E-136-a','E-137-a','E-138-a',
   ...(policy==='research'?['BTF-004:N01b','BTF-004:N02d','BTF-004:N03b','BTF-004:N04a','BTF-004:N05a','BTF-004:N06a','BTF-004:N07d','BTF-004:N08a']:['BTF-004:N01a','BTF-004:N02b','BTF-004:N03c']),
   'E-153-a','E-154-a','E-155-a','E-159-a','E-180-a','E-188-b','E-194-a'];
 while(r.phase!=='ending'&&steps++<2400){
  let action:Action;
  if(r.phase==='play'){
   const options=availableOptions(r),wanted=planned.map(id=>options.find(o=>o.id===id||o.id.endsWith(`:${id}`))).find(Boolean),fulfil=options.find(o=>o.id.endsWith(':complete')&&'butterflyCommitment'in(currentCard(r)??{}));
   if(r.vitals.stamina<Math.min(32,r.caps.stamina-12)&&worldCoffeeOffering(r).allowed&&!r.facts[`leave:${r.day}`])action={type:'coffee'};
   else action={type:'choose',id:(wanted??fulfil??select(r,'careful')).id};
  }else if(r.phase==='feedback')action={type:'continue'};
  else if(r.phase==='roll')action={type:'ack-roll'};
  else if(r.phase==='debuff')action={type:'debuff',id:[...r.offered].sort((a,b)=>Number(['B12','B09','B10','B03','B17','B24','B01','B23'].includes(a))-Number(['B12','B09','B10','B03','B17','B24','B01','B23'].includes(b)))[0]};
  else if(r.phase==='funding')action={type:'fund',method:!r.facts['asset-sold']?'asset':!r.facts['family-funding']?'family':'credit'};
  else action={type:'testify',response:'facts'};
  const next=act(r,action);if(next===r)throw new Error(`Stuck ${seed}/${policy}: ${JSON.stringify(action)}`);r=next;
 }
 if(r.phase!=='ending')throw new Error(`Unfinished ${seed}/${policy} at day ${r.day}`);
 return{r,steps};
}
function routeReport(r:Run){return{runId:r.id,ending:r.ending?.id,day:r.day,events:Object.keys(r.authored?.seen??{}),chains:r.authored?.chains.map(c=>({id:c.chain,nodes:c.consumed,resolution:c.resolution})),trolley:r.authored?.trolley?.tokens.map(t=>({id:t.sourceId,completed:t.resolved}))};}
if(process.argv[1]?.endsWith('route-audit.ts')){
 const reports:unknown[]=[],failures:string[]=[];
 for(const policy of ['representative','research']as const)for(let i=0;i<Number(process.argv[2]??4);i++)try{const {r,steps}=runAuthoredRoute(`route-audit-${i}`,policy,true);reports.push({seed:r.seed,policy,veteran:true,steps,...routeReport(r)});}catch(error){failures.push(String(error));}
 console.log(JSON.stringify({manualPlaythroughsCertified:false,reports,failures},null,2));
}
