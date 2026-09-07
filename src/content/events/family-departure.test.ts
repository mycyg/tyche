import {describe,it,expect}from 'vitest';
import {startRun}from '../../game/engine';
import {startButterfly,butterflyResolutionView}from './butterfly';
import {canLeaveForFamily,postponeFamilyDepartureWork}from './family-departure';
import {deadlineCandidates,approvedDeadlineChanges}from './butterfly-deadlines';
import {hasScopedButterflyReview,butterflyReviewScope}from './butterfly-review';
import type {Card}from '../../game/types';

describe('dated obligations and actual delivery',()=>{
 it('keeps patient work blocking departure and defers research without extending its deadline',()=>{
  const r=startRun('family-departure','程医生',[]),s=r.authored!;
  expect(canLeaveForFamily(r)).toBe(false);
  const chain=startButterfly('BTF-004','research',{actorId:'zhou',projectId:'project'});
  chain.commitments.push({id:'verification',type:'self_verification_accepted',source:'BTF-004:N04a',task:'核对资料',actorId:'player',status:'accepted',due:2});s.chains.push(chain);
  const card:Card={id:'due-paper',kind:'story',chain:'BTF-004',scope:chain.scope,title:'原始资料',text:'资料尚未核对。',options:[{id:'verify',label:'核对',ap:1,minutes:10,cost:0,effects:{},result:'已核对。'}]};
  const deadline=chain.commitments[0].due;r.queue=[card];r.cursor=0;
  expect(canLeaveForFamily(r)).toBe(true);
  expect(postponeFamilyDepartureWork(r,s,'family-now','choose-family')).toEqual([card.id]);
  expect(s.sceneAgenda?.find(a=>a.cardId===card.id)).toMatchObject({due:2,phase:'结算'});
  expect(chain.commitments[0]).toMatchObject({due:deadline,resumeDay:2,status:'accepted'});
  postponeFamilyDepartureWork(r,s,'family-now','choose-family');
  expect(s.sceneAgenda?.filter(a=>a.cardId===card.id)).toHaveLength(1);
 });
 it('does not reuse yesterday’s rescheduling permission',()=>{
  const r=startRun('dated-permission','程医生',[]);r.day=4;
  const chain=startButterfly('BTF-004','research',{actorId:'zhou',projectId:'project'});
  chain.commitments.push({id:'verification',type:'self_verification_accepted',source:'BTF-004:N04a',task:'核对资料',actorId:'player',status:'accepted',due:5});r.authored!.chains.push(chain);
  const candidates=deadlineCandidates(r);
  chain.facts.push({id:'permission',type:'deadlines_may_extend',scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'ask',day:3,knownBy:['player','zhou'],deadlineChanges:candidates});
  expect(approvedDeadlineChanges(r,chain)).toEqual([]);
  chain.facts[0].day=4;expect(approvedDeadlineChanges(r,chain)).toEqual(candidates);
 });
 it('does not turn an errand into a repayment or a family payment',()=>{
  const chain=startButterfly('BTF-002','errand',{actorId:'li'});
  chain.facts.push({id:'errand-receipt',type:'time_help_completed',scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'receipt',day:2,knownBy:['player','li']});
  const view=butterflyResolutionView(chain,{day:3,cash:100,ap:1,facts:[],actorAvailable:true});
  expect(view.id).toBe('BTF-002:R01');expect(view.text).toContain('没有涉及转款');
 });
 it('requires an inquiry into this transaction, after the transaction',()=>{
  const r=startRun('scoped-inquiry','程医生',[]),s=r.authored!;
  const chain=startButterfly('BTF-002','exchange',{actorId:'li'});s.chains.push(chain);
  chain.facts.push({id:'exchange',type:'exchange_performed',scope:chain.scope,subjects:chain.subjects,sourceChoiceId:'exchange',day:3,knownBy:['player','ye']});
  s.activeFacts['药代-约谈']={day:4,source:'general-inquiry'};
  expect(hasScopedButterflyReview(r,chain)).toBe(false);
  const card={id:'inquiry',kind:'story',title:'约谈',text:'核对往来',scope:{kind:'personal',id:'unrelated'},options:[],authoredEventId:'E-140',eventBinding:{day:4}}as unknown as Card;
  r.queue=[card];r.cursor=0;expect(hasScopedButterflyReview(r,chain)).toBe(false);
  card.scope=butterflyReviewScope(chain);expect(hasScopedButterflyReview(r,chain)).toBe(true);
  (card as Card&{eventBinding:{day:number}}).eventBinding.day=2;
  expect(hasScopedButterflyReview(r,chain)).toBe(false);
 });
});
