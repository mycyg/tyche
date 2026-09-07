import {describe,it,expect} from 'vitest';
import {clinicalGraphs,getClinicalGraph,initialGraphState,advanceClinicalGraph,getAvailableGraphOptions} from './index';
import {applyBedsideObservations} from './observations';
describe('visible bedside findings',()=>{
 it('every authored history, observation and examination has a finding rather than only its action label',()=>{
  const missing=clinicalGraphs.flatMap(g=>g.nodes.flatMap(n=>n.options.filter(o=>!o.system&&['history','observe','exam','full-exam'].includes(o.mechanics?.operation??'')&&o.result===o.label+'。'&&!o.successText&&!o.resultVariants?.length).map(o=>`${g.id}/${o.id}`)));
  expect(missing).toEqual([]);
 });
 it('successful C018 questions reveal medication use; failure does not claim it was confirmed',()=>{
  const g=getClinicalGraph('C018')!,s=initialGraphState(g,'meds');s.nodeId='s2';s.entered.push('s2');
  const success=advanceClinicalGraph(g,s,'s2_ask',true),failure=advanceClinicalGraph(g,s,'s2_ask',false);
  expect(success.actionText).toContain('甲泼尼龙');expect(success.state.flags).toContain('steroid_known');expect(failure.actionText).not.toContain('甲泼尼龙');expect(failure.state.flags).not.toContain('steroid_known');
 });
 it('C017 bedside findings match the fixed diagnosis and failed exams do not reveal success',()=>{
  const g=getClinicalGraph('C017')!;
  for(const variant of ['leak','lung_infection']){
   let s=initialGraphState(g,variant);s.variants=[variant];
   const nursing=advanceClinicalGraph(g,s,'s1_nursing');
   expect(nursing.actionText).toContain(variant==='leak'?'转为浑浊':'没有进行性浑浊');
   s=nursing.state;
   const exam=advanceClinicalGraph(g,s,'s2_exam');expect(exam.actionText).toContain(variant==='leak'?'腹部有防御':'腹部柔软');
   const failed=advanceClinicalGraph(g,s,'s2_exam',false);expect(failed.actionText).not.toContain('腹部有防御');
  }
 });
 it('C019 child low blood sugar is visible immediately, not a post-treatment normal result',()=>{
  const g=getClinicalGraph('C019')!,s=initialGraphState(g,'child');s.nodeId='s2';s.entered.push('s2');
  const a=advanceClinicalGraph(g,s,'s2_child');expect(a.actionText).toContain('2.9 mmol/L');expect(a.actionText).toContain('尚未纠正');expect(a.actionText).not.toContain('4.8');
 });
 it('C013 labels a repeat troponin only once the first result has actually been obtained',()=>{
  const g=getClinicalGraph('C013')!,s=initialGraphState(g,'trop');s.nodeId='s3';s.entered.push('s3');
  expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s3_wait_trop')?.label).not.toContain('复查');s.choices.push('s2_ecg_ddimer');
  expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s3_wait_trop')?.label).toBe('等待复查肌钙蛋白再决定');
 });
 it('removes source script IDs from report titles while retaining clinical parentheses',()=>{
  expect(clinicalGraphs.flatMap(g=>g.reports.filter(r=>/[（(]s\d/.test(r.title)).map(r=>r.title))).toEqual([]);
  const graph=structuredClone(getClinicalGraph('C013')!);graph.reports[0].title='动脉血气（室内空气）（s2_ecg_only）';applyBedsideObservations(graph);expect(graph.reports[0].title).toBe('动脉血气（室内空气）');
 });
});
