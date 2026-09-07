import {describe,expect,it}from 'vitest';
import {act,currentCard,startRun}from './engine';
import {afterAuthoredChoice,buildAuthoredEvents}from './director';
import {decode,encode,emptySave,storageRunIssues}from './storage';
import {EVENT_BY_ID,eventToCard,contextualOptions}from '../content/events/catalog';
import {buildTribunalPreparation,courtPreparationNotes}from '../content/events/court-preparation';
import type {Card}from './types';
import {eventTuning}from '../content/events/modifiers';
import {paperDefenseModifier}from '../content/events/specialized-checks';
import {prepareTalentEvent}from '../content/events/talent-adapter';
import {assessEnding}from '../content/events/ending-adapter';
const restore=(r:ReturnType<typeof startRun>)=>{expect(storageRunIssues(r)).toEqual([]);return decode(encode({...emptySave(),run:r})).run!;};
describe('specialized court and defense checks',()=>{
 it('enters two real preparation checks on day fifteen, reloads pending dice, and reaches the tribunal once',()=>{
  let r=startRun('court-prep-route','程医生',[]);r.day=14;r.phase='feedback';r.feedback={title:'值班结束',text:'十四天的工作已经结束。',changes:[],next:'day'};
  r=act(r,{type:'continue'});expect(r.day).toBe(15);expect(r.phase).toBe('play');expect(currentCard(r).chain).toBe('court-preparation');r=restore(r);
  const initialHazards=JSON.stringify(r.hazards),initialCash=r.cash;
  for(const skill of ['record','endure']){
   const card=currentCard(r);expect(card.id).toContain(`court-preparation:${skill}`);r=act(r,{type:'choose',id:card.options[0].id});expect(r.phase).toBe('roll');r=restore(r);
   const die=structuredClone(r.roll);r=act(r,{type:'ack-roll'});expect(r.phase).toBe('feedback');expect(r.roll).toEqual(die);r=restore(r);r=act(r,{type:'continue'});
  }
  expect(r.phase).toBe('tribunal');expect(r.day).toBe(15);expect(r.cash).toBe(initialCash);expect(JSON.stringify(r.hazards)).toBe(initialHazards);expect(buildTribunalPreparation(r)).toHaveLength(0);expect(courtPreparationNotes(r)).toHaveLength(2);
  r=act(r,{type:'testify',response:'facts'});expect(r.phase).toBe('ending');expect(r.ending?.annexes.some(a=>a.includes('卷宗整理'))).toBe(true);
 });
 it('keeps the eve-of-hearing bonus out of ordinary checks and the natural case-filing die',()=>{
  const r=startRun('court-only-bonus','程医生',[]);r.day=14;r.authored=buildAuthoredEvents(r,'交班').patch.authored;
  const card=eventToCard(EVENT_BY_ID['E-098'],{instanceId:'court-eve',scope:{kind:'patient',id:r.patients[0].uid},patientId:r.patients[0].uid,day:14,phase:'日终'}),done=afterAuthoredChoice(r,card,card.options[0],true),next={...r,...done.patch,day:15};
  expect(eventTuning(next.authored.ledger,15).skills.record??0).toBe(0);expect(buildTribunalPreparation(next)[0].options[0].check?.dc).toBe(13);
  expect(assessEnding(next).face).toBe(assessEnding({...next,authored:r.authored}).face);expect(assessEnding(next).dc).toBe(assessEnding({...next,authored:r.authored}).dc);
  const low=contextualOptions(EVENT_BY_ID['E-098'],{day:14,phase:'日终',facts:{},relations:{family:2}}),high=contextualOptions(EVENT_BY_ID['E-098'],{day:14,phase:'日终',facts:{},relations:{family:3}});
  expect(low[2].modifiers.some(m=>m.target==='court-preparation:endure')).toBe(false);expect(high[2].modifiers.some(m=>m.target==='court-preparation:endure')).toBe(true);
 });
 it('applies each authorship penalty only to that project defense, not project negotiations',()=>{
  let r=startRun('defense-only','程医生',[]);r.day=8;r.authored=buildAuthoredEvents(r,'交班').patch.authored;
  const scope={kind:'project' as const,id:`${r.id}:research-project`};
  for(const [event,choice]of [['E-189',2],['E-192',0]]as const){const card=eventToCard(EVENT_BY_ID[event],{instanceId:event,scope,day:8,phase:'结算'});r={...r,...afterAuthoredChoice(r,card,card.options[choice],true).patch};}
  r.day=12;expect(paperDefenseModifier(r,scope)).toBe(-2);expect(paperDefenseModifier(r,{kind:'project',id:'other-project'})).toBe(0);expect(eventTuning(r.authored!.ledger,12,scope).allChecks).toBe(0);
  const defense=eventToCard(EVENT_BY_ID['E-190'],{instanceId:'defense',scope,day:12,phase:'结算'},{day:12,phase:'结算',facts:{'科研-造假':true,'科研-主任课题':true}});
  expect(prepareTalentEvent(r,defense).options[0].check?.dc).toBe(16);
 });
});
it('carries an already-published but unoffered record request to the actual review without a duplicate',()=>{
 const r=startRun('court-queued-notice','程医生',[]);r.day=15;
 const id=`${r.id}:audit-echo:3`,card:Card={id,kind:'audit',title:'原件核对',text:'请核对已经通知的原件。',actor:'auditor',scope:{kind:'personal',id:r.id},options:[{id:`${id}:review`,label:'清点现有资料',ap:2,minutes:15,cost:0,effects:{},result:'实际持有的原件已清点。'}]};
 r.authored!.published[id]=card;r.authored!.sceneAgenda=[{cardId:id,due:13,phase:'结算'}];
 const queued=buildTribunalPreparation(r).filter(c=>c.id===id);expect(queued).toHaveLength(1);expect(queued[0].options[0]).toMatchObject({ap:0,minutes:0});expect(queued[0].text).toBe(card.text);
 r.committed.push(card.options[0].id);expect(buildTribunalPreparation(r).some(c=>c.id===id)).toBe(false);
});
