import {createHash}from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync}from 'node:fs';
import {resolve,join,relative}from 'node:path';
import {pathToFileURL}from 'node:url';
import {act,availableEncounters,availableOptions,currentCard,newMeta,reward,startRun,upgrade,type UpgradeKind}from '../src/game/engine';
import {drawTalentPool}from '../src/game/talents';
import {random}from '../src/game/random';
import {TALENTS,DEBUFFS}from '../src/game/catalog';
import {clinicalGraphs}from '../src/content/clinical';
import {CASE_PRESETS,PATIENT_ENTITIES}from '../src/content/patients';
import {AUTHORED_EVENTS,DOCUMENTED_ENDINGS}from '../src/content/events/catalog';
import {BUTTERFLY_NODES,BUTTERFLY_RESOLUTIONS,BUTTERFLY_MERGES}from '../src/content/events/butterfly';
import {TROLLEY_DEFINITIONS}from '../src/content/events/trolley';
import {encounteredCollections}from '../src/game/encounters';
import {decode,encode,emptySave,storageRunIssues}from '../src/game/storage';
import {worldCoffeeOffering}from '../src/world/refreshments';
import {select}from './simulate';
import {exploreCheckpoint}from './explore-checkpoint';
import {plannedChoice,plannedEncounter,ROUTE_PLANS,type RoutePlan}from './route-plans';
import {sourceExitWitnesses,type SourceExitWitness}from './source-exits';
import type {Action,Card,Meta,Option,PartnerSetting,Run}from '../src/game/types';

export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
interface Purchase {kind:UpgradeKind;key?:string;}
interface Trace {
 index:number;seed:string;instanceId:string;talents:string[];difficulty:Run['difficulty'];
 metaBefore:string;partner?:PartnerSetting;actions:Action[];finalHash?:string;ending?:string;error?:string;failedAttempt?:Action;purchases:Purchase[];
 strategy?:RoutePlan;summary?:{day:number;chains:unknown[]};
}
interface Witness {run:number;action:number;day:number;branch?:string;via?:SourceExitWitness;}
interface BranchTrace {run:number;prefixActions:number;rootHash:string;actions:Action[];finalHash:string;error?:string;failedAttempt?:Action;}
interface Manifest {schema:1;sourceHash:string;traceFiles:string[];branchFiles?:string[];complete:boolean;}
// This source row is a conditional ending, not a third button. It is no longer
// compiled as an option, so it carries its own coverage target here.
const CONDITIONAL_EVENT_ROWS:Record<string,{eventId:string;endingId:string}>={'E-209-c':{eventId:'E-209',endingId:'X32'}};
export function witnessedEventConditions(r:Run):string[]{
 if(r.phase!=='ending')return [];
 return Object.entries(CONDITIONAL_EVENT_ROWS).flatMap(([id,condition])=>
  r.ending?.id===condition.endingId&&r.authored?.ledger.outcomes?.some(o=>o.eventId===condition.eventId)
   ?[`event-condition:${id}`]:[]);
}
export function coverageUniverse():string[]{
 return [...new Set([
  ...clinicalGraphs.flatMap(g=>[...g.nodes.flatMap(n=>[`clinical-node:${g.id}:${n.id}`,...n.options.map(o=>`clinical-choice:${g.id}:${o.id}`)]),...g.outcomes.map(o=>`clinical-outcome:${g.id}:${o.id}`)]),
  ...CASE_PRESETS.flatMap(p=>p.scenes.flatMap(n=>[`preset-node:${n.id}`,...n.options.map(o=>`preset-choice:${o.id}`)])),
  ...PATIENT_ENTITIES.map(p=>`patient:${p.id}`),
  ...AUTHORED_EVENTS.flatMap(e=>[`event:${e.id}`,...e.options.map(o=>`${o.id in CONDITIONAL_EVENT_ROWS?'event-condition':'event-choice'}:${o.id}`)]),
  ...Object.keys(CONDITIONAL_EVENT_ROWS).map(id=>`event-condition:${id}`),
  ...BUTTERFLY_NODES.flatMap(n=>[`butterfly-node:${n.id}`,...n.options.map(o=>`butterfly-choice:${o.id}`)]),
  ...BUTTERFLY_RESOLUTIONS.map(r=>`butterfly-ending:${r.id}`),
  ...BUTTERFLY_MERGES.flatMap(m=>[`merge:${m.id}`,...m.options.map(o=>`merge-choice:${o.id}`)]),
  ...TROLLEY_DEFINITIONS.flatMap(t=>[1,2,3].map(stage=>`trolley:${t.id}:${stage}`)),
  ...DOCUMENTED_ENDINGS.map(e=>`ending:${e.id}`),
  ...TALENTS.map(t=>`talent:${t.id}`),...DEBUFFS.map(d=>`debuff:${d.id}`),
 ])];
}
/** Coverage includes later conditional branches, not only the entry menu.
 * A new legal patient/seed can witness a previously failed check or variant. */
export function caseCoverageIndex(universe:readonly string[]):Map<string,string[]>{
 const index=new Map<string,string[]>();
 for(const key of universe){
  const parts=key.split(':'),group=parts[0].startsWith('clinical-')?`clinical:${parts[1]}`:
   parts[0].startsWith('preset-')?`preset:${parts[2]}`:undefined;
  if(group){const keys=index.get(group)??[];keys.push(key);index.set(group,keys);}
 }
 return index;
}
export function needsCheckpoint(keys:readonly string[],seen:{has(key:string):boolean}):boolean{
 return keys.some(key=>!seen.has(key));
}
/** Exactly the initial nine visible talent cards. No injected veteran stats. */
export function legalTalentDeal(seed:string):string[]{
 let draw=0;return drawTalentPool(()=>random(seed,`talents:0:${draw++}`),TALENTS.length).slice(0,9);
}
function chooseTalents(seed:string,meta:Meta,index:number):string[]{
 const picks:string[]=[],deal=legalTalentDeal(seed);
 const priority=index%3===0?['T11','T16','T17','T23','T06']:deal.filter(id=>!meta.usedTalents?.includes(id));
 for(const id of [...priority.filter(id=>deal.includes(id)),...deal]){
  if(picks.includes(id)||picks.length>=(meta.fourthSlot?4:3))continue;
  const family=TALENTS.find(t=>t.id===id)!.family;
  if(picks.filter(p=>TALENTS.find(t=>t.id===p)!.family===family).length<2)picks.push(id);
 }
 return picks;
}
function assertLegalStart(t:Trace,meta:Meta){
 const deal=legalTalentDeal(t.seed);
 if(t.metaBefore!==fingerprint(meta)||t.talents.some(id=>!deal.includes(id))||new Set(t.talents).size!==t.talents.length||t.talents.length!==(meta.fourthSlot?4:3))throw new Error('Start does not match earned progress and the visible talent deal');
 for(const id of t.talents)if(t.talents.filter(p=>TALENTS.find(t=>t.id===p)!.family===TALENTS.find(t=>t.id===id)!.family).length>2)throw new Error('Too many talents from one family');
 if(t.difficulty==='attending'&&!meta.attendingUnlocked)throw new Error('Locked difficulty');
}
function presetKey(r:Run,c:Card,id:string):string{
 const p=r.patients.find(p=>p.uid===c.patientId);
 return p?.preset?id.replace(`preset:${p.caseId}:${p.uid}`,`preset:${p.caseId}`):id;
}
function choiceKeys(r:Run,c:Card,o:Option):string[]{
 const keys:string[]=[];
 if(c.clinicalGraph&&o.clinicalChoice&&o.clinicalChoice!=='continue')keys.push(`clinical-choice:${c.caseId}:${o.clinicalChoice}`);
 if(c.presetNode)keys.push(`preset-choice:${presetKey(r,c,o.id)}`);
 const b=o.id.match(/BTF-\d{3}:N\d{2}[a-e]$/)?.[0];if(b)keys.push(`butterfly-choice:${b}`);
 const m=o.id.match(/XJ\d{2}[a-d]$/)?.[0];if(m)keys.push(`merge-choice:${m}`);
 const e=o.id.match(/E-\d{3}-[a-e]$/)?.[0];if(e)keys.push(`event-choice:${e}`);
 return keys;
}
function nodeKeys(r:Run,c:Card):string[]{
 const keys:string[]=[];
 if(c.clinicalGraph)keys.push(`clinical-node:${c.caseId}:${c.clinicalGraph.nodeId}`);
 if(c.presetNode)keys.push(`preset-node:${presetKey(r,c,c.presetNode)}`);
 const extended=c as Card&{butterfly?:{nodeId:string};butterflyMerge?:{mergeId:string};authoredEventId?:string;trolley?:{sourceId:string;stage:number}};
 if(extended.butterfly)keys.push(`butterfly-node:${extended.butterfly.nodeId}`);
 if(extended.butterflyMerge)keys.push(`merge:${extended.butterflyMerge.mergeId}`);
 if(extended.authoredEventId)keys.push(`event:${extended.authoredEventId}`);
 if(extended.trolley)keys.push(`trolley:${extended.trolley.sourceId}:${extended.trolley.stage}`);
 return keys;
}
function purchased(meta:Meta):{meta:Meta;purchases:Purchase[]}{
 const purchases:Purchase[]=[];
 const order:Purchase[]=[
  {kind:'cap',key:'stamina'},{kind:'cash'},{kind:'cap',key:'san'},{kind:'cap',key:'emotion'},
  ...Object.keys(meta.skills).map(key=>({kind:'skill' as const,key})),
  {kind:'depression'},{kind:'fourth-slot'},{kind:'reroll-token'},{kind:'attending'},
 ];
 let changed=true;
 while(changed){changed=false;for(const p of order){const next=upgrade(meta,p.kind,p.key);if(fingerprint(next)!==fingerprint(meta)){meta=next;purchases.push(p);changed=true;}}}
 return{meta,purchases};
}
export function chooseAction(r:Run,index:number,step:number,seen:Map<string,Witness>,plan?:RoutePlan):Action{
 if(r.phase==='play'){
  if(r.vitals.stamina<Math.min(32,r.caps.stamina-12)&&worldCoffeeOffering(r).allowed)return{type:'coffee'};
  const current=currentCard(r);
  if(!current)throw new Error('No current card in play');
  const wanted=plan&&plannedChoice(r,plan);
  if(wanted)return{type:'choose',id:wanted.id};
  const planned=plan&&plannedEncounter(r,plan);
  if(planned&&planned.id!==current.id)return{type:'focus',id:planned.id};
  const novel=availableEncounters(r).find(c=>c.id!==current.id&&nodeKeys(r,c).some(k=>!seen.has(k)));
  if(novel&&nodeKeys(r,current).every(k=>seen.has(k)))return{type:'focus',id:novel.id};
  const options=availableOptions(r);
  if(!options.length)throw new Error('No legal choice');
  let chosen=select(r,index%7===6&&!plan?'reckless':'careful');
  if(index%3!==0&&random(r.seed,`explore:${step}`)<(plan ? .12 : .48)){
   const novelOptions=options.filter(o=>choiceKeys(r,current,o).some(k=>!seen.has(k)));
   const pool=novelOptions.length?novelOptions:options;
   chosen=pool[Math.floor(random(r.seed,`option:${step}`)*pool.length)];
  }
  return{type:'choose',id:chosen.id};
 }
 if(r.phase==='feedback')return{type:'continue'};
 if(r.phase==='roll')return{type:'ack-roll'};
 if(r.phase==='debuff')return{type:'debuff',id:r.offered.find(id=>!seen.has(`debuff:${id}`))??r.offered[0]};
 if(r.phase==='collapse')return{type:'collapse',method:'report'};
 if(r.phase==='funding')return{type:'fund',method:!r.facts['asset-sold']?'asset':!r.facts['family-funding']?'family':r.debt<50000?'credit':'stop'};
 return{type:'testify',response:(['facts','admit','silent']as const)[index%3]};
}
function checkState(r:Run,saveCheck:boolean){
 if(Object.values(r.vitals).some(n=>!Number.isFinite(n))||!Number.isFinite(r.cash)||r.ap<0||r.debt<0)throw new Error('Non-finite or negative constrained resource');
 if(saveCheck){
  const issues=storageRunIssues(r);if(issues.length)throw new Error(`Invalid save: ${issues.join(',')}`);
  const save={...emptySave(),run:r};
  if(!decode(encode(save)).run)throw new Error('Save lost current run');
 }
}
function witnessState(r:Run,ref:Witness,seen:Map<string,Witness>){
 const hit=(key:string)=>{if(!seen.has(key))seen.set(key,ref);};
 r.talents.forEach(id=>hit(`talent:${id}`));r.debuffs.forEach(id=>hit(`debuff:${id}`));
 const contact=encounteredCollections(r);contact.entities.forEach(id=>hit(`patient:${id}`));
 for(const p of r.patients)if(p.clinical?.choices.length){
  p.clinical.entered.forEach(id=>hit(`clinical-node:${p.caseId}:${id}`));
  p.clinical.choices.forEach(id=>hit(`clinical-choice:${p.caseId}:${id}`));
  if(p.clinical.outcomeId)hit(`clinical-outcome:${p.caseId}:${p.clinical.outcomeId}`);
 }
 for(const o of r.authored?.ledger.outcomes??[]){hit(`event:${o.eventId}`);hit(`event-choice:${o.choiceId}`);}
 witnessedEventConditions(r).forEach(hit);
 for(const c of r.authored?.chains??[]){
  c.consumed.forEach(id=>hit(`butterfly-node:${id}`));
  if(c.resolution&&(c.status==='closed'||r.phase==='ending'))hit(`butterfly-ending:${c.resolution}`);
 }
 if(r.ending&&r.phase==='ending')[r.ending.id,...(r.ending.annexIds??[])].forEach(id=>hit(`ending:${id}`));
}
function witnessExits(before:Run,after:Run,ref:Witness,seen:Map<string,Witness>){
 for(const via of sourceExitWitnesses(before,after)){
  const key=`clinical-choice:${via.caseId}:${via.choiceId}`;
  if(!seen.has(key))seen.set(key,{...ref,via});
 }
}
export function sourceHash(root:string):string{
 // Test additions do not change a saved campaign. Runtime/content and the
 // actual generator scripts remain covered; generated Python caches do not.
 const files:string[]=[];const walk=(path:string)=>{for(const e of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(e.name==='__pycache__'||/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(e.name)||/^test_.*\.py$/.test(e.name))continue;
  const p=join(path,e.name);if(e.isDirectory())walk(p);else files.push(p);
 }};
 walk(join(root,'src'));walk(join(root,'scripts'));files.push(join(root,'package-lock.json'));
 const hash=createHash('sha256');for(const file of files)hash.update(relative(root,file)).update('\0').update(readFileSync(file)).update('\0');
 return hash.digest('hex');
}
/** Replay the campaign, including all prior earned rewards and purchases. */
export function replayCampaign(directory:string):number{
 const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'))as Manifest;
 if(manifest.sourceHash!==sourceHash(resolve('.')))throw new Error('Trace belongs to a different source tree');
 let meta=newMeta(),count=0;
 const branches=(manifest.branchFiles??[]).map(file=>({file,trace:JSON.parse(readFileSync(join(directory,file),'utf8'))as BranchTrace}));
 for(const file of manifest.traceFiles){
  const t=JSON.parse(readFileSync(join(directory,file),'utf8'))as Trace;
  assertLegalStart(t,meta);
  let r=startRun(t.seed,'程医生',t.talents,meta,t.difficulty,t.instanceId,{partner:t.partner});
  const forks=branches.filter(b=>b.trace.run===t.index),required=new Set(forks.map(b=>b.trace.prefixActions)),roots=new Map<number,Run>();
  for(let index=0;index<t.actions.length;index++){
   if(required.has(index))roots.set(index,r);
   const next=act(r,t.actions[index]);if(next===r)throw new Error(`Replay no-op: run ${t.index}, action ${index}`);r=next;count++;
  }
  if(required.has(t.actions.length))roots.set(t.actions.length,r);
  if(t.finalHash!==fingerprint(r))throw new Error(`Replay state differs in run ${t.index}`);
  for(const {file,trace}of forks){
   let branch=roots.get(trace.prefixActions);
   if(!branch||fingerprint(branch)!==trace.rootHash)throw new Error(`Checkpoint is not the recorded campaign prefix: ${file}`);
   for(const action of trace.actions){const next=act(branch,action);if(next===branch)throw new Error(`Checkpoint replay no-op: ${file}`);branch=next;count++;}
   if(fingerprint(branch)!==trace.finalHash)throw new Error(`Checkpoint replay differs: ${file}`);
   checkState(branch,true);
  }
  if(t.ending){meta=reward(meta,r);for(const p of t.purchases){const next=upgrade(meta,p.kind,p.key);if(fingerprint(next)===fingerprint(meta))throw new Error('Unfunded recorded purchase');meta=next;}}
 }
 return count;
}
export function auditRoutes(samples:number,directory:string,failureLimit=5,branchLimit=0,plans:readonly RoutePlan[]=Object.keys(ROUTE_PLANS)as RoutePlan[],seedPrefix='legal-route'){
 if(!Number.isInteger(samples)||samples<1)throw new Error('Positive sample count required');
 if(!Number.isInteger(branchLimit)||branchLimit<0)throw new Error('Non-negative integer checkpoint budget required');
 if(!plans.length||plans.some(plan=>!Object.hasOwn(ROUTE_PLANS,plan)))throw new Error('Unknown or empty route plan list');
 if(!seedPrefix.trim())throw new Error('Non-empty seed prefix required');
 mkdirSync(directory,{recursive:false});
 const seen=new Map<string,Witness>(),offered=new Map<string,Witness>(),failures:unknown[]=[],traceFiles:string[]=[],branchFiles:string[]=[];
 const universe=coverageUniverse(),universeSet=new Set(universe),caseKeys=caseCoverageIndex(universe);
 const manifest:Manifest={schema:1,sourceHash:sourceHash(resolve('.')),traceFiles,branchFiles,complete:false};
 writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
 let meta=newMeta(),actions=0,completed=0,explorationSteps=0,branchActions=0;
 for(let index=0;index<samples;index++){
  const seed=`${seedPrefix}-${index}`;
  const plan=plans[index%plans.length];
  // The registration page offers three partner settings and DK-10 exists only
  // on the two that put a partner on record, so the campaign uses all three.
  const partner=(['none','female','male']as const)[index%3];
  const t:Trace={index,seed,instanceId:`route-audit-${index}`,talents:chooseTalents(seed,meta,index),difficulty:meta.attendingUnlocked&&index%9===8?'attending':'rotation',metaBefore:fingerprint(meta),partner,actions:[],purchases:[],strategy:plan};
  assertLegalStart(t,meta);
  let r=startRun(seed,'程医生',t.talents,meta,t.difficulty,t.instanceId,{partner});
  const pending=new Map<string,{nodes:string[];choices:string[]}>();
  const explored=new Set<string>();
  let attempted:Action|undefined;
  try{
   checkState(r,true);
   for(let step=0;r.phase!=='ending'&&step<4000;step++){
    const before=r,card=currentCard(r),ref={run:index,action:step,day:r.day};
    if(r.phase==='play'&&card)for(const key of nodeKeys(r,card))if(!offered.has(key))offered.set(key,ref);
    if(branchLimit>0&&r.phase==='play'&&card&&nodeKeys(r,card).length){
     const checkpointKey=card.clinicalGraph||card.presetNode?`patient:${card.patientId}`:card.id;
     const patient=r.patients.find(p=>p.uid===card.patientId);
     const localKeys=card.clinicalGraph?caseKeys.get(`clinical:${card.caseId}`)??[]:
      card.presetNode?caseKeys.get(`preset:${patient?.caseId}`)??[]:
      [...nodeKeys(r,card),...availableOptions(r).flatMap(o=>choiceKeys(r,card,o))].filter(k=>universeSet.has(k));
     if(!explored.has(checkpointKey)&&needsCheckpoint(localKeys,seen)){
      explored.add(checkpointKey);const rootHash=fingerprint(r),prefixActions=t.actions.length;
      const search=exploreCheckpoint(r,branchLimit,({before,after,path})=>{
       const size=seen.size,file=`branch-${String(branchFiles.length).padStart(6,'0')}.json`;
       const witness:Witness={run:index,action:path.length-1,day:after.day,branch:file},current=currentCard(before);
       if(current)for(const id of after.committed.filter(id=>!before.committed.includes(id))){
        const option=availableOptions(before).find(o=>o.id===id);
        if(option)for(const key of [...nodeKeys(before,current),...choiceKeys(before,current,option)])if(!seen.has(key))seen.set(key,witness);
       }
       witnessExits(before,after,witness,seen);witnessState(after,witness,seen);checkState(after,seen.size>size||path.length%32===0);
       if(seen.size>size){
        const trace:BranchTrace={run:index,prefixActions,rootHash,actions:path,finalHash:fingerprint(after)};
        writeFileSync(join(directory,file),JSON.stringify(trace));branchFiles.push(file);branchActions+=path.length;
       }
      },(state,source,action)=>action.type==='choose'
       ?choiceKeys(state,source,availableOptions(state).find(o=>o.id===action.id)!).filter(k=>!seen.has(k)).length:0,
       ()=>localKeys.length>0&&localKeys.every(k=>seen.has(k)));
      explorationSteps+=search.steps;
      for(const failure of search.failures){
       const file=`branch-${String(branchFiles.length).padStart(6,'0')}.json`;
       writeFileSync(join(directory,file),JSON.stringify({run:index,prefixActions,rootHash,actions:failure.path,finalHash:fingerprint(failure.state),error:failure.error,failedAttempt:failure.attempted} satisfies BranchTrace));
       branchFiles.push(file);branchActions+=failure.path.length;
       failures.push({run:index,branch:file,day:failure.state.day,phase:failure.state.phase,card:currentCard(failure.state)?.id,error:failure.error});
      }
     }
    }
    attempted=chooseAction(r,index,step,seen,plan);
    if(attempted.type==='choose'&&card){
     const option=availableOptions(r).find(o=>o.id===(attempted as {id:string}).id)!;
     pending.set(option.id,{nodes:nodeKeys(r,card),choices:choiceKeys(r,card,option)});
    }
    const next=act(r,attempted);if(next===r)throw new Error('Legal policy action made no transition');
    t.actions.push(attempted);r=next;actions++;
    for(const [id,keys]of pending)if(r.committed.includes(id)){for(const key of [...keys.nodes,...keys.choices])if(!seen.has(key))seen.set(key,ref);pending.delete(id);}
    witnessExits(before,r,ref,seen);witnessState(r,ref,seen);
    checkState(r,r.day!==before.day||r.phase==='ending'||r.emergency?.cardId!==before.emergency?.cardId||step%64===0);
   }
   if(r.phase!=='ending')throw new Error('Action budget exhausted before ending');
   t.ending=r.ending!.id;completed++;
   const next=purchased(reward(meta,r));meta=next.meta;t.purchases=next.purchases;
  }catch(error){
   t.error=String(error);t.failedAttempt=attempted;
   const stateFile=`failure-state-${String(index).padStart(5,'0')}.json`;
   writeFileSync(join(directory,stateFile),JSON.stringify(r));
   failures.push({run:index,seed,action:t.actions.length,attempted,day:r.day,phase:r.phase,card:currentCard(r)?.id,error:t.error,stateFile});
  }
  t.finalHash=fingerprint(r);
  t.summary={day:r.day,chains:r.authored?.chains.map(c=>({chain:c.chain,cursor:c.cursor,status:c.status,nodes:c.consumed,facts:c.facts.map(f=>f.type),commitments:c.commitments.map(c=>({type:c.type,status:c.status,due:c.due})),resolution:c.resolution}))??[]};
  const file=`run-${String(index).padStart(5,'0')}.json`;writeFileSync(join(directory,file),JSON.stringify(t));traceFiles.push(file);
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({runs:index+1,completed,actions,explorationSteps,branches:branchFiles.length,witnessed:seen.size,failures:failures.length}));
  if(failures.length>=failureLimit)break;
 }
 writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
 let replayed=0,replayError:string|undefined;
 try{replayed=replayCampaign(directory);}catch(error){replayError=String(error);}
 const missing=universe.filter(key=>!seen.has(key));
 const groups=Object.fromEntries([...new Set(universe.map(k=>k.split(':')[0]))].map(group=>{const all=universe.filter(k=>k.startsWith(group+':'));return[group,{covered:all.filter(k=>seen.has(k)).length,total:all.length}];}));
 const complete=!failures.length&&!missing.length&&!replayError;
 const report={complete,samplesRequested:samples,samples:traceFiles.length,completed,actions,explorationSteps,branches:branchFiles.length,branchActions,replayed,replayError,groups,missing,failures,witnesses:Object.fromEntries(seen),offeredOnly:[...offered.keys()].filter(k=>!seen.has(k)),manualPlaythroughsCertified:false};
 manifest.complete=complete;
 writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
 writeFileSync(join(directory,'coverage.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({directory,complete,completed,actions,explorationSteps,branches:branchFiles.length,branchActions,replayed,replayError,groups,missing:missing.length,failures},null,2));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const replay=process.argv.indexOf('--replay');
 if(replay>=0)console.log(JSON.stringify({replayed:replayCampaign(resolve(process.argv[replay+1]))}));
 else{
  const out=process.argv.indexOf('--out'),count=Number(process.argv[2]??100);
  const branches=process.argv.indexOf('--branches');
  const selected=process.argv.indexOf('--plans'),plans=selected>=0?process.argv[selected+1]?.split(',')as RoutePlan[]:undefined;
  const prefix=process.argv.indexOf('--seed-prefix');
  const report=auditRoutes(count,out>=0?resolve(process.argv[out+1]):resolve(`route-audit-${Date.now()}`),5,branches>=0?Number(process.argv[branches+1]):0,plans,prefix>=0?process.argv[prefix+1]:undefined);
  if(report.failures.length||report.replayError||process.argv.includes('--require-complete')&&!report.complete)process.exitCode=1;
 }
}
