import {describe,it,expect}from 'vitest';
import {startRun}from '../game/engine';
import {EVENT_BY_ID,eventToCard}from '../content/events/catalog';
import {recordEventChoice}from '../content/events/ledger';
import {scheduledChoiceWork,pendingScheduledWork}from './scheduled-work';
describe('known future appointments are disclosed without exposing future incidents',()=>{
 it('shows the actual two-action gastroscopy appointment before committing and on the schedule',()=>{
  const r=startRun('future-gastroscopy','程医生',[]);r.day=7;
  const card=eventToCard(EVENT_BY_ID['E-074'],{instanceId:'gastroscopy',scope:{kind:'personal',id:r.id},day:7,phase:'日终'}),option=card.options[1];
  expect(scheduledChoiceWork(r,option)).toEqual(['后续安排：第 8 天交班另用 2 点行动，不在今天扣除。届时即使休假也需处理，行动不足仍会透支。']);
  expect(pendingScheduledWork(r,8)).toEqual([]);
  r.authored!.ledger=recordEventChoice(r.authored!.ledger,card,option.id,true);
  expect(pendingScheduledWork(r,8)).toMatchObject([{phase:'交班',ap:2,label:'预约胃镜'}]);
  expect(pendingScheduledWork(r,7)).toEqual([]);
 });
 it('retains a committed base appointment even when its separate chance check failed',()=>{
  const r=startRun('future-consultation','程医生',[]);
  const card=eventToCard(EVENT_BY_ID['E-083'],{instanceId:'consultation',scope:{kind:'personal',id:r.id},day:1,phase:'日终'}),option=card.options[1];
  expect(scheduledChoiceWork(r,option)[0]).toContain('另用 2 点行动');
  expect(scheduledChoiceWork(r,option)[0]).not.toContain('通过');
  r.authored!.ledger=recordEventChoice(r.authored!.ledger,card,option.id,false);
  expect(pendingScheduledWork(r,2)).toMatchObject([{ap:2,label:'院外咨询'}]);
 });
 it('never previews hidden random outcomes, conditional branches, or future narrative results',()=>{
  const r=startRun('future-no-spoiler','程医生',[]),option=structuredClone(EVENT_BY_ID['E-074'].options[1]);
  option.deferred[0].probability=.5;expect(scheduledChoiceWork(r,option)).toEqual([]);
  option.deferred[0].probability=1;option.deferred[0].requires=['hidden-patient-fact'];expect(scheduledChoiceWork(r,option)).toEqual([]);
  option.deferred[0].requires=[];option.deferred[0].id='future-incident';expect(scheduledChoiceWork(r,option)).toEqual([]);
 });
});
