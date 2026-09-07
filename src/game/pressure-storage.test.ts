import {describe,it,expect} from 'vitest';
import {startRun} from './engine';
import {emptySave,encode,decode} from './storage';
function fixture(){
 const save={...emptySave(),run:startRun('pressure-storage','程医生',[])},r=save.run,a=r.authored!,source=`${r.id}:event:E-111:1:E-111-a`;
 a.ledger.commits.push(`${source.slice(0,source.lastIndexOf(':'))}:${source}`);
 (a.ledger.outcomes??=[]).push({eventId:'E-111',choiceId:source,success:true,scope:{kind:'personal',id:r.id},day:1});
 a.pressureCharges=[{day:1,amount:6500,source}];a.pressureBackground={raw:132,value:105};return{save,r,a,source};
}
describe('actual financial pressure persistence',()=>{
 it('accepts a real mortgage commit and backgrounds above the displayed 100 cap',()=>{const {save}=fixture();expect(decode(encode(save))).toEqual(save);});
 it('keeps multiple real deductions from one source and old optional omissions',()=>{
  const {save,a}=fixture();a.pressureCharges!.push({...a.pressureCharges![0],amount:100});expect(decode(encode(save))).toEqual(save);
  delete a.pressureCharges;delete a.pressureBackground;expect(decode(encode(save))).toEqual(save);
 });
 it('requires exact applied deferred or supplemental patient bill provenance',()=>{
  for(const suffix of [':deferred:0',':event-patient-bill']){
   const {save,r,a,source}=fixture(),id=source+suffix;a.pressureCharges![0].source=id;
   expect(()=>decode(encode(save))).toThrow();a.ledger.applied.push(id);r.facts[`director-applied:${id}`]={day:1,source:id,sequence:0};expect(decode(encode(save))).toEqual(save);
  }
 });
 it.each([['day',0],['day',2],['day',1.5],['amount',0],['amount',-1],['amount',null],['source','foreign:source']] as const)('rejects invalid charge %s',(key,value)=>{
  const {save,a}=fixture();(a.pressureCharges![0] as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode(save))).toThrow();
 });
 it.each([{raw:-1,value:0},{raw:1,value:2},{raw:1,value:-1},{raw:null,value:0},{raw:0,value:'0'}])('rejects invalid financial background %j',value=>{
  const {save,a}=fixture();a.pressureBackground=value as unknown as typeof a.pressureBackground;expect(()=>decode(encode(save))).toThrow();
 });
 it('does not turn ordinary personal spending into an authorized penalty record',()=>{
  const {save,a,source}=fixture();a.ledger.outcomes![0].eventId='E-177';a.ledger.outcomes![0].choiceId=source;expect(()=>decode(encode(save))).toThrow();
 });
});
