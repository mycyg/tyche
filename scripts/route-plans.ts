import {availableEncounters,availableOptions,currentCard}from '../src/game/engine';
import type {Option,Run}from '../src/game/types';
import {isResearchCollaboration}from '../src/content/events/butterfly';

/** Priorities are choices, not state patches. An unavailable choice is never
 * executed. Plans do not assert that a promise or requested fact has occurred. */
const BASE_ROUTE_PLANS={
 research:['E-131-a','E-132-a','E-133-b','E-134-a','BTF-004:N01b','BTF-004:N02a','BTF-004:N04a','BTF-004:N03a','BTF-004:N05a','BTF-004:N06a','BTF-004:N07c','BTF-004:N08a'],
 falseResearch:['E-131-a','E-132-a','E-134-a','BTF-004:N01d','BTF-004:N02a','BTF-004:N04a','BTF-004:N03d','BTF-004:N05a','BTF-004:N06b','BTF-004:N07b','BTF-004:N08c'],
 recording:['BTF-003:N01a','BTF-003:N02a','BTF-003:N03a','BTF-003:N04a','BTF-003:N05a','BTF-003:N06a','BTF-003:N07a','BTF-003:N08a'],
 shift:['BTF-001:N01c','BTF-001:N02a','BTF-001:N03b','BTF-001:N04a','BTF-001:N05a','BTF-001:N06a','BTF-001:N07d','BTF-001:N08a'],
 falseShift:['BTF-001:N01a','BTF-001:N02b','BTF-001:N03d','BTF-001:N04d','BTF-001:N05a','BTF-001:N06c','BTF-001:N07b','BTF-001:N08d'],
 cash:['E-131-a','E-132-a','E-134-a','BTF-002:N01b','BTF-002:N02e','BTF-002:N03c','BTF-002:N04a','BTF-002:N05a','BTF-002:N06c','BTF-002:N07b','BTF-002:N08b'],
 representative:['E-131-a','E-132-a','E-133-b','E-134-a','E-136-a','E-137-a','E-138-a','E-146-a'],
 privateHelp:['BTF-002:N01d','BTF-002:N02d','BTF-002:N03a','BTF-002:N04c','BTF-002:N05b','BTF-002:N06a','BTF-002:N07d','BTF-002:N08a'],
}as const;
export const ROUTE_PLANS={
 ...BASE_ROUTE_PLANS,
 fundingResearch:[...BASE_ROUTE_PLANS.cash,...BASE_ROUTE_PLANS.research,'XJ02a'],
 familyWork:['BTF-001:N03a','BTF-001:N04b','BTF-004:N04b',...BASE_ROUTE_PLANS.privateHelp,...BASE_ROUTE_PLANS.shift,...BASE_ROUTE_PLANS.research,'XJ01d','XJ01b','XJ01c','XJ01a'],
 recordedHandoff:[...BASE_ROUTE_PLANS.falseShift,...BASE_ROUTE_PLANS.recording,'XJ03a','XJ03d','XJ03b'],
}as const;
export type RoutePlan=keyof typeof ROUTE_PLANS;
export function plannedChoice(r:Run,plan:RoutePlan):Option|undefined{
 const card=currentCard(r);if(!card)return;
 const options=availableOptions(r);
 if('familyFundingContact'in card&&['cash','privateHelp','fundingResearch','familyWork'].includes(plan))return options.find(o=>o.id.endsWith(':ask'));
 const preferred=ROUTE_PLANS[plan].map(id=>options.find(o=>o.id===id||o.id.endsWith(`:${id}`))).find(Boolean);
 if(preferred)return preferred;
 // Explore a real preparation route: build collegial cooperation, then leave
 // the agreed research delivery pending until the independent family peak.
 // Deferring pays the offered cost and does not change the deadline.
 if(plan==='familyWork'&&r.relations.peer<2&&card.kind==='story'){const help=options.find(o=>(o.effects.relations?.peer??0)>0);if(help)return help;}
 if(plan==='familyWork'&&'butterflyCommitment'in card&&(r.day<10||r.shiftPhase!=='结算')){
  const b=(card as typeof card&{butterflyCommitment:{chainStateId:string;commitmentId:string}}).butterflyCommitment;
  const c=r.authored?.chains.find(c=>c.id===b.chainStateId)?.commitments.find(c=>c.id===b.commitmentId);
  if(c&&isResearchCollaboration(c.type))return options.find(o=>o.id.endsWith(':defer'));
 }
 if('butterflyCommitment'in card)return options.find(o=>o.id.endsWith(':complete'));
 if('butterflyPermission'in card)return options.find(o=>!o.id.endsWith(':later')&&!o.id.endsWith(':defer'));
 return;
}
/** Preview only scenes the engine currently permits the player to focus.
 * This is a policy preference, never an unlocked gate or a fabricated fact. */
export function plannedEncounter(r:Run,plan:RoutePlan){
 return availableEncounters(r).find(card=>{
  const cursor=r.queue.findIndex(c=>c.id===card.id);
  return cursor>=0&&!!plannedChoice({...r,cursor},plan);
 });
}
