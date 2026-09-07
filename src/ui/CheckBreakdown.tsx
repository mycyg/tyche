import type {CheckTerm}from '../game/types';
import {sumCheckTerms}from '../game/costs';

export function CheckBreakdown({modifiers,difficulty}:{modifiers?:readonly CheckTerm[];difficulty?:readonly CheckTerm[]}){
 if(!modifiers&&!difficulty)return null;
 return <details class="check-breakdown"><summary>查看能力加成和难度来源</summary>
  {([{title:'能力加成',terms:modifiers},{title:'通过门槛',terms:difficulty}]as const).filter(group=>group.terms).map(group=><section key={group.title}><h4>{group.title}</h4><dl>
   {group.terms!.map(term=><div key={term.id}><dt>{term.label}</dt><dd>{term.value>0?'+':term.value<0?'−':''}{Math.abs(term.value)}</dd></div>)}
   <div class="check-breakdown__total"><dt>合计</dt><dd>{sumCheckTerms(group.terms!)}</dd></div>
  </dl></section>)}
 </details>;
}
