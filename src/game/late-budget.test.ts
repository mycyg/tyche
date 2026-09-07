import {it,expect}from 'vitest';
import {startRun}from './engine';
import {lateWeeklyBudgetEvents}from './director';
import type {EventCard}from '../content/events/types';
it('binds both late weekly notices to the same real audit scope and delivers them once',()=>{
 const r=startRun('late-budget-regression','程医生',[]);r.day=7;
 r.budgetCharges=[{day:7,patientId:r.patients[0].uid,source:'ward-settlement',amount:9000}];
 const result=lateWeeklyBudgetEvents(r);
 const notices=result.cards as EventCard[];
 expect(notices.map(c=>c.authoredEventId)).toEqual(['E-159','E-160']);
 for(const card of notices){
  expect(card.scope).toEqual({kind:'project',id:`${r.id}:audit-project`});
  expect(card.eventBinding.scope).toEqual(card.scope);
  expect(card.eventBinding.day).toBe(7);expect(card.text).toContain('9,000');
 }
 expect(lateWeeklyBudgetEvents({...r,...result.patch}).cards).toEqual([]);
 expect(r.cash).toBe(startRun('late-budget-regression','程医生',[]).cash);
});
