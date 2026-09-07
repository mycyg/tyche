import type {Run}from '../../game/types';
import type {ButterflyState}from './butterfly';

const reportFacts:Record<string,string>={
 'BTF-001:N03b':'correction_submitted',
 'BTF-001:N04a':'witness_delivered',
 'BTF-001:N04b':'own_statement_submitted',
 'BTF-001:N04d':'shared_false_witness',
};

export function recordDepartmentStatementReceipt(chain:ButterflyState,choiceId:string,day:number):void{
 if(chain.chain!=='BTF-001'||!chain.subjects.patientId||!chain.facts.some(f=>f.sourceChoiceId===choiceId&&f.type===reportFacts[choiceId]))return;
 const id=`${chain.id}:${choiceId}:department-receipt`;if(chain.facts.some(f=>f.id===id))return;
 chain.facts.push({id,type:'department_statement_received',scope:{...chain.scope},subjects:{...chain.subjects,recipientIds:['player','tang']},sourceChoiceId:choiceId,day,knownBy:['player','tang'],observations:[{actorId:'tang',day,source:choiceId,channel:'delivered-record'}]});
}

/** A received statement supplies the next department reply. Looking at a chart
 * or retaining an unsubmitted draft is not a report to the department. */
export function departmentStatementSource(r:Pick<Run,'day'|'journal'|'committed'>,chain:ButterflyState){
 if(chain.chain!=='BTF-001'||chain.status==='closed'||!chain.subjects.patientId)return;
 return chain.facts.find(f=>f.type===reportFacts[f.sourceChoiceId]&&f.day<=r.day
  &&f.scope.kind==='patient'&&f.scope.id===chain.subjects.patientId&&f.subjects.patientId===chain.subjects.patientId
  &&r.committed.includes(`${chain.id}:${f.sourceChoiceId}`)
  &&r.journal.some(j=>j.id===`${chain.id}:${f.sourceChoiceId}`&&j.day===f.day&&j.scope.kind==='patient'&&j.scope.id===chain.subjects.patientId));
}
