import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions}from './engine';
import {buildAuthoredEvents,type ButterflyCard,type ButterflyMergeCard}from './director';
import {startButterfly,type ButterflyState}from '../content/events/butterfly';
import {emptySave,encode,decode,storageRunIssues}from './storage';
import {scheduleEchoScenes}from '../content/events/scene-agenda';
import type {Card,Run}from './types';

const fact=(s:ButterflyState,type:string)=>s.facts.push({id:`${s.id}:${type}`,type,scope:s.scope,subjects:{...s.subjects},day:7,sourceChoiceId:'fixture-source',knownBy:['player']});
function fixture(extra=false){
 let r=startRun('merge-snapshot-fixture','程医生',[]);r.day=12;r.ap=40;r.phase='play';r.shiftPhase='结算';
 const s=r.authored!;s.actor.sharedResearch=true;s.actor.zhouAwayDays=[];s.actor.liAwayDays=[];
 const subjects={projectId:'same-project',paymentId:'same-payment',sponsorId:'ye'};
 const cash=startButterfly('BTF-002','cash',{actorId:'li',...subjects},'N05'),work=startButterfly('BTF-004','research',{actorId:'zhou',...subjects},'N05');
 fact(cash,'conditional_offer_accepted');fact(cash,'exchange_request_received');fact(work,'same_project_invitation');
 s.chains=[cash,work];
 if(extra){const other=startButterfly('BTF-004','unrelated',{actorId:'zhou',projectId:'other-project',paymentId:'other-payment',sponsorId:'ye'},'N05');fact(other,'same_project_invitation');s.chains.unshift(other);}
 const previous:ButterflyCard={id:'cash:N05',title:'旧待办',text:'等候处理。',kind:'story',shiftPhase:'结算',scope:cash.scope,chain:cash.chain,options:[{id:'cash:BTF-002:N05b',label:'拒绝',ap:0,minutes:0,cost:0,effects:{},result:'拒绝。'}],butterfly:{chainStateId:cash.id,nodeId:cash.cursor,day:11,phase:'结算'}};
 s.published[previous.id]=previous;r.queue=[previous];r.cursor=0;
 const built=buildAuthoredEvents(r,'结算');
 r={...r,...built.patch,queue:[...r.queue.filter(c=>!built.removeCardIds.includes(c.id)),...built.cards]};
 const merge=r.queue.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
 expect(merge).toBeDefined();r.cursor=r.queue.indexOf(merge);
 return{r,merge,previous};
}
describe('precise merge scene ownership, persistence and continuation',()=>{
 it('records both claimed nodes and exits, and leaves an unrelated third project in its own queue',()=>{
  const {r,merge,previous}=fixture(true);
  expect(merge.butterflyMerge.chainStateIds).toEqual(['cash','research']);
  expect(merge.butterflyMerge.claimedSceneIds).toContain(previous.id);
  expect(merge.butterflyMerge.continuations).toEqual([
   {chainStateId:'cash',sourceNode:'BTF-002:N05',targetNode:'BTF-002:N06'},
   {chainStateId:'research',sourceNode:'BTF-004:N05',targetNode:'BTF-004:N06'},
  ]);
  expect(r.queue.some(c=>c.id===previous.id)).toBe(false);
  expect(merge.butterflyMerge.claimedSceneIds?.some(id=>id.startsWith('unrelated:'))).toBe(false);
  expect(r.authored!.chains.find(c=>c.id==='unrelated')?.consumed).toEqual([]);
  expect(storageRunIssues(r)).toEqual([]);
  expect(decode(encode({...emptySave(),run:r})).run!.authored!.published[merge.id]).toEqual(merge);
 });
 it('restores only the original unconsumed source nodes when the player chooses separate handling',()=>{
  const {r,merge}=fixture();
  const after=act(r,{type:'choose',id:availableOptions(r).find(o=>o.id.endsWith(':separate'))!.id});
  expect(after.ap).toBe(r.ap);expect(after.authored!.ledger.commits).toContain(`merge:${merge.id}`);
  for(const chain of ['cash','research']){
   expect(after.queue.filter(c=>c.id===`${chain}:N05`)).toHaveLength(1);
   expect(after.authored!.chains.find(c=>c.id===chain)!.consumed).not.toContain(chain==='cash'?'BTF-002:N05':'BTF-004:N05');
  }
  expect(storageRunIssues(after)).toEqual([]);
 });
 it('charges a merge once, consumes the exact source nodes, and does not claim a paper or data transfer was performed',()=>{
  const {r,merge}=fixture(),choice=availableOptions(r).find(o=>o.id.endsWith(':XJ02a'))!;
  const after=act(r,{type:'choose',id:choice.id});
  expect(after.ap).toBe(r.ap-choice.ap);
  for(const [id,node]of [['cash','BTF-002:N05'],['research','BTF-004:N05']]){
   const chain=after.authored!.chains.find(c=>c.id===id)!;expect(chain.consumed.filter(n=>n===node)).toHaveLength(1);
   expect(chain.facts.some(f=>['submitted','exchange_performed'].includes(f.type))).toBe(false);
  }
  expect(after.authored!.ledger.commits.filter(c=>c===`merge:${merge.id}`)).toHaveLength(1);
  expect(act(after,{type:'choose',id:choice.id})).toBe(after);
  expect(storageRunIssues(after)).toEqual([]);
 });
 it('does not silently adopt a different source node after the saved merge was offered',()=>{
  const {r}=fixture();r.authored!.chains.find(c=>c.id==='cash')!.cursor='BTF-002:N08';
  expect(availableOptions(r).map(o=>o.id.split(':').at(-1))).toEqual(['separate']);
 });
 it('rechecks each source prerequisite without borrowing a fact from the other project participant',()=>{
  const {r}=fixture(),cash=r.authored!.chains.find(c=>c.id==='cash')!,work=r.authored!.chains.find(c=>c.id==='research')!;
  cash.facts=[];fact(work,'conditional_offer_accepted');fact(work,'exchange_request_received');
  expect(availableOptions(r).map(o=>o.id.split(':').at(-1))).toEqual(['separate']);
 });
 it('rejects a changed return node, fabricated claimed scene or mismatched chain binding on import',()=>{
  const valid=fixture();
  for(const mutate of [
   (r:Run)=>{(r.authored!.published[valid.merge.id]as ButterflyMergeCard).butterflyMerge.continuations![0].targetNode='BTF-004:N06';},
   (r:Run)=>{(r.authored!.published[valid.merge.id]as ButterflyMergeCard).butterflyMerge.claimedSceneIds!.push('missing-scene');},
   (r:Run)=>{(r.authored!.published[valid.merge.id]as ButterflyMergeCard).butterflyMerge.continuations![0].chainStateId='research';},
  ]){const corrupt=structuredClone(valid.r);mutate(corrupt);expect(storageRunIssues(corrupt).length).toBeGreaterThan(0);}
 });
 it('removes only the claimed appointment from the future agenda, retaining another node of the same chain',()=>{
  const {r,merge,previous}=fixture();
  const other={...previous,id:'cash:N07',butterfly:{...previous.butterfly,nodeId:'BTF-002:N07'},options:[{...previous.options[0],id:'cash:BTF-002:N07a'}]};
  const state={published:{[previous.id]:previous,[other.id]:other,[merge.id]:merge}as Record<string,Card>,sceneAgenda:[{cardId:previous.id,due:11,phase:'结算' as const},{cardId:other.id,due:11,phase:'结算' as const}]};
  const offered=scheduleEchoScenes(r,state,'结算',[merge]);
  expect([...offered.map(c=>c.id),...state.sceneAgenda.map(c=>c.cardId)]).not.toContain(previous.id);
  expect([...offered.map(c=>c.id),...state.sceneAgenda.map(c=>c.cardId)]).toContain(other.id);
 });
});
