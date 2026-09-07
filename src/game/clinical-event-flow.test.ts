import {describe,expect,it} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient} from './cards';
import {beginClinical} from './clinical';
import {decode,encode,emptySave} from './storage';
import type {Run} from './types';

function step(run:Run,choice:string):Run {
  let r=run;
  if(r.phase==='feedback')r=act(r,{type:'continue'});
  const option=availableOptions(r).find(o=>o.clinicalChoice===choice||o.id.endsWith(choice));
  expect(option,`${currentCard(r)?.title} must offer ${choice}`).toBeDefined();
  r=act(r,{type:'choose',id:option!.id});
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  return r;
}

describe('clinical actions and live bedside events',()=>{
  it('inserts refusal after the actual LP proposal and resumes treatment without repeating charges or the consent node',()=>{
    let r=startRun('lp-event-engine','程医生',[]);r.day=4;r.shiftPhase='查房';r.phase='play';
    r.ap=100;r.cash=100000;r.vitals={stamina:80,san:80,emotion:80};
    const patient=createPatient(r,'C008','live-refusal');r.patients.push(patient);
    r.queue=[beginClinical(r,patient)!];r.queue[0].shiftPhase='查房';r.cursor=0;
    for(const choice of ['s1_abc','s1_exam','continue','s2_labs','s2_lp'])r=step(r,choice);
    const event=currentCard(r);
    expect('authoredEventId'in event&&event.authoredEventId).toBe('E-013');
    expect(r.queue[r.cursor+1].clinicalGraph?.nodeId).toBe('s3');
    const before=r.ap;
    r=decode(encode({...emptySave(),run:r})).run!;
    expect(currentCard(r).id).toBe(event.id);
    r=step(r,'E-013-a');
    expect(currentCard(r).clinicalGraph?.nodeId).toBe('s4');
    expect(r.patients.find(p=>p.uid===patient.uid)!.clinical!.flags).toContain('refusal_signed');
    expect(r.ap).toBe(before-event.options[0].ap);
    expect(r.journal.filter(j=>j.clinicalChoice==='s2_lp')).toHaveLength(1);
    expect(r.queue.filter(c=>'authoredEventId'in c&&c.authoredEventId==='E-013')).toHaveLength(1);
    expect(r.queue.slice(r.cursor).some(c=>c.clinicalGraph?.nodeId==='s3')).toBe(false);
    const restored=decode(encode({...emptySave(),run:r})).run!;
    expect(restored).toEqual(r);
    r=step(restored,'s4_empiric');
    expect(r.patients.find(p=>p.uid===patient.uid)!.clinical!.flags).toContain('abx_started');
  });
});
