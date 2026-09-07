import type { Run } from '../../game/types';
import { talentEventWeight, talentFoodPositive, talentRepresentative } from '../../game/talents';
import type { TalentContext, TalentEventContext } from '../../game/talents';
import type { AuthoredEvent, EventCard } from './types';
import {authoredCashPressure}from './pressure';
import {paperDefenseModifier,paperStepCredit}from './specialized-checks';

export const eventTalentContext=(r:Run):TalentContext=>({talents:r.talents,debuffs:r.debuffs,day:r.day,memory:r.talentMemory});
/** Source IDs are editorial classifications, not guesses based on translated titles. */
export const TALENT_EVENT_IDS={
  chiefResponsibility:['E-052','E-053','E-055'],
  peerNegative:['E-040','E-043','E-049','E-054','E-055','E-056','E-064','E-084','E-143','E-144','E-184','E-186'],
  chiefCallout:['E-041','E-049','E-051','E-062','E-063','E-145','E-192'],
  positive:['E-036','E-092','E-095','E-196','E-211'],
  food:['E-068'],
  peerCover:['E-042','E-043','E-072','E-144','E-210'],
  peerMeal:['E-132','E-151'],
} satisfies Record<keyof TalentEventContext,string[]>;
export function authoredTalentWeight(r:Run,event:AuthoredEvent,base:number):number {
  const c:TalentEventContext={};
  for(const [key,ids]of Object.entries(TALENT_EVENT_IDS))if(ids.includes(event.id))c[key as keyof TalentEventContext]=true;
  const weighted=talentEventWeight(eventTalentContext(r),base,c);
  return weighted*(r.talents.includes('T28')&&event.id==='E-137'?2:1);
}
const peerAssistance=['E-067-c','E-069-c','E-197-a'];
const handOver=['E-134-b','E-138-c'];
export const PAPER_SUBMISSION_CHOICES=['E-188-a','E-188-b','BTF-004:N06a','BTF-004:N06b'];
export const AUTOMATIC_BEAUTIFICATION_CHOICES=['E-188-a','BTF-004:N06b'];
const acceptedRepresentativeChoices=['E-132-a','E-132-c','E-134-a','E-136-a','E-137-a','E-137-c','E-138-a'];
const refusedRepresentativeChoices=['E-132-b','E-134-c','E-136-b','E-137-b','E-138-b'];
export function prepareTalentEvent(r:Run,original:EventCard):EventCard {
  const card=structuredClone(original),ctx=eventTalentContext(r),rep=talentRepresentative(ctx,0,0);
  card.options=card.options.filter(o=>!(r.debuffs.includes('B16')&&peerAssistance.some(id=>o.id.endsWith(id)))&&!(!rep.canHandOver&&handOver.some(id=>o.id.endsWith(id))));
  if(TALENT_EVENT_IDS.food.includes(card.authoredEventId)&&talentFoodPositive(ctx)){
    card.text='你赶到食堂时已经过了饭点。阿姨还留着热饭，手机上的外卖也显示可以送到值班室。今晚还能吃到热饭。';
    card.options.forEach((o,i)=>{
      o.label=['点一份热饭送到值班室','吃阿姨留的饭','打包带回宿舍'][i];
      o.result=['外卖送到值班室。你趁热吃完，收好饭盒，准备下班。','阿姨把饭菜热好。你在空下来的餐桌边坐了一会，吃完后向她道谢。','阿姨替你打好包。回到宿舍，你吃完了这顿饭。'][i];
      for(const key of ['stamina','san','emotion']as const)if((o.effects[key]??0)<0)delete o.effects[key];
      o.effects.emotion=3;o.modifiers=[];o.deferred=[];o.hint=i===0?'外卖 ¥45':'热饭已经备好';
    });
  }
  for(const o of card.options){
    if(card.authoredEventId==='E-190'&&o.check)o.check.dc=14-paperDefenseModifier(r,card.scope);
    const local=o.id.split(':').at(-1)!;
    if(PAPER_SUBMISSION_CHOICES.includes(local)&&o.ap>0){const credit=paperStepCredit(r,card.scope);o.ap=Math.max(0,o.ap-credit);o.minutes=Math.max(0,o.minutes-credit*12);}
    const pressure=authoredCashPressure(r);
    if(refusedRepresentativeChoices.includes(local)&&o.check)o.check.dc+=Math.floor(pressure/20);
    if(acceptedRepresentativeChoices.includes(local))for(const effects of [o.effects,o.failureTotal])if(effects&&(effects.san??0)<0)effects.san=effects.san!*(1-pressure/200);
    if(r.talents.includes('T29')&&PAPER_SUBMISSION_CHOICES.includes(local)){
      for(const e of [o.effects,o.failureTotal])if(e){if((e.stamina??0)<0)delete e.stamina;if((e.cash??0)<0)delete e.cash;}
      o.cost=0;o.hint='美化：投稿整理不消耗体力与现金。';
      if(AUTOMATIC_BEAUTIFICATION_CHOICES.includes(local)){
        o.label='按美化后的现稿提交';o.result='稿件已经提交。周乔看到你删改过的表格，知道现稿与原始结果并不一致。';
        o.effects.flags=[...(o.effects.flags??[]).filter(f=>f!=='科研-诚实'),'科研-造假','科研-收口'];
        o.effects.clear=[...(o.effects.clear??[]),'科研-诚实'];
        o.hint+=' 周乔会知道删改情况，期刊仍可能要求撤稿。';
      }
    }
    if(card.authoredEventId.startsWith('E-1')&&EVENT_REPRESENTATIVE_IDS.includes(card.authoredEventId)){
      for(const mods of [o.modifiers,o.failureModifiers??[]])for(const m of mods)if(m.kind==='cash-pressure'&&(m.value??0)<0)m.value=-talentRepresentative(ctx,-m.value!,0).pressureRelief;
    }
  }
  return card;
}
export const EVENT_REPRESENTATIVE_IDS=Array.from({length:22},(_,i)=>`E-${131+i}`);
