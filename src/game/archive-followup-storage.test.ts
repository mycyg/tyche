import {describe,it,expect} from 'vitest';
import {startRun} from './engine';
import {emptySave,encode,decode} from './storage';

function fixture(){
  const save={...emptySave(),run:startRun('followup-storage','程医生',[])},r=save.run,a=r.authored!,p=r.patients[0];
  const appointment=`${r.id}:E-032-c`,refusal=`${r.id}:E-013-a`;
  a.ledger.commits.push(appointment,refusal);
  a.ledger.outcomes??=[];a.ledger.outcomes.push({eventId:'E-032',choiceId:appointment,success:true,scope:{kind:'patient',id:p.uid},day:1},{eventId:'E-013',choiceId:refusal,success:true,scope:{kind:'patient',id:p.uid},day:1});
  a.appointments=[{id:appointment,source:'E-032',day:2,patientId:p.uid}];
  a.refusals={[p.uid]:{day:1,source:refusal}};
  return {save,r,a,p};
}
describe('stable archive and sourced follow-up persistence',()=>{
 it('roundtrips valid source trap keys and optional legacy omissions',()=>{
  const {save}=fixture();save.meta.archiveTraps=['C-001:decision:trap-1','C001:s5_discharge'];
  save.run.archiveTraps=['C-001:preset:C-001:old:decision:trap-1'];
  expect(decode(encode(save))).toEqual(save);
  delete save.meta.archiveTraps;delete save.run.archiveTraps;delete save.run.authored!.appointments;delete save.run.authored!.refusals;
  expect(decode(encode(save))).toEqual(save);
 });
 it.each(['C-999:decision:trap-1','C-001:decision:trap-99','C-001:investigate:targeted','C001:s5_consult','C002:s5_discharge','C-001:preset:C-001:old:decision:trap-1'])('rejects invalid/noncanonical meta archive key %s',key=>{
  const {save}=fixture();save.meta.archiveTraps=[key];expect(()=>decode(encode(save))).toThrow();
 });
 it('accepts appointment arrival and each terminal refusal result',()=>{
  for(const resolved of ['assessment','known-damage','telephone','stable','deteriorated'] as const){const {save,a,p}=fixture();a.appointments![0].arrived=true;a.refusals![p.uid].resolved=resolved;expect(decode(encode(save))).toEqual(save);}
 });
 it('accepts the real card-and-choice composite ledger commit keys',()=>{
  const {save,a}=fixture();a.ledger.commits=a.ledger.commits.map(id=>`${id.slice(0,id.lastIndexOf(':'))}:${id}`);
  expect(decode(encode(save))).toEqual(save);
 });
 it.each([['day',0],['day',16],['day',2.5],['source','E-999'],['id','uncommitted:E-032-c'],['patientId','missing'],['arrived','yes']] as const)('rejects invalid appointment %s', (key,value)=>{
  const {save,a}=fixture();(a.appointments![0] as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode(save))).toThrow();
 });
 it('rejects duplicate appointments, E032 without a patient, or source-day mismatch',()=>{
  const first=fixture();first.a.appointments!.push({...first.a.appointments![0]});expect(()=>decode(encode(first.save))).toThrow();
  const second=fixture();delete second.a.appointments![0].patientId;expect(()=>decode(encode(second.save))).toThrow();
  const third=fixture();third.a.appointments![0].day=3;expect(()=>decode(encode(third.save))).toThrow();
 });
 it.each([['day',0],['day',15],['day',1.5],['source','missing:E-013-a'],['source','x:E-013-c'],['resolved','accepted']] as const)('rejects invalid refusal %s',(key,value)=>{
  const {save,a,p}=fixture();(a.refusals![p.uid] as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode(save))).toThrow();
 });
 it('rejects refusal patient mismatch and a successful E013b incorrectly treated as refused',()=>{
  const first=fixture(),saved=first.a.refusals![first.p.uid];first.a.refusals={missing:saved};expect(()=>decode(encode(first.save))).toThrow();
  const second=fixture(),source=`${second.r.id}:E-013-b`;second.a.refusals![second.p.uid].source=source;second.a.ledger.commits.push(source);second.a.ledger.outcomes!.push({eventId:'E-013',choiceId:source,success:true,scope:{kind:'patient',id:second.p.uid},day:1});expect(()=>decode(encode(second.save))).toThrow();
 });
 it('permits a source E109 family referral without an existing patient',()=>{
  const {save,r,a}=fixture(),id=`r.id:E-109-c`;a.ledger.commits.push(id);a.ledger.outcomes!.push({eventId:'E-109',choiceId:id,success:true,scope:{kind:'personal',id:r.id},day:1});a.appointments=[{id,source:'E-109',day:2}];expect(decode(encode(save))).toEqual(save);
 });
});
