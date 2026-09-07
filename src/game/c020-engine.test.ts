import {describe,expect,it} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient} from './cards';
import {beginClinical} from './clinical';
import {decode,encode,emptySave} from './storage';
import type {Run} from './types';

const good='s1_resuscitate s1_confirm s2_scene s2_timeline s3_family s3_rights s4_autopsy s4_morgue s5_report s6_discuss s6_quality s7_record s7_handoff';
function fixture(seed:number){
  const r=startRun(`c020-real-${seed}`,'程医生',[]),p=createPatient(r,'C020','death-review');r.patients.push(p);
  const card=beginClinical(r,p)!;card.shiftPhase='查房';r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';
  r.ap=100;r.cash=100000;r.vitals={stamina:80,san:80,emotion:80};delete r.roll;delete r.feedback;delete r.pendingCheck;
  return {run:r,uid:p.uid};
}
function select(run:Run,id:string):Run {
  let r=run;
  for(let guard=0;guard<10;guard++){
    if(r.phase==='feedback')r=act(r,{type:'continue'});
    if(r.phase==='roll')r=act(r,{type:'ack-roll'});
    const options=availableOptions(r),wanted=options.find(o=>o.clinicalChoice===id);
    if(wanted){r=act(r,{type:'choose',id:wanted.id});return r.phase==='roll'?act(r,{type:'ack-roll'}):r;}
    const next=options.find(o=>o.clinicalChoice==='continue');
    expect(next,`C020 ${currentCard(r)?.clinicalGraph?.nodeId} must continue to ${id}; offered ${options.map(o=>o.label).join('/')}`).toBeDefined();
    r=act(r,{type:'choose',id:next!.id});
  }
  throw new Error(`C020 failed to reach ${id}`);
}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;

describe('C020 actual engine death-investigation continuity',()=>{
  it.each([
    ['o_chain',8,good],
    ['o_respectful_dispute',2,good.replace('s6_discuss s6_quality','s6_quality')],
    ['o_lost_chain',0,good.replace('s1_resuscitate','s1_assume')],
    ['o_obstruction',0,good.replace('s2_timeline','s2_edit')],
  ] as const)('reaches documented %s through charged, acknowledged engine actions and save/resume',(outcome,seed,path)=>{
    const f=fixture(seed);let r=f.run;
    for(const id of path.split(' '))r=reload(select(r,id));
    const p=r.patients.find(p=>p.uid===f.uid)!;
    expect(p.clinical!.outcomeId).toBe(outcome);expect(p.settled).toBe(true);
    expect(p.clinical!.choices).toEqual(expect.arrayContaining(path.split(' ')));
    expect(r.journal.filter(j=>j.scope.id===f.uid&&j.clinicalChoice&&j.clinicalChoice!=='continue').map(j=>j.clinicalChoice)).toEqual(path.split(' '));
  });
  it('confirmation records the existing death without fabricating a treatment injury, while retaining every postmortem node',()=>{
    const f=fixture(8);let r=select(select(f.run,'s1_resuscitate'),'s1_confirm');
    const p=r.patients.find(p=>p.uid===f.uid)!;
    expect(p.clinical!.flags).toContain('death_confirmed');
    expect(p.damage).toBe(3);
    expect(p.active).toBe(true);expect(p.bed).toBeGreaterThan(0);
    expect(createPatient(r,'C013','later-admission').bed).not.toBe(p.bed);
    expect(r.hazards.filter(h=>h.scope.id===f.uid&&h.causal)).toHaveLength(0);
    r=reload(r);
    for(const id of good.split(' ').slice(2))r=select(r,id);
    const settled=r.patients.find(p=>p.uid===f.uid)!;
    expect(settled.clinical!.outcomeId).toBe('o_chain');expect(settled.active).toBe(false);expect(settled.bed).toBe(0);
  });
  it('keeps the original bed occupied until the actual transfer, then clears it before later paperwork',()=>{
    const f=fixture(8);let r=f.run;
    for(const id of good.split(' ').slice(0,7))r=select(r,id);
    const before=r.patients.find(p=>p.uid===f.uid)!;
    expect(before.damage).toBe(3);expect(before.bed).toBeGreaterThan(0);expect(before.active).toBe(true);
    r=select(r,'s4_morgue');
    const after=r.patients.find(p=>p.uid===f.uid)!;
    expect(after.clinical!.outcomeId).toBeUndefined();expect(after.clinical!.flags).toContain('body_transferred');
    expect(after.bed).toBe(0);expect(after.active).toBe(false);
  });
  it('a save with already confirmed death still offers original preservation, family, autopsy and handoff choices',()=>{
    const f=fixture(8);let r=select(select(f.run,'s1_resuscitate'),'s1_confirm');
    const p=r.patients.find(p=>p.uid===f.uid)!;p.damage=3;p.active=false;p.bed=0;
    r=reload(r);
    for(const id of good.split(' ').slice(2))r=select(r,id);
    expect(r.patients.find(p=>p.uid===f.uid)!.clinical!.outcomeId).toBe('o_chain');
  });
});
