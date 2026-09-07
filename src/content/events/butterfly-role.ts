import type {Card,Run}from '../../game/types';
import type {ButterflyState}from './butterfly';
import {RULES}from '../../game/rules';
import {hasScopedButterflyReview}from './butterfly-review';

export interface ButterflyRoleDutyCard extends Card{butterflyRoleDuty:{chainStateId:string;day:number};}
/** A dated invitation from the appointing chief is a separate occurrence from
 * an investigation. It cannot be inferred from Q or from accepting a loan. */
export function offerLiaisonRole(r:Run,chain:ButterflyState):boolean{
 if(chain.chain!=='BTF-002'||chain.status==='closed'||r.day<RULES.butterfly.liaisonOfferDay||r.day>RULES.days||r.relations.chief<3)return false;
 const exchange=chain.facts.find(f=>f.type==='exchange_performed');
 if(!exchange||exchange.day>=r.day||chain.facts.some(f=>['liaison_offer_received','cooperation_ended','review_opened'].includes(f.type))||hasScopedButterflyReview(r,chain))return false;
 const source=`${chain.id}:liaison-notice:${r.day}`;
 for(const type of ['liaison_offer_received','liaison_position_vacant'])chain.facts.push({id:`${source}:${type}`,type,scope:chain.scope,subjects:{...chain.subjects},sourceChoiceId:source,day:r.day,knownBy:['player','tang','ye']});
 return true;
}
export function butterflyRoleDutyCard(r:Run,chain:ButterflyState):ButterflyRoleDutyCard|undefined{
 const appointment=chain.facts.find(f=>f.type==='liaison_appointed');
 if(!appointment||appointment.day>=r.day||r.day>RULES.days)return;
 const id=`${chain.id}:liaison-duty:${r.day}`;
 return{id,kind:'story',actor:'chief',shiftPhase:'结算',chain:chain.chain,scope:chain.scope,title:'联络表又到了',text:'办公室把今天要核对的联络事项发给你，问名单什么时候能交回来。你得留出时间处理这份新工作，此前的钱款和资料往来仍有记录可查。',butterflyRoleDuty:{chainStateId:chain.id,day:r.day},options:[
  {id:`${id}:work`,label:'按职责核对今天的联络事项',ap:RULES.butterfly.liaisonDailyAp,minutes:RULES.butterfly.liaisonDailyMinutes,cost:0,effects:{flags:[`${id}:completed`]},result:'你核对了今天的名单和需要回复的事项，把已完成的部分交回办公室。这次联络没有涉及患者资料，也没有额外报酬。'},
  {id:`${id}:miss`,label:'今天腾不出时间，说明这份工作未完成',ap:0,minutes:0,cost:0,effects:{emotion:-RULES.butterfly.liaisonMissEmotion,relations:{chief:-1},flags:[`${id}:missed`]},result:'你告诉办公室名单没做完。唐济问：“那你当时答应得倒挺快？”这次未交名单被记进了工作记录。'},
 ]};
}
