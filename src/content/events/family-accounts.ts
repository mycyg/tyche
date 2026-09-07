import type {Card, Run} from '../../game/types';
import type {AuthoredDirectorState} from '../../game/director';
import type {ButterflyState} from './butterfly';
import {EVENT_BY_ID}from './catalog';

/** A delivered request is not a doctor's debt. The original family card owns
 * the choice and debit; this ledger only records that transaction's receipt. */
export interface FamilyInvoice {
  id:string; sourceEventId:string; title:string; day:number;
  dueDay?:number;
  requested:number;
  status:'decision-pending'|'delegated'|'declined'|'payment-pending'|'paid';
  choiceId?:string;
  adjustment?:{choiceId:string;from:number;to:number;day:number};
  payment?:{choiceId:string;amount:number;day:number;paidDay?:number};
}
const invoiceEvents=new Set(['E-099','E-100','E-102','E-103','E-105','E-106','E-111','E-112','E-124','E-126']);
export function registerFamilyInvoice(s:AuthoredDirectorState,card:Card,eventId:string,day:number):FamilyInvoice|undefined {
  if(!invoiceEvents.has(eventId))return;
  const requested=Math.max(0,...card.options.map(o=>-(o.effects.cash??0)));
  if(!requested)return;
  const invoices=s.familyInvoices??=[];
  let invoice=invoices.find(i=>i.id===card.id);
  if(!invoice){invoice={id:card.id,sourceEventId:eventId,title:card.title,day,requested,status:'decision-pending'};invoices.push(invoice);}
  return invoice;
}
export function familyInvoiceFor(s:AuthoredDirectorState,chain:ButterflyState):FamilyInvoice|undefined {
  if(chain.subjects.familyBillId)return s.familyInvoices?.find(i=>i.id===chain.subjects.familyBillId);
  return s.familyInvoices?.find(i=>i.status==='decision-pending');
}
export function recordFamilyInvoiceChoice(s:AuthoredDirectorState,card:Card,choiceId:string,cashChange:number,day:number):void {
  const invoice=s.familyInvoices?.find(i=>i.id===card.id);
  if(!invoice||invoice.choiceId)return;
  invoice.choiceId=choiceId;
  const amount=choiceId.endsWith('E-112-c')?Math.max(0,-(EVENT_BY_ID['E-111'].options[0].effects.cash??0)):Math.max(0,-cashChange);
  if(amount){invoice.payment={choiceId,amount,day};invoice.status='payment-pending';}
  else invoice.status=choiceId.endsWith('E-105-b')?'declined':'delegated';
}
/** The family can reduce an unaccepted wedding contribution, not ICU costs or
 * a payment already sent. The transfer still happens on the original card. */
export function reduceFamilyContribution(s:AuthoredDirectorState,chain:ButterflyState,choiceId:string,day:number):boolean {
  const invoice=familyInvoiceFor(s,chain),card=invoice&&s.published[invoice.id];
  if(!invoice||!card||invoice.sourceEventId!=='E-105'||invoice.status!=='decision-pending'||invoice.adjustment)return false;
  const smaller=card.options.find(o=>o.id.endsWith('E-105-c'));
  const amount=Math.max(0,-(smaller?.effects.cash??0));
  if(!amount||amount>=invoice.requested)return false;
  invoice.adjustment={choiceId,from:invoice.requested,to:amount,day};invoice.requested=amount;
  return true;
}
export function refreshFamilyInvoiceCard(r:Run,card:Card):Card {
  const invoice=r.authored?.familyInvoices?.find(i=>i.id===card.id),adjustment=invoice?.adjustment;
  if(!adjustment||invoice?.status!=='decision-pending')return card;
  const amount=adjustment.to.toLocaleString('zh-CN');
  return{...card,text:`家里删减了可以推迟的婚事开支，同意这次先由你出 ${amount} 元。母亲等你确认何时转款；如果暂时拿不出，仍要告诉家里。`,options:card.options.map(o=>
    o.id.endsWith('E-105-a')?{...o,label:`自愿多承担一些，仍转 ${(-(o.effects.cash??0)).toLocaleString('zh-CN')} 元`}
    :o.id.endsWith('E-105-c')?{...o,label:`按新约定转 ${amount} 元`,effects:{...o.effects,relations:{...o.effects.relations,family:0}},result:`你按新约定转出了 ${amount} 元。母亲确认收到，说会照商量好的办法安排。`}:o)};
}
/** Called after all choice debits and, if necessary, actual funding. A negative
 * balance cannot produce a success receipt. Never debit a second time here. */
export function finalizeFamilyPayments(r:Run):void {
  if(r.cash<0||!r.authored)return;
  for(const invoice of r.authored.familyInvoices??[]){
    if(invoice.status!=='payment-pending'||!invoice.payment)continue;
    invoice.status='paid';invoice.payment.paidDay=r.day;
    for(const chain of r.authored.chains){
      if(chain.subjects.familyBillId!==invoice.id||chain.facts.some(f=>f.type==='bill_paid'&&f.subjects.familyBillId===invoice.id))continue;
      chain.facts.push({id:`${chain.id}:${invoice.payment.choiceId}:bill_paid`,type:'bill_paid',scope:chain.scope,
        subjects:{...chain.subjects},sourceChoiceId:invoice.payment.choiceId,day:r.day,amount:invoice.payment.amount,knownBy:['player','mother']});
    }
  }
}
export function familyInvoiceNotes(s:AuthoredDirectorState):string[]{
  return(s.familyInvoices??[]).map(i=>i.status==='paid'&&i.payment
    ?`「${i.title}」：你已支付 ${i.payment.amount.toLocaleString('zh-CN')} 元，回执日期为第 ${i.payment.paidDay} 天。家人承担的部分另计。`
    :i.status==='payment-pending'&&i.payment?`「${i.title}」：${i.payment.amount.toLocaleString('zh-CN')} 元还没凑齐，这次付款没有成功。`
    :i.status==='decision-pending'?`「${i.title}」：家里的来信还没答复，尚未决定自己承担多少费用。`
    :i.status==='declined'?`「${i.title}」：你没有答应这次出资，也没有转款。`
    :`「${i.title}」：你选了不直接转款的办法，这次没有自己付款。`);
}
