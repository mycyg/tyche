import {describe,it,expect}from 'vitest';
import {act,startRun}from './engine';
import {createPatient,assignBed}from './cards';
import {patientPayment}from './costs';
import {patientLiability}from './budget-liability';
import {decode,encode,emptySave,storageRunIssues}from './storage';
import {makeTrolleyCard,TROLLEY_DEFINITIONS,trolleyEchoCard,trolleyBindings}from '../content/events/trolley';
import {createClaimedReadmission}from '../content/events/billing-episodes';
import type {Card,Option,Run}from './types';

function fixture(){
 const r=startRun('settled-bills','程医生',[]),p=createPatient(r,'C013','previous-invoice');r.patients.push(p);
 p.budget=p.initialBudget=1000;p.spent=2000;p.charged=1000;
 r.debuffs.push('B24');r.phase='play';r.shiftPhase='查房';r.cursor=0;
 return{r,p};
}
function invoice(r:Run,uid:string,id:string,cost=0,effects:Option['effects']={}):Option{
 const option:Option={id,label:'核对本次事项',ap:0,minutes:0,cost,result:'本次事项已核对。',effects};
 r.queue=[{id:`card:${id}`,kind:'story',title:'核对记录',text:'',patientId:uid,scope:{kind:'patient',id:uid},options:[option]}];
 r.cursor=0;r.phase='play';delete r.feedback;return option;
}
describe('budget settlement belongs to a real billing action',()=>{
 it('uses the same actual cost at the dilemma trigger and the quoted invoice',()=>{
  const {r,p}=fixture(),d=TROLLEY_DEFINITIONS[4];
  assignBed(r,p);expect(p.inpatient).toBe(true);
  const world={day:r.day,phase:'查房' as const,patients:[p],facts:[],peerAvailable:true};
  p.spent=p.budget+9000;p.charged=10800; // An already settled B24 invoice, not pre-B24 principal.
  expect(trolleyBindings(d,world,r)).toEqual([p]);
  expect(patientPayment(r,p,makeTrolleyCard(d,r,[p]).options[0]).personal).toBe(1080);
  r.debuffs=[];r.talents=['T26'];p.spent=p.budget-900;p.charged=0;
  expect(trolleyBindings(d,world,r)).toEqual([p]);
  r.talents=[];expect(trolleyBindings(d,world,r)).toBeNull();
 });
 it('does not invent a personal drug gap already covered by a billing allowance or the responsible team',()=>{
  const {r,p}=fixture(),d=TROLLEY_DEFINITIONS[4];
  assignBed(r,p);expect(p.inpatient).toBe(true);
  const world={day:r.day,phase:'查房' as const,patients:[p],facts:[],peerAvailable:true};
  r.authored!.billingEpisodes=[createClaimedReadmission(r,p,'invoice:E-171-c')!];
  expect(trolleyBindings(d,world,r)).toBeNull();
  r.authored!.billingEpisodes=[];r.authored!.clinicalAssignments=[{patientId:p.uid,owner:'peer',day:r.day,source:'E-043',teamCharged:0}];
  expect(trolleyBindings(d,world,r)).toBeNull();
 });
 it.each([true,false])('does not reprice settled bills on a free encounter (active=%s)',active=>{
  const {r,p}=fixture();p.active=active;if(!active){p.inpatient=false;p.bed=0;p.dischargedDay=1;}
  const o=invoice(r,p.uid,'read-archive');
  expect(patientPayment(r,p,o)).toMatchObject({personal:0,refund:0});
  const done=act(r,{type:'choose',id:o.id});
  expect(done.cash).toBe(r.cash);expect(done.patients.find(x=>x.uid===p.uid)?.charged).toBe(1000);
  expect(done.budgetCharges??[]).toEqual([]);expect(storageRunIssues(done)).toEqual([]);
 });
 it('preserves the already-paid principal and applies B24 only to new shortfall, before and after reload',()=>{
  let {r,p}=fixture();
  for(const [id,cost,paid]of [['new-100',100,120],['new-50',50,60]]as const){
   const o=invoice(r,p.uid,id,cost),before=r.cash;
   expect(patientPayment(r,p,o).personal).toBe(paid);
   r=act(r,{type:'choose',id:o.id});expect(r.cash).toBe(before-paid);
   expect(r.budgetCharges!.at(-1)).toMatchObject({source:id,patientId:p.uid,amount:paid});
   expect(r.budgetCharges!.some(c=>c.source.startsWith('contact:'))).toBe(false);
   r=decode(encode({...emptySave(),run:r})).run!;p=r.patients.find(x=>x.uid===p.uid)!;
  }
  expect(p.charged).toBe(1180);expect(p.budgetSurchargeExempt).toBe(1000);
  const correction=invoice(r,p.uid,'budget-correction',0,{bill:-150}),before=r.cash;
  expect(patientPayment(r,p,correction).refund).toBe(180);
  r=act(r,{type:'choose',id:correction.id});expect(r.cash).toBe(before+180);
  expect(r.patients.find(x=>x.uid===p.uid)?.charged).toBe(1000);
  expect(act(r,{type:'choose',id:correction.id})).toBe(r);
 });
 it('retains old mixed-rate payments rather than inventing a refund',()=>{
  const {r,p}=fixture();p.charged=1100;
  expect(patientLiability(r,p)).toBe(1100);
  expect(patientPayment(r,p,invoice(r,p.uid,'more-medicine',100)).personal).toBe(120);
 });
 it.each([4,17])('uses the actual budget quote for the medicine dilemma %i',index=>{
  const {r,p}=fixture();const card=makeTrolleyCard(TROLLEY_DEFINITIONS[index],r,[p]);r.queue=[card];
  expect(card.text).toContain('1,080');expect(card.options[0].hint).toContain('1,080');
  expect(patientPayment(r,p,card.options[0]).personal).toBe(1080);
  const done=act(r,{type:'choose',id:card.options[0].id});expect(done.cash).toBe(r.cash-1080);
  expect(storageRunIssues(done)).toEqual([]);
 });
 it('keeps a historical trolley receipt free even when the old patient has a new first-contact hook',()=>{
  const {r,p}=fixture();const token={id:`${r.id}:TROLLEY-16:echo`,sourceId:'TROLLEY-16',choice:'a',response:'review',day:1,due:1,stage:3 as const,scope:{kind:'patient' as const,id:p.uid},patientIds:[p.uid],actor:'带教',object:'医嘱修改日志',resolved:false};
  r.authored!.trolley={seen:['TROLLEY-16'],commits:[],tokens:[token]};
  const card:Card=trolleyEchoCard(r,token);r.queue=[card];
  const done=act(r,{type:'choose',id:card.options[0].id});
  expect(done.cash).toBe(r.cash);expect(done.budgetCharges??[]).toEqual([]);
  expect(done.authored!.trolley!.tokens[0].resolved).toBe(true);
  expect(decode(encode({...emptySave(),run:done})).run).toEqual(done);
 });
 it.each([-1,1001,Infinity,NaN,'paid'])('rejects an invalid historical surcharge basis: %s',value=>{
  const {r,p}=fixture();(p as unknown as {budgetSurchargeExempt:unknown}).budgetSurchargeExempt=value;
  expect(()=>decode(encode({...emptySave(),run:r}))).toThrow();
 });
});
