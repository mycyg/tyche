import type {Option,Run}from '../game/types';
import type {DelayedEffect,EventOption}from '../content/events/types';
import {EVENT_BY_ID}from '../content/events/catalog';
import {RULES}from '../game/rules';

/** Only a cost explicitly promised by the chosen appointment. Delayed random
 * events, concealed conditions and future outcome prose are not player hints. */
const publicActionCost=(effect:DelayedEffect)=>effect.id.includes(':cost:')&&(effect.effects.ap??0)<0
  &&(effect.probability===undefined||effect.probability===1)&&!effect.requires?.length&&!effect.until?.length;
export function scheduledChoiceWork(r:Run,option:Option):string[] {
  if(option.id.endsWith('BTF-002:N08c'))return[`接任仍需签收办公室的任命通知。生效后，每天另用 ${RULES.butterfly.liaisonDailyAp} 点行动、${RULES.butterfly.liaisonDailyMinutes} 分钟处理联络事务，没有额外工资。`];
  if(!('deferred'in option))return [];
  return (option as EventOption).deferred.filter(publicActionCost).map(effect=>{
    const day=effect.day??r.day+effect.delay;
    return `后续安排：第 ${day} 天${effect.phase}另用 ${-effect.effects.ap!} 点行动，不在今天扣除。届时即使休假也需处理，行动不足仍会透支。`;
  });
}
export function pendingScheduledWork(r:Run,day:number) {
  const dated=(r.authored?.ledger.pending??[]).filter(effect=>effect.due===day&&publicActionCost(effect)).map(effect=>{
    const source=effect.id.match(/(E-\d{3}-[a-z]):cost:/)?.[1];
    const option=source?EVENT_BY_ID[source.slice(0,5)]?.options.find(option=>option.id===source):undefined;
    return {id:effect.id,phase:effect.phase,ap:-effect.effects.ap!,label:option?.label??'已约定的事务'};
  });
  const duties=(r.authored?.chains??[]).flatMap(chain=>{
    const appointment=chain.facts.find(f=>f.type==='liaison_appointed');
    if(!appointment||appointment.day>=day||day>RULES.days)return[];
    return[{id:`${chain.id}:liaison-duty:${day}`,phase:'结算' as const,ap:RULES.butterfly.liaisonDailyAp,label:'联络岗位 · 核对当日事项'}];
  });
  return [...dated,...duties];
}
