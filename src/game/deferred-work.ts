import type {Card,DeferredPatientWork,Option,Run}from './types';
import {RULES}from './rules';
import {isPlayerResponsibleForPatient}from '../content/events/clinical-ownership';
import {PRESET_BY_ID}from '../content/patients';
import {getClinicalGraph}from '../content/clinical';
import {isFullDayLeave}from './duty-state';
import {runRandom}from './run-random';

function isDaytimeCare(card:Card) {
  return ['clinical','quick','ward'].includes(card.kind)&&card.shiftPhase!=='夜班'&&
    !('authoredEventId'in card)&&!('sourceFollowup'in card)&&!('butterfly'in card)&&!('trolley'in card);
}
export function deferrablePatientCards(r:Run,patientId:string):Card[] {
  const p=r.patients.find(p=>p.uid===patientId);
  if(!p||!p.active||p.damage>=3||p.caseId==='C020'||!isPlayerResponsibleForPatient(r,p))return [];
  return r.queue.slice(r.cursor).filter(c=>c.patientId===patientId&&isDaytimeCare(c));
}
export function deferredPatientOption(r:Run,card:Card):Option|undefined {
  if(r.ap>0||r.emergency||isFullDayLeave(r)||!card.patientId||!isDaytimeCare(card)||!deferrablePatientCards(r,card.patientId).length)return;
  const id=`defer:${r.day}:${card.patientId}`;
  if(r.committed.includes(id)||r.deferredWork?.some(w=>w.patientId===card.patientId))return;
  return {id,interaction:'defer',label:'今天先不处理，留给明天',ap:0,minutes:0,cost:0,effects:{},
    result:'今天的处置没有完成，未处理事项留在交班记录中。',hint:'不消耗行动或体力。该患者的诊疗和记录各留下一项缺口；病情可能在等待中恶化。'};
}
/** Captured cards retain their unfinished node; no choice is marked complete. */
export function captureDeferredWork(r:Run,patientId:string,source:string,reason:DeferredPatientWork['reason']):DeferredPatientWork|undefined {
  if(r.deferredWork?.some(w=>w.patientId===patientId))return;
  const cards=deferrablePatientCards(r,patientId);if(!cards.length)return;
  const work:DeferredPatientWork={patientId,source,reason,created:r.day,due:r.day+1,cards:structuredClone(cards)};
  (r.deferredWork??=[]).push(work);
  const ids=new Set(cards.map(c=>c.id));r.queue=r.queue.filter((c,i)=>i<r.cursor||!ids.has(c.id));
  return work;
}
export function deferredWorkEffects(patientId:string,day:number) {
  return {flags:[`deferred-patient:${day}:${patientId}`],hazards:[
    {type:'R' as const,weight:RULES.deferredPatient.R,reason:'当班未完成患者所需的诊疗，留待次日处理',norm:'对待处理病情及时评估、处置并完成交接',causal:false},
    {type:'D' as const,weight:RULES.deferredPatient.D,reason:'当班应完成的病程处置记录留到次日',norm:'病程记录应及时反映实际诊疗经过，补记保留原时间',causal:false},
  ]};
}
/** Resolve the additional waiting risk, not the underlying clinical graph. */
export function resolveDeferredWork(r:Run):Card[] {
  const due=(r.deferredWork??[]).filter(w=>w.due<=r.day),cards:Card[]=[];
  for(const work of due) {
    const p=r.patients.find(p=>p.uid===work.patientId);if(!p)continue;
    const scope={kind:'patient' as const,id:p.uid},source=`${work.source}:waiting-result`;
    const hidden=PRESET_BY_ID.get(p.caseId)?.hasHidden??!!getClinicalGraph(p.caseId);
    const stillWaiting=p.active&&p.damage<3;
    const harmed=stillWaiting&&p.damage<2&&hidden&&runRandom(r,source)<RULES.deferredPatient.hiddenSeedChance;
    if(harmed) {
      p.damage=2;
      for(const h of r.hazards.filter(h=>h.scope.id===p.uid&&h.choiceId===work.source&&h.type==='R'))h.causal=true;
      if(p.clinical)p.clinical.causalChoices=[...new Set([...p.clinical.causalChoices,work.source])];
    }
    const handedOff=isFullDayLeave(r)||r.day>RULES.days;
    const text=harmed?'夜间回报：患者在等待处置时病情恶化，发生严重临床损害。接诊延误及后续救治经过已留档。':stillWaiting?'夜间没有回报新的严重临床损害。昨天未完成的诊疗和记录仍需接着处理。':'患者已不在原来的诊疗环节，昨天未完成的事项仍保留在交接记录中。';
    const closing=!stillWaiting?'这次不再安排原来的床旁处置，后续按患者实际去向核对。':handedOff?'你今天不在临床岗，未完成事项已经列入当班医生的交接单。':'患者仍在等待，你需要从尚未完成的步骤继续。';
    r.journal.push({id:source,day:r.day,title:`${p.name}的延期处置`,choice:'核对上一班留下的待办',result:`${text}${closing}`,scope,flags:[]});
    r.facts[`deferred-resolved:${work.source}`]={day:r.day,source,sequence:r.journal.length-1};
    if(!handedOff&&p.active&&p.damage<3)cards.push(...work.cards.map((c,i)=>({...c,text:i===0?`${p.name}昨天的处置没有完成。${text}\n${c.text}`:c.text})));
  }
  r.deferredWork=(r.deferredWork??[]).filter(w=>w.due>r.day);
  return cards;
}
