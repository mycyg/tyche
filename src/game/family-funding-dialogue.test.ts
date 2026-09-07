import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions,currentCard}from './engine';
import {refreshButterflyOptions,authoredGraphWorld,buildAuthoredEvents,shouldSuppressLegacyStory,type ButterflyCard}from './director';
import {familyFundingContactCard,canContactForFamilyFunding}from '../content/events/family-funding-contact';
import {startButterfly,routeButterfly}from '../content/events/butterfly';
import {EVENT_BY_ID,eventToCard}from '../content/events/catalog';
import {registerFamilyInvoice}from '../content/events/family-accounts';
import {emptySave,encode,decode,storageRunIssues}from './storage';
import type {Run}from './types';

// Execution-boundary fixtures. The campaign auditor supplies natural entrances.
function showNode(r:Run,nodeId:string):ButterflyCard{
 const chain=r.authored!.chains[0];
 const phase=nodeId==='BTF-002:N01'?EVENT_BY_ID['E-064'].phases[0]:'结算';r.shiftPhase=phase;
 const card:ButterflyCard={id:`${chain.id}:${nodeId.split(':').at(-1)}`,kind:'story',shiftPhase:phase,chain:chain.chain,scope:chain.scope,
  title:'筹款',text:'家里的账单还没付款。',options:[],butterfly:{chainStateId:chain.id,nodeId,day:r.day,phase}};
 card.options=refreshButterflyOptions(r,card);r.authored!.published[card.id]=card;return card;
}
function fixture(pressure=50){
 let r=startRun('funding-dialogue','程医生',[]);r.day=8;r.cash=5000;r.ap=10;r.phase='play';r.shiftPhase='结算';
 r.authored!.actor.liAwayDays=[];r.authored!.pressure=pressure;
 r.authored!.activeFacts['药代-0搭话']={day:8,source:'earlier-contact'};
 r.authored!.chains=[startButterfly('BTF-002','actual-loan',{actorId:'li'})];
 const loan=showNode(r,'BTF-002:N01');r.queue=[loan];r.cursor=0;
 r=act(r,{type:'choose',id:loan.options.find(o=>o.id.endsWith('N01b'))!.id});
 expect(r.cash).toBe(3500);expect(r.receivable).toBe(1500);
 r.day=10;r.phase='play';r.ap=10;
 const bill=eventToCard(EVENT_BY_ID['E-105'],{instanceId:'family-invoice',scope:{kind:'personal',id:r.id},day:10,phase:'结算'});
 bill.shiftPhase='结算';r.authored!.published[bill.id]=bill;registerFamilyInvoice(r.authored!,bill,'E-105',10);
 const chain=r.authored!.chains[0];r.authored!.chains[0]=routeButterfly(chain,authoredGraphWorld(r,r.authored!,chain,'结算'),['BTF-002:N02']);
 const funding=showNode(r,'BTF-002:N02');r.queue=[funding,bill];r.cursor=0;
 expect(storageRunIssues(r)).toEqual([]);return{r,bill};
}
function choose(r:Run,suffix:string){const option=availableOptions(r).find(o=>o.id.endsWith(suffix));expect(option,suffix).toBeDefined();return act(r,{type:'choose',id:option!.id});}
describe('family funding is answered before the payment it is meant to fund',()=>{
 function directFixture(){
  const r=startRun('direct-funding-contact','程医生',[]);r.day=10;r.cash=1000;r.ap=10;r.phase='play';r.shiftPhase='结算';
  r.authored!.pressure=50;r.authored!.activeFacts['药代-0搭话']={day:8,source:'prior-message'};
  const bill=eventToCard(EVENT_BY_ID['E-105'],{instanceId:'direct-family-invoice',scope:{kind:'personal',id:r.id},day:10,phase:'结算'});
  bill.shiftPhase='结算';r.authored!.published[bill.id]=bill;registerFamilyInvoice(r.authored!,bill,'E-105',10);
  const contact=familyFundingContactCard(r,bill.id);r.authored!.published[contact.id]=contact;r.queue=[contact,bill];r.cursor=0;
  return{r,bill,contact};
 }
 it.each(['unaccepted-first','closed-only','two-accepted'] as const)('binds a private funding offer only to its known active project: %s',variant=>{
  const {r}=directFixture();r.authored!.actor.sharedResearch=true;
  const project=(id:string,accepted:boolean,closed=false)=>{
   const c=startButterfly('BTF-004',id,{actorId:'zhou',projectId:id},'N05');
   if(accepted)c.facts.push({id:`${id}:accepted`,type:'project_accepted',day:8,scope:c.scope,subjects:{...c.subjects},sourceChoiceId:`${id}:prior-choice`,knownBy:['player']});
   if(closed)c.status='closed';return c;
  };
  r.authored!.chains=variant==='closed-only'?[project('closed-project',true,true)]:[project('first-project',variant==='two-accepted'),project('accepted-project',true)];
  let next=act(choose(r,':ask'),{type:'continue'});next=choose(next,'N04a');
  const loan=next.authored!.chains.find(c=>c.chain==='BTF-002')!;
  expect(next.privateDebt).toBe(10000);
  expect(loan.subjects.projectId).toBe(variant==='unaccepted-first'?'accepted-project':undefined);
  expect(next.authored!.chains.find(c=>c.id==='first-project')?.subjects.paymentId).toBeUndefined();
  expect(storageRunIssues(next)).toEqual([]);
 });
 it('opens the direct E146 entrance without inventing an earlier loan or N01/N02 choices',()=>{
  const {r,bill}=directFixture();let next=choose(r,':ask');
  expect(next.cash).toBe(r.cash);expect(next.receivable).toBe(0);expect(next.privateDebt).toBe(0);
  let chain=next.authored!.chains.find(c=>c.chain==='BTF-002')!;
  expect(chain.consumed).toEqual([]);expect(chain.facts.map(f=>f.type)).toEqual(['financial_need_disclosed']);
  expect(chain.facts[0].knownBy).toContain('ye');expect(chain.subjects.familyBillId).toBe(bill.id);
  next=decode(encode({...emptySave(),run:next})).run!;next=act(next,{type:'continue'});
  expect(currentCard(next)?.actor).toBe('rep');next=choose(next,'N04a');
  chain=next.authored!.chains.find(c=>c.chain==='BTF-002')!;expect(chain.consumed).toEqual(['BTF-002:N04']);
  expect(next.privateDebt).toBe(10000);expect(next.cash).toBe(r.cash+10000);expect(next.receivable).toBe(0);
  expect(storageRunIssues(next)).toEqual([]);
 });
 it('offers contact after the real invoice arrives, but not when the player has never met the representative',()=>{
  const {r,bill,contact}=directFixture();delete r.authored!.published[contact.id];r.queue=[bill];
  const built=buildAuthoredEvents(r,'结算');expect(built.cards.some(c=>c.id===contact.id)).toBe(true);
  delete r.authored!.activeFacts['药代-0搭话'];expect(canContactForFamilyFunding(r,bill.id)).toBe(false);
 });
 it('does not disclose finances or start a chain when declining the optional call',()=>{
  const {r,bill}=directFixture();let next=choose(r,':decline');next=act(next,{type:'continue'});
  expect(currentCard(next)?.id).toBe(bill.id);expect(next.authored!.chains.some(c=>c.chain==='BTF-002')).toBe(false);
  expect(next.cash).toBe(r.cash);expect(next.privateDebt).toBe(0);
 });
 it('removes a stale call after payment and rejects an imported reference to a missing invoice',()=>{
  const {r,contact}=directFixture();r.authored!.familyInvoices![0].status='delegated';
  expect(availableOptions(r).map(o=>o.id)).toEqual([`${contact.id}:decline`]);
  contact.familyFundingContact.familyBillId='missing-invoice';expect(storageRunIssues(r)).toContain('references');
 });
 it('keeps fresh wedding choices in E105, while preserving a played legacy wedding record',()=>{
  const {r}=directFixture();expect(shouldSuppressLegacyStory(r,'family-wedding')).toBe(true);
  r.facts['seen:family-wedding']={day:7,source:'family-wedding-a',sequence:0};expect(shouldSuppressLegacyStory(r,'family-wedding')).toBe(false);
 });
 it('opens the requested credit confirmation before returning to the original bill',()=>{
  const {r,bill}=fixture();let next=choose(r,'N02b');
  expect(next.cash).toBe(r.cash);expect(next.debt).toBe(r.debt);
  next=act(next,{type:'continue'});expect(currentCard(next)).toHaveProperty('butterflyFinance');
  next=choose(next,':decline');next=act(next,{type:'continue'});
  expect(currentCard(next)?.id).toBe(bill.id);expect(next.cash).toBe(r.cash);expect(next.debt).toBe(r.debt);
 });
 it('receives the contacted representative reply before paying, then records the loan and bill once each',()=>{
  const {r,bill}=fixture();let next=choose(r,'N02e');
  expect(next.cash).toBe(r.cash);expect(next.privateDebt).toBe(0);
  next=decode(encode({...emptySave(),run:next})).run!;
  next=act(next,{type:'continue'});
  expect((currentCard(next)as ButterflyCard)?.butterfly.nodeId).toBe('BTF-002:N04');
  const accept=availableOptions(next).find(o=>o.id.endsWith('N04a'))!;expect(accept).toBeDefined();
  next=act(next,{type:'choose',id:accept.id});
  expect(next.cash).toBe(r.cash+10000);expect(next.privateDebt).toBe(10000);expect(next.receivable).toBe(1500);
  expect(next.authored!.familyInvoices![0].status).toBe('decision-pending');
  expect(act(next,{type:'choose',id:accept.id})).toBe(next);
  next=act(next,{type:'continue'});expect(currentCard(next)?.id).toBe(bill.id);
  const pay=availableOptions(next).find(o=>o.id.endsWith('E-105-c'))!;
  const before=next.cash;next=act(next,{type:'choose',id:pay.id});
  expect(next.cash).toBe(before+(pay.effects.cash??0));expect(next.privateDebt).toBe(10000);
  expect(next.authored!.familyInvoices![0].status).toBe('paid');
  expect(storageRunIssues(next)).toEqual([]);
 });
 it('can refuse the reply without receiving money or changing the unpaid bill',()=>{
  const {r,bill}=fixture();let next=act(choose(r,'N02e'),{type:'continue'});
  next=choose(next,'N04b');next=act(next,{type:'continue'});
  expect(currentCard(next)?.id).toBe(bill.id);expect(next.cash).toBe(r.cash);expect(next.privateDebt).toBe(0);
  expect(next.authored!.familyInvoices![0].status).toBe('decision-pending');
 });
 it('does not create a representative offer below the documented pressure threshold',()=>{
  const {r,bill}=fixture(39);const next=act(choose(r,'N02e'),{type:'continue'});
  expect(currentCard(next)?.id).toBe(bill.id);
  expect(next.queue.some(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-002:N04')).toBe(false);
  expect(next.cash).toBe(r.cash);expect(next.privateDebt).toBe(0);
 });
});
