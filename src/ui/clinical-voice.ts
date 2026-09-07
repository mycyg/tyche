import {getClinicalGraph} from '../content/clinical';

// These four charts explicitly identify the adult providing the infant's history.
const guardians:Record<string,string>={C001:'mother',C007:'mother',C008:'father',C014:'mother'};
const namedFamily:Record<string,string>={母亲:'mother',妈妈:'mother',奶奶:'mother',外婆:'mother',父亲:'father',爸爸:'father',爷爷:'father',外公:'father',女儿:'family',妻子:'family',儿子:'patient-male',丈夫:'patient-male'};

/** An unattributed quoted reply follows the submitted clinical action. An exam
 * finding or a quoted diagnosis is narration, not a patient speaking it aloud. */
export function clinicalVoiceActor(caseId:string,sex:string,choiceId?:string):string {
 const patient=sex==='男'?'patient-male':'patient-female';
 if(!choiceId)return guardians[caseId]??patient;
 const option=getClinicalGraph(caseId)?.nodes.flatMap(n=>n.options).find(o=>o.id===choiceId);
 if(!option)return'narrator';
 const operation=option.mechanics?.operation;
 if(['comfort','consent','norm-quote','refusal-signature'].includes(operation??''))return'hero';
 if(operation==='history'){
  if(option.mechanics?.actor!=='family')return guardians[caseId]??patient;
  const person=Object.keys(namedFamily).find(name=>option.label.includes(name));
  return person?namedFamily[person]:guardians[caseId]??'family';
 }
 return'narrator';
}
