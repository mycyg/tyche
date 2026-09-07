import type {Card,Run}from '../../game/types';
import type {ButterflyState}from './butterfly';
import {RULES}from '../../game/rules';

export interface ButterflyFinanceCard extends Card {butterflyFinance:{chainStateId:string};}
/** Request, loan acceptance and invoice payment are separate transactions. */
export function butterflyFinanceCard(r:Run,chain:ButterflyState,id=`${chain.id}:credit-terms`):ButterflyFinanceCard {
 const amount=Math.max(0,Math.floor(Math.min(RULES.butterfly.bridgeLoan,RULES.debtMax-r.debt)));
 return{id,kind:'story',chain:chain.chain,scope:chain.scope,title:'信用借款确认',
  text:amount?`现有信用额度还可借出 ${amount.toLocaleString('zh-CN')} 元。借款到账后计入你的个人余额，每回合按信用债余额计息 ${RULES.debtRate*100}%。借到的钱可以用来缴付家里的账单，李恂欠你的钱仍需要他归还。`:'信用借贷额度已用满，不能继续借入。李恂尚未归还的本金和家里的待付账单都还在。',
  butterflyFinance:{chainStateId:chain.id},options:[
   ...(amount?[{id:`${id}:accept`,label:`确认借入 ${amount.toLocaleString('zh-CN')} 元`,ap:0,minutes:0,cost:0,effects:{cash:amount,debt:amount,cashPressure:RULES.creditPressure,flags:['credit-used',`butterfly-credit:${chain.id}`]},result:`${amount.toLocaleString('zh-CN')} 元到账，信用债增加同额本金。这笔钱之后需要归还，家里的账单还没缴付，李恂也还没还钱。`}]:[]),
   {id:`${id}:decline`,label:'不借款，继续安排现有资金',ap:0,minutes:0,cost:0,effects:{emotion:-2},result:'你退出了借款确认，没有新增信用债，也没有收款或缴费。'},
  ]};
}
