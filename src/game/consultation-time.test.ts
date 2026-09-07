import {describe,it,expect} from 'vitest';
import {clinicalGraphs,initialGraphState,getAvailableGraphOptions} from '../content/clinical';
import {CONSULTATION_TIMES} from '../content/clinical/consultation-time';
import {CASE_PRESETS} from '../content/patients';
import {talentCosts} from './talents';
import {actionMinutes,checkDifficulty,optionCosts} from './costs';
import {act,startRun} from './engine';
import {clinicalCard} from './clinical';

function actual(caseId:string,choice:string,variants:string[]=[]) {
  const graph=clinicalGraphs.find(g=>g.id===caseId)!;
  const state=initialGraphState(graph,'consult-time');
  state.nodeId=graph.nodes.find(n=>n.options.some(o=>o.id===choice))!.id;
  state.variants=variants;
  const r=startRun('consult-time','程医生',[]),p=r.patients[0];
  p.caseId=caseId;p.clinical=state;p.preset=undefined;p.presetNode=undefined;
  p.uid='consult-test-night';p.active=true;p.damage=0;
  r.nightBudget=300;r.nightMinutes=300;r.shiftPhase='夜班';
  r.facts[`night-started:${p.uid}`]={day:r.day,source:'started',sequence:0};
  const card=clinicalCard(r,p)!;r.queue=[card];r.cursor=0;r.phase='play';
  const option=card.options.find(o=>o.clinicalChoice===choice)!;
  return {graph,state,r,p,card,option};
}

describe('consultation arrival waiting is a real, bounded cost component',()=>{
  it('has an explicit split for every authored consult, including zero-wait actions',()=>{
    for(const graph of clinicalGraphs)for(const node of graph.nodes)for(const option of node.options)
      if(option.mechanics?.operation==='consult') {
        expect(CONSULTATION_TIMES[graph.id]?.[option.id],`${graph.id}/${option.id}`).toBeDefined();
        expect(option.mechanics.consultWaitMinutes).toBeGreaterThanOrEqual(0);
        expect(option.mechanics.consultWaitMinutes).toBeLessThanOrEqual(option.minutes);
      }
    for(const [caseId,entries]of Object.entries(CONSULTATION_TIMES))for(const id of Object.keys(entries))
      expect(clinicalGraphs.find(g=>g.id===caseId)!.nodes.some(n=>n.options.some(o=>o.id===id))).toBe(true);
  });
  it('charges source-stated arrival separately from the application, once',()=>{
    for(const [id,choice,variants,base,discounted]of [
      ['C001','s5_consult',[],35,25],['C012','s3_urgent',[],22,16],['C012','s3_urgent',['surgeon_busy'],50,30],
    ] as const) {
      const {r,option,card}=actual(id,choice,[...variants]);
      expect(actionMinutes(r,option,card)).toBe(base);
      r.talents=['T08'];expect(actionMinutes(r,option,card)).toBe(discounted);
    }
  });
  it('keeps CTA, chest radiographs, simultaneous resuscitation and telephone-only work unchanged',()=>{
    for(const [id,choice,variants]of [
      ['C013','s3_cta',[]],['C017','s4_cxr',[]],['C010','s5_icu',[]],['C016','s3_psych',['no_night_psych']],
    ] as const) {
      const {r,card,option}=actual(id,choice,[...variants]);
      const before=actionMinutes(r,option,card);r.talents=['T08'];
      expect(actionMinutes(r,option,card),`${id}/${choice}`).toBe(before);
    }
  });
  it('applies T08 to actual consultation persuasion, not unrelated conversation',()=>{
    const {r,card,option}=actual('C015','s2_mero_approved');
    const before=checkDifficulty(r,option,card);r.talents=['T08'];
    expect(checkDifficulty(r,option,card)).toBe(before-3);
    const other=actual('C012','s4_argue');const dc=checkDifficulty(other.r,other.option,other.card);
    other.r.talents=['T08'];expect(checkDifficulty(other.r,other.option,other.card)).toBe(dc);
  });
  it('includes six waiting minutes in all 208 real preset consultation branches',()=>{
    const baseline=startRun('preset-time','程医生',[]);
    for(const preset of CASE_PRESETS) {
      const option=preset.scenes.flatMap(n=>n.options).find(o=>o.id.endsWith(':decision:consult'))!;
      expect(option.mechanics?.consultWaitMinutes).toBe(6);
      const r=structuredClone(baseline),normal=optionCosts(r,option,undefined);
      r.talents=['T08'];const faster=optionCosts(r,option,undefined);
      expect(faster).toEqual({...normal,minutes:normal.minutes-3});
    }
  },30000);
  it('commits the same discounted minutes to the live night ledger and clinical history',()=>{
    const {r,p,card,option}=actual('C005','s4_neurosurg');r.talents=['T08'];
    const expected=actionMinutes(r,option,card),next=act(r,{type:'choose',id:option.id});
    expect(next.nightMinutes).toBe(r.nightMinutes-expected);
    expect(next.patients.find(q=>q.uid===p.uid)!.clinical!.minutes).toBe(expected);
    expect(next.hazards.filter(h=>h.scope.id===p.uid&&h.reason==='新增会诊流程')).toHaveLength(1);
  });
  it('clamps malformed waiting and applies other time modifiers only once',()=>{
    const base={ap:1,minutes:20,cost:100,stamina:2},context={operation:'consult' as const,isNight:true,clinical:true,consultWaitMinutes:10};
    expect(talentCosts({talents:['T08','T06'],debuffs:['B08'],day:1},base,context).minutes).toBeCloseTo((20-5+1)*1.15);
    for(const wait of [-10,NaN,Infinity])expect(talentCosts({talents:['T08'],debuffs:[],day:1},base,{...context,consultWaitMinutes:wait}).minutes).toBe(20);
    expect(talentCosts({talents:['T08'],debuffs:[],day:1},base,{...context,consultWaitMinutes:100}).minutes).toBe(10);
    expect(getAvailableGraphOptions(actual('C005','s4_neurosurg').graph,actual('C005','s4_neurosurg').state).length).toBeGreaterThan(0);
  });
});
