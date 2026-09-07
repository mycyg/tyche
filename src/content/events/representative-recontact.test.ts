import {describe,it,expect}from 'vitest';
import {startRun,act}from '../../game/engine';
import {buildAuthoredEvents,settleAuthoredEvents}from '../../game/director';
import {EVENT_BY_ID,eventToCard}from './catalog';
import {decode,encode,emptySave,storageRunIssues}from '../../game/storage';
import {makeRepresentativeRecontact,type RepresentativeRecontactCard}from './representative-recontact';
import type {Run}from '../../game/types';
function refuseFirst():Run{
 let r=startRun('rep-recontact-route7','程医生',[]);r.day=7;const card=eventToCard(EVENT_BY_ID['E-132'],{instanceId:`${r.id}:first-dinner`,day:7,phase:'结算',scope:{kind:'project',id:`${r.id}:representative-account`},actorId:'ye'});
 r={...r,...buildAuthoredEvents(r,'交班').patch};r.authored!.published[card.id]=card;r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='结算';r=act(r,{type:'choose',id:card.options[1].id});if(r.phase==='roll')r=act(r,{type:'ack-roll'});return r;
}
function due(r:Run){const pending=Object.entries(r.authored!.activeFacts).find(([id])=>id.startsWith('rep-recontact-due:'))!;r={...r,day:pending[1].day};const built=buildAuthoredEvents(r,'结算'),card=built.cards.find(c=>'representativeRecontact'in c)as RepresentativeRecontactCard;expect(card).toBeDefined();return {r:{...r,...built.patch,queue:[card],cursor:0,phase:'play' as const,shiftPhase:'结算' as const},card};}
describe('source 03 renewed representative contact',()=>{
 it('waits three days after an actual refusal, preserves E once-only history, and survives reload without duplicate offers',()=>{
  const before=refuseFirst(),money=before.cash;expect(before.authored!.drugCooldownUntil).toBe(10);expect(before.authored!.seen['E-132']).toBe(7);
  expect(buildAuthoredEvents({...before,day:9},'结算').cards.some(c=>'representativeRecontact'in c)).toBe(false);
  const {r,card}=due(before);expect(card.representativeRecontact.stage).toBe(0);expect(card).not.toHaveProperty('authoredEventId');expect(r.cash).toBe(money);expect(storageRunIssues(r)).toEqual([]);
  const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored.authored!.seen['E-132']).toBe(7);expect(buildAuthoredEvents(restored,'结算').cards).toHaveLength(0);
  const freshPhase=structuredClone(restored);freshPhase.authored!.scheduled=[];expect(buildAuthoredEvents(freshPhase,'结算').cards.some(c=>c.id===card.id)).toBe(false);
  const corrupt=structuredClone(r);(corrupt.queue[0]as RepresentativeRecontactCard).representativeRecontact.priorChoiceId='not-a-real-refusal';expect(storageRunIssues(corrupt)).toContain('references');
 });
 it('requires a separate later acceptance for each new payment and does not credit an unaccepted future invitation',()=>{
  let r=refuseFirst();const initial=r.cash;
  for(const stage of [0,1,2]){const offered=due(r);expect(offered.card.representativeRecontact.stage).toBe(stage);r=act(offered.r,{type:'choose',id:offered.card.options[0].id});expect(r.cash).toBe(initial+(stage===2?3000:0));expect(storageRunIssues(r)).toEqual([]);const again=act(r,{type:'choose',id:offered.card.options[0].id});expect(again.cash).toBe(r.cash);}
  expect(r.authored!.benefitsReceived).toBe(3000);expect(Object.keys(r.authored!.seen)).not.toContain('REP-RECONTACT');
  const closed=settleAuthoredEvents(r,'日终',true);expect(closed.patch.authored.endNotes.some(n=>n.includes('新邀请尚未接受'))).toBe(true);expect(closed.effects.some(e=>(e.effects.cash??0)>0)).toBe(false);
 });
 it('does not turn an unsuccessful refusal into consent or accept money on behalf of the player',()=>{
  const r=refuseFirst();for(const stage of [1,2,3,4,5]){const card=makeRepresentativeRecontact(r,stage,r.committed.at(-1)!,10),refuse=card.options.find(o=>o.id.endsWith(':refuse'))!;expect(refuse.check?.failure.flags).toContain('药代-拒绝');expect(refuse.check?.failure.cash).toBeUndefined();expect(refuse.check?.failure.flags).not.toContain('药代-5回扣');}
 });
});
