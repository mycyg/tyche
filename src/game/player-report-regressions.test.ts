import {describe,it,expect} from 'vitest';
import {startRun,act} from './engine';
import {createPatient} from './cards';
import {buildAuthoredEvents,eligibleAuthoredEvents} from './director';
import {EVENT_BY_ID,eventToCard,eventEligible,contextualOptions,authoredChoiceEffects} from '../content/events/catalog';
import {initialGraphState,getAvailableGraphOptions,advanceClinicalGraph,getClinicalGraph} from '../content/clinical';
import {clinicalNodeText} from '../content/clinical/player-copy';
import {beginClinical,clinicalCard} from './clinical';
import {presetRiskPending} from './discharge-readiness';
import {PRESET_BY_ID,ENTITY_BY_ID,instantiatePreset,compatibleEntities} from '../content/patients';
import {createEventLedger,settleEventLedger} from '../content/events/ledger';
import {makeTrolleyCard,TROLLEY_DEFINITIONS} from '../content/events/trolley';
import {nightClinicalCharge} from './night-costs';
import {choiceResourceCopy,visibleChoiceEffects} from '../ui/copy';
import {worldTargets} from '../world/WorldStage';
import {encode,decode,emptySave,storageRunIssues} from './storage';
import {uniqueEndingNotes} from '../content/events/ending-adapter';
import {patientIdentityMatches} from '../content/events/patient-requirements';

describe('player report decision and presentation boundaries',()=>{
 it.each([0,2])('the committed departure choice %i actually vacates this bed and survives reload',index=>{
  let r=startRun('signed-self-discharge','程医生',[]);r.day=4;r={...r,...buildAuthoredEvents(r,'日终').patch};
  const p=r.patients.find(p=>p.inpatient)!,uid=p.uid;
  const card=eventToCard(EVENT_BY_ID['E-023'],{instanceId:`${r.id}:event:E-023:4`,scope:{kind:'patient',id:uid},patientId:uid,patientName:p.name,bed:p.bed,day:4,phase:'查房'});
  r.authored!.published[card.id]=card;r.queue=[card,beginClinical(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='查房';
  r=act(r,{type:'choose',id:card.options[index].id});const departed=r.patients.find(p=>p.uid===uid)!;
  expect(departed).toMatchObject({active:false,inpatient:false,bed:0,dischargedDay:4});
  expect(r.facts[`${index===0?'self-departure':'early-discharge'}:${uid}`]).toBeDefined();expect(r.hazards.some(h=>h.scope.id===uid)).toBe(true);expect(r.queue.slice(r.cursor).some(c=>c.patientId===uid&&c.clinicalGraph)).toBe(false);
  expect(storageRunIssues(r)).toEqual([]);expect(decode(encode({...emptySave(),run:r})).run!.patients.find(p=>p.uid===uid)!.active).toBe(false);
  r.day=10;expect(eligibleAuthoredEvents(r,'查房').filter(e=>e.event.id==='E-046').some(e=>e.binding.patientId===uid)).toBe(false);
 });
 it('failed persuasion discharges; successful persuasion keeps daily care running',()=>{
  const o=EVENT_BY_ID['E-023'].options[1];expect(authoredChoiceEffects(o,false).discharge).toBe(true);expect(authoredChoiceEffects(o,true).discharge).not.toBe(true);
 });
 it('the safe oral route offers allergy records without rescue paperwork',()=>{
  const g=getClinicalGraph('C011')!;let s=initialGraphState(g,'oral');
  s=advanceClinicalGraph(g,s,'s1_record',true).state;s=advanceClinicalGraph(g,s,'continue',true).state;
  s=advanceClinicalGraph(g,s,'s2_azith',true).state;
  expect(s.nodeId).toBe('s6');expect(s.entered).not.toContain('s4');
  expect(clinicalNodeText(g.nodes.find(n=>n.id==='s6')!,s)).toContain('未发生抢救');
  const ids=getAvailableGraphOptions(g,s).map(o=>o.id);expect(ids).toContain('s6_label');expect(ids).not.toContain('s6_record');expect(ids).not.toContain('s6_skip');expect(ids).not.toContain('s6_adr');
  s=advanceClinicalGraph(g,s,'s6_label',true).state;s=advanceClinicalGraph(g,s,'continue',true).state;expect(s.outcomeId).toBe('o_good');
 });
 it('an old pending rescue-record die returns to oral-treatment records without charging or inventing rescue',()=>{
  let r=startRun('old-oral-record','程医生',[]);const p=createPatient(r,'C011','old-oral'),g=getClinicalGraph('C011')!;
  p.clinical=initialGraphState(g,'oral');p.clinical.nodeId='s6';p.clinical.entered=['s1','s2','s4','s6'];p.clinical.flags=['oral_given'];
  r.patients=[p];r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';delete r.shiftPhase;
  const option=r.queue[0].options.find(o=>o.clinicalChoice==='s6_record')!;
  r=act(r,{type:'choose',id:option.id});expect(r.phase).toBe('roll');
  r.patients[0].clinical!.entered=['s1','s2','s6'];const ap=r.ap,cash=r.cash,stamina=r.vitals.stamina;
  r=act(r,{type:'ack-roll'});expect(r.feedback?.text).toContain('该项未执行、未计费');expect(r.ap).toBe(ap);expect(r.cash).toBe(cash);expect(r.vitals.stamina).toBe(stamina);
  expect(r.patients[0].clinical!.choices).not.toContain('s6_record');expect(r.queue[r.cursor].options.some(o=>o.clinicalChoice==='s6_record')).toBe(false);expect(storageRunIssues(r)).toEqual([]);
 });
 it('a first PCI refusal remains at consent, without pre-operative progress or implied consent',()=>{
  const g=getClinicalGraph('C003')!,s=initialGraphState(g,'refusal');s.nodeId='s4';s.variants=['onsite'];s.flags=['stemi_known'];s.entered=['s1','s2','s3','s4'];
  expect(getAvailableGraphOptions(g,s).some(o=>o.id==='s4_pci')).toBe(false);
  const failed=advanceClinicalGraph(g,s,'s4_inform',false).state;expect(failed.nodeId).toBe('s4');expect(failed.flags).not.toContain('consented');expect(getAvailableGraphOptions(g,failed).some(o=>o.id==='s4_pci')).toBe(false);
  expect(advanceClinicalGraph(g,failed,'s4_inform',false).state.outcomeId).toBe('o_refuse');
  const accepted=advanceClinicalGraph(g,s,'s4_inform',true).state;expect(getAvailableGraphOptions(g,accepted).some(o=>o.id==='s4_pci')).toBe(true);
 });
 it('privacy stays in force in repeated history, examination and imaging scenes',()=>{
  const g=getClinicalGraph('C005')!,s=initialGraphState(g,'private');s.flags=['mother_out'];
  for(const id of ['s1','s2','s3']){const text=clinicalNodeText(g.nodes.find(n=>n.id===id)!,s);expect(text).not.toMatch(/母亲站在旁边|母亲想替|母亲在旁边/);}
 });
 it('a completed communication repair closes those gaps, without inventing missing treatment',()=>{
  const r=startRun('repair-evidence','程医生',[]),p=createPatient(r,'C-001','repair'),prefix=`preset:${p.caseId}:${p.uid}`;p.presetNode=`${prefix}:echo`;
  const before=presetRiskPending(p,{[`${prefix}:communication-incomplete`]:{day:1,source:'talk',sequence:0}});expect(before.some(s=>s.includes('已进行告知'))).toBe(true);
  const after=presetRiskPending(p,{[`${prefix}:repaired`]:{day:1,source:'repair',sequence:0}});expect(after.some(s=>s.includes('告知')||s.includes('说明风险')||s.includes('写进交接'))).toBe(false);expect(after.some(s=>s.includes('尚未按本次病情安排处置'))).toBe(true);
  const repair=PRESET_BY_ID.get(p.caseId)!.scenes.flatMap(n=>n.options).find(o=>o.id.endsWith(':echo:repair'))!;expect(repair.effects.flags).toContain(`preset:${p.caseId}:informed`);expect(repair.effects.flags).not.toContain(`preset:${p.caseId}:treated`);
 });
 it('a single protagonist gets no partner-only event or partner payment choice',()=>{
  const ctx={day:8,phase:'结算' as const,facts:{},san:60,emotion:60,stamina:60,depression:0,cash:3000,pressure:30};
  for(const id of ['E-115','E-116','E-127','E-244']){const e=EVENT_BY_ID[id];expect(eventEligible(e,{...ctx,phase:e.phases[0]})).toBe(false);}
  for(const id of ['E-097','E-108','E-111'])expect(contextualOptions(EVENT_BY_ID[id],ctx).some(o=>o.id.endsWith('-c'))).toBe(false);
  const e=EVENT_BY_ID['E-115'];expect(eventEligible(e,{...ctx,phase:e.phases[0],facts:{'伴侣-在册':true}})).toBe(true);
  expect(eventToCard(e,{instanceId:'partner-call',scope:{kind:'personal',id:'partner'},day:8,phase:e.phases[0]}).actor).toBe('partner');
 });
 it('the hospital system notice goes to the nursing station even for an old bed-bound snapshot',()=>{
  const r=startRun('system-notice','程医生',[]),p=r.patients[0];p.damage=3;r.phase='play';delete r.shiftPhase;
  const card=eventToCard(EVENT_BY_ID['E-058'],{instanceId:'system-outage',scope:{kind:'personal',id:r.id},day:1,phase:'门诊'});
  expect(card.patientId).toBeUndefined();expect(card.actor).toBe('nurse');r.queue=[{...card,patientId:p.uid}];r.cursor=0;
  expect(worldTargets(r).find(t=>t.id==='nurse')?.cards?.map(c=>c.id)).toContain(card.id);
 });
 it('a bleeding case is not a fresh back-pain injection encounter',()=>{
  const r=startRun('injection-fit','程医生',[]),p=createPatient(r,'C003','bleeding');expect(patientIdentityMatches('E-038',r,p)).toBe(false);
 });
 it('the wine salesman keeps his background without bringing unrelated abdominal symptoms',()=>{
  const entity=ENTITY_BY_ID.get('P-086')!,preset=[...PRESET_BY_ID.values()].find(p=>!/(腹胀|肚子胀)/.test(p.presentation)&&compatibleEntities(p).some(e=>e.id===entity.id))!;
  const patient=instantiatePreset(preset,entity,'salesman');expect(patient.steps[0].text).toContain('我们做酒的');expect(patient.steps[0].text).not.toContain('就是这两天肚子胀');
 });
 it('the reduced envelope reward explicitly identifies the original and actual amount',()=>{
  const r=startRun('reward-explanation','程医生',['T16']),card=eventToCard(EVENT_BY_ID['E-017'],{instanceId:'envelope',scope:{kind:'patient',id:'p'},patientId:'p',day:5,phase:'查房'}),o=card.options[0];
  expect(visibleChoiceEffects(r,o.effects,card).cash).toBe(500);expect(choiceResourceCopy(r,o,card).map(row=>row.text).join(' ')).toContain('原金额 ¥1,000；天赋调整后实际到账 ¥500');
 });
 it('future ledger entries remain unperformed and do not grant future rewards at the ending',()=>{
  const ledger=createEventLedger();ledger.pending.push({id:'run:E-180-a:future',delay:1,due:7,phase:'结算',scope:{kind:'personal',id:'run'},effects:{cash:100},description:'你又写了一晚稿件，合上电脑时已经很疲惫。'});
  const closed=settleEventLedger(ledger,6,'结算',[],()=>0,true);expect(closed.effects).toEqual([]);expect(closed.epilogue.join()).toContain('尚未到期，未执行');expect(closed.epilogue.join()).not.toContain('你又写了一晚');
 });
 it('merges the same ending attachment when only the title separator differs',()=>{
  expect(uniqueEndingNotes(['没有继续的项目\n讲课没有你的部分。','没有继续的项目：讲课没有你的部分。','另一位患者：仍有待办。'])).toHaveLength(2);
 });
 it.each([0,120])('chart access with a %i-minute planned night never charges a new emergency admission',budget=>{
  const r=startRun('night-chart','程医生',[]),p=r.patients[0];r.shiftPhase='夜班';r.nightBudget=budget;r.nightMinutes=0;
  const card=makeTrolleyCard(TROLLEY_DEFINITIONS.find(d=>d.id==='TROLLEY-19')!,r,[p]);expect(card.kind).toBe(budget?'night':'story');expect(card.shiftPhase).toBe('夜班');expect(nightClinicalCharge(r,card,card.options[0]).key).toBeUndefined();
 });
});
