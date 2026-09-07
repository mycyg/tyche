import {describe,it,expect} from 'vitest';
import {worldCoffeeOffering,worldNapOffering} from './refreshments';
import {worldTargets} from './WorldStage';
import {startRun,act} from '../game/engine';
describe('world coffee costs match current rules',()=>{
 it('does not offer coffee during an acute interruption or an unfinished dialog',()=>{
  const r=startRun('coffee-interlock','医生',[]);r.vitals.stamina=20;
  r.emergency={cardId:r.queue[0].id,vital:'san',resolved:false,resume:{phase:'play'}};
  expect(worldCoffeeOffering(r).allowed).toBe(false);expect(act(r,{type:'coffee'})).toBe(r);
  delete r.emergency;r.phase='feedback';expect(worldCoffeeOffering(r).allowed).toBe(false);
  r.phase='play';expect(worldCoffeeOffering(r).allowed).toBe(true);
 });
 it('uses diminishing cup recovery and the actual remaining stamina capacity',()=>{
  const r=startRun('coffee-world','医生',[]);r.vitals.stamina=70;
  expect(worldCoffeeOffering(r)).toMatchObject({price:15,stamina:15,remaining:3,allowed:true});r.coffee=1;expect(worldCoffeeOffering(r).stamina).toBe(8);r.vitals.stamina=99;expect(worldCoffeeOffering(r).stamina).toBe(1);r.coffee=3;expect(worldTargets(r).find(t=>t.id==='coffee')?.action).toBeUndefined();
 });
 it('reads E081 price and weak/limited supply changes from the effective event ledger',()=>{
  const r=startRun('coffee-event','医生',[]);r.vitals.stamina=60;
  r.authored!.ledger.modifiers.push({id:'E-081-a',kind:'formula',description:'咖啡调价',scope:{kind:'personal',id:r.id},starts:1,expires:3});
  expect(worldTargets(r).find(t=>t.id==='coffee')?.label).toContain('¥25');
  r.authored!.ledger.modifiers.push({id:'E-081-b',kind:'formula',description:'供应调整',scope:{kind:'personal',id:r.id},starts:1,expires:3});
  expect(worldCoffeeOffering(r)).toMatchObject({price:25,stamina:5,remaining:1});r.coffee=1;expect(worldCoffeeOffering(r).allowed).toBe(false);expect(worldTargets(r).find(t=>t.id==='coffee')?.label).toContain('今日已用完');
 });
 it('includes the coffee talent and withdrawal state without independently changing the engine',()=>{
  const r=startRun('coffee-trait','医生',['T20']);r.vitals.stamina=40;r.coffee=2;expect(worldCoffeeOffering(r).stamina).toBe(15);r.debuffs.push('B04');expect(worldCoffeeOffering(r).stamina).toBe(5);
 });
 it('quotes every actual successive cup, including reputation and a cap-limited recovery',()=>{
  let r=startRun('coffee-quote','医生',[]);r.vitals.stamina=40;
  for(const [amount,rep] of [[15,0],[8,-2],[3,-2]]){
    const before=structuredClone(r),offer=worldCoffeeOffering(r);expect(offer).toMatchObject({stamina:amount,reputation:rep,price:15});
    if(rep)expect(offer.label).toContain('声望 -2');
    r=act(r,{type:'coffee'});expect(r.vitals.stamina-before.vitals.stamina).toBe(offer.stamina);expect(r.reputation-before.reputation).toBe(offer.reputation);expect(r.cash-before.cash).toBe(-offer.price);r.phase='play';
  }
  expect(worldCoffeeOffering(r).allowed).toBe(false);
 });
 it('keeps personal coffee available on leave but never invents AP for a nap',()=>{
  const r=startRun('leave-coffee','医生',[]);r.facts['leave:1']={day:1,source:'approved',sequence:0};r.ap=0;r.vitals.stamina=50;
  r.shiftPhase='结算';
  expect(worldNapOffering(r)).toMatchObject({allowed:false,ap:1});
  expect(worldNapOffering(r).text).toContain('不能用午睡透支');
  const done=act(r,{type:'coffee'});expect(done.vitals.stamina).toBe(65);expect(done.ap).toBe(0);expect(done.cash).toBe(r.cash-15);
  expect(act(r,{type:'borrow'})).toBe(r);expect(act(r,{type:'nap'})).toBe(r);
 });
});
