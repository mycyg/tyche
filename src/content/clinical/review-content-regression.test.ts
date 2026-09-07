import {it,expect}from 'vitest';
import {clinicalGraphs}from './index';
import {reportReviewLines}from './report-reading';
import {CASES}from '../../game/catalog';

it('source-backed clinical scenes have a readable context before choices',()=>{
 for(const graph of clinicalGraphs)for(const node of graph.nodes){
  expect(node.text.trim(),`${graph.id}/${node.id}`).not.toBe('');
  expect(node.text,`${graph.id}/${node.id}`).not.toMatch(/^场景：/);
 }
});
it('uses each source graph budget and DIP group, including emergency observation C006',()=>{
 for(const graph of clinicalGraphs){const c=CASES.find(c=>c.id===graph.id)!;expect(c.budget,graph.id).toBe(graph.budget);expect(c.dipGroup,graph.id).toBe(graph.dipGroup);}
 expect(CASES.find(c=>c.id==='C006')!.budget).toBe(1800);
});
it('skim summaries retain a separate verbatim critical numeric reading',()=>{
 const full='患者姓名已核对。血钾 6.8 mmol/L；目前未排除标本问题。复查尚未完成。';
 const lines=reportReviewLines(full,'患者姓名已核对。');
 expect(lines.join('')).toContain('血钾 6.8 mmol/L');expect(lines.join('')).toContain('未排除标本问题');expect(lines.join('')).toContain('复查尚未完成');
 expect(lines).not.toContain('患者姓名已核对。');
});
it('separately authored skim and full reports do not collapse to the same source field',()=>{
 const reports=clinicalGraphs.flatMap(g=>g.reports);
 expect(reports.some(r=>r.full!==r.skimmed)).toBe(true);
 for(const report of reports)expect(report.full).not.toContain('[扫读]');
});
