import {it,expect}from 'vitest';
import {coverageUniverse,legalTalentDeal,fingerprint,caseCoverageIndex,needsCheckpoint,chooseAction,witnessedEventConditions}from './audit-routes';
import {TALENTS}from '../src/game/catalog';
import {act,startRun}from '../src/game/engine';
import {EVENT_BY_ID,eventToCard}from '../src/content/events/catalog';
import type {Card}from '../src/game/types';
it('starts from the same nine-card deal as the setup screen',()=>{
 const first=legalTalentDeal('visible-talents');
 expect(first).toHaveLength(9);expect(new Set(first).size).toBe(9);
 expect(first.every(id=>TALENTS.some(t=>t.id===id))).toBe(true);
 expect(legalTalentDeal('visible-talents')).toEqual(first);
 expect(legalTalentDeal('another-deal')).not.toEqual(first);
});
it('enumerates every source node separately from its source choices and endings',()=>{
 const keys=coverageUniverse();
 expect(new Set(keys).size).toBe(keys.length);
 expect(keys.filter(k=>k.startsWith('clinical-node:'))).toHaveLength(134);
 expect(keys.filter(k=>k.startsWith('butterfly-node:'))).toHaveLength(32);
 expect(keys.filter(k=>k.startsWith('event:'))).toHaveLength(212);
 expect(keys.filter(k=>k.startsWith('event-choice:'))).toHaveLength(634);
 expect(keys.filter(k=>k.startsWith('event-condition:'))).toEqual(['event-condition:E-209-c']);
 expect(keys.filter(k=>k.startsWith('patient:'))).toHaveLength(251);
 expect(keys.filter(k=>k.startsWith('ending:'))).toHaveLength(41);
 expect(fingerprint(keys)).toBe(fingerprint(coverageUniverse()));
});
it.each(['a','b'])('E209-%s witnesses the source corruption condition only after the actual departure',letter=>{
 // Event-host fixture, not a campaign entrance proof.
 for(const corruption of [false,true]){
  let r=startRun(`departure-condition:${letter}:${corruption}`,'程医生',[]);
  r.phase='play';r.shiftPhase='结算';
  if(corruption)r.facts['kickback-received']={day:1,source:'E-135',sequence:0};
  const card=eventToCard(EVENT_BY_ID['E-209'],{instanceId:'departure',scope:{kind:'personal',id:r.id},day:r.day,phase:'结算'});
  r.authored!.published[card.id]=card;r.queue=[card];r.cursor=0;
  expect(witnessedEventConditions(r)).toEqual([]);
  r=act(r,{type:'choose',id:`departure:E-209-${letter}`});
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  expect(r.phase).toBe('ending');expect(r.ending!.id).toBe(corruption?'X32':'X31');
  expect(witnessedEventConditions(r)).toEqual(corruption?['event-condition:E-209-c']:[]);
  r.authored!.ledger.outcomes=[];
  expect(witnessedEventConditions(r)).toEqual([]);
 }
});
it('keeps exploring a case when entry choices are covered but a later conditional node is not',()=>{
 const keys=['clinical-node:C009:s1','clinical-choice:C009:s1_check','clinical-node:C009:s2r','clinical-outcome:C009:o_best',
  'clinical-node:C005:s3mrv','preset-node:preset:C-009:s1','preset-choice:preset:C-009:s1:review','event:E-009'];
 const index=caseCoverageIndex(keys),clinical=index.get('clinical:C009')!;
 expect(clinical).toEqual(keys.slice(0,4));
 const seen=new Set(clinical.slice(0,2));
 expect(needsCheckpoint(clinical,seen)).toBe(true);
 clinical.forEach(k=>seen.add(k));expect(needsCheckpoint(clinical,seen)).toBe(false);
 expect(needsCheckpoint(index.get('clinical:C005')!,seen)).toBe(true);
 expect(index.get('preset:C-009')).toEqual(keys.slice(5,7));
 expect(needsCheckpoint([],seen)).toBe(false);
 expect([...index.values()].flat()).not.toContain('event:E-009');
});
it('does not postpone a planned chain because a fork already covered its entry',()=>{
 // Policy boundary fixture only; not a campaign reachability witness.
 const r=startRun('route-priority','程医生',[]);r.shiftPhase='结算';
 const card=(id:string,eventId:string):Card=>({id,kind:'story',shiftPhase:'结算',title:'当日约谈',text:'',scope:{kind:'personal',id},
  options:[{id:`${id}:${eventId}-a`,label:'按约答复',ap:0,minutes:0,cost:0,effects:{},result:''}],...{authoredEventId:eventId}});
 const target=card('invitation','E-132'),ordinary=card('ordinary','E-014');
 r.queue=[target,ordinary];r.cursor=0;r.phase='play';
 const seen=new Map([['event:E-132',{run:0,action:0,day:1}]]);
 const before=fingerprint(r);
 expect(chooseAction(r,0,0,seen,'research')).toEqual({type:'choose',id:target.options[0].id});
 expect(fingerprint(r)).toBe(before);
 r.queue=[ordinary,target];
 expect(chooseAction(r,0,0,new Map(),'research')).toEqual({type:'focus',id:target.id});
 target.options[0].when={all:['not-acquired']};
 expect(chooseAction(r,0,0,new Map(),'research')).toEqual({type:'choose',id:ordinary.options[0].id});
});
