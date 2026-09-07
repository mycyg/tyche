import {readFileSync,writeFileSync}from 'node:fs';
import {join,resolve}from 'node:path';
import {pathToFileURL}from 'node:url';
import {act,startRun,newMeta,reward,upgrade,currentCard,type UpgradeKind}from '../src/game/engine';
import {authoredGraphWorld,type ButterflyCard}from '../src/game/director';
import {BUTTERFLY_NODES,butterflyNodeEligible}from '../src/content/events/butterfly';
import {fingerprint,legalTalentDeal}from './audit-routes';
import {storageRunIssues}from '../src/game/storage';
import type {Run,Action}from '../src/game/types';

/** Diagnostic re-execution against the current engine. No source-hash waiver
 * for coverage: every action must remain legal and the final state must match.
 * This report explains gates; it does not add reachability witnesses. */
export function diagnoseChainRoutes(directory:string){
 const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'))as {traceFiles:string[]};
 let meta=newMeta();
 return manifest.traceFiles.map(file=>{
  const t=JSON.parse(readFileSync(join(directory,file),'utf8'))as {index:number;seed:string;instanceId:string;talents:string[];difficulty:Run['difficulty'];actions:Action[];metaBefore:string;finalHash:string;ending?:string;purchases:{kind:UpgradeKind;key?:string}[]};
  if(fingerprint(meta)!==t.metaBefore||t.talents.some(id=>!legalTalentDeal(t.seed).includes(id)))throw new Error(`Start changed: ${file}`);
  let r=startRun(t.seed,'程医生',t.talents,meta,t.difficulty,t.instanceId);
  const timeline:unknown[]=[],seen=new Map<string,string>();
  const inspect=(step:number)=>{
   if(!r.authored)return;
   for(const c of r.authored.chains){
    const w=authoredGraphWorld(r,r.authored,c,r.shiftPhase??'结算');
    const cards=Object.values(r.authored.published).filter(card=>(card as Partial<ButterflyCard>).butterfly?.chainStateId===c.id);
    const pending=cards.filter(card=>!card.options.some(o=>r.committed.includes(o.id))).map(card=>({node:(card as ButterflyCard).butterfly.nodeId,
     queued:r.queue.some(q=>q.id===card.id),offered:r.authored!.echoDays?.find(d=>d.cardIds.includes(card.id))?.day,
     agenda:r.authored!.sceneAgenda?.find(a=>a.cardId===card.id)}));
    const nodes=BUTTERFLY_NODES.filter(n=>n.id.startsWith(c.chain)&&!c.consumed.includes(n.id)).map(n=>({id:n.id,eligible:butterflyNodeEligible(c,n,w),missing:n.requiredFacts.filter(f=>!w.facts.includes(f)&&!c.facts.some(x=>x.type===f))}));
    const data={day:r.day,phase:r.shiftPhase,chain:c.id,cursor:c.cursor,status:c.status,consumed:c.consumed,peer:r.relations.peer,
     facts:c.facts.map(f=>({type:f.type,day:f.day})),pending,nodes};
    const key=fingerprint(data);if(seen.get(c.id)===key)continue;seen.set(c.id,key);
    timeline.push({step,card:currentCard(r)?.id,...data});
   }
  };
  for(const [step,action]of t.actions.entries()){
   inspect(step);const next=act(r,action);if(next===r)throw new Error(`Action no longer legal: ${file}:${step}`);r=next;
  }
  inspect(t.actions.length);
  const issues=storageRunIssues(r);if(issues.length)throw new Error(`Save invalid: ${file}:${issues.join(',')}`);
  if(fingerprint(r)!==t.finalHash)throw new Error(`End state changed: ${file}`);
  if(t.ending){meta=reward(meta,r);for(const p of t.purchases){const next=upgrade(meta,p.kind,p.key);if(next===meta)throw new Error(`Purchase changed: ${file}`);meta=next;}}
  return{run:t.index,seed:t.seed,ending:t.ending,actions:t.actions.length,timeline};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=diagnoseChainRoutes(resolve(process.argv[2]));
 writeFileSync(resolve(process.argv[3]),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.map(r=>({run:r.run,actions:r.actions,observations:r.timeline.length}))));
}
