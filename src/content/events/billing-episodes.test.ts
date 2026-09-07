import {describe,it,expect}from 'vitest';
import {startRun}from '../../game/engine';
import {afterAuthoredChoice,buildAuthoredEvents}from '../../game/director';
import {eventToCard,EVENT_BY_ID}from './catalog';
import {billingEpisodeCredit,createClaimedReadmission,episodeAdjustedBudget,billingEpisodeSummaries}from './billing-episodes';
function split(){
 const r=startRun('split-claim','程医生',['T06','T16','T11']);r.day=6;r.authored=buildAuthoredEvents(r,'交班').patch.authored;
 const p=r.patients[0];p.active=p.inpatient=true;p.budget=5000;p.initialBudget=5000;p.spent=8000;p.charged=3000;
 const card=eventToCard(EVENT_BY_ID['E-171'],{instanceId:'real-split',scope:{kind:'patient',id:p.uid},patientId:p.uid,day:6,phase:'结算'}),done=afterAuthoredChoice(r,card,card.options[2],true);
 return{r:{...r,...done.patch},p,card,done};
}
describe('claimed billing episodes retain real continuous care',()=>{
 it('creates a sourced claim, never resets actual spending, charges or admission',()=>{
  const {r,p,done,card}=split();expect(r.authored.billingEpisodes).toHaveLength(1);expect(r.authored.billingEpisodes![0]).toMatchObject({source:card.options[2].id,patientId:p.uid,spendingAtSplit:8000,chargedAtSplit:3000,additionalBudget:5000,continuousStay:true});
  expect(done.patch.patients).toBeUndefined();expect(p.spent).toBe(8000);expect(p.charged).toBe(3000);expect(billingEpisodeCredit(r,p)).toBe(0);expect(episodeAdjustedBudget(r,p)).toBe(5000);
  expect(afterAuthoredChoice(r,card,card.options[2],true).patch.authored.billingEpisodes).toHaveLength(1);expect(createClaimedReadmission(r,p,card.options[2].id)).toBeUndefined();
 });
 it('offsets only future spending up to the new allowance while retaining prior liability',()=>{
  const {r,p}=split();expect(billingEpisodeCredit(r,p,8600)).toBe(600);expect(episodeAdjustedBudget(r,p,8600)).toBe(5600);expect(p.spent).toBe(8000);
  for(const [spent,credit,liability]of [[8600,600,3000],[13000,5000,3000],[13600,5000,3600]]){p.spent=spent;expect(billingEpisodeCredit(r,p)).toBe(credit);expect(p.spent-episodeAdjustedBudget(r,p)).toBe(liability);}
  expect(billingEpisodeSummaries(r,p)[0]).toMatchObject({day:6,additionalBudget:5000,used:5000,remaining:0,continuousStay:true});
  p.active=false;expect(billingEpisodeCredit(r,p)).toBe(5000);
  expect(billingEpisodeCredit(r,{uid:'another-person',spent:13600})).toBe(0);
 });
 it('cannot split a non-inpatient or grant a negative credit after corrected spending',()=>{
  const {r,p}=split();p.spent=7000;expect(billingEpisodeCredit(r,p)).toBe(0);
  const other={...p,uid:'other',inpatient:false};expect(createClaimedReadmission(r,other,'other:E-171-c')).toBeUndefined();
 });
});
