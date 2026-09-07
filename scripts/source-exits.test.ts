import {describe,it,expect} from 'vitest';
import {clinicalGraphs,initialGraphState,advanceClinicalGraph,canContinueGraph,getAvailableGraphOptions} from '../src/content/clinical';
import {sourceExitMap,graphExitWitnesses,sourceExitWitnesses} from './source-exits';
import {startRun} from '../src/game/engine';
import type {ClinicalGraphState} from '../src/content/clinical/types';

describe('source exit coverage provenance',()=>{
  it('keeps six automatic controls and nine folded controls explicit, without pretending they were clicked',()=>{
    const map=sourceExitMap();expect(map).toHaveLength(15);
    expect(map.filter(e=>e.mode==='automatic-exit')).toHaveLength(6);
    expect(map.filter(e=>e.mode==='folded-continue')).toHaveLength(9);
    expect(map.every(e=>e.source.file.startsWith('04_病例库/')&&e.source.line>0)).toBe(true);
    expect(map.some(e=>e.caseId==='C019'&&e.nodeId==='s7')).toBe(false);
  });
  it.each(['cost','ap','check','requires','reports','rules','mechanics','effects','next'])(
    'rejects the equivalence if %s gains independent behavior',key=>{
      const graph=structuredClone(clinicalGraphs.find(g=>g.id==='C011')!);
      const option=graph.nodes.find(n=>n.id==='s7')!.options[0];
      const changes:Record<string,unknown>={cost:1,ap:1,check:{},requires:{flag:'new-condition'},reports:['new-report'],
        rules:[{effects:{san:-1}}],mechanics:{operation:'norm-quote'},effects:{flags:['new-fact']},next:'s6'};
      Object.assign(option,{[key]:changes[key]});expect(sourceExitMap([graph])).toEqual([]);
    });
  it('requires flags to be delegated to an unconditional exit rule, and refuses ambiguous controls',()=>{
    const graph=structuredClone(clinicalGraphs.find(g=>g.id==='C019')!);
    const node=graph.nodes.find(n=>n.id==='s2')!;
    expect(sourceExitMap([graph]).some(e=>e.nodeId===node.id)).toBe(true);
    node.exitEffects![0].when={flag:'maybe'};
    expect(sourceExitMap([graph]).some(e=>e.nodeId===node.id)).toBe(false);
    delete node.exitEffects![0].when;node.options.push({...structuredClone(node.options.find(o=>o.system)!),id:'another-exit'});
    expect(sourceExitMap([graph]).some(e=>e.nodeId===node.id)).toBe(false);
  });

  // Graph-level boundary fixtures only. Campaign proofs are collected separately
  // from real act() transitions and replayable campaign checkpoints.
  for(const graph of clinicalGraphs.filter(g=>sourceExitMap([g]).length)){
    it(`${graph.id}: witnesses each mapped control on an actual graph transition`,()=>{
      const expected=sourceExitMap([graph]);const seen=new Set<string>();
      let before=initialGraphState(graph,'source-exits');
      // Walk a concrete source-ordered path; this unit tests exit equivalence,
      // not breadth-first campaign coverage or every diagnostic combination.
      for(let steps=0;!before.outcomeId&&steps<200;steps++){
        const option=canContinueGraph(graph,before)?'continue':getAvailableGraphOptions(graph,before)[0]?.id;
        expect(option).toBeDefined();
        const after=advanceClinicalGraph(graph,before,option!,true).state;
        for(const witness of graphExitWitnesses(graph,before,after)){
          seen.add(witness.choiceId);
          expect(after.choices).not.toContain(witness.choiceId);
          expect(graphExitWitnesses(graph,after,after)).toEqual([]);
          expect(graphExitWitnesses(graph,after,before)).toEqual([]);
        }
        before=after;
      }
      expect(before.outcomeId).toBeDefined();
      expect([...seen].sort()).toEqual(expected.map(e=>e.choiceId).sort());
    });
  }
  it('does not turn existing flags, a different patient or a new run into a transition witness',()=>{
    const r=startRun('exit-patient-identity','程医生',[]),p=r.patients[0];
    const graph=clinicalGraphs.find(g=>g.id==='C020')!;
    p.caseId=graph.id;p.clinical=initialGraphState(graph,'patient-scope');
    const action=getAvailableGraphOptions(graph,p.clinical)[0];
    p.clinical=advanceClinicalGraph(graph,p.clinical,action.id).state;
    const next=structuredClone(r),q=next.patients[0];
    q.clinical=advanceClinicalGraph(graph,p.clinical,'continue').state;
    expect(sourceExitWitnesses(r,next)).toHaveLength(1);
    q.uid='another-patient';expect(sourceExitWitnesses(r,next)).toEqual([]);
    q.uid=p.uid;next.id='another-run';expect(sourceExitWitnesses(r,next)).toEqual([]);
    expect(sourceExitWitnesses(r,structuredClone(r))).toEqual([]);
  });
  it('rejects an exit without the minimum selections or actual delegated flag',()=>{
    const graph=clinicalGraphs.find(g=>g.id==='C019')!;
    const state=(nodeId:string):ClinicalGraphState=>({...initialGraphState(graph,'invalid-exit'),nodeId,entered:['s1','s2'],flags:['triage_complete']});
    const before=state('s2'),after=state('s3');after.entered.push('s3');
    expect(graphExitWitnesses(graph,before,after)).toEqual([]);
    after.choices=['s2_father','s2_mother'];after.selected.s2=[...after.choices];after.flags=[];
    expect(graphExitWitnesses(graph,before,after)).toEqual([]);
  });
});
