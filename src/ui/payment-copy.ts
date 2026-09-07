import {patientPayment} from '../game/costs';
import {episodeAdjustedBudget} from '../content/events/billing-episodes';
import type {Option,Patient,Run} from '../game/types';
const money=(n:number)=>`¥${n.toLocaleString('zh-CN')}`;

export function paymentCopy(r:Run,p:Patient,o:Option){
 const payment=patientPayment(r,p,o),current=episodeAdjustedBudget(r,p);
 const approval=!!o.check&&(o.effects.bill??0)<0&&!('authoredEventId'in (r.queue[r.cursor]??{}));
 const changed=payment.budget!==current;
 const allowance=`本次结算可用额度 ${money(current)}${changed?` → ${money(payment.budget)}${approval?'（预算申请通过后）':'（按本次记账计算）'}`:''}`;
 const cash=payment.personal>0?`本次新增自付 ${money(payment.personal)}，从你的个人余额扣除。`
   :payment.refund>0?`${approval?'申请通过后':'本次结算后'}把你多垫的 ${money(payment.refund)} 退回个人余额。`
   :payment.spent>payment.budget?'本次没有新增自付；原有超支已结算，不再重复扣款。'
   :'本次费用由可用额度覆盖，不扣个人余额。';
 return {payment,allowance,cash,approval};
}
