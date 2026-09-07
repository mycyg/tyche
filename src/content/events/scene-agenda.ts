import type {Card,Run}from '../../game/types';
import type {EventPhase}from './types';
import {RULES}from '../../game/rules';
import {mergeClaimsScene}from './merge-scenes';

export interface SceneAgendaItem {cardId:string;due:number;phase:EventPhase;}
export interface SceneAgendaState {
 published:Record<string,Card>;
 chains?:{id:string;entrySource?:string}[];
 sceneAgenda?:SceneAgendaItem[];
 echoDays?:{day:number;cardIds:string[]}[];
}
const scenePhases:EventPhase[]=['交班','查房','门诊','结算','夜班','日终'];
const phaseIndex=(phase:EventPhase)=>scenePhases.indexOf(phase);
const byFirstDue=(a:SceneAgendaItem,b:SceneAgendaItem)=>a.due-b.due||phaseIndex(a.phase)-phaseIndex(b.phase)||(a.cardId<b.cardId?-1:a.cardId>b.cardId?1:0);
/** 01 §7 pressure curve: how many random scenes one phase of one day offers. */
export const randomSceneSlots=(day:number,phase:EventPhase)=>RULES.events.randomSlots[phase][Math.max(0,Math.min(13,day-1))];
export const obligatoryScene=(card:Card|undefined,published:Record<string,Card>={},chains:SceneAgendaState['chains']=[]):boolean=>{
 if(!card)return false;
 const followup=(card as Card&{sourceFollowup?:{kind:string;stage?:number}}).sourceFollowup;
 const merge=(card as Card&{butterflyMerge?:{claimedSceneIds?:string[];claimedCommitmentIds?:string[]}}).butterflyMerge;
 const graph=(card as Card&{butterfly?:{chainStateId:string;nodeId:string}}).butterfly;
 const assignedTeaching=graph?.nodeId==='BTF-004:N01'&&chains.some(c=>c.id===graph.chainStateId&&c.entrySource==='department-teaching');
 return followup?.kind==='dispute'||'butterflyCommitment'in card||'butterflyRoleDuty'in card
  ||assignedTeaching
  ||!!merge?.claimedCommitmentIds?.length
  ||!!merge?.claimedSceneIds?.some(id=>'butterflyCommitment'in(published[id]??{}));
};
/** Pending scenes keep their first due date and published identity. A crowded
 * stage cannot mark an unseen response as completed, or forget it overnight. */
export function scheduleEchoScenes(r:Pick<Run,'day'|'committed'>,state:SceneAgendaState,phase:EventPhase,candidates:Card[]):Card[]{
 const agenda=state.sceneAgenda??=[],days=state.echoDays??=[];
 const alreadyOffered=new Set(days.flatMap(d=>d.cardIds));
 for(const card of candidates){
  state.published[card.id]=card;
  if(!agenda.some(a=>a.cardId===card.id)&&!alreadyOffered.has(card.id)&&!card.options.some(o=>r.committed.includes(o.id)))agenda.push({cardId:card.id,due:r.day,phase});
 }
 // A merge replaces its two standalone appointments, including appointments
 // that were queued on a previous day but have not been offered yet.
 const merged=candidates.filter(c=>'butterflyMerge'in c);
 const pending=agenda.filter(a=>{
  const card=state.published[a.cardId];if(!card||card.options.some(o=>r.committed.includes(o.id)))return false;
  return !merged.some(merge=>mergeClaimsScene(merge,card));
 });
 const today=days.find(d=>d.day===r.day)??{day:r.day,cardIds:[]};
 if(!days.includes(today))days.push(today);
 const cap=RULES.events.echoDailyCaps[Math.max(0,Math.min(13,r.day-1))];
 const counted=today.cardIds.filter(id=>!obligatoryScene(state.published[id],state.published,state.chains));
 let remaining=Math.max(0,cap-counted.length);
 const phaseSlots=new Map(scenePhases.map(p=>[p,Math.max(0,randomSceneSlots(r.day,p)-counted.filter(id=>state.published[id]?.shiftPhase===p).length)]));
 // A real answer opts into this instance's continuing story. Keep the next
 // node playable before unrelated echoes accumulate across the whole run.
 // This changes ordering, not the daily/phase quota or any narrative facts.
 const graphOf=(card:Card|undefined)=>(card as (Card&{butterfly?:{chainStateId:string}})|undefined)?.butterfly?.chainStateId;
 const answeredChains=new Set(Object.values(state.published).filter(card=>card.options.some(o=>r.committed.includes(o.id))).flatMap(card=>graphOf(card)?[graphOf(card)!]:[]));
 const continuing=(item:SceneAgendaItem)=>{
  const card=state.published[item.cardId],merge=(card as Card&{butterflyMerge?:{chainStateIds:string[]}})?.butterflyMerge;
  return answeredChains.has(graphOf(card)??'')||!!merge?.chainStateIds.some(id=>answeredChains.has(id));
 };
 // Reserve later stages in the same priority class by their original due
 // date. Reservation is not an offer, a completion or a charge.
 // A stage already passed today waits until tomorrow; no time travel.
 const ordered=pending.filter(a=>a.due<=r.day&&phaseIndex(a.phase)>=phaseIndex(phase)).sort((a,b)=>Number(continuing(b))-Number(continuing(a))||byFirstDue(a,b));
 const reserved=new Set<string>();
 for(const item of ordered){
  if(obligatoryScene(state.published[item.cardId],state.published,state.chains))continue;
  const slots=phaseSlots.get(item.phase)??0;
  if(remaining===0||slots===0)continue;
  reserved.add(item.cardId);phaseSlots.set(item.phase,slots-1);remaining--;
 }
 const due=ordered.filter(a=>a.phase===phase);
 const selected:Card[]=[];
 for(const item of due){
  const card=state.published[item.cardId];
  if(!obligatoryScene(card,state.published,state.chains)&&!reserved.has(card.id))continue;
  const offered={...card,shiftPhase:phase};
  state.published[card.id]=offered;
  selected.push(offered);today.cardIds.push(card.id);
 }
 const offered=new Set(selected.map(c=>c.id));
 state.sceneAgenda=pending.filter(a=>!offered.has(a.cardId));state.echoDays=days;
 return selected;
}
export function pendingSceneNotes(state:SceneAgendaState):string[]{
 return(state.sceneAgenda??[]).flatMap(item=>{const card=state.published[item.cardId];return card?[`「${card.title}」还没处理，你尚未答复，也没交材料或同意新的安排。`]:[];});
}
