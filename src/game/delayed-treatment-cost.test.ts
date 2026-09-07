import {describe,it,expect}from 'vitest';
import {act,startRun}from './engine';
import {decode,encode,emptySave}from './storage';
import {EVENT_BY_ID,eventToCard}from '../content/events/catalog';
import {eventTuning}from '../content/events/modifiers';
import {settleEventLedger}from '../content/events/ledger';

describe('a medication order starting tomorrow cannot refund past treatment',()=>{
 it.each([0,2])('E-161 option %s preserves today’s bill and the same patient’s future price',index=>{
  let r=startRun(`tomorrow-medication-${index}`,'程医生',[]);r.day=5;r.phase='play';r.shiftPhase='结算';r.cash=20000;
  const p=r.patients[0];p.active=true;p.inpatient=true;p.bed=5;
  const card=eventToCard(EVENT_BY_ID['E-161'],{instanceId:`tomorrow-medication-${index}`,scope:{kind:'patient',id:p.uid},patientId:p.uid,bed:5,day:5,phase:'结算'});
  r.queue=[card];r.cursor=0;r.authored!.published[card.id]=card;
  const before={cash:r.cash,spent:p.spent,budget:p.budget,charged:p.charged};
  expect(card.options[index].effects.bill).toBeUndefined();
  expect(card.options[index].result).toContain('从明天起');
  r=act(r,{type:'choose',id:card.options[index].id});
  expect(r.phase).toBe('feedback');
  const after=r.patients.find(candidate=>candidate.uid===p.uid)!;
  expect({cash:r.cash,spent:after.spent,budget:after.budget,charged:after.charged}).toEqual(before);
  r=decode(encode({...emptySave(),run:r})).run!;expect(r).toBeDefined();
  const ledger=r.authored!.ledger;
  expect(ledger.modifiers.filter(m=>m.target==='patientDailyCost')).toHaveLength(1);
  expect(eventTuning(ledger,5,card.scope).patientDailyCost).toBe(0);
  expect(eventTuning(ledger,6,card.scope).patientDailyCost).toBe(-900);
  expect(eventTuning(ledger,6,{kind:'patient',id:'another-patient'}).patientDailyCost).toBe(0);
  expect(eventTuning(ledger,6,card.scope,['patient-discharged:another-patient']).patientDailyCost).toBe(-900);
  expect(eventTuning(ledger,6,card.scope,[`patient-discharged:${p.uid}`]).patientDailyCost).toBe(0);
  const discharged=settleEventLedger(ledger,6,'结算',[`patient-discharged:${p.uid}`],()=>0).ledger;
  expect(eventTuning(discharged,7,card.scope).patientDailyCost).toBe(0);
 });
 it('retains the distinct same-day continuing-care charge and refusal payment',()=>{
  expect(EVENT_BY_ID['E-023'].options[1].effects.bill).toBe(800);
  expect(EVENT_BY_ID['E-161'].options[1].effects.cash).toBe(-900);
 });
});
