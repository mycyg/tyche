import type {Card,Patient,Run} from './types';
import type {EventCard,EventPhase} from '../content/events/types';
import {EVENT_BY_ID,eventToCard} from '../content/events/catalog';
import {PRESET_END} from '../content/patients';
import {createPatient} from './cards';
import {pickPreset,presetCard} from './presets';
import {RULES} from './rules';
import type {AuthoredDirectorState,DirectorResult} from './director';

export interface PeerReferral {
  id:string;
  due:number;
  mode:'full'|'brief';
  patientIds:string[];
}

/** An unanswered saved offer uses the current contract; completed history
 * and a die already presented to the player are left untouched. */
export function refreshPeerReferralOffer(r:Run,card:Card):Card {
  if(!('authoredEventId'in card)||card.authoredEventId!=='E-144'||!('eventBinding'in card))return card;
  if(card.options.some(o=>r.committed.includes(o.id))||r.pendingCheck?.kind==='choice'&&r.pendingCheck.cardId===card.id)return card;
  const binding={...(card as EventCard).eventBinding};delete binding.patients;
  return {...eventToCard(EVENT_BY_ID['E-144'],binding),shiftPhase:card.shiftPhase};
}

/** A promise creates no patient encounter, bill, examination or evidence. */
export function schedulePeerReferral(s:AuthoredDirectorState,choiceId:string,day:number) {
  if(!/E-144-[ac]$/.test(choiceId)||s.peerReferrals?.some(item=>item.id===choiceId))return;
  (s.peerReferrals??=[]).push({id:choiceId,due:day+1,mode:choiceId.endsWith('-a')?'full':'brief',patientIds:[]});
}

export function peerReferralEntry(p:Patient,mode:PeerReferral['mode']) {
  const next=p.preset!.steps[0].id,id=`preset:${p.caseId}:${p.uid}:peer-referral`;
  const start={id:`${id}:start`,label:mode==='full'?'接诊，先问这次哪里不舒服':'改主意了，重新问诊',ap:0,minutes:0,cost:0,next,effects:{},
    result:'旧病历留作参考，这次的情况从问诊开始核对。'};
  p.preset!.steps.unshift({id,title:'停诊后转来的患者',
    text:'同事停诊后转来的加号患者到了，旧病历夹在挂号单里。这次的症状和用药还没核对。',
    options:mode==='full'?[start]:[
      {id:`${id}:brief`,label:'照旧病历交代，不做本次评估',ap:0,minutes:RULES.peerReferrals.briefMinutes,cost:0,next:PRESET_END,
        mechanics:{operation:'other',quality:'incorrect'},
        effects:{hazards:[{type:'D',weight:RULES.peerReferrals.briefDocumentationRisk,reason:'接手停诊同事的患者，沿用旧病历而未记录本次评估',norm:'每次接诊应核实当前病情并记录本次诊疗经过',causal:false}]},
        result:'你照旧病历交代了几句，结束接诊。本次病情没有核实，病历中也没有本次评估记录。'},start],
  });
}

/** Normal care remains a playable preset, not a resource-only approximation. */
export function deliverPeerReferrals(r:Run,s:AuthoredDirectorState,result:DirectorResult,phase:EventPhase) {
  if(phase!=='门诊'||r.day>RULES.days)return;
  const work=structuredClone({...r,patients:result.patch.patients??r.patients});
  for(const referral of s.peerReferrals??[]) {
    if(referral.due>r.day)continue;
    while(referral.patientIds.length<RULES.peerReferrals.patients) {
      const index=referral.patientIds.length,key=`peer-referral:${referral.id}:${index}`;
      const preset=pickPreset(work,'门诊',key);if(!preset)break;
      const p=createPatient(work,preset.id,`quick-peer-referral-${referral.due}-${index}`);
      // This is an outpatient transfer of appointment, not an inpatient bed.
      p.inpatient=false;p.bed=0;p.spent=p.preset!.baseCost;delete work.facts[`awaiting-bed:${p.uid}`];
      peerReferralEntry(p,referral.mode);work.patients.push(p);
      const card=presetCard(work,p,undefined,'quick')!;card.shiftPhase='门诊';
      result.cards.push(card);referral.patientIds.push(p.uid);
      if(referral.mode==='full')result.effects.push({id:`${key}:allowance`,scope:{kind:'patient',id:p.uid},
        effects:{apAllowance:RULES.peerReferrals.fullAp/RULES.peerReferrals.patients},
        text:'为这次加号增加一点行动，接诊仍按实际处置扣除。'});
    }
  }
  if(work.patients.length!==(result.patch.patients??r.patients).length) {
    result.patch.patients=work.patients;result.patch.facts=work.facts;
  }
}

export function pendingPeerReferralNotes(r:Run,day?:number):string[] {
  return (r.authored?.peerReferrals??[]).filter(referral=>referral.patientIds.length<RULES.peerReferrals.patients&&(day===undefined||referral.due<=day)).map(referral=>
    `同事转来的加号患者还剩 ${RULES.peerReferrals.patients-referral.patientIds.length} 人，约在第 ${referral.due} 天门诊。休假时顺延，接诊按处置消耗行动。`);
}
