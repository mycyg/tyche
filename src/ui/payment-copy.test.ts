import {describe,it,expect}from 'vitest';
import {startRun}from '../game/engine';
import {createPatient}from '../game/cards';
import {createClaimedReadmission}from '../content/events/billing-episodes';
import type {Option}from '../game/types';
import {paymentCopy}from './payment-copy';
import {beginClinical}from '../game/clinical';
import {clinicalActionHelp,clinicalChoiceHelp}from './clinical-help';
import {clinicalCard,fullGraph}from '../game/clinical';

describe('readable action and billing explanations',()=>{
 it('distinguishes settled overspending from a genuinely within-budget bill',()=>{
  const r=startRun('cost-wording','医生',[]),p=createPatient(r,'C013','invoice');
  p.active=p.inpatient=true;p.budget=p.initialBudget=5000;p.spent=8000;p.charged=3000;
  r.authored!.billingEpisodes=[createClaimedReadmission(r,p,'claim:E-171-c')!];
  const o:Option={id:'new-invoice',label:'后续治疗',ap:0,minutes:0,cost:600,result:'已安排。',effects:{}};
  r.queue=[{id:'invoice',kind:'ward',scope:{kind:'patient',id:p.uid},patientId:p.uid,title:'账单',text:'账单已到。',options:[o]}];r.cursor=0;
  const copy=paymentCopy(r,p,o);
  expect(copy.payment.personal).toBe(0);expect(copy.cash).toContain('原有超支已结算');expect(copy.cash).not.toContain('预算内');expect(copy.allowance).not.toContain('审核通过');
  expect(copy.allowance).toContain('¥5,600');
  p.spent=500;p.charged=0;r.authored!.billingEpisodes=[];
  expect(paymentCopy(r,p,o).cash).toContain('费用由可用额度覆盖');
 });
 it('shows multi-action help separately from the patient conversation',()=>{
  const r=startRun('multi-help','医生',[]),p=createPatient(r,'C013','help');r.patients.push(p);
  const card=beginClinical(r,p)!;
  expect(clinicalActionHelp(r,card)).toContain('每项单独确认');
  expect(card.text).not.toContain('立即执行并扣除费用');
  expect(card.text).not.toContain('至少');
  expect(clinicalActionHelp(r,{...card,clinicalGraph:undefined})).toBeUndefined();
 });
 it('warns that PICU disposition leaves the group while illness counselling can be done first',()=>{
  const r=startRun('group-exit','医生',[]),p=createPatient(r,'C008','help');r.patients=[p];beginClinical(r,p);
  p.clinical!.nodeId='s5';p.clinical!.selected.s5=[];p.clinical!.variants=p.clinical!.variants.filter(v=>v!=='no_picu');
  const card=clinicalCard(r,p)!,before=structuredClone(p.clinical);
  const disposition=card.options.find(o=>o.clinicalChoice==='s5_picu')!,inform=card.options.find(o=>o.clinicalChoice==='s5_inform')!;
  expect(disposition).toBeDefined();expect(clinicalChoiceHelp(r,card,disposition)).toContain('结束本组');
  expect(clinicalChoiceHelp(r,card,inform)).toBeUndefined();expect(p.clinical).toEqual(before);
  expect(clinicalChoiceHelp(r,undefined,disposition)).toBeUndefined();expect(fullGraph('C008')!.nodes.find(n=>n.id==='s5')!.exitOn).toContain('s5_picu');
 });
});
