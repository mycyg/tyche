import {describe,it,expect}from 'vitest';
import {BUTTERFLY_NODES,BUTTERFLY_MERGES,startButterfly,butterflyChoiceCost,butterflyMergeCost,commitButterflyChoice,type ButterflyWorld}from './butterfly';
import {BUTTERFLY_CHOICE_RESULTS,BUTTERFLY_MERGE_RESULTS}from './butterfly-prose';
import {startRun,act,availableOptions}from '../../game/engine';
import {refreshButterflyOptions,type ButterflyCard}from '../../game/director';

// Boundary fixtures only. They do not certify a natural route into a branch.
const world:ButterflyWorld={day:8,cash:2400,ap:6,facts:[],actorAvailable:true,repaymentAvailable:500};
describe('review: authored butterfly outcomes and one-transaction costs',()=>{
 it('every source option has independently written feedback',()=>{
  for(const n of BUTTERFLY_NODES)for(const o of n.options){
   const text=BUTTERFLY_CHOICE_RESULTS[o.id];expect(text,o.id).toBeTruthy();
   expect(text,o.id).not.toBe(o.label+'。');expect(text,o.id).not.toMatch(/NPC|按 01|→|flag|沿用 E-/);
  }
  for(const m of BUTTERFLY_MERGES)for(const o of m.options){expect(BUTTERFLY_MERGE_RESULTS[o.id],o.id).toBeTruthy();expect(BUTTERFLY_MERGE_RESULTS[o.id]).not.toContain('NPC');}
 });
 it('quotes and charges the same partial incoming repayment without creating principal',()=>{
  const s=startButterfly('BTF-002','boundary',{actorId:'li'},'N03');s.receivable=1500;
  const o=BUTTERFLY_NODES.find(n=>n.id===s.cursor)!.options[0],quote=butterflyChoiceCost(s,o,world);
  const result=commitButterflyChoice(s,o.id,world);
  expect(quote.effects.cash).toBe(500);expect(result.effects.cash).toBe(500);
  expect(result.state.receivable).toBe(1000);expect(s.receivable).toBe(1500);
 });
 it('private loan principal is recorded once, not twice',()=>{
  const s=startButterfly('BTF-002','boundary',{actorId:'li'},'N04');
  const o=BUTTERFLY_NODES.find(n=>n.id===s.cursor)!.options[0];
  const result=commitButterflyChoice(s,o.id,{...world,conditions:{[o.id]:true}});
  expect(result.effects.cash).toBe(10000);expect(result.effects.privateDebt).toBe(10000);expect(result.state.privateDebt).toBe(10000);
 });
 it('outgoing private repayment cannot exceed current cash or unpaid principal',()=>{
  const s=startButterfly('BTF-002','boundary',{actorId:'li'},'N06');s.privateDebt=8000;
  const o=BUTTERFLY_NODES.find(n=>n.id===s.cursor)!.options[1];
  const result=commitButterflyChoice(s,o.id,world);
  expect(result.effects.cash).toBe(-2400);expect(result.effects.privateDebt).toBe(-2400);expect(result.state.privateDebt).toBe(5600);
 });
 it('an accepted shift does not charge an unworked future night',()=>{
  const s=startButterfly('BTF-001','boundary',{actorId:'li'}),o=BUTTERFLY_NODES.find(n=>n.id===s.cursor)!.options[0];
  const result=commitButterflyChoice(s,o.id,{...world,conditions:{[o.id]:true}});
  expect(result.effects.san??0).toBe(0);expect(result.effects.income??0).toBe(0);expect(result.state.facts.some(f=>f.type==='cover_completed')).toBe(false);
 });
 it('leaving uses only current remaining AP and handoff has a real action cost',()=>{
  const o=BUTTERFLY_MERGES.find(m=>m.id==='XJ-01')!.options;
  expect(butterflyMergeCost(o[0],world).ap).toBe(6);
  expect(butterflyMergeCost(o[0],{...world,ap:0}).ap).toBe(0);
  expect(butterflyMergeCost(o[3],world).ap).toBe(1);
 });
 it('the real engine applies a graph loan once and exposes its costs before choosing',()=>{
  let r=startRun('loan-transaction-boundary','程医生',[]);r.phase='play';r.day=8;r.shiftPhase='结算';r.ap=6;
  const s=startButterfly('BTF-002',`${r.id}:fixture`,{actorId:'li'},'N06');s.privateDebt=8000;r.privateDebt=8000;r.cash=2400;
  r.authored!.chains=[s];
  const card:ButterflyCard={id:'fixture-repayment',title:'钱回来了',text:'核对实际余额。',kind:'story',chain:s.chain,scope:s.scope,options:[],butterfly:{chainStateId:s.id,nodeId:s.cursor,day:r.day,phase:'结算'}};
  card.options=refreshButterflyOptions(r,card);r.queue=[card];r.cursor=0;
  const choice=availableOptions(r).find(o=>o.id.endsWith('N06b'))!;
  expect(choice.effects.cash).toBe(-2400);r=act(r,{type:'choose',id:choice.id});
  expect(r.cash).toBe(0);expect(r.privateDebt).toBe(5600);expect(r.authored!.chains[0].privateDebt).toBe(5600);
  expect(act(r,{type:'choose',id:choice.id})).toBe(r);
 });
});
