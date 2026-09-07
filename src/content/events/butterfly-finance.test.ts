import {it,expect}from 'vitest';
import {startRun,act,availableOptions}from '../../game/engine';
import {startButterfly,butterflyChoices,BUTTERFLY_NODES}from './butterfly';
import {butterflyFinanceCard}from './butterfly-finance';
import {RULES}from '../../game/rules';
import {emptySave,encode,decode}from '../../game/storage';

// Boundary transactions, not proof that a random run reaches N02.
it('loan confirmation leaves the bill and the colleague receivable untouched',()=>{
 let r=startRun('credit-confirmation','程医生',[]);r.day=8;r.phase='play';r.shiftPhase='结算';r.cash=200;r.debt=100;r.receivable=1500;
 const chain=startButterfly('BTF-002',`${r.id}:finance`,{actorId:'li'},'N02');chain.receivable=1500;r.authored!.chains=[chain];
 const card=butterflyFinanceCard(r,chain);r.queue=[card];r.cursor=0;
 expect(r.cash).toBe(200);expect(r.debt).toBe(100);const choice=availableOptions(r).find(o=>o.id.endsWith(':accept'))!;
 expect(choice.effects).toMatchObject({cash:10000,debt:10000,cashPressure:RULES.creditPressure});
 r=act(r,{type:'choose',id:choice.id});expect(r.cash).toBe(10200);expect(r.debt).toBe(10100);expect(r.income).toBe(0);expect(r.receivable).toBe(1500);expect(r.authored!.chains[0].receivable).toBe(1500);
 expect(r.authored!.chains[0].facts.some(f=>f.type==='bill_paid')).toBe(false);expect(act(r,{type:'choose',id:choice.id})).toBe(r);
 expect(decode(encode({...emptySave(),run:r})).run).toEqual(r);
});
it('refreshes the remaining credit limit and always permits declining without debt',()=>{
 const r=startRun('credit-limit','程医生',[]),chain=startButterfly('BTF-002','finance-limit',{actorId:'li'},'N02');r.authored!.chains=[chain];r.debt=49999.8;
 const card=butterflyFinanceCard(r,chain);expect(card.options.map(o=>o.id)).toEqual([`${card.id}:decline`]);
 r.debt=49000;const loan=butterflyFinanceCard(r,chain).options[0];expect(loan.effects.debt).toBe(1000);expect(loan.effects.cash).toBe(1000);
 const decline=card.options[0];expect(decline.effects.debt).toBeUndefined();expect(decline.effects.cash).toBeUndefined();
});
it('unaffordable voluntary transfers are unavailable rather than throwing after AP is spent',()=>{
 const s=startButterfly('BTF-002','cash-boundary',{actorId:'li'}),w={day:3,cash:0,ap:4,facts:[],actorAvailable:true};
 const choices=butterflyChoices(s,w);expect(choices.find(x=>x.choice.localId==='N01a')?.available).toBe(false);expect(choices.find(x=>x.choice.localId==='N01b')?.available).toBe(false);expect(choices.some(x=>x.available)).toBe(true);
 expect(BUTTERFLY_NODES.find(n=>n.id==='BTF-002:N01')).toBeDefined();
});
