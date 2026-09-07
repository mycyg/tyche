import {describe,it,expect} from 'vitest';
import {startRun,act,availableOptions,currentCard} from './engine';
import {buildAuthoredEvents,eligibleAuthoredEvents,settleAuthoredEvents} from './director';
import {EVENT_BY_ID,eventToCard,eventRiskTargets} from '../content/events';
import {pendingPeerReferralNotes,refreshPeerReferralOffer} from './peer-referrals';
import {emptySave,encode,decode,storageRunIssues} from './storage';
import {RULES} from './rules';
import type {Run,Card} from './types';

// Explicit event fixtures exercise the production dispatcher and transactions.
// They are not counted as naturally reached campaign coverage.
function offer(day=5) {
  const r=startRun('peer-referral-fixture','程医生',[]);
  r.day=day;r.ap=40;r.shiftPhase='结算';r.phase='play';
  r.authored!.activeFacts['药代-同事收了']={day:1,source:'E-143-b'};
  const match=eligibleAuthoredEvents(r,'结算').find(item=>item.event.id==='E-144')!;
  expect(match).toBeDefined();
  const card=eventToCard(match.event,match.binding,match.context);
  r.authored!.published[card.id]=card;r.queue=[card];r.cursor=0;
  return {r,card};
}
function accept(index=0,day=5) {
  const {r,card}=offer(day);
  return act(r,{type:'choose',id:card.options[index].id});
}
function outpatient(r:Run,day=r.day+1) {
  const card:Card={id:`test-to-outpatient:${day}`,kind:'story',scope:{kind:'personal',id:r.id},
    title:'查房结束',text:'前往门诊。',options:[{id:`test-to-outpatient:${day}:go`,label:'去门诊',ap:0,minutes:0,cost:0,effects:{},result:'门诊开始。'}]};
  const chosen=act({...r,day,ap:10,phase:'play',shiftPhase:'查房',cursor:0,queue:[card]}, {type:'choose',id:card.options[0].id});
  return act(chosen,{type:'continue'});
}
const referralPatients=(r:Run)=>(r.authored!.peerReferrals?.[0].patientIds??[]).map(id=>r.patients.find(p=>p.uid===id)!);
function focusReferral(r:Run,index:number) {
  if(r.phase==='feedback')r=act(r,{type:'continue'});
  const id=r.authored!.peerReferrals![0].patientIds[index];
  const card=r.queue.find(c=>c.patientId===id&&c.presetNode?.endsWith(':peer-referral'))!;
  return act(r,{type:'focus',id:card.id});
}
describe('E144 transfers real appointments instead of existing player beds or project guilt',()=>{
  it('refreshes an unanswered saved offer before charging, but preserves already completed history',()=>{
    const {r,card}=offer();
    card.options[2].effects.hazards=[{type:'D',weight:5,reason:'旧选项',norm:'旧选项',causal:false}];
    card.options[0].deferred=[{id:'E-144-a:legacy',delay:1,phase:'门诊',effects:{apAllowance:3},description:'旧选项'}];
    expect(currentCard(r)!.options[2].effects.hazards).toEqual([]);
    const chosen=act(r,{type:'choose',id:card.options[2].id});
    expect(chosen.hazards).toEqual(r.hazards);expect(chosen.authored!.peerReferrals).toHaveLength(1);
    expect(refreshPeerReferralOffer(chosen,card)).toBe(card);
  });
  it.each([0,2])('keeps option %i as a future promise, with no encounter or clinical risk today',index=>{
    const {r,card}=offer(),priorIds=r.patients.map(p=>p.uid),beforeCash=r.cash;
    const after=act(r,{type:'choose',id:card.options[index].id});
    expect(after.authored!.peerReferrals).toEqual([{id:card.options[index].id,due:6,mode:index===0?'full':'brief',patientIds:[]}]);
    expect(after.patients.map(p=>p.uid)).toEqual(priorIds);
    expect(after.cash).toBe(beforeCash);
    expect(after.hazards.filter(h=>h.choiceId===card.options[index].id)).toEqual([]);
    expect(after.authored!.ledger.pending.some(p=>p.id.includes('E-144'))).toBe(false);
    expect(eventRiskTargets(EVENT_BY_ID['E-144'],card.options[index],card.eventBinding)).toEqual([]);
    expect(card.eventBinding.patients).toBeUndefined();
    expect(storageRunIssues(after)).toEqual([]);
    expect(decode(encode({...emptySave(),run:after})).run!.authored!.peerReferrals).toEqual(after.authored!.peerReferrals);
    const repeated=act(after,{type:'choose',id:card.options[index].id});
    expect(repeated.authored!.peerReferrals).toEqual(after.authored!.peerReferrals);
  });
  it('offers the transfer even without three pre-existing player beds',()=>{
    const {r}=offer();r.patients=[];r.queue=[];
    expect(eligibleAuthoredEvents(r,'结算').some(item=>item.event.id==='E-144')).toBe(true);
  });
  it('refusal creates neither patients nor extra allowance',()=>{
    const r=accept(1),ids=r.patients.map(p=>p.uid),after=outpatient(r);
    expect(after.authored!.peerReferrals??[]).toEqual([]);
    expect(after.patients.map(p=>p.uid)).toEqual(ids);
    expect(after.ap).toBe(10);
  });
  it('delivers three independently playable outpatient presets and applies the three-point allowance once',()=>{
    const r=accept(),oldPatients=structuredClone(r.patients);
    let arrived=outpatient(r);const people=referralPatients(arrived);
    expect(people).toHaveLength(RULES.peerReferrals.patients);
    expect(new Set(people.map(p=>p.entityId)).size).toBe(3);
    expect(people.every(p=>p.bed===0&&!p.inpatient&&p.preset?.period==='门诊'&&p.budget>0&&p.charged===0&&!p.settled)).toBe(true);
    expect(arrived.ap).toBe(10+RULES.peerReferrals.fullAp);
    expect(arrived.patients.filter(p=>oldPatients.some(old=>old.uid===p.uid))).toEqual(oldPatients);
    expect(buildAuthoredEvents(arrived,'门诊').cards).toEqual([]);
    expect(pendingPeerReferralNotes(arrived,6)).toEqual([]);
    expect(storageRunIssues(arrived)).toEqual([]);
    arrived=decode(encode({...emptySave(),run:arrived})).run!;
    arrived=focusReferral(arrived,0);
    const before=arrived.ap,entry=currentCard(arrived)!;
    arrived=act(arrived,{type:'choose',id:availableOptions(arrived)[0].id});
    expect(arrived.ap).toBe(before);
    expect(arrived.queue.some(c=>c.patientId===entry.patientId&&c.presetNode&&!c.presetNode.endsWith(':peer-referral')&&!arrived.committed.includes(c.options[0].id))).toBe(true);
    expect(referralPatients(arrived)[0].presetResolved).not.toBe(true);
    expect(storageRunIssues(arrived)).toEqual([]);
  });
  it('attaches D+5 to each actual brief encounter, permits reassessment, and never adds representative-project guilt',()=>{
    let r=outpatient(accept(2));expect(r.ap).toBe(10);expect(referralPatients(r)).toHaveLength(3);
    const unrelated=structuredClone(r.hazards);
    for(let i=0;i<2;i++){
      r=focusReferral(r,i);const card=currentCard(r)!,option=availableOptions(r).find(o=>o.id.endsWith(':brief'))!;
      r=act(r,{type:'choose',id:option.id});
      const hazards=r.hazards.filter(h=>h.choiceId===option.id);
      expect(hazards).toMatchObject([{scope:{kind:'patient',id:card.patientId},type:'D',weight:RULES.peerReferrals.briefDocumentationRisk}]);
      expect(r.patients.find(p=>p.uid===card.patientId)?.presetResolved).toBe(true);
      const before=r.hazards.length;r=act(r,{type:'choose',id:option.id});expect(r.hazards).toHaveLength(before);
    }
    r=focusReferral(r,2);const third=currentCard(r)!;
    r=act(r,{type:'choose',id:availableOptions(r).find(o=>o.id.endsWith(':start'))!.id});
    expect(r.hazards.some(h=>h.scope.id===third.patientId)).toBe(false);
    expect(r.hazards.filter(h=>h.scope.kind==='project')).toEqual(unrelated.filter(h=>h.scope.kind==='project'));
    expect(storageRunIssues(r)).toEqual([]);
  });
  it('postpones during full-day leave without granting unused AP, and resumes after leave',()=>{
    const r=accept();r.day=6;r.facts['leave:6']={day:6,source:'test-approved-leave',sequence:r.journal.length};
    const skipped=buildAuthoredEvents(r,'门诊');
    expect(skipped.cards.some(c=>c.presetNode?.endsWith(':peer-referral'))).toBe(false);
    expect(skipped.effects.some(e=>e.id.includes('peer-referral'))).toBe(false);
    const after=outpatient({...r,...skipped.patch},7);
    expect(referralPatients(after)).toHaveLength(3);expect(referralPatients(after).every(p=>p.admitted===7)).toBe(true);
    expect(after.ap).toBe(13);expect(storageRunIssues(after)).toEqual([]);
  });
  it('keeps a last-day promise pending after the rotation, with no invented patient or completed examination',()=>{
    const r=accept(2,14),result=settleAuthoredEvents(r,'结算',true);
    expect(result.patch.authored.peerReferrals![0].due).toBe(15);
    expect(result.patch.authored.endNotes.some(note=>note.includes('三位')||note.includes('还剩 3 人'))).toBe(true);
    expect(result.patch.authored.endNotes.some(note=>note.includes('尚未接诊'))).toBe(true);
    const after=buildAuthoredEvents({...r,...result.patch,day:15},'门诊');
    expect(after.patch.authored.peerReferrals![0].patientIds).toEqual([]);
    expect(after.cards.some(c=>c.presetNode?.endsWith(':peer-referral'))).toBe(false);
  });
  it('rejects fabricated referral sources, mode switches and substitutions of old patient identities',()=>{
    const valid=outpatient(accept());
    for(const change of [
      (r:Run)=>{r.authored!.peerReferrals![0].id='fake:E-144-a';},
      (r:Run)=>{r.authored!.peerReferrals![0].mode='brief';},
      (r:Run)=>{r.authored!.peerReferrals![0].patientIds[0]=r.patients[0].uid;},
      (r:Run)=>{r.authored!.peerReferrals![0].due++;},
    ]){const corrupt=structuredClone(valid);change(corrupt);expect(storageRunIssues(corrupt).length).toBeGreaterThan(0);}
  });
});
