import {describe,it,expect}from 'vitest';
import {act,availableOptions,startRun}from './engine';
import {buildAuthoredEvents,settleAuthoredEvents,authoredGraphWorld}from './director';
import {startButterfly,commitButterflyChoice}from '../content/events/butterfly';
import {extraShiftCompleted}from './extra-shift';
import {confirmedLocalCareTransfer}from './care-completion';

// State-boundary tests; only audit-routes certifies natural-run prefixes.
function fixture(seed:string,partial=false){
 const r=startRun(seed,'程医生',['T27']);r.day=2;r.authored!.actor.liAwayDays=[];
 const chain=startButterfly('BTF-001',`${r.id}:shift`,{actorId:'li',shiftId:'shift:3'});
 r.authored!.chains=[commitButterflyChoice(chain,'BTF-001:N01a',authoredGraphWorld(r,r.authored!,chain,'交班')).state];
 r.authored!.activeFacts['extra-night:3']={day:2,source:'cover'};
 if(partial)r.authored!.activeFacts['extra-night-partial:3']={day:2,source:'confirmed-partial'};
 r.day=3;r.queue=[];r.cursor=0;r.phase='play';r.shiftPhase='夜班';
 const built=buildAuthoredEvents(r,'夜班');Object.assign(r,built.patch);
 r.queue=built.cards.filter(c=>c.patientId?.includes('night-extra')||c.id.includes('extra-night-call'));
 return r;
}
describe('actual extra-shift dispositions',()=>{
 it('counts confirmed transfers without fabricating a completed source chart',()=>{
  let checked=false;
  for(let seed=0;seed<20&&!checked;seed++){
   let r=fixture(`shift-transfer-${seed}`);
   const cards=r.queue.filter(c=>c.clinicalGraph),alarm=r.queue.find(c=>c.id.includes('extra-night-call'))!;
   let allTransferred=true;
   for(const card of cards){
    r.queue=[card];r.cursor=0;r.phase='play';delete r.feedback;
    const option=availableOptions(r).find(o=>o.talentAction==='transfer')!;expect(option).toBeDefined();
    r=act(r,{type:'choose',id:option.id});expect(r.phase).toBe('roll');r=act(r,{type:'ack-roll'});
    const p=r.patients.find(p=>p.uid===card.patientId)!;
    if(!confirmedLocalCareTransfer(r,p)){allTransferred=false;break;}
    expect(p.clinical!.outcomeId).toBeUndefined();
   }
   if(!allTransferred)continue;
   expect(extraShiftCompleted(r,r.authored!)).toBe(false);
   r.queue=[alarm];r.cursor=0;r.phase='play';delete r.feedback;
   r=act(r,{type:'choose',id:alarm.options[0].id});
   expect(extraShiftCompleted(r,r.authored!)).toBe(true);
   const result=settleAuthoredEvents(r,'日终'),c=result.patch.authored.chains[0];
   expect(c.commitments[0].status).toBe('completed');
   expect(c.facts.some(f=>f.type==='cover_completed')).toBe(true);
   expect(settleAuthoredEvents({...r,...result.patch},'日终').effects).toEqual([]);
   checked=true;
  }
  expect(checked).toBe(true);
 });
 it('does not mistake a request, inactive bed, another day or missing receipt for transfer completion',()=>{
  const r=fixture('unconfirmed-cover',true),p=r.patients.find(p=>p.uid.includes('night-extra'))!;
  const source='transfer-request';p.active=p.inpatient=false;p.bed=0;r.committed.push(source);
  expect(extraShiftCompleted(r,r.authored!)).toBe(false);
  r.facts[`local-care-transferred:${p.uid}`]={day:2,sequence:0,source};expect(extraShiftCompleted(r,r.authored!)).toBe(false);
  r.facts[`local-care-transferred:${p.uid}`]={day:3,sequence:0,source:'not-committed'};expect(extraShiftCompleted(r,r.authored!)).toBe(false);
  r.facts[`local-care-transferred:${p.uid}`]={day:3,sequence:0,source};expect(extraShiftCompleted(r,r.authored!)).toBe(true);
  p.active=true;expect(extraShiftCompleted(r,r.authored!)).toBe(false);
 });
});
