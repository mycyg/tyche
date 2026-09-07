import {describe,expect,it} from 'vitest';
import {clinicalGraphs,getClinicalGraph,initialGraphState,advanceClinicalGraph,canContinueGraph} from './index';
import {applyClinicalCheckCopy,operationCheckPurpose} from './check-copy';
import type {Option} from '../../game/types';

const option=(caseId:string,id:string)=>getClinicalGraph(caseId)!.nodes.flatMap(n=>n.options).find(o=>o.id===id)!;
describe('clinical checks describe the actual operation',()=>{
 it('provides every check a purpose and keeps script weights and identifiers out of player failure copy',()=>{
  for(const g of clinicalGraphs)for(const n of g.nodes)for(const o of n.options)if(o.check){
   expect(o.check.purpose,`${g.id}/${o.id}`).toBeTruthy();
   expect(o.check.failureText,`${g.id}/${o.id}`).not.toMatch(/对方没有补充更多信息|\b[RCDF]\s*\d|[a-z]+_[a-z]+/);
  }
 });
 it('C013 failed comfort preserves the performed explanation and signature instead of asking for more history',()=>{
  const g=getClinicalGraph('C013')!,state=initialGraphState(g,'consent-copy');state.nodeId='s5';state.entered.push('s5');
  const result=advanceClinicalGraph(g,state,'s5_inform',false);
  expect(result.state.flags).toContain('informed');expect(result.actionText).toContain('已告知并签字');expect(result.actionText).toContain('仍有顾虑');
  expect(canContinueGraph(g,result.state)).toBe(true);expect(advanceClinicalGraph(g,result.state,'continue').state.nodeId).toBe('s6');
  expect(option('C013','s5_inform').check!.purpose).toContain('缓解患者与家属的顾虑');
 });
 it('preserves source failure hazards expressed with a space rather than a colon',()=>{
  const o=option('C018','s6_record');expect(o.check!.failure.hazards).toEqual(expect.arrayContaining([expect.objectContaining({type:'D',weight:5})]));
  expect(o.check!.failureText).toContain('不阻断报告');
  const g=getClinicalGraph('C018')!,state=initialGraphState(g,'report-copy');state.nodeId='s6';state.entered.push('s6');
  const result=advanceClinicalGraph(g,state,o.id,false);expect(result.state.flags).toEqual(expect.arrayContaining(['audit_recorded','independent_order']));
 });
 it('a failed consultation conversation does not revoke the consultation itself',()=>{
  const o=option('C019','s4_hbo');expect(o.check!.failureText).toContain('仍可会诊');expect(o.effects.flags).toContain('hbo_consult');expect(o.check!.purpose).toContain('会诊意见');
 });
 it('distinguishes signatures, records, histories and observation for UI fallback',()=>{
  const base:Option={id:'fallback',label:'继续处理',ap:1,minutes:5,cost:0,effects:{},result:'已处理。',check:{skill:'comfort',dc:12,failure:{},failureText:'暂未完成。'}};
  expect(operationCheckPurpose({...base,mechanics:{operation:'consent',checkOperation:'comfort'}})).toContain('明确表达意愿');
  expect(operationCheckPurpose({...base,mechanics:{operation:'initial-record',checkOperation:'record'}})).toContain('完整记入文书');
  expect(operationCheckPurpose({...base,mechanics:{operation:'history'}})).toContain('病史');
  expect(operationCheckPurpose({...base,mechanics:{operation:'full-exam',checkOperation:'observe'}})).toContain('眼前的细节');
 });
 it('copy normalization never changes source mechanics or branch transitions',()=>{
  for(const source of clinicalGraphs){const g=structuredClone(source),before=g.nodes.flatMap(n=>n.options.map(o=>({id:o.id,effects:o.effects,rules:o.rules,next:o.next,transitions:o.transitions,failure:o.check?.failure})));
   applyClinicalCheckCopy(g);expect(g.nodes.flatMap(n=>n.options.map(o=>({id:o.id,effects:o.effects,rules:o.rules,next:o.next,transitions:o.transitions,failure:o.check?.failure})))).toEqual(before);
  }
 });
});
