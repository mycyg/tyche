import {describe,it,expect} from 'vitest';
import {startRun} from './engine';
import {emptySave,encode,decode} from './storage';

function fixture(){
 const save={...emptySave(),run:startRun('budget-charge-storage','程医生',[])},r=save.run,p=r.patients[0];
 r.budgetCharges=[{day:r.day,amount:50,patientId:p.uid,source:`ward-billing:${r.day}:${p.uid}`}];
 return {save,r,p};
}
describe('actual new DIP shortfall payment persistence',()=>{
 it('accepts actual daily billing and older saves without payment history',()=>{
  const {save,r}=fixture();expect(decode(encode(save))).toEqual(save);delete r.budgetCharges;expect(decode(encode(save))).toEqual(save);
 });
 it('retains separate positive payments sharing a source instead of deduplicating money',()=>{
  const {save,r,p}=fixture(),source='actual-treatment';
  r.journal.push({id:source,day:r.day,title:'诊疗',choice:'完成处置',result:'已完成。',scope:{kind:'patient',id:p.uid},flags:[]});
  r.budgetCharges=[{day:r.day,amount:50,patientId:p.uid,source},{day:r.day,amount:80,patientId:p.uid,source}];
  expect(decode(encode(save))).toEqual(save);
 });
 it('accepts an applied director effect without requiring a player option commit',()=>{
  const {save,r,p}=fixture(),source='actual-delayed-bill';
  r.budgetCharges=[{day:r.day,amount:20,patientId:p.uid,source}];r.facts[`director-applied:${source}`]={day:r.day,source,sequence:0};
  expect(decode(encode(save))).toEqual(save);
 });
 it('accepts a committed current card option when journal provenance is unavailable',()=>{
  const {save,r}=fixture(),c=r.queue.find(c=>c.patientId===r.budgetCharges![0].patientId)!,o=c.options[0];
  r.budgetCharges![0].source=o.id;r.committed.push(`${c.id}:${o.id}`);expect(decode(encode(save))).toEqual(save);
 });
 it.each([['day',0],['day',16],['day',2],['day',1.5],['amount',0],['amount',-1],['amount',null],['amount','30'],['patientId','foreign-patient'],['source','invented'],['source','ward-billing:2:foreign-patient']] as const)('rejects invalid or unbacked %s = %s',(key,value)=>{
  const {save,r}=fixture();(r.budgetCharges![0] as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode(save))).toThrow();
 });
 it('rejects an otherwise real payment source belonging to another patient or day',()=>{
  for(const mismatch of ['patient','day']){
   const {save,r}=fixture(),source='other-care';r.budgetCharges![0].source=source;
   r.journal.push({id:source,day:mismatch==='day'?2:1,title:'诊疗',choice:'完成处置',result:'已完成。',scope:{kind:'patient',id:mismatch==='patient'?r.patients[1].uid:r.patients[0].uid},flags:[]});
   expect(()=>decode(encode(save))).toThrow();
  }
 });
});
