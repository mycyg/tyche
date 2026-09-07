import {describe,expect,it} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient} from './cards';
import {beginClinical} from './clinical';
import {nightTelephoneDeteriorates,nightTelephoneRequired} from './night-overflow';
import {decode,encode,emptySave} from './storage';
import {nextShiftForecast} from './schedule-preview';
import {random} from './random';
import {RULES} from './rules';
import type {Run} from './types';
import {eventToCard,EVENT_BY_ID} from '../content/events';
import {makeTrolleyCard,TROLLEY_DEFINITIONS} from '../content/events/trolley';
const fixture=():Run=>{
 const r=startRun('exhausted-night','程医生',[]),p=createPatient(r,'C013','night-overflow');r.patients.push(p);r.queue=[beginClinical(r,p)!];r.queue[0].kind='night';r.queue[0].shiftPhase='夜班';r.shiftPhase='夜班';r.cursor=0;r.phase='play';r.nightMinutes=0;r.vitals={stamina:80,san:80,emotion:80};return r;
};
describe('exhausted night emergency arrivals',()=>{
 it('does not replace a family chart-access conversation with emergency telephone care',()=>{
  const r=fixture(),p=r.patients.at(-1)!;
  const card=makeTrolleyCard(TROLLEY_DEFINITIONS.find(d=>d.id==='TROLLEY-19')!,r,[p]);
  r.queue=[card];r.cursor=0;
  expect(card.kind).toBe('night');expect(nightTelephoneRequired(r,card)).toBe(false);
  expect(availableOptions(r).map(o=>o.id).sort()).toEqual(card.options.map(o=>o.id).sort());
  const option=availableOptions(r).find(o=>o.id.endsWith(':a'))!;
  const done=act(r,{type:'choose',id:option.id});
  expect(done.hazards.some(h=>h.reason.includes('电话'))).toBe(false);
  expect(done.facts[`night-telephone:${p.uid}`]).toBeUndefined();
  expect(done.authored!.trolley?.tokens.at(-1)?.sourceId).toBe('TROLLEY-19');
 });
 it('allows only telephone handover for a new arrival, recording delay once without invented tests or performance',()=>{
  const r=fixture(),p=r.patients.at(-1)!,before=structuredClone(p.clinical!),options=availableOptions(r);expect(options).toHaveLength(1);expect(options[0].label).toContain('电话');
  const result=act(r,{type:'choose',id:options[0].id});expect(result.patients.at(-1)?.clinical).toEqual(before);
  expect(result.ap).toBe(r.ap);expect(result.income).toBe(r.income);expect(result.patients.at(-1)?.spent).toBe(p.spent);
  expect(result.hazards.filter(h=>h.choiceId===options[0].id)).toHaveLength(1);expect(result.hazards.find(h=>h.choiceId===options[0].id)?.weight).toBe(25);
  expect(act(result,{type:'choose',id:options[0].id})).toBe(result);expect(decode(encode({...emptySave(),run:result})).run).toEqual(result);
 });
 it('does not halt ongoing bedside care merely because its remaining time reached zero',()=>{
  const r=fixture(),p=r.patients.at(-1)!;r.facts[`night-started:${p.uid}`]={day:r.day,source:'started-before-zero',sequence:0};
  expect(nightTelephoneRequired(r,currentCard(r))).toBe(false);expect(availableOptions(r).length).toBeGreaterThan(1);
 });
 it('samples the documented hidden-patient course once per patient and never rerolls it on refresh',()=>{
  const r=fixture(),p=r.patients.at(-1)!,card=currentCard(r);
  for(const seed of ['late-a','late-b','late-c','late-d']){r.seed=seed;expect(nightTelephoneDeteriorates(r,card)).toBe(random(seed,`night-telephone-course:${p.uid}`)<RULES.nightTelephone.seedChance);}
 });
 it('treats a new inpatient fall as its own response and does not invent completion of the existing case',()=>{
  const r=fixture(),p=r.patients.at(-1)!;r.day=4;
  r.facts[`night-started:${p.uid}`]={day:4,source:'earlier-care',sequence:0};
  const card=eventToCard(EVENT_BY_ID['E-012'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:`${r.id}:event:E-012:4`,day:4,phase:'夜班'});
  r.queue=[card];r.cursor=0;
  expect(nightTelephoneRequired(r,card)).toBe(true);
  const option=availableOptions(r)[0],before=structuredClone(p.clinical);
  const done=act(r,{type:'choose',id:option.id}),after=done.patients.find(x=>x.uid===p.uid)!;
  expect(after.clinical).toEqual(before);expect(after.settled).toBe(p.settled);
  expect(after.spent).toBe(p.spent);expect(done.income).toBe(r.income);
  expect(done.hazards.filter(h=>h.choiceId===option.id)).toHaveLength(1);
  expect(done.facts[`night-telephone:${p.uid}`]).toBeUndefined();
  expect(done.facts[`night-telephone-incident:${card.id}`]).toBeDefined();
  expect(done.authored!.seen['E-012']).toBe(4);
  expect(decode(encode({...emptySave(),run:done})).run).toEqual(done);
 });
 it('keeps a new fall independent of a prior refusal or the patient’s first arrival dice',()=>{
  const r=fixture(),p=r.patients.at(-1)!;
  const card=eventToCard(EVENT_BY_ID['E-012'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:'new-fall-on-night',day:4,phase:'夜班'});
  for(const seed of ['fall-a','fall-b','fall-c']){
    r.seed=seed;
    expect(nightTelephoneDeteriorates(r,card)).toBe(random(seed,`night-telephone-incident:${card.id}`)<RULES.nightTelephone.seedChance);
  }
 });
 it('an actually worked extra night affects next-day recovery and day-end depression',()=>{
  let r=fixture();const o=availableOptions(r)[0];r=act(r,{type:'choose',id:o.id});
  expect(r.facts[`worked-night:${r.day}`]).toBeDefined();expect(nextShiftForecast(r).afterNight).toBe(true);
  r.queue=[];r.cursor=0;r.shiftPhase='日终';r.phase='feedback';r.vitals.emotion=50;r.depression=10;r.feedback={title:'结束',text:'交班完成。',changes:[],next:'check'};
  r=act(r,{type:'continue'});expect(r.depression).toBe(13);
 });
});
