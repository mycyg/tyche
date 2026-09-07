import type {Run,Scope,Effects}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import type {ButterflyState}from './butterfly';
import {RULES}from '../../game/rules';
import {runRandom}from '../../game/run-random';

export const receivableDue=(c:ButterflyState)=>(c.receivableDueDay??((c.facts.find(f=>f.type==='loan_made')?.day??0)+RULES.butterfly.loanDays));
export const privateDebtDue=(c:ButterflyState)=>(c.privateDebtDueDay??((c.facts.find(f=>['conditional_offer_accepted','unconditional_loan_accepted'].includes(f.type))?.day??0)+RULES.butterfly.loanDays));

/** The bank transfer belongs to the debt, even after its story has closed.
 * A due-date draw never increases the debtor's independently available cash. */
export function settleButterflyAccounts(r:Run,s:AuthoredDirectorState):{id:string;scope:Scope;effects:Effects;text:string}[]{
  const result:{id:string;scope:Scope;effects:Effects;text:string}[]=[];
  for(const c of s.chains.filter(c=>c.chain==='BTF-002')){
    const due=receivableDue(c);
    if(c.receivable<=0||due>r.day||due>RULES.days||!c.facts.some(f=>f.type==='loan_made'))continue;
    const attempts=c.receivableAttempts??=[];
    if(attempts.some(a=>a.due===due))continue;
    const roll=1+Math.floor(runRandom(r,`${c.id}:repayment:${due}`)*20);
    const received=roll>RULES.butterfly.nonpaymentRoll?Math.max(0,Math.min(c.receivable,s.actor.liCash)):0;
    const id=`${c.id}:repayment:${due}`;
    attempts.push({due,day:r.day,roll,received});
    c.receivable-=received;c.paid+=received;s.actor.liCash-=received;
    const add=(type:string,amount?:number)=>c.facts.push({id:`${id}:${type}`,type,scope:c.scope,subjects:{...c.subjects},sourceChoiceId:id,day:r.day,knownBy:['player','li'],...(amount===undefined?{}:{amount})});
    if(received>0)add('repayment_received',received);
    if(c.receivable>0)add('repayment_missed',c.receivable);
    result.push({id,scope:c.scope,effects:{cash:received,receivable:-received},text:received>0
      ?`到了约好的第 ${due} 天，李恂还给你 ${received.toLocaleString('zh-CN')} 元。${c.receivable?`尚有 ${c.receivable.toLocaleString('zh-CN')} 元未归还。`:'这笔本金已结清。'}你和家人各自付了多少费用，仍按付款凭证分别记录。`
      :`第 ${due} 天的归还日期到了，李恂没有转来款项。${c.receivable.toLocaleString('zh-CN')} 元本金仍记在他名下，你的余额没有增加。`});
  }
  return result;
}
