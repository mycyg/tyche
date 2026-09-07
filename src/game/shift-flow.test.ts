import {describe,expect,it} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient,restCard} from './cards';
import {beginClinical} from './clinical';
import {orderPendingScenes} from './shift';
import {decode,emptySave,encode} from './storage';
import type {Card,Run} from './types';
import {makeTrolleyCard,TROLLEY_DEFINITIONS} from '../content/events/trolley';
const evening=(r:Run):Card=>({id:'evening-call',kind:'story',shiftPhase:'日终',title:'睡前的电话',text:'家里有事找你。',scope:{kind:'personal',id:r.id},options:[{id:'answer-evening-call',label:'接电话',ap:0,minutes:0,cost:0,result:'电话已经接完。',effects:{flags:['evening-answered']}}]});
describe('work-period progression',()=>{
  it('places two-patient night triage before both untouched encounters, preserving completed scenes and pending dice',()=>{
    const r=startRun('night-triage-sort','程医生',[]);r.day=3;r.phase='play';r.shiftPhase='夜班';
    const people=['C004','C012'].map((id,i)=>createPatient(r,id,`night${i}`));r.patients.push(...people);
    const encounters=people.map(p=>{const c=beginClinical(r,p)!;c.kind='night';c.shiftPhase='夜班';return c;});
    const triage=makeTrolleyCard(TROLLEY_DEFINITIONS[0],r,people),done=evening(r);r.queue=[done,...encounters,triage];r.cursor=1;
    orderPendingScenes(r);expect(r.queue.map(c=>c.id)).toEqual([done.id,triage.id,...encounters.map(c=>c.id)]);
    r.queue=[done,...encounters,triage];r.phase='roll';orderPendingScenes(r);expect(r.queue.map(c=>c.id)).toEqual([done.id,...encounters.map(c=>c.id),triage.id]);
    r.phase='play';people[0].clinical!.choices.push('s1_vitals');orderPendingScenes(r);expect(r.queue.at(-1)?.id).toBe(triage.id);
  });
  it('orders real evening conversations before the final sleep choice',()=>{
    const r=startRun('evening-sort','程医生',[]);r.shiftPhase='日终';r.cursor=0;r.queue=[restCard(1),evening(r)];
    orderPendingScenes(r);expect(r.queue.map(c=>c.id)).toEqual(['evening-call','rest:1']);
  });
  it('an older save with already-chosen sleep still handles the remaining call, and only then rolls day end',()=>{
    let r=startRun('evening-resume','程医生',[]);r.shiftPhase='日终';r.phase='feedback';r.cursor=1;r.queue=[restCard(1),evening(r)];
    r.feedback={title:'休息',text:'交班后休息。',changes:[],next:'check'};
    r=decode(encode({...emptySave(),run:r})).run!;
    r=act(r,{type:'continue'});expect(r.phase).toBe('play');expect(currentCard(r).id).toBe('evening-call');expect(r.day).toBe(1);
    r=act(r,{type:'choose',id:'answer-evening-call'});expect(r.facts['evening-answered']).toBeDefined();
    r=act(r,{type:'continue'});expect(r.phase).toBe('roll');expect(r.roll?.kind).toBe('day');
  });
  it('completed choices do not reorder the remaining buttons in a multi-action clinical scene',()=>{
    let r=startRun('stable-options','程医生',[]),p=createPatient(r,'C013','ordering');r.patients.push(p);r.queue=[beginClinical(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='查房';
    const before=availableOptions(r).map(o=>o.clinicalChoice??o.id),o=availableOptions(r).find(o=>o.clinicalChoice==='s1_bp_both')!;
    r=act(r,{type:'choose',id:o.id});r=act(r,{type:'continue'});
    const after=availableOptions(r).filter(o=>o.interaction!=='graph-continue').map(o=>o.clinicalChoice??o.id);
    expect(after).toEqual(before.filter(id=>id!=='s1_bp_both'));
    const advance=availableOptions(r).find(o=>o.interaction==='graph-continue')!;r=act(r,{type:'choose',id:advance.id});
    expect(r.phase).toBe('play');expect(r.feedback).toBeUndefined();expect(currentCard(r).clinicalGraph?.nodeId).toBe('s2');
  });
});
