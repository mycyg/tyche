import type {Card,Run}from '../../game/types';
import {BUTTERFLY_NODES,butterflyChoiceCost,startButterfly}from './butterfly';

export interface FamilyFundingContactCard extends Card {familyFundingContact:{familyBillId:string};}
export function canContactForFamilyFunding(r:Run,billId:string):boolean{
 const s=r.authored,bill=s?.familyInvoices?.find(b=>b.id===billId);
 return !!bill&&bill.status==='decision-pending'&&r.cash<bill.requested&&s?.seen['E-146']===undefined
  &&!!(s?.activeFacts['药代-0搭话']||r.facts['药代-0搭话']||r.facts['rep-contact'])
  &&!s?.chains.some(c=>c.facts.some(f=>f.type==='financial_need_disclosed'));
}
export function familyFundingContactCard(r:Run,billId:string):FamilyFundingContactCard{
 const id=`${r.id}:family-funding-contact:${billId}`;
 const ask=BUTTERFLY_NODES.find(n=>n.id==='BTF-002:N02')!.options.find(o=>o.localId==='N02e')!;
 const cost=butterflyChoiceCost(startButterfly('BTF-002','contact-cost',{actorId:'ye'}),ask,{day:r.day,cash:r.cash,ap:r.ap,facts:[],actorAvailable:true});
 return{id,kind:'story',chain:'FAMILY-FUNDING-CONTACT',shiftPhase:'结算',scope:{kind:'personal',id:r.id},title:'先问问能否周转',
  text:'家里等着交钱，你的余额不够。你和叶茗有过联系，要不要问她能否周转？',familyFundingContact:{familyBillId:billId},options:[
   {id:`${id}:ask`,label:ask.label,ap:cost.ap,minutes:cost.minutes,cost:0,effects:cost.effects,result:'你告诉叶茗家里缺钱，问她能否周转。消息已发出，你还没有答应任何条件。'},
   {id:`${id}:decline`,label:'不联系，按原方案筹款',ap:0,minutes:0,cost:0,effects:{},result:'你没有找叶茗，回到账单继续安排。钱还没付，也没有新增借款。'},
  ]};
}
