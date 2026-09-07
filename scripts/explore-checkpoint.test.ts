import {it,expect}from 'vitest';
import {act,availableOptions,currentCard,startRun}from '../src/game/engine';
import {exploreCheckpoint}from './explore-checkpoint';
import {fingerprint,legalTalentDeal}from './audit-routes';
import {TALENTS}from '../src/game/catalog';
import type {Action}from '../src/game/types';

it('all explored branches replay from an engine-reached checkpoint without changing it',()=>{
 const picks:string[]=[];
 for(const id of legalTalentDeal('branch-proof')){
  if(picks.length===3)break;
  if(picks.filter(p=>TALENTS.find(t=>t.id===p)!.family===TALENTS.find(t=>t.id===id)!.family).length<2)picks.push(id);
 }
 let root=startRun('branch-proof','程医生',picks),steps=0;
 // Reach the first complete case through the public actions. These are not
 // changes to the live user's save or evidence of a full browser playthrough.
 while((root.phase!=='play'||!currentCard(root)?.clinicalGraph)&&steps++<100){
  const action:Action=root.phase==='play'?{type:'choose',id:availableOptions(root)[0].id}:
   root.phase==='roll'?{type:'ack-roll'}:{type:'continue'};
  const next=act(root,action);expect(next).not.toBe(root);root=next;
 }
 expect(currentCard(root)?.clinicalGraph).toBeDefined();expect(root.phase).toBe('play');
 const original=fingerprint(root),paths:{path:Action[];hash:string}[]=[];
 const explored=exploreCheckpoint(root,32,({after,path})=>paths.push({path,hash:fingerprint(after)}));
 expect(explored.failures).toEqual([]);expect(explored.steps).toBeGreaterThan(3);expect(explored.steps).toBeLessThanOrEqual(32);
 expect(fingerprint(root)).toBe(original);
 for(const {path,hash}of paths){
  let state=root;for(const action of path){const next=act(state,action);expect(next).not.toBe(state);state=next;}
  expect(fingerprint(state)).toBe(hash);
 }
},30000);
it('a checkpoint exploration can stop when its explicit coverage target is met',()=>{
 const root=startRun('bounded-proof','程医生',[]);let visits=0;
 const result=exploreCheckpoint(root,100,()=>visits++,()=>0,()=>visits>=1);
 expect(result.steps).toBe(1);expect(visits).toBe(1);
});
