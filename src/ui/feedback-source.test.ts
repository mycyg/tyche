import {describe,it,expect}from 'vitest';
import {act,startRun,currentCard,availableOptions}from '../game/engine';
import {emptySave,decode,encode}from '../game/storage';
import {feedbackSource,feedbackVoiceActor}from './feedback-source';
import {createPatient}from '../game/cards';
import {beginClinical,clinicalCard}from '../game/clinical';
import type {Card}from '../game/types';
import {BUTTERFLY_CHOICE_RESULTS}from '../content/events/butterfly-prose';
describe('feedback portrait and voice retain the actual speaker through interruptions',()=>{
 it.each(['BTF-001:N01b','BTF-001:N03c'])('voices the submitted player refusal %s without changing the listener portrait',id=>{
  let r=startRun('butterfly-speaker-source','程医生',[]);r.phase='play';
  const card={id:'spoken-refusal',kind:'story' as const,title:'答复',text:'李恂等你答复。',actor:'peer',scope:{kind:'personal' as const,id:r.id},butterfly:{chainStateId:'speaker-fixture',nodeId:id.slice(0,-1),day:1,phase:'交班' as const},options:[{id:`spoken:${id}`,label:'拒绝',ap:0,minutes:0,cost:0,effects:{},result:BUTTERFLY_CHOICE_RESULTS[id]}]};
  r.queue=[card];r.cursor=0;r=act(r,{type:'choose',id:card.options[0].id});
  expect(feedbackSource(r)?.actor).toBe('peer');expect(feedbackVoiceActor(r)).toBe('hero');
 });
 it('keeps the nurse response separate from the mother result that resumes afterward',()=>{
  let r=startRun('feedback-interruption','程医生',[]);r.phase='play';r.shiftPhase='日终';r.vitals.emotion=5;
  const mother:Card={id:'mother-refusal',title:'母亲来电',text:'母亲问起买车的钱。',actor:'mother',kind:'story',scope:{kind:'personal',id:r.id},options:[{id:'mother-refusal:no',label:'说明现在无法承担',ap:0,minutes:0,cost:0,result:'你说明了自己的存款和开销。',effects:{emotion:-10}}]};
  r.queue=[mother];r.cursor=0;r=act(r,{type:'choose',id:mother.options[0].id});
  expect(r.emergency).toBeDefined();
  const acute=currentCard(r)!;const option=availableOptions(r).find(o=>o.id.endsWith('E-203-c'))!;
  expect(option).toBeDefined();r=act(r,{type:'choose',id:option.id});
  expect(r.feedback!.sourceCardId).toBe(acute.id);expect(feedbackSource(r)?.actor).toBe(acute.actor);
  expect(feedbackSource(r)?.actor).not.toBe('mother');
  r=decode(encode({...emptySave(),run:r})).run!;expect(feedbackSource(r)?.id).toBe(acute.id);
  r=act(r,{type:'continue'});expect(feedbackSource(r)?.id).toBe(mother.id);expect(feedbackSource(r)?.actor).toBe('mother');
 });
 it('uses neutral narration when an old result cannot be tied to a committed scene',()=>{
  const r=startRun('feedback-old-neutral','程医生',[]);r.feedback={title:'纸杯',text:'你放下纸杯。',changes:[],next:'play'};
  expect(feedbackSource(r)).toBeUndefined();
 });
 it('uses the submitted clinical choice to voice the doctor’s consent explanation',()=>{
  // Isolated clinical-node fixture, not a campaign path claim.
  let r=startRun('clinical-speaker-source','程医生',[]);
  const p=createPatient(r,'C008','voice-boundary');r.patients.push(p);beginClinical(r,p);
  p.clinical!.nodeId='s3';p.clinical!.entered=['s1','s2','s3'];
  p.clinical!.flags.push('persuasion_failed');
  r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=30;r.cash=10000;
  const option=availableOptions(r).find(o=>o.clinicalChoice==='s3_sign')!;
  r=act(r,{type:'choose',id:option.id});if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  expect(r.phase).toBe('feedback');expect(feedbackVoiceActor(r)).toBe('hero');
  const restored=decode(encode({...emptySave(),run:r})).run!;
  expect(feedbackVoiceActor(restored)).toBe('hero');
 });
});
