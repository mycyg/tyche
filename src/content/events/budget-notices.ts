import type {Card,Run}from '../../game/types';
import {chargedBudgetTotal}from '../../game/budget-account';
/** Morning and late-settlement notices describe the same actual deductions. */
export function budgetNoticeCopy<T extends Card>(r:Run,card:T):T{
 const id=(card as Card&{authoredEventId?:string}).authoredEventId;
 const amount=chargedBudgetTotal(r).toLocaleString('zh-CN');
 if(id==='E-159')return{...card,text:`科室群里发来本轮病组超支表。你的个人累计扣款为 ${amount} 元，退款另列。表格下面通知你补交诊疗依据。`};
 if(id==='E-160')return{...card,title:'主任的两条建议',text:`唐济把超支表推到你面前：“你这轮个人已经扣了 ${amount} 元。再这样下去，工资还够扣吗？”他提出换便宜药，也提出放宽入院标准。`};
 return card;
}
