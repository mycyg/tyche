import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions}from './engine';
import {authoredGraphWorld,buildAuthoredEvents,type ButterflyCard}from './director';
import {startButterfly,commitButterflyChoice}from '../content/events/butterfly';
import {storageRunIssues,emptySave,encode,decode}from './storage';
import type {Run}from './types';
import {departmentStatementSource}from '../content/events/statement-requests';

// Execution boundary: an actual submitted N04 statement is the source. Earlier
// patient and observation setup is a fixture, not a full campaign witness.
function submitted(choice='BTF-001:N04d'){
 const r=startRun(`statement:${choice}`,'程医生',[]);r.day=6;r.ap=40;r.phase='play';r.shiftPhase='结算';r.relations.peer=4;
 const p=r.patients[0],s=r.authored!;s.actor.liAwayDays=[];s.actor.liFalseStatementWilling=true;
 let chain=startButterfly('BTF-001','written-statement',{actorId:'li',patientId:p.uid},'N03');
 chain=commitButterflyChoice(chain,'BTF-001:N03d',{day:5,cash:10000,ap:10,actorAvailable:true,facts:['false_exam_discovered'],conditions:{'BTF-001:N03d':true}}).state;
 chain.facts.push({...chain.facts[0],id:'actual-exam-observation',type:'false_exam_discovered'});
 s.chains=[chain];
 const built=buildAuthoredEvents(r,'结算'),card=built.cards.find(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-001:N04')!;
 let next:Run={...r,...built.patch,queue:[card],cursor:0};
 expect(availableOptions(next).some(o=>o.id.endsWith(choice))).toBe(true);
 next=act(next,{type:'choose',id:availableOptions(next).find(o=>o.id.endsWith(choice))!.id});
 expect(next.journal.at(-1)?.title).toBe('只写自己那一段');
 return next;
}
describe('department response follows actual submitted statements',()=>{
 it('keeps the source through storage and repeated submission',()=>{
  const r=submitted(),id=r.journal.at(-1)!.id;
  expect(act(r,{type:'choose',id})).toBe(r);
  const restored=decode(encode({...emptySave(),run:r})).run!;
  expect(departmentStatementSource(restored,restored.authored!.chains[0])?.sourceChoiceId).toBe('BTF-001:N04d');
  expect(restored.authored!.chains[0].facts.filter(f=>f.type==='department_statement_received')).toHaveLength(1);
 });
 it.each(['other-patient','unsubmitted','future','closed'])('rejects a %s report as this scene source',variant=>{
  const r=submitted(),chain=r.authored!.chains[0];
  if(variant==='other-patient')chain.subjects.patientId='another-patient';
  if(variant==='unsubmitted')r.committed=[];
  if(variant==='future')r.day=4;
  if(variant==='closed')chain.status='closed';
  expect(departmentStatementSource(r,chain)).toBeUndefined();
 });
 it('recognizes a legacy submitted statement from its matching fact and real journal entry',()=>{
  const r=submitted(),chain=r.authored!.chains[0];chain.facts=chain.facts.filter(f=>f.type!=='department_statement_received');
  expect(departmentStatementSource(r,chain)?.sourceChoiceId).toBe('BTF-001:N04d');
 });
 it.each(['BTF-001:N04a','BTF-001:N04b','BTF-001:N04d'])('%s can receive the department response without a magic word in its title',choice=>{
  const r=submitted(choice),s=r.authored!,chain=s.chains[0];r.day=7;r.phase='play';r.shiftPhase='交班';
  expect(chain.facts.find(f=>f.type==='department_statement_received')).toMatchObject({knownBy:['player','tang'],sourceChoiceId:choice});
  expect(chain.facts.find(f=>f.type==='false_exam_entry')?.knownBy).not.toContain('tang');
  expect(authoredGraphWorld(r,s,chain,'交班').facts).toContain('statement_request_delivered');
  const built=buildAuthoredEvents(r,'交班');
  expect(built.cards.some(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-001:N06')).toBe(true);
  expect(storageRunIssues({...r,...built.patch,queue:[...r.queue,...built.cards]})).toEqual([]);
 });
 it('does not treat retained but unsubmitted material as a report delivered to the chief',()=>{
  const r=submitted('BTF-001:N04c');r.day=7;
  expect(authoredGraphWorld(r,r.authored!,r.authored!.chains[0],'交班').facts).not.toContain('statement_request_delivered');
 });
 it('does not infer this report from a high audit value or an unrelated review title',()=>{
  const r=submitted('BTF-001:N04c'),chain=r.authored!.chains[0];r.day=7;
  r.journal.push({id:'unrelated-review',day:6,title:'复核',choice:'查看病历',result:'已读。',scope:{...chain.scope},flags:[]});
  r.hazards.push({id:'other-document-error',type:'D',weight:10,day:6,scope:{...chain.scope},choiceId:'unrelated-review',choice:'查看病历',reason:'另一份记录的缺项',norm:'记录要求',causal:false});
  expect(authoredGraphWorld(r,r.authored!,chain,'交班').facts).not.toContain('statement_request_delivered');
 });
});
