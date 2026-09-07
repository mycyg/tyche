import { describe, expect, it } from 'vitest';
import { startRun,act } from './engine';
import {nightClinicalCharge}from './night-costs';
import {RULES}from './rules';
import {visibleChoiceEffects}from '../ui/copy';
import { buildAuthoredEvents, afterAuthoredChoice, settleAuthoredEvents, authoredGraphWorld, eligibleAuthoredEvents, authoredQualifiers, documentedQualifierInventory, authoredRequestedEnding, forceZeroEvent,authoredRefusalRiskBonus,pendingClinicalEvent,representativeContactChance } from './director';
import {beginClinical}from './clinical';
import {createPatient}from './cards';
import type {Card}from './types';
import type { AuthoredRun, ButterflyCard, ButterflyCommitmentCard } from './director';
import { startButterfly, commitButterflyChoice, eventToCard, EVENT_BY_ID } from '../content/events';
import { authoredTalentWeight, prepareTalentEvent } from '../content/events/talent-adapter';
const fresh=():AuthoredRun=>startRun('director-test','程医生',['T06','T16','T11']);
const initialized=()=>{const r=fresh();r.authored=buildAuthoredEvents(r,'日终').patch.authored;r.authored.scheduled=[];r.authored.published={};r.authored.chains=[];return r as AuthoredRun&{authored:NonNullable<AuthoredRun['authored']>};};
describe('authored encounter director',()=>{
  it('binds lowered admission only to an actual mild pneumonia outpatient',()=>{
    const r=initialized();r.day=7;r.authored.activeFacts['DIP-指征']={day:6,source:'chief-indication'};
    const p=createPatient(r,'C-001','quick-mild-admission');r.patients=[p];p.active=true;p.inpatient=false;p.damage=0;
    const eligible=eligibleAuthoredEvents(r,'门诊').find(e=>e.event.id==='E-162')!;expect(eligible.binding.patientId).toBe(p.uid);
    const card=eventToCard(eligible.event,eligible.binding,eligible.context),accepted=afterAuthoredChoice(r,card,card.options[0],true);expect(accepted.patch.patients![0].inpatient).toBe(true);
    p.damage=2;expect(eligibleAuthoredEvents(r,'门诊').some(e=>e.event.id==='E-162')).toBe(false);
    p.damage=0;p.caseId='C008';expect(eligibleAuthoredEvents(r,'门诊').some(e=>e.event.id==='E-162')).toBe(false);
  });
  it('keeps a keyed authored choice delay stable across unique run identities',()=>{
    const first=initialized(),second=initialized();first.id='same-seed-run-one';second.id='same-seed-run-two';first.day=second.day=8;
    const outcomes=[first,second].map(r=>{const card=eventToCard(EVENT_BY_ID['E-134'],{instanceId:`${r.id}:event:E-134:8`,scope:{kind:'project',id:`${r.id}:representative-account`},day:8,phase:'结算'});return afterAuthoredChoice(r,card,card.options[0],true).patch.authored;});
    expect(outcomes[0].drugNextDay).toBe(outcomes[1].drugNextDay);expect(outcomes[0].drugStage).toBe(outcomes[1].drugStage);
  });
  it('delivers the documented day-eight first invitation without inventing an accepted benefit',()=>{
    const r=initialized();r.day=8;r.debt=0;r.authored.pressure=0;
    const result=buildAuthoredEvents(r,'结算'),invitation=result.cards.find(c=>(c as Partial<ButterflyCard>).authoredEventId==='E-132')!;expect(invitation).toBeDefined();expect(invitation.text).toContain('第一次收到');
    expect(result.effects.some(e=>e.effects.flags?.includes('药代-0搭话'))).toBe(true);expect(result.effects.some(e=>(e.effects.cash??0)>0||e.effects.flags?.includes('药代-1餐叙'))).toBe(false);
    expect(representativeContactChance(39)).toBe(.1);expect(representativeContactChance(40)).toBe(.3);expect(representativeContactChance(60)).toBe(.6);
  });
  it('honours the child review and family booking as actual appointments rather than empty notices',()=>{
    const r=initialized();r.day=4;const child=createPatient(r,'C-151','quick-review');r.patients.push(child);child.active=false;child.presetResolved=true;
    child.spent=child.budget+50;child.charged=50;child.budgetSurchargeExempt=50;
    const event=eventToCard(EVENT_BY_ID['E-032'],{scope:{kind:'patient',id:child.uid},patientId:child.uid,instanceId:'review-booking',day:4,phase:'门诊'});
    const promised=afterAuthoredChoice(r,event,event.options[2],true),next={...r,...promised.patch,day:5},arrival=buildAuthoredEvents(next,'门诊');
    const review=arrival.cards.find(c=>c.id==='review-booking:E-032-c:review')!;expect(review).toBeDefined();expect(review.options[0].ap).toBe(3);
    const revisiting=arrival.patch.patients!.find(p=>p.uid===review.patientId)!;expect(revisiting.name).toBe(child.name);expect(revisiting.uid).not.toBe(child.uid);expect(revisiting.preset?.revisit?.previousPatientId).toBe(child.uid);
    expect(arrival.patch.patients!.find(p=>p.uid===child.uid)?.presetResolved).toBe(true);
    expect(revisiting.spent).toBe(0);expect(revisiting.charged).toBe(0);expect(revisiting.budgetSurchargeExempt).toBeUndefined();
    expect(arrival.patch.patients!.find(p=>p.uid===child.uid)?.budgetSurchargeExempt).toBe(50);
    expect(buildAuthoredEvents({...next,...arrival.patch},'门诊').cards).toHaveLength(0);
    const call=eventToCard(EVENT_BY_ID['E-109'],{scope:{kind:'personal',id:r.id},instanceId:'family-booking',day:4,phase:'结算'}),booking=afterAuthoredChoice(r,call,call.options[2],true),familyArrival=buildAuthoredEvents({...r,...booking.patch,day:5},'门诊');
    const booked=familyArrival.patch.patients!.find(p=>p.uid.includes('quick-family-referral'))!;expect(booked).toBeDefined();expect(booked.preset!.age).toBeLessThan(18);expect(familyArrival.cards.some(c=>c.patientId===booked.uid&&c.presetNode)).toBe(true);
  });
  it('keeps the same hospital invoice when an agreed follow-up takes place at the bedside',()=>{
    const r=initialized();r.day=4;r.patients=[];
    const child=createPatient(r,'C-151','quick-ward-review');r.patients.push(child);
    child.inpatient=true;child.bed=1;child.active=true;child.presetResolved=true;
    child.spent=child.budget+50;child.charged=50;child.budgetSurchargeExempt=50;
    const event=eventToCard(EVENT_BY_ID['E-032'],{scope:{kind:'patient',id:child.uid},patientId:child.uid,instanceId:'ward-review-booking',day:4,phase:'查房'});
    const promised=afterAuthoredChoice(r,event,event.options[2],true),arrival=buildAuthoredEvents({...r,...promised.patch,day:5},'查房');
    const review=arrival.cards.find(c=>c.id==='ward-review-booking:E-032-c:review')!;
    expect(review.patientId).toBe(child.uid);expect(review.text).toContain('在病区完成');
    expect(arrival.patch.patients!.find(p=>p.uid===child.uid)).toMatchObject({spent:child.spent,charged:50,budgetSurchargeExempt:50});
    expect(arrival.patch.patients!.some(p=>p.uid.endsWith(':E-032-return'))).toBe(false);
  });
  it('records a new fall answered by telephone without performing any original clinical option',()=>{
    const r=initialized();r.day=6;const p=r.patients[0],event=eventToCard(EVENT_BY_ID['E-012'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:'new-fall',day:6,phase:'夜班'});
    const phone={id:'new-fall:night-telephone',label:'电话交代',ap:0,minutes:5,cost:0,result:'',effects:{}};
    const response=afterAuthoredChoice(r,event,phone,true);expect(response.patch.authored.seen['E-012']).toBe(6);expect(response.effects).toHaveLength(0);expect(response.patch.patients).toBeUndefined();expect(response.patch.authored.ledger.outcomes?.at(-1)?.choiceId).toBe(phone.id);
    expect(afterAuthoredChoice({...r,...response.patch},event,phone,true).patch.authored.ledger.commits).toHaveLength(response.patch.authored.ledger.commits.length);
  });
  it('interrupts a real proposed lumbar puncture before its next step and resumes treatment once',()=>{
    const r=initialized();r.day=4;const p=r.patients[0];p.caseId='C008';delete p.preset;delete p.clinical;beginClinical(r,p);p.clinical!.nodeId='s3';p.clinical!.flags.push('lp_proposed');p.clinical!.choices.push('s2_lp');
    const card:Card={id:'lp-proposed',kind:'clinical',shiftPhase:'查房',scope:{kind:'patient',id:p.uid},patientId:p.uid,title:'检查',text:'',options:[]};
    const option={id:'actual-lp-proposal',clinicalChoice:'s2_lp',label:'提出腰穿',ap:1,minutes:10,cost:0,result:'',effects:{}};
    const pending=pendingClinicalEvent(r,card,option),event=pending.cards[0];expect(event).toBeDefined();expect('authoredEventId'in event&&event.authoredEventId).toBe('E-013');
    expect(pendingClinicalEvent({...r,...pending.patch},card,option).cards).toHaveLength(0);
    const signed=afterAuthoredChoice({...r,...pending.patch},event,event.options[0],true);expect(signed.patch.patients![0].clinical!.nodeId).toBe('s4');expect(signed.patch.patients![0].clinical!.flags).toContain('refusal_signed');
    expect(pendingClinicalEvent(r,{...card,kind:'night',shiftPhase:'夜班'},option).cards).toHaveLength(0);
    p.clinical!.outcomeId='o_best';expect(pendingClinicalEvent(r,card,option).cards).toHaveLength(0);
  });
  it('applies the three-day outpatient limit to each actual new outpatient only once',()=>{
    const r=initialized();r.day=5;const p=r.patients[0];p.inpatient=false;
    const event=eventToCard(EVENT_BY_ID['E-159'],{scope:{kind:'project',id:'actual-audit'},instanceId:'limit',day:5,phase:'结算'});
    const decision=afterAuthoredChoice(r,event,event.options[2],true),next={...r,...decision.patch,day:6};
    const card:Card={id:'actual-outpatient',kind:'quick',patientId:p.uid,title:'接诊',text:'',scope:{kind:'patient',id:p.uid},options:[{id:'actual-choice',label:'诊疗',ap:1,minutes:0,cost:0,result:'',effects:{}}]};
    expect(afterAuthoredChoice({...next,day:5},card,card.options[0],true).effects).toHaveLength(0);
    const done=afterAuthoredChoice(next,card,card.options[0],true);expect(done.effects[0].scope.id).toBe(p.uid);expect(done.effects[0].effects.hazards?.[0].weight).toBe(5);
    expect(afterAuthoredChoice({...next,...done.patch},card,card.options[0],true).effects).toHaveLength(0);
    expect(afterAuthoredChoice({...next,day:9},card,card.options[0],true).effects).toHaveLength(0);
  });
  it('charges hallucination once per new emergency that night and stops after real counselling',()=>{
    const r=initialized();r.day=6;const p=r.patients[0],event=eventToCard(EVENT_BY_ID['E-201'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:'hallucination',day:6,phase:'夜班'});
    const continued=afterAuthoredChoice(r,event,event.options[1],true),next={...r,...continued.patch};
    expect(next.authored.activeFacts['幻听']).toBeDefined();
    const card:Card={id:'new-emergency',kind:'night',last:false,patientId:p.uid,title:'接诊',text:'',scope:{kind:'patient',id:p.uid},options:[{id:'emergency-choice',label:'诊疗',ap:0,minutes:0,cost:0,result:'',effects:{}}]};
    next.queue=[card];next.cursor=0;next.phase='play';next.shiftPhase='夜班';next.nightMinutes=100;
    expect(nightClinicalCharge(next,card,card.options[0]).san).toBe(8+RULES.perception.nightExtraSan);
    next.vitals.san=80; // Isolate the acute hallucination rule from low-SAN perception.
    const san=next.vitals.san;
    expect(nightClinicalCharge(next,card,card.options[0]).san).toBe(8);
    const done=act(next,{type:'choose',id:card.options[0].id});
    expect(done.vitals.san).toBe(san-8);
    expect(nightClinicalCharge(done,card,card.options[0]).san).toBe(0);
    const complete=act({...next,queue:[{...card,last:true}]},{type:'choose',id:card.options[0].id});
    expect(complete.vitals.san).toBe(san-8+3); // Separate reward for a completed, unharmed encounter.
    const recovered=afterAuthoredChoice(next,{...card,kind:'story'},{...card.options[0],talentAction:'counselling'},true);
    expect(nightClinicalCharge({...next,...recovered.patch},card,card.options[0]).san).toBe(RULES.nightIncident.san);
    expect(nightClinicalCharge({...next,day:7},card,card.options[0]).san).toBe(RULES.nightIncident.san);
    const failed=afterAuthoredChoice(r,event,event.options[1],false);expect(failed.patch.authored.activeFacts['幻听']).toBeUndefined();
  });
  it('settles a signed refusal once, without inventing a clinical or consent offence',()=>{
    const r=initialized();r.day=3;const p=r.patients[0];p.caseId='C008';delete p.preset;delete p.clinical;beginClinical(r,p);p.clinical!.flags.push('lp_proposed');
    const event=eventToCard(EVENT_BY_ID['E-013'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:'signed-refusal',day:3,phase:'查房'});
    const signed=afterAuthoredChoice(r,event,event.options[0],true),next={...r,...signed.patch,day:4};
    expect(authoredRefusalRiskBonus(next,p.uid)).toBe(.2);
    const done=settleAuthoredEvents(next,'交班'),followup=done.effects.find(e=>e.id.endsWith(':refusal-followup'))!;expect(followup).toBeDefined();expect(followup.effects.hazards).toBeUndefined();expect(followup.scope.id).toBe(p.uid);
    expect(settleAuthoredEvents({...next,...done.patch},'查房').effects.some(e=>e.id===followup.id)).toBe(false);
    for(const situation of ['completed','damaged','telephone']){
      const checked=structuredClone(next);if(situation==='completed')checked.patients[0].clinical!.flags.push('lp_consented','abx_started');
      if(situation==='damaged')checked.patients[0].damage=2;if(situation==='telephone')checked.facts[`night-telephone:${p.uid}`]={day:3,source:'phone',sequence:1};
      expect(settleAuthoredEvents(checked,'交班').effects.some(e=>e.id===followup.id)).toBe(false);
    }
  });
  it('keeps a three-day refusal cooldown without accepting a one-sided transfer',()=>{
    const r=initialized();r.day=8;r.authored.activeFacts['药代-1餐叙']={day:6,source:'actual-dinner'};
    const card=eventToCard(EVENT_BY_ID['E-134'],{scope:{kind:'project',id:'rep'},instanceId:'lecture',day:8,phase:'结算'});
    const failedRefusal=afterAuthoredChoice(r,card,card.options[2],false);expect(failedRefusal.patch.authored.drugStage).toBe(1);expect(failedRefusal.patch.authored.drugCooldownUntil).toBe(11);expect(failedRefusal.patch.authored.activeFacts['药代-2讲课费']).toBeUndefined();
    const accepted=afterAuthoredChoice(r,card,card.options[0],true);expect(accepted.patch.authored.drugStage).toBe(2);expect([10,11]).toContain(accepted.patch.authored.drugNextDay);
    expect(accepted.cards.some(c=>(c as Partial<ButterflyCard>).authoredEventId==='E-135')).toBe(true);
    const next={...r,...accepted.patch,day:9};expect(eligibleAuthoredEvents(next,'结算').some(x=>x.event.id==='E-136')).toBe(false);
  });
  it('uses actual cash pressure for the specific offer and refusal choices',()=>{
    const r=initialized();r.authored.pressure=80;
    const card=prepareTalentEvent(r,eventToCard(EVENT_BY_ID['E-134'],{scope:{kind:'project',id:'rep'},instanceId:'pressured-lecture',day:8,phase:'结算'}));
    expect(card.options[0].effects.san).toBeCloseTo(-4.8);expect(card.options[2].check?.dc).toBe(15);
  });
  it('applies the same-group low-price policy only to later actual treatment and only once',()=>{
    const r=initialized(),p=r.patients[0],other=structuredClone(p);other.uid='later-same-group';r.patients.push(other);r.day=8;
    const card=eventToCard(EVENT_BY_ID['E-161'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,instanceId:'cheap-policy',day:8,phase:'结算'});
    const made=afterAuthoredChoice(r,card,card.options[0],true),next={...r,...made.patch};
    expect(settleAuthoredEvents(next,'查房').effects.some(e=>e.id===`dip-cheaper-policy:${other.uid}`)).toBe(false);
    next.journal.push({id:'actual-later-treatment',day:8,title:'用药',choice:'治疗',result:'已给药',scope:{kind:'patient',id:other.uid},flags:[],operation:'treatment'});
    const done=settleAuthoredEvents(next,'结算'),risk=done.effects.find(e=>e.id===`dip-cheaper-policy:${other.uid}`);expect(risk?.effects.hazards?.[0].weight).toBe(5);
    expect(settleAuthoredEvents({...next,...done.patch},'日终').effects.some(e=>e.id===risk?.id)).toBe(false);
  });
  it('adds a distinct late outpatient now or on the promised next day',()=>{
    const r=initialized();r.day=4;
    const binding={scope:{kind:'patient' as const,id:`${r.id}:event-patient:E-005`},patientId:`${r.id}:event-patient:E-005`,instanceId:'late-visit',day:4,phase:'门诊' as const};
    const card=eventToCard(EVENT_BY_ID['E-005'],binding);
    const now=afterAuthoredChoice(r,card,card.options[0],true);
    expect(now.cards[0].presetNode).toBeDefined();expect(now.cards[0].clinicalGraph).toBeUndefined();
    expect(now.patch.patients!.length).toBe(r.patients.length+1);expect(now.cards[0].patientId).toBe(binding.patientId);
    const arrived=now.patch.patients!.find(p=>p.uid===binding.patientId)!;
    expect(arrived.caseId).toBe('C-043');expect(arrived.preset?.sex).toBe('男');
    const later=afterAuthoredChoice(r,card,card.options[2],true);expect(later.cards).toHaveLength(0);
    const next=buildAuthoredEvents({...r,...later.patch,day:5},'门诊');expect(next.cards.some(c=>c.patientId===binding.patientId&&c.presetNode)).toBe(true);
    expect(buildAuthoredEvents({...r,...next.patch,day:5},'门诊').cards).toHaveLength(0);
  });
  it('makes the paired-talent interview playable without inventing a patient offence',()=>{
    const r=initialized();r.day=9;r.facts['forced_audit_interview']={day:1,source:'T26+T28',sequence:0};
    const result=buildAuthoredEvents(r,'结算'),card=result.cards.find(c=>'authoredEventId'in c&&c.authoredEventId==='E-156')!;expect(card).toBeDefined();expect(card.scope.kind).toBe('project');expect(card.patientId).toBeUndefined();
    const done=afterAuthoredChoice({...r,...result.patch},card,card.options[0],true);expect(done.effects.some(e=>e.effects.clear?.includes('forced_audit_interview'))).toBe(true);
  });
  it('counts failure to rectify once at final review, in the audit project only',()=>{
    const r=initialized();r.authored.activeFacts['飞检-未整改']={day:13,source:'E-167-c'};r.day=15;
    const done=settleAuthoredEvents(r,'结算',true),effect=done.effects.find(e=>e.id.endsWith('unrectified-audit'))!;expect(effect.effects.hazards?.[0].weight).toBe(5);expect(effect.scope).toEqual({kind:'project',id:`${r.id}:audit-project`});
    expect(settleAuthoredEvents({...r,...done.patch},'日终',true).effects.some(e=>e.id===effect.id)).toBe(false);
  });
  it('applies talent event weights by source ID and blocks peer assistance without banning unrelated choices',()=>{
    const r=initialized();r.talents=['T14','T21'];r.debuffs=['B13'];
    expect(authoredTalentWeight(r,EVENT_BY_ID['E-053'],1)).toBe(2);
    expect(authoredTalentWeight(r,EVENT_BY_ID['E-054'],1)).toBe(1.2);
    expect(authoredTalentWeight(r,EVENT_BY_ID['E-036'],1)).toBe(1.5);
    expect(authoredTalentWeight(r,EVENT_BY_ID['E-041'],1)).toBe(2);
    r.debuffs=['B16'];expect(authoredTalentWeight(r,EVENT_BY_ID['E-042'],1)).toBe(0);
    const card=eventToCard(EVENT_BY_ID['E-197'],{scope:{kind:'patient',id:r.patients[0].uid},patientId:r.patients[0].uid,instanceId:'acute',day:1,phase:'交班'});
    expect(prepareTalentEvent(r,card).options.map(o=>o.id.split(':').at(-1))).toEqual(['E-197-b','E-197-c']);
  });
  it('keeps food positive only until stomach illness and doubles actual representative pressure relief',()=>{
    const r=initialized();r.talents=['T19','T28'];r.debuffs=[];
    const food=eventToCard(EVENT_BY_ID['E-068'],{scope:{kind:'personal',id:r.id},instanceId:'food',day:3,phase:'日终'});
    expect(prepareTalentEvent(r,food).options.every(o=>(o.effects.emotion??0)>0&&!o.deferred.length)).toBe(true);
    r.debuffs=['B03'];expect(prepareTalentEvent(r,food).text).toBe(food.text);
    const fee=eventToCard(EVENT_BY_ID['E-134'],{scope:{kind:'project',id:'lecture'},projectId:'lecture',instanceId:'fee',day:8,phase:'结算'});
    const altered=prepareTalentEvent(r,fee);expect(altered.options.some(o=>o.id.endsWith('E-134-b'))).toBe(false);
    expect(altered.options[0].effects.cashPressure).toBe(-5);
    expect(visibleChoiceEffects(r,altered.options[0].effects,altered).cashPressure).toBe(-10);
    expect(altered.options[0].modifiers.some(m=>m.kind==='cash-pressure')).toBe(false);
    r.authored.pressure=20;r.queue=[altered];r.cursor=0;r.phase='play';r.shiftPhase='结算';
    const received=act(r,{type:'choose',id:altered.options[0].id});
    expect(received.authored!.pressure).toBe(10);
    expect(act(received,{type:'choose',id:altered.options[0].id})).toBe(received);
    expect(authoredTalentWeight(r,EVENT_BY_ID['E-137'],1)).toBe(2);
  });
  it('records T29 beauty and colleague knowledge only after submission, not at the invitation',()=>{
    const r=initialized();r.talents=['T29','T14'];r.day=11;
    const card=prepareTalentEvent(r,eventToCard(EVENT_BY_ID['E-188'],{scope:{kind:'project',id:'actual-project'},projectId:'actual-project',instanceId:'paper',day:11,phase:'结算'}));
    expect(card.options[0].effects.stamina??0).toBe(0);
    const submitted=afterAuthoredChoice(r,card,card.options[0],true);
    expect(submitted.patch.talentMemory?.beautifiedProjects).toContain('actual-project');
    expect(submitted.patch.talentMemory?.chiefKnowsProjects).not.toContain('actual-project');
    expect(submitted.patch.authored.activeFacts['科研-造假']).toBeDefined();
    const honest=afterAuthoredChoice(r,card,card.options[1],true);
    expect(honest.patch.talentMemory?.beautifiedProjects??[]).not.toContain('actual-project');
  });
  it('forces one acute card even after phase settlement, without assigning a nonexistent patient',()=>{
    const r=initialized();r.authored.scheduled=['1:交班','settled:1:交班:false'];r.vitals.san=0;
    const forced=forceZeroEvent(r,'san','交班');expect(forced.cards).toHaveLength(1);expect(forced.cards[0].patientId).toBe(r.queue[r.cursor]?.patientId);
    const again=forceZeroEvent({...r,...forced.patch},'san','交班');expect(again.cards[0].id).toBe(forced.cards[0].id);
    r.patients=[];r.queue=[];const absent=forceZeroEvent(r,'san','交班');expect(absent.cards[0].scope.kind).toBe('personal');expect(absent.cards[0].options.every(o=>!o.effects.hazards?.length)).toBe(true);
  });
  it('is deterministic, immutable and schedules each phase once',()=>{
    const r=fresh(),snapshot=JSON.stringify(r),a=buildAuthoredEvents(r,'交班');
    expect(buildAuthoredEvents(r,'交班')).toEqual(a);expect(JSON.stringify(r)).toBe(snapshot);
    expect(buildAuthoredEvents({...r,...a.patch},'交班').cards).toEqual([]);
    expect(new Set(a.cards.map(c=>c.id)).size).toBe(a.cards.length);
  });
  it('binds documented pregnancy and cancer to distinct people, not unrelated C patients',()=>{
    const r=initialized();r.day=6;
    const pregnancy=eligibleAuthoredEvents(r,'门诊').find(e=>e.event.id==='E-033')!;
    expect(pregnancy.extra?.category).toBe('孕产');expect(r.patients.some(p=>p.uid===pregnancy.binding.patientId)).toBe(false);
    const cancer=eligibleAuthoredEvents(r,'查房').find(e=>e.event.id==='E-003')!;
    expect(cancer.extra?.history).toContain('胃癌');expect(cancer.extra?.history).toContain('妻子');
  });
  it('uses actual plan and workload, and does not infer antibiotics from mere diagnosis',()=>{
    const r=initialized(),p=r.patients[0];p.clinical=undefined;
    expect(authoredQualifiers(r,'查房',p)).not.toContain('当前病人用药方案含抗菌药');
    r.overtime=1;expect(authoredQualifiers(r,'查房',p)).toContain('当日已加班');
    r.day=13;r.facts['health-open']={day:5,source:'symptoms',sequence:1};
    expect(eligibleAuthoredEvents(r,'交班').some(e=>e.event.id==='E-212')).toBe(false);
    expect(eligibleAuthoredEvents(r,'结算').some(e=>e.event.id==='E-212')).toBe(true);
    expect(documentedQualifierInventory().every(q=>q.provider.length>0)).toBe(true);
  });
  it('does not borrow another patient’s complaint, documentation risk or handoff',()=>{
    const r=initialized(),[p,other]=r.patients;
    const chain=startButterfly('BTF-003','record',{patientId:p.uid,recordId:`${p.uid}:record`,actorId:'li'});
    r.hazards.push({id:'other-risk',type:'C',weight:100,reason:'投诉',norm:'告知',causal:false,day:r.day,scope:{kind:'patient',id:other.uid},choiceId:'other',choice:'争执'});
    const w=authoredGraphWorld(r,r.authored,chain,'结算');
    expect(w.facts).not.toContain('same_patient_dispute');expect(w.facts).not.toContain('own_error_or_actual_query');
  });
  it('schedules actual extra-shift clinical patients and never grants favor for an empty queue',()=>{
    const r=initialized();r.authored.actor.liAwayDays=[];r.day=2;
    const chain=startButterfly('BTF-001','shift',{actorId:'li',shiftId:'shift:3'});
    const w=authoredGraphWorld(r,r.authored,chain,'交班');
    r.authored.chains=[commitButterflyChoice(chain,'BTF-001:N01a',w).state];
    r.authored.activeFacts['extra-night:3']={day:2,source:'cover'};r.day=3;r.queue=[];r.cursor=0;
    expect(settleAuthoredEvents(r,'日终').patch.authored.chains[0].facts.some(f=>f.type==='favor_available')).toBe(false);
    const night=buildAuthoredEvents(r,'夜班');
    expect(night.cards.filter(c=>c.clinicalGraph)).toHaveLength(2);expect(night.patch.nightMinutes).toBe(r.nightMinutes+200);
    expect(night.patch.patients!.filter(p=>p.uid.includes('night-extra'))).toHaveLength(2);
  });
  it('requires a separate actual verification action before learning a dataset is false',()=>{
    const r=initialized();r.authored.actor.zhouAwayDays=[];r.authored.actor.datasetHasProblem=true;
    const chain=startButterfly('BTF-004','paper',{actorId:'zhou',projectId:'project',datasetId:'dataset'},'N04');
    chain.facts.push({id:'actual-original',type:'original_file_retained',scope:chain.scope,subjects:chain.subjects,day:r.day,sourceChoiceId:'BTF-004:N01b',knownBy:['player']});
    chain.facts.push({id:'actual-shared-copy',type:'zhou_saw_original',scope:chain.scope,subjects:chain.subjects,day:r.day,sourceChoiceId:'BTF-004:N02a',knownBy:['player','zhou']});
    const w={...authoredGraphWorld(r,r.authored,chain,'交班'),facts:['materials_received','dataset_has_problem'],conditions:{'BTF-004:N04a':true},ap:10};
    r.authored.chains=[commitButterflyChoice(chain,'BTF-004:N04a',w).state];
    const settled=settleAuthoredEvents(r,'日终');expect(settled.patch.authored.chains[0].facts.some(f=>f.type==='problem_known')).toBe(false);
    const built=buildAuthoredEvents(r,'结算'),card=built.cards.find(c=>'butterflyCommitment'in c)as ButterflyCommitmentCard;
    expect(card).toBeDefined();r.authored=built.patch.authored;
    const done=afterAuthoredChoice(r,card,card.options[0],true);
    expect(done.patch.authored.chains[0].facts.some(f=>f.type==='problem_known')).toBe(true);
    expect(afterAuthoredChoice({...r,...done.patch},card,card.options[0],true).patch.authored.chains[0]).toEqual(done.patch.authored.chains[0]);
  });
  it('opens an actual supplement request after an unclear research defense without inventing fraud',()=>{
    const r=initialized();r.day=12;r.authored.actor.zhouAwayDays=[];
    const chain=startButterfly('BTF-004','defense-paper',{actorId:'zhou',projectId:'defense-project',datasetId:'actual-original'},'N06');
    r.authored.actor.datasetHasProblem=false;
    r.authored.chains=[commitButterflyChoice(chain,'BTF-004:N06a',{...authoredGraphWorld(r,r.authored,chain,'结算'),facts:['real_contribution'],conditions:{'BTF-004:N06a':true}}).state];
    const built=buildAuthoredEvents(r,'结算'),card=built.cards.find(c=>'butterfly'in c&&(c as ButterflyCard).butterfly.nodeId==='BTF-004:N07')!;
    expect(card).toBeDefined();const explain=card.options.find(o=>o.id.endsWith('N07a'))!,supplement=card.options.find(o=>o.id.endsWith('N07c'))!;
    expect(explain.check?.skill).toBe('endure');expect(supplement.check).toBeUndefined();
    const done=afterAuthoredChoice({...r,...built.patch},card,explain,false),state=done.patch.authored.chains[0];
    expect(state.cursor).toBe('BTF-004:N08');expect(state.facts.some(f=>f.type==='inquiry_delivered')).toBe(true);expect(state.facts.some(f=>f.type==='knowingly_false_submission')).toBe(false);
    expect(done.effects[0].text).toContain('补充材料要求');
  });
  it('keeps an offered unanswered graph node and charges extension effects only once',()=>{
    const r=initialized();r.authored.actor.liAwayDays=[];
    const chain=startButterfly('BTF-002','loan',{actorId:'li'});r.authored.chains=[chain];
    const card:ButterflyCard={id:'loan:N01',kind:'story',title:'借款',text:'',scope:chain.scope,options:[],butterfly:{chainStateId:chain.id,nodeId:chain.cursor,day:1,phase:'日终'}};
    r.authored.published[card.id]=card;
    expect(buildAuthoredEvents(r,'交班').patch.authored.chains[0].cursor).toBe('BTF-002:N01');
    const event=eventToCard(EVENT_BY_ID['E-064'],{scope:{kind:'personal',id:r.id},instanceId:'cash-event',day:r.day,phase:'日终'});
    const one=afterAuthoredChoice(r,event,event.options[0],true);
    const two=afterAuthoredChoice({...r,...one.patch},event,event.options[0],true);
    expect(two.patch.authored.ledger.pending).toEqual(one.patch.authored.ledger.pending);expect(two.effects).toEqual([]);
  });
  it('allows the documented arrest scene only after an actual matching payment/export history',()=>{
    const r=initialized();r.day=13;
    expect(eligibleAuthoredEvents(r,'结算').some(e=>e.event.id==='E-208')).toBe(false);
    r.authored.activeFacts['药代-4统方']={day:8,source:'actual-export'};
    for(let i=0;i<100;i++){
      r.seed=`arrest-${i}`;
      const matching=eligibleAuthoredEvents(r,'结算').find(e=>e.event.id==='E-208');
      if(!matching)continue;
      const card=eventToCard(matching.event,matching.binding,matching.context);
      expect(authoredRequestedEnding(r,card,card.options[0],true)).toBe('X06');return;
    }
    throw new Error('No seeded eligible arrest scene');
  });
});

describe('the pressure curve and the night beat',()=>{
  it('offers more random slots late in the rotation than at the start',()=>{
    const morning=RULES.events.randomSlots['交班'],settlement=RULES.events.randomSlots['结算'];
    expect(morning[13]).toBeGreaterThan(morning[0]);
    expect(settlement[13]).toBeGreaterThan(settlement[0]);
    for(const phase of ['交班','查房','门诊','结算','日终'] as const){
      const row=RULES.events.randomSlots[phase];
      expect(row,phase).toHaveLength(RULES.days);
      for(let i=1;i<row.length;i++)expect(row[i],`${phase} D${i+1}`).toBeGreaterThanOrEqual(row[i-1]);
    }
    for(let day=1;day<=RULES.days;day++)
      expect(RULES.events.randomSlots['夜班'][day-1]>0,`D${day}`).toBe(RULES.nightDays.includes(day as never));
  });
  it('builds no night card on a day without a night shift, and several on a night day',()=>{
    const off=initialized();off.day=5;off.nightBudget=0;
    expect(buildAuthoredEvents(off,'夜班').cards.filter(c=>(c as Partial<Card>).kind==='night')).toEqual([]);
    const duty=initialized();duty.day=6;duty.nightBudget=200;
    expect(eligibleAuthoredEvents(duty,'夜班').filter(x=>x.event.weight>0).length).toBeGreaterThanOrEqual(4);
  });
  it('keeps a due echo and a random event in the same phase instead of trading one for the other',()=>{
    const r=initialized();r.day=12;
    const before=buildAuthoredEvents({...r,authored:{...r.authored,scheduled:[]}},'结算').cards.length;
    expect(before).toBeGreaterThan(1);
  });
  it('lets the next representative rung follow an offer of grey income',()=>{
    const r=initialized();r.day=9;r.authored.drugStage=1;r.authored.drugNextDay=13;
    r.authored.activeFacts['药代-1餐叙']={day:6,source:'dinner'};
    expect(eligibleAuthoredEvents(r,'结算').some(x=>x.event.id==='E-134')).toBe(false);
    r.authored.activeFacts['gray-income-offered']={day:9,source:'funding-break'};
    expect(eligibleAuthoredEvents(r,'结算').some(x=>x.event.id==='E-134')).toBe(true);
  });
});
