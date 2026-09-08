import {describe,it,expect}from 'vitest';
import {startRun,act}from '../../game/engine';
import {afterAuthoredChoice,buildAuthoredEvents}from '../../game/director';
import {TROLLEY_DEFINITIONS,trolleyBindings,makeTrolleyCard,trolleyEchoCard,emptyTrolleyLedger,TROLLEY_DRUG_QUOTE}from './trolley';
import type {TrolleyWorld}from './trolley';
import {CASE_PRESETS,instantiatePreset,compatibleEntities}from '../patients';
import {optionCosts}from '../../game/costs';
function fixture(){
 const r=startRun('trolley-fixture','程医生',['T06','T11','T16']);r.day=6;r.authored=buildAuthoredEvents(r,'交班').patch.authored;r.authored.trolley=emptyTrolleyLedger();r.authored.published={};r.authored.scheduled=[];
 return r;
}
describe('20 source trolley dilemmas',()=>{
 it('keeps a refused night shift refused in both later replies',()=>{
   const r=fixture(),first=makeTrolleyCard(TROLLEY_DEFINITIONS[19],r,[]),chosen=afterAuthoredChoice(r,first,first.options[1],true),token=chosen.patch.authored.trolley!.tokens[0];
   const echo=trolleyEchoCard(r,token);expect(echo.text).toContain('没有约定由你接班');expect(echo.text).not.toContain('是否已经交接');expect(echo.options[0].label).toContain('没有安排自己');
   expect(trolleyEchoCard(r,{...token,stage:3,response:'review'}).text).toContain('没有承担这次夜班');
   expect(chosen.patch.authored.activeFacts['extra-night-agreed']).toBeUndefined();
 });
 it('charges night paperwork in minutes without double-charging an explicit duration',()=>{
   const r=fixture();r.shiftPhase='夜班';r.nightBudget=120;r.debuffs=[];r.talents=[];
   const chart=makeTrolleyCard(TROLLEY_DEFINITIONS[18],r,r.patients.slice(0,1));expect(chart.kind).toBe('night');expect(chart.options[2].minutes).toBe(12);expect(optionCosts(r,chart.options[2],chart).minutes).toBe(12);
   const triage=makeTrolleyCard(TROLLEY_DEFINITIONS[1],r,r.patients.slice(0,2));expect(triage.options[2].minutes).toBe(20);
 });
 for(const d of TROLLEY_DEFINITIONS)it(`${d.id}: binds a legal world, offers every source branch and preserves a two-step same-object reply`,()=>{
  const r=fixture(),[p,other]=r.patients;p.active=other.active=true;p.inpatient=other.inpatient=true;p.damage=other.damage=0;p.admitted=1;p.spent=p.budget+900;p.charged=0;
  const preset=instantiatePreset(CASE_PRESETS[0],compatibleEntities(CASE_PRESETS[0])[0],p.uid);preset.age=72;preset.complaint='肺炎并高钾，晚期肺癌';preset.history=['已使用抗菌药','患者本人清醒'];p.preset=preset;
  const w:TrolleyWorld={day:6,phase:d.phases[0],patients:[p,other],facts:[],peerAvailable:true};r.shiftPhase=w.phase;if(w.phase==='门诊')p.inpatient=other.inpatient=false;
  for(const required of d.requires){
   if(['verified-colleague-false-data','family-icu','recent-family-icu','representative-contact','audit-open'].includes(required))w.facts.push(required);
   if(required==='same-patient-recording')w.facts.push(`recording:${p.uid}`);
   if(required==='three-day-debt-patient')w.facts.push(`three-day-debt:${p.uid}`);
   if(required==='two-night-patients')w.nightArrivalIds=[p.uid,other.uid];
   if(required==='pregnant-patient'){const obstetric=CASE_PRESETS.find(p=>p.id==='C-164')!;p.caseId=obstetric.id;p.preset=instantiatePreset(obstetric,compatibleEntities(obstetric)[0],p.uid);}
   if(required==='young-trauma-and-elder'){w.nightArrivalIds=[p.uid,other.uid];p.preset.age=28;p.preset.history=['车祸外伤'];other.preset=structuredClone(p.preset);other.preset.age=76;other.preset.history=['重症肺炎'];}
  }
  const bound=trolleyBindings(d,w,r);expect(bound).not.toBeNull();const card=makeTrolleyCard(d,r,bound!);expect(card.options).toHaveLength(3);expect(d.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  for(const option of card.options){
   const committed=afterAuthoredChoice(r,card,option,true),token=committed.patch.authored.trolley!.tokens[0];
   expect(token.patientIds).toEqual(card.trolley.patientIds);expect(token.object).toBe(d.object);expect(token.due-r.day).toBeGreaterThanOrEqual(1);expect(token.due-r.day).toBeLessThanOrEqual(2);
   const next={...r,...committed.patch,day:token.due},echo=trolleyEchoCard(next,token),response=afterAuthoredChoice(next,echo,echo.options[0],true),finalToken=response.patch.authored.trolley!.tokens[0];
   expect(finalToken.stage).toBe(3);expect(finalToken.patientIds).toEqual(token.patientIds);
   const lastRun={...next,...response.patch,day:finalToken.due},last=trolleyEchoCard(lastRun,finalToken),closed=afterAuthoredChoice(lastRun,last,last.options[0],true);
   expect(closed.patch.authored.trolley!.tokens[0].resolved).toBe(true);expect(afterAuthoredChoice({...lastRun,...closed.patch},last,last.options[0],true).effects).toEqual([]);
  }
 });
 it('does not call postpartum bleeding or an undiscovered pregnancy a high-risk-pregnancy request',()=>{
  const r=fixture(),p=r.patients[0],world:TrolleyWorld={day:6,phase:'门诊',patients:[p],facts:[],peerAvailable:false};p.inpatient=false;
  for(const id of ['C-166','C-170','C-022','C-175']){const preset=CASE_PRESETS.find(x=>x.id===id)!;p.caseId=id;p.preset=instantiatePreset(preset,compatibleEntities(preset)[0],p.uid);expect(trolleyBindings(TROLLEY_DEFINITIONS[3],world,r)).toBeNull();}
  const highRisk=CASE_PRESETS.find(x=>x.id==='C-171')!;p.caseId=highRisk.id;p.preset=instantiatePreset(highRisk,compatibleEntities(highRisk)[0],p.uid);expect(trolleyBindings(TROLLEY_DEFINITIONS[3],world,r)).toEqual([p]);
 });
 it('does not borrow unrelated recording, fabricate a second emergency or charge a paid budget gap',()=>{
  const r=fixture(),p=r.patients[0],w:TrolleyWorld={day:6,phase:'查房',patients:[p],facts:['recording:someone-else'],peerAvailable:false};
  expect(trolleyBindings(TROLLEY_DEFINITIONS[10],w,r)).toBeNull();
  expect(trolleyBindings(TROLLEY_DEFINITIONS[0],{...w,phase:'夜班'},r)).toBeNull();
  p.spent=p.budget-TROLLEY_DRUG_QUOTE;p.charged=0;expect(trolleyBindings(TROLLEY_DEFINITIONS[4],w,r)).toBeNull();
 });
 it('can quote a new medicine after old bills are fully settled and charges only its new excess',()=>{
  const r=fixture(),p=r.patients[0];p.active=true;p.inpatient=true;p.spent=p.budget+900;p.charged=900;
  const world:TrolleyWorld={day:r.day,phase:'查房',patients:[p],facts:[],peerAvailable:false},bound=trolleyBindings(TROLLEY_DEFINITIONS[4],world,r)!;expect(bound).not.toBeNull();
  const card=makeTrolleyCard(TROLLEY_DEFINITIONS[4],r,bound);expect(card.options[0].effects.cash).toBeUndefined();expect(card.options[0].cost).toBe(TROLLEY_DRUG_QUOTE);
  r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';const cash=r.cash,next=act(r,{type:'choose',id:card.options[0].id});
  expect(cash-next.cash).toBe(TROLLEY_DRUG_QUOTE);expect(next.patients.find(x=>x.uid===p.uid)!.charged).toBe(900+TROLLEY_DRUG_QUOTE);
 });
 it('charges the waiting second emergency only to that actual patient',()=>{
  const r=fixture(),bound=r.patients.slice(0,2),card=makeTrolleyCard(TROLLEY_DEFINITIONS[0],r,bound),done=afterAuthoredChoice(r,card,card.options[0],true);
  expect(done.effects).toEqual(expect.arrayContaining([expect.objectContaining({scope:{kind:'patient',id:bound[1].uid},effects:{hazards:[expect.objectContaining({type:'R',weight:25})]}})]));
 });
 it('can occupy the real director random slot alongside all authored E events',()=>{
  let found=false;for(let i=0;i<100&&!found;i++){const r=fixture();r.seed=`trolley-real-${i}`;r.day=7;r.authored!.scheduled=[];r.authored!.dispute={patientId:r.patients[0].uid,stage:4,first:true,second:true};const built=buildAuthoredEvents(r,'查房');found=built.cards.some(c=>'trolley'in c);}
  expect(found).toBe(true);
 });
});
