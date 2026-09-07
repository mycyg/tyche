import {describe,it,expect} from 'vitest';
import {startRun} from './engine';
import {createClaimedReadmission} from '../content/events/billing-episodes';
import {decode,encode,emptySave} from './storage';
function fixture(){
 const save={...emptySave(),run:startRun('billing-episode-storage','程医生',[])},r=save.run,a=r.authored!,p=r.patients.find(p=>p.inpatient)!;
 const source=`${r.id}:event:E-171:1:E-171-c`,episode=createClaimedReadmission(r,p,source)!;a.billingEpisodes=[episode];
 a.ledger.commits.push(`${source.slice(0,source.lastIndexOf(':'))}:${source}`);
 (a.ledger.outcomes??=[]).push({eventId:'E-171',choiceId:source,success:true,scope:{kind:'patient',id:p.uid},day:1});
 r.facts[`director-applied:${episode.id}`]={day:1,source:episode.id,sequence:0};
 r.journal.push({id:episode.id,day:1,title:'结算',choice:'分次住院申报',result:'实际住院连续。',scope:{kind:'patient',id:p.uid},flags:[`billing-split:${p.uid}`]});
 return{save,r,a,p,episode};
}
describe('source-proven separate billing claim persistence',()=>{
 it('roundtrips real claim provenance without requiring current charges to exceed a historical split snapshot',()=>{
  const {save,p,episode}=fixture();episode.spendingAtSplit=1000;episode.chargedAtSplit=500;p.spent=200;p.charged=100;
  expect(decode(encode(save))).toEqual(save);
 });
 it('accepts legacy absence, but rejects two E171 claims for the same actual patient',()=>{
  const {save,a,episode}=fixture();a.billingEpisodes!.push({...episode});expect(()=>decode(encode(save))).toThrow();delete a.billingEpisodes;expect(decode(encode(save))).toEqual(save);
 });
 it.each([['id','invented'],['source','E-171-a'],['sourceEvent','E-176'],['patientId','foreign-patient'],['day',0],['day',2],['day',1.5],['kind','actual-readmission'],['continuousStay',false],['spendingAtSplit',-1],['chargedAtSplit',null],['budgetAtSplit','100'],['additionalBudget',1]] as const)('rejects malformed claim %s',(key,value)=>{
  const {save,episode}=fixture();(episode as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode(save))).toThrow();
 });
 it.each(['commit','outcome','success','scope','applied','journal'])('rejects missing or wrong actual %s provenance',missing=>{
  const {save,r,a,episode}=fixture();
  if(missing==='commit')a.ledger.commits=[];
  if(missing==='outcome')a.ledger.outcomes=[];
  if(missing==='success')a.ledger.outcomes![0].success=false;
  if(missing==='scope')a.ledger.outcomes![0].scope={kind:'patient',id:r.patients.find(p=>p.uid!==episode.patientId)!.uid};
  if(missing==='applied')delete r.facts[`director-applied:${episode.id}`];
  if(missing==='journal')r.journal=[];
  expect(()=>decode(encode(save))).toThrow();
 });
});
