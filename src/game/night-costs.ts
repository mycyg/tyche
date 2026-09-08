import type {Card,Option,Run}from './types';
import {RULES}from './rules';
import {NEW_NIGHT_CLINICAL_EVENT_IDS}from '../content/events/night-incidents';
import {eventTuning}from '../content/events/modifiers';

/** An admission or a new ward emergency is charged once. A phone call about
 * money, a hallucination, a consent gate and the doctor's collapse are not new
 * patient emergencies. A continuing case keeps the same encounter key. */
export function nightClinicalCharge(r:Run,card:Card|undefined,o:Option) {
  const none={stamina:0,san:0,key:undefined as string|undefined};
  if(!card||card.kind!=='night'||!card.patientId||o.talentAction||o.interaction==='hallucination'||o.interaction==='graph-continue'||'patientGate'in card)return none;
  if('butterfly'in card||'butterflyMerge'in card||'butterflyCommitment'in card||'butterflyPermission'in card||'sourceFollowup'in card||'trolley'in card)return none;
  const authored=(card as Card&{authoredEventId?:string}).authoredEventId;
  if(authored&&!NEW_NIGHT_CLINICAL_EVENT_IDS.some(id=>id===authored))return none;
  const key=authored?`night-baseline:${r.day}:${card.id}`:`night-baseline:${r.day}:${card.patientId}`;
  if(r.facts[key])return none;
  // Old saves already paid their original first-contact costs. Never charge
  // them again just because this version uses a more specific marker.
  if(!authored&&r.facts[`night-started:${card.patientId}`]?.day===r.day)return none;
  const acuteTotal=r.authored?eventTuning(r.authored.ledger,r.day,card.scope,Object.keys(r.facts)).nightSanPenalty:0;
  return {key,stamina:RULES.nightIncident.stamina,san:Math.max(RULES.nightIncident.san,acuteTotal)+
    (r.vitals.san<RULES.perception.fractured?RULES.perception.nightExtraSan:0)+
    (r.debuffs.includes('B06')?RULES.nightIncident.hallucinationSan:0)};
}
