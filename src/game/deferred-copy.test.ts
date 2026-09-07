import {describe,it,expect}from 'vitest';
import {act,startRun,availableOptions}from './engine';
import {eventToCard,EVENT_BY_ID}from '../content/events';
import {RULES}from './rules';
import {decode,emptySave,encode}from './storage';
import {scheduledChoiceWork}from '../ui/scheduled-work';
import {EVENT_DEFERRED_RESULTS}from '../content/events/narrative';
import {createEventLedger,recordEventChoice,settleEventLedger}from '../content/events/ledger';
describe('deferred changes have a readable actual settlement record',()=>{
 it('does not invent commuting or overtime on a full leave day, and retains the actual receipt through reload',()=>{
  let r=startRun('commute-on-leave','程医生',[]);r.day=3;r.phase='play';r.shiftPhase='日终';r.ap=10;
  const card=eventToCard(EVENT_BY_ID['E-067'],{instanceId:'commute',day:3,phase:'日终',scope:{kind:'personal',id:r.id}});
  r.queue=[card];r.cursor=0;r.authored!.published[card.id]=card;
  r=act(r,{type:'choose',id:card.options.find(o=>o.id.endsWith(':E-067-c'))!.id});
  // Isolate the next-day deferred settlement; the normal leave/day-roll flow
  // itself is exercised by leave-duty.test, not claimed as a browser run.
  r.skipNextDay=true;r.phase='feedback';r.feedback={title:'次日',text:'交班已完成。',changes:[],next:'day'};
  r=act(r,{type:'continue'});
  const note=r.journal.find(e=>e.title==='后续消息'&&e.result.includes('通勤'))!;
  expect(note).toBeDefined();expect(note.result).toContain('今天休假');
  expect(note.result).not.toContain('本次变化：');expect(note.result).not.toContain('体力 -7');
  expect(r.caps).toEqual({stamina:100,san:100,emotion:100});
  expect(r.ap).toBe(0);expect(r.overtime).toBe(0);
  const restored=decode(encode({...emptySave(),run:r})).run!;
  expect(restored.journal.find(e=>e.id===note.id)).toEqual(note);
  expect(restored.journal.filter(e=>e.id===note.id)).toHaveLength(1);
 });
});
describe('a promise today is not an appointment already attended',()=>{
 it.each([
  ['E-110',0,'明天去骨科','你到骨科打了招呼'],
  ['E-116',0,'明天请半天假','你请了半天假回去'],
  ['E-127',0,'明天请半天假','一起吃了顿饭'],
 ] as const)('%s separates the response from the next-day receipt and resumes once', (event,index,promise,premature)=>{
  let r=startRun(`family-promise-${event}`,'程医生',[]);r.day=3;r.shiftPhase='日终';
  const card=eventToCard(EVENT_BY_ID[event],{instanceId:`promise-${event}`,day:3,phase:'日终',scope:{kind:'personal',id:r.id}});
  r.queue=[card];r.cursor=0;r.phase='play';r.authored!.published[card.id]=card;
  const option=card.options[index],sourceChoice=`${event}-a`;
  expect(option.deferred.some(d=>d.delay===1&&d.description===EVENT_DEFERRED_RESULTS[sourceChoice])).toBe(true);
  r=act(r,{type:'choose',id:option.id});
  expect(r.phase).toBe('feedback');expect(r.feedback?.text).toContain(promise);
  expect(r.feedback?.text).not.toContain(premature);
  expect(r.journal.some(e=>e.title==='后续消息'&&e.result.includes(EVENT_DEFERRED_RESULTS[sourceChoice]))).toBe(false);
  r=decode(encode({...emptySave(),run:r})).run!;expect(r).toBeDefined();
  // Isolated date-boundary fixture: real day/leave traversal has separate tests.
  r.phase='feedback';r.feedback={title:'次日',text:'交班已完成。',changes:[],next:'day'};
  r=act(r,{type:'continue'});expect(r.day).toBe(4);
  // Date-bound clauses settle at their actual phase boundary. Entering the
  // morning is not itself evidence that every morning appointment happened.
  for(let step=0;step<60&&r.day===4&&r.shiftPhase==='交班';step++){
   if(r.phase==='play'){
    const next=availableOptions(r)[0];expect(next).toBeDefined();
    r=act(r,{type:'choose',id:next.id});
   }else if(r.phase==='roll')r=act(r,{type:'ack-roll'});
   else if(r.phase==='feedback')r=act(r,{type:'continue'});
   else throw new Error(`Unexpected appointment fixture phase: ${r.phase}`);
  }
  expect(r.day).toBe(4);expect(r.shiftPhase).not.toBe('交班');
  const receipts=r.journal.filter(e=>e.title==='后续消息'&&e.result.includes(EVENT_DEFERRED_RESULTS[sourceChoice]));
  expect(receipts).toHaveLength(1);expect(receipts[0].day).toBe(4);
  const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();
  expect(restored.journal.filter(e=>e.id===receipts[0].id)).toEqual(receipts);
 });
 it('refusing a dinner does not put tomorrow’s question into today’s answer',()=>{
  const option=EVENT_BY_ID['E-132'].options[1];
  expect(option.result).toBe('你回话说不参加聚餐，没有去赴约。');
  expect(option.deferred.some(d=>d.delay===1&&d.description===EVENT_DEFERRED_RESULTS['E-132-b'])).toBe(true);
  expect(option.check?.failureText).toContain('当面追问');
  expect(option.failureDeferred??[]).toHaveLength(0);
 });
 it.each([0,2])('E-168 option %s books tomorrow’s meal and records attendance once at the outpatient phase',index=>{
  const card=eventToCard(EVENT_BY_ID['E-168'],{instanceId:`audit-lunch-${index}`,scope:{kind:'project',id:'audit'},day:5,phase:'结算'});
  const option=card.options[index],sourceChoice=`E-168-${index===0?'a':'c'}`;
  expect(card.text).toContain('明天中午');expect(option.result).toContain('答应明天去');
  expect(option.result).not.toMatch(/你参加了|你吃到一半|你陪着吃了/);
  const ledger=recordEventChoice(createEventLedger(),card,option.id,true);
  expect(settleEventLedger(ledger,5,'日终',[],()=>0).effects).toHaveLength(0);
  expect(settleEventLedger(ledger,6,'交班',[],()=>0).effects).toHaveLength(0);
  expect(settleEventLedger(ledger,6,'查房',[],()=>0).effects).toHaveLength(0);
  const attended=settleEventLedger(ledger,6,'门诊',[],()=>0);
  expect(attended.effects).toHaveLength(1);
  expect(attended.effects[0].description).toBe(EVENT_DEFERRED_RESULTS[sourceChoice]);
  expect(attended.effects[0].effects).toEqual({apAllowance:index===0?-2:-1});
  expect(settleEventLedger(attended.ledger,6,'门诊',[],()=>0).effects).toHaveLength(0);
 });
});
describe('booked attendance consumes actual actions, unlike a smaller workday allowance',()=>{
 it.each([['E-074',1,2],['E-083',0,2],['E-009',2,1]] as const)('%s keeps the promised action cost on a full leave day', (event,index,ap)=>{
  let r=startRun(`appointment-on-leave-${event}`,'程医生',[]);r.day=3;r.shiftPhase='日终';r.cash=10000;
  const p=r.patients[0],scope=event==='E-009'?{kind:'patient' as const,id:p.uid}:{kind:'personal' as const,id:r.id};
  const card=eventToCard(EVENT_BY_ID[event],{instanceId:`booked-${event}`,day:3,phase:'日终',scope,...(event==='E-009'?{patientId:p.uid}:{})});
  r.queue=[card];r.cursor=0;r.phase='play';r.authored!.published[card.id]=card;
  expect(scheduledChoiceWork(r,card.options[index]).join('')).toContain(`另用 ${ap} 点行动`);
  r=act(r,{type:'choose',id:card.options[index].id});
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  r.skipNextDay=true;r.phase='feedback';r.feedback={title:'次日',text:'交班已完成。',changes:[],next:'day'};
  r=act(r,{type:'continue'});
  expect(r.day).toBe(4);expect(r.ap).toBe(0);expect(r.overtime).toBe(ap);
  expect(r.caps.stamina).toBe(100-ap*RULES.overtimeCapLoss);expect(r.vitals.stamina).toBe(100-ap*(RULES.overtimeCapLoss+RULES.overtimeStamina));
  const entry=r.journal.find(e=>e.id.includes(`${event}-`)&&e.title==='后续消息'&&e.result.includes('透支行动'))!;
  expect(entry.result).toContain(`透支行动 +${ap}`);
  const restored=decode(encode({...emptySave(),run:r})).run!;
  expect(restored.journal.filter(e=>e.id===entry.id)).toHaveLength(1);
  expect(restored.overtime).toBe(ap);
 });
});
