import {it,expect}from 'vitest';
import {startRun,availableEncounters,act}from './engine';
import type {Card}from './types';

it('keeps clinical sequencing and same-chain ordering while exposing independent preparations',()=>{
 const r=startRun('independent-encounters','程医生',[]);r.phase='play';r.shiftPhase='结算';
 const patientId=r.patients[0].uid;
 const card=(id:string,extra:Record<string,unknown>={}):Card=>({id,patientId,scope:{kind:'patient',id:patientId},kind:'story',shiftPhase:'结算',title:'待办',text:'',
  options:[{id:`${id}:answer`,label:'办理',ap:0,minutes:0,cost:0,effects:{},result:''}],...extra});
 r.queue=[card('exam-a',{kind:'clinical'}),card('exam-b',{kind:'clinical'}),
  card('statement-a',{butterfly:{chainStateId:'one'}}),card('statement-next',{butterfly:{chainStateId:'one'}}),
  card('record-a',{butterfly:{chainStateId:'two'}}),card('permission',{butterflyPermission:{chainStateId:'one'}}),
  card('delivery',{butterflyCommitment:{chainStateId:'one'}})];r.cursor=0;
 expect(availableEncounters(r).map(c=>c.id)).toEqual(['exam-a','statement-a','record-a','permission','delivery']);
 expect(act(r,{type:'focus',id:'exam-b'})).toBe(r);
 expect(act(r,{type:'focus',id:'statement-next'})).toBe(r);
 r.emergency={cardId:'exam-a',vital:'san',resolved:false,resume:{phase:'play'}};
 expect(availableEncounters(r).map(c=>c.id)).toEqual(['exam-a']);
 expect(act(r,{type:'focus',id:'record-a'})).toBe(r);
});
