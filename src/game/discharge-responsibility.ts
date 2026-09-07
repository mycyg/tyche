import type {Card,Option,Patient,Run}from './types';
/** A ward disposition date is not proof that the player made the decision. */
export function playerEarlyDischargeSource(r:Run,p:Patient):string|undefined{
 const fact=r.facts[`early-discharge:${p.uid}`];if(!fact)return;
 const entry=r.journal.find(e=>e.id===fact.source&&e.scope.kind==='patient'&&e.scope.id===p.uid&&e.day===fact.day&&e.flags.includes(`early-discharge:${p.uid}`));
 if(!entry)return;
 if(entry.id.endsWith(':discharge')&&r.committed.includes(entry.id))return entry.id;
 if(entry.id.endsWith(':early-departure')&&r.authored?.ledger.outcomes?.some(o=>o.eventId==='E-048'&&o.success&&entry.id===`option:${o.choiceId}:early-departure`))return entry.id;
}
export function isUnsupportedReadmission(r:Run,card:Card):boolean{
 if(!card.patientId||card.id!==`return:${card.patientId}`||card.kind!=='audit')return false;
 const p=r.patients.find(p=>p.uid===card.patientId);return !!p&&!playerEarlyDischargeSource(r,p)&&!card.options.some(o=>r.committed.includes(o.id));
}
/** An allegation, billing entry or recorded conversation is not a treatment act. */
export function playerClinicalSource(r:Run,p:Patient):string|undefined{
 const discharge=playerEarlyDischargeSource(r,p);if(discharge)return discharge;
 const operations=['history','observe','exam','full-exam','treatment','consult','consent','refusal-signature'];
 return r.journal.find(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&!e.id.startsWith(`return:${p.uid}`)&&
   (e.clinicalChoice!==undefined||operations.includes(e.operation??'')||r.hazards.some(h=>h.scope.kind==='patient'&&h.scope.id===p.uid&&h.choiceId===e.id&&h.type==='R'))&&r.committed.includes(e.id))?.id;
}
export function isUnsupportedPatientClaim(r:Run,card:Card):boolean{
 if(isUnsupportedReadmission(r,card))return true;
 if(!card.patientId||card.id!==`${card.patientId}:source-compensation`||!('sourceFollowup'in card))return false;
 const p=r.patients.find(p=>p.uid===card.patientId);
 return !!p&&!playerClinicalSource(r,p)&&!card.options.some(o=>r.committed.includes(o.id)||r.authored?.ledger.commits.includes(o.id));
}
export function unsupportedPatientClaimOption(card:Card):Option{
 if(card.id===`return:${card.patientId}`)return unsupportedReadmissionOption(card);
 return{id:`${card.id}:return-to-responsible-team`,label:'请医务科核对诊疗经手人，转交实际主管组',ap:0,minutes:0,cost:0,effects:{},result:'医务科收到更正请求。现有材料没有找到由你实施相关诊疗的记录，先由实际主管组说明经过；这次没有确认个人赔偿或付款。'};
}
export function unsupportedReadmissionOption(card:Card):Option{return{id:`${card.id}:return-to-responsible-team`,label:'请医务科核对出院经手人，转交实际主管组',ap:0,minutes:0,cost:0,effects:{},result:'医务科收到更正请求。这份通知没有找到你作出出院决定的依据，后续交由实际主管组说明；你没有承认自己作过这项决定。'};}
