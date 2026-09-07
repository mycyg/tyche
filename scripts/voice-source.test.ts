import {describe,it,expect}from 'vitest';
import {visibleSourceText}from './voice-source';

describe('voice source collection',()=>{
 it('excludes internal facts, lookup keys, conditions and exception text',()=>{
  const code=`
   type Phase='门诊内部类型';
   const x={flags:['科研-造假'],raw:'引擎掷 d20',requires:['家庭-住院'],title:'联系家里'};
   if(facts['家庭-车祸']&&has(r,'隐患标记'))throw new Error('内部对象绑定失败');
   const label=kind==='状态标记'?'请半天假':'继续值班';
   const result=text.replace('旧文案','新文案');
   const stageFlags=['药代-1餐叙'];
   const RECONTACT_STAGE_FLAGS=['药代-3挂名'];
   outcome.flags=['科研-造假'];
   function contextFor(){const q=[];q.push('当前床有护工');return q;}
   console.warn('开发诊断');
  `;
  expect(visibleSourceText(code,'fixture.ts').map(x=>x.text)).toEqual(['联系家里','请半天假','继续值班','新文案']);
 });
 it('keeps UI text and runtime template pieces',()=>{
  const code='const label=`交班给${name}，明天回来`; const view=<button title="查看账单">还款<span>余额 {cash} 元</span></button>;';
  expect(visibleSourceText(code,'fixture.tsx').map(x=>x.text)).toEqual(['交班给','，明天回来','查看账单','还款','余额 ',' 元']);
 });
 it('collects the actual voice of a direct audition line',()=>{
  expect(visibleSourceText('narrate("先核对姓名。", "nurse")','fixture.ts')).toEqual([{text:'先核对姓名。',actor:'nurse'}]);
 });
 it('collects replacement vocabulary without pronouncing backreferences',()=>{
  expect(visibleSourceText('text.replace(/x/g,"$1比$2")','fixture.ts')).toEqual([{text:'比'}]);
 });
});
