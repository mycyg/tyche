import {describe,it,expect}from 'vitest';
import {startRun,act}from './engine';
import {authoredGraphWorld}from './director';
import {startButterfly,commitButterflyChoice,butterflyNodeEligible,BUTTERFLY_NODES}from '../content/events/butterfly';
import {isRepresentativeBenefit}from './representative-benefit';
import {visibleChoiceEffects}from '../ui/copy';
import type {Card}from './types';

// Source-boundary tests only. The campaign auditor supplies natural witnesses.
describe('research invitations precede acceptance without inventing work',()=>{
 function fixture(){
  const r=startRun('teaching-source','程医生',[]);r.day=6;r.ap=10;
  r.authored!.actor.sharedResearch=true;r.authored!.actor.zhouAwayDays=[];
  let chain=startButterfly('BTF-004','teaching',{actorId:'zhou',projectId:'actual-project',datasetId:'actual-slides'});
  chain.entrySource='department-teaching';
  chain=commitButterflyChoice(chain,'BTF-004:N01b',authoredGraphWorld(r,r.authored!,chain,'结算')).state;
  r.authored!.chains=[chain];return{r,chain};
 }
 it('allows a same-project request and invitation with no acceptance or deadline marker',()=>{
  const {r,chain}=fixture();r.day=8;
  expect(chain.facts.some(f=>f.type==='project_accepted')).toBe(false);
  expect(r.authored!.activeFacts['科研-deadline']).toBeUndefined();
  const w=authoredGraphWorld(r,r.authored!,chain,'结算');
  for(const id of ['BTF-004:N02','BTF-004:N05'])expect(butterflyNodeEligible(chain,BUTTERFLY_NODES.find(n=>n.id===id)!,w),id).toBe(true);
  expect(w.facts).not.toContain('manuscript_due');expect(w.facts).not.toContain('verification_completed');
  expect(w.facts).not.toContain('project_accepted');expect(w.facts).not.toContain('zhou_saw_original');
 });
 it('does not fabricate the same project from a name, missing file or cancelled lecture',()=>{
  const {r,chain}=fixture();r.day=8;
  for(const variant of ['unrelated','missing-dataset','cancelled','unperformed']as const){
   const copy=structuredClone(chain),world=structuredClone(r);
   if(variant==='unrelated')world.authored!.actor.sharedResearch=false;
   if(variant==='missing-dataset')delete copy.subjects.datasetId;
   if(variant==='cancelled')copy.facts.push({...copy.facts[0],id:'cancelled',type:'lecture_cancelled'});
   if(variant==='unperformed')copy.consumed=[];
   const w=authoredGraphWorld(world,world.authored!,copy,'结算');
   expect(w.facts,variant).not.toContain('same_dataset_request');
   expect(w.facts,variant).not.toContain('same_project_invitation');
  }
 });
});
describe('representative pressure relief shares the displayed and paid calculation',()=>{
 it.each([['rep',-5,-10],['family',-5,-5],['rep',5,5]]as const)('%s pressure %s becomes %s only once',(actor,pressure,expected)=>{
  let r=startRun('gray-pressure','程医生',['T28']);r.authored!.pressure=20;
  const card:Card={id:'actual-offer',kind:'story',actor,scope:{kind:'personal',id:r.id},title:'来电',text:'对方来电。',options:[{id:'actual-offer:reply',label:'答复',ap:0,cost:0,minutes:0,result:'已答复。',effects:{cashPressure:pressure}}]};
  r.queue=[card];r.cursor=0;r.phase='play';const option=card.options[0];
  expect(isRepresentativeBenefit(card,option.effects)).toBe(actor==='rep'&&pressure<0);
  expect(visibleChoiceEffects(r,option.effects,card).cashPressure).toBe(expected);
  r=act(r,{type:'choose',id:option.id});expect(r.authored!.pressure).toBe(20+expected);
  expect(act(r,{type:'choose',id:option.id})).toBe(r);
 });
});
