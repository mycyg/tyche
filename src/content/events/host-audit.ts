import {runSimulation}from '../../../scripts/simulate';
import {AUTHORED_EVENTS}from './catalog';
import {TROLLEY_DEFINITIONS}from './trolley';
/** Mixed engine regression samples. Veteran cases inject starting upgrades;
 * these counts are neither legal progression evidence nor manual play. */
export function auditAuthoredHostWorld(samples=8){
 const events:Record<string,string[]>={},trolley:Record<string,{offered:string[];completed:string[]}>=Object.fromEntries(TROLLEY_DEFINITIONS.map(d=>[d.id,{offered:[],completed:[]}])) as Record<string,{offered:string[];completed:string[]}>,endings:Record<string,number>={},failures:string[]=[];
 let runs=0,actions=0;
 for(const policy of ['random','careful','reckless']as const)for(const veteran of [false,true])for(let i=0;i<samples;i++){
  const seed=`host-authored-${i}`,label=`${seed}/${policy}/${veteran?'veteran':'new'}`;
  try{
   const {r,steps}=runSimulation(seed,policy,veteran);runs++;actions+=steps;endings[r.ending!.id]=(endings[r.ending!.id]??0)+1;
   for(const id of Object.keys(r.authored?.seen??{}))(events[id]??=[]).push(label);
   for(const id of r.authored?.trolley?.seen??[])trolley[id]?.offered.push(label);
   for(const token of r.authored?.trolley?.tokens??[])if(token.resolved)trolley[token.sourceId]?.completed.push(label);
  }catch(error){failures.push(`${label}: ${String(error)}`);}
 }
 return{runs,actions,includesInjectedStartingUpgrades:true,manualPlaythroughsCertified:false,eventsWitnessed:Object.keys(events).length,events,unwitnessedEvents:AUTHORED_EVENTS.filter(e=>!events[e.id]).map(e=>e.id),trolley,endings,failures};
}
if(process.argv[1]?.endsWith('host-audit.ts')){
 const report=auditAuthoredHostWorld(Number(process.argv[2]??8));
 console.log(JSON.stringify(process.argv.includes('--details')?report:{...report,events:Object.keys(report.events),trolley:Object.fromEntries(Object.entries(report.trolley).map(([id,t])=>[id,{offered:t.offered.length,completed:t.completed.length,example:t.completed[0]??t.offered[0]}]))},null,2));
}
