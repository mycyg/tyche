import type {Card,Run}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import {isDirectPatientCare}from '../../game/clinical-handoff';
import {isPlayerResponsibleForPatient}from './clinical-ownership';

/** Leaving the settlement conversation cannot silently abandon bedside care. */
export function canLeaveForFamily(r:Run):boolean{
  return !r.emergency&&!r.queue.slice(r.cursor).some(c=>isDirectPatientCare(c)&&
    r.patients.some(p=>p.uid===c.patientId&&p.active&&isPlayerResponsibleForPatient(r,p)));
}
function postponable(card:Card|undefined,s:AuthoredDirectorState):boolean{
  if(!card)return false;
  const node=(card as Card&{butterfly?:{chainStateId:string;nodeId:string}}).butterfly;
  if(node&&s.chains.find(c=>c.id===node.chainStateId)?.consumed.includes(node.nodeId))return false;
  const b=(card as Card&{butterflyCommitment?:{chainStateId:string;commitmentId:string}}).butterflyCommitment;
  if(b){
    const c=s.chains.find(c=>c.id===b.chainStateId)?.commitments.find(c=>c.id===b.commitmentId);
    return !!c&&c.status==='accepted'&&/verification|labor_exchange|clinical_explanation|contribution_division/.test(c.type);
  }
  return card.chain==='BTF-004'||(card as Card&{authoredEventId?:string}).authoredEventId==='E-188';
}
/** Delivery moves to a later day; the promised deadline does not. */
export function postponeFamilyDepartureWork(r:Run,s:AuthoredDirectorState,currentId:string,source:string):string[]{
  if(!canLeaveForFamily({...r,authored:s}))return[];
  for(const chain of s.chains)for(const c of chain.commitments){
    if(c.status==='accepted'&&/verification|labor_exchange|clinical_explanation|contribution_division/.test(c.type))c.resumeDay=r.day+1;
  }
  const later=r.queue.slice(r.cursor).filter(c=>c.id!==currentId&&postponable(c,s));
  for(const card of later){
    s.published[card.id]=card;
    const existing=s.sceneAgenda?.find(a=>a.cardId===card.id);
    if(existing){existing.due=Math.max(existing.due,r.day+1);existing.phase='结算';}
    else(s.sceneAgenda??=[]).push({cardId:card.id,due:r.day+1,phase:'结算'});
  }
  for(const pending of s.sceneAgenda??[])if(postponable(s.published[pending.cardId],s))pending.due=Math.max(pending.due,r.day+1);
  s.activeFacts[`family-departure:${r.day}`]={day:r.day,source};
  return later.map(c=>c.id);
}
