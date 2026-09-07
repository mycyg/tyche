import type {Run,Scope}from '../../game/types';
import type {ButterflyState}from './butterfly';

const same=(a:Scope,b:Scope)=>a.kind===b.kind&&a.id===b.id;
export function butterflyReviewScope(chain:ButterflyState):Scope{
 return chain.chain==='BTF-002'?{kind:'project',id:`${chain.id}:transaction-review`}:{...chain.scope};
}
/** A general audit flag is not an inquiry into every transaction or paper. */
export function hasScopedButterflyReview(r:Pick<Run,'authored'|'queue'|'cursor'>,chain:ButterflyState):boolean{
  const s=r.authored;if(!s)return false;
  const evidence=chain.facts.find(f=>f.type===(chain.chain==='BTF-002'?'exchange_performed':'submitted'));
  if(!evidence)return false;
  if(chain.facts.some(f=>f.type==='review_opened'||f.type==='inquiry_delivered'))return true;
  const eventId=chain.chain==='BTF-002'?'E-140':chain.chain==='BTF-004'?'E-191':undefined;
  if(!eventId)return false;
  const scope=butterflyReviewScope(chain);
  if(s.ledger.outcomes?.some(o=>o.eventId===eventId&&o.day>=evidence.day&&same(o.scope,scope)))return true;
  return r.queue.slice(r.cursor).some(c=>{
    const event=c as typeof c&{authoredEventId?:string;eventBinding?:{day:number}};
    return event.authoredEventId===eventId&&!!event.eventBinding&&event.eventBinding.day>=evidence.day&&same(event.scope,scope);
  });
}
