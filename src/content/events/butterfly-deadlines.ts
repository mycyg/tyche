import type {Run}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import type {ButterflyState}from './butterfly';
import {RULES}from '../../game/rules';

export interface DeadlineChange {kind:'commitment'|'paper'|'family-bill';id:string;from:number;to:number;family:boolean;}
/** Only named, still-open, non-urgent work can enter a rescheduling request. */
export function deadlineCandidates(r:Run):DeadlineChange[]{
  const s=r.authored;if(!s)return[];
  const candidates:DeadlineChange[]=[];
  for(const chain of s.chains){
    for(const c of chain.commitments){
      if(c.status!=='accepted'||c.due<r.day||!/verification|labor_exchange|clinical_explanation|contribution_division|source_delivery|source_preservation/.test(c.type))continue;
      candidates.push({kind:'commitment',id:c.id,from:c.due,to:c.due+RULES.butterfly.deadlineExtensionDays,family:false});
    }
    const due=s.paperDeadline??RULES.butterfly.paperDeadline;
    if(chain.chain==='BTF-004'&&chain.subjects.projectId&&chain.facts.some(f=>f.type==='project_accepted')&&!chain.facts.some(f=>f.type==='submitted')&&due>=r.day)
      candidates.push({kind:'paper',id:chain.subjects.projectId,from:due,to:due+RULES.butterfly.deadlineExtensionDays,family:false});
  }
  for(const bill of s.familyInvoices??[]){
    const due=bill.dueDay??bill.day;
    if(bill.sourceEventId==='E-105'&&bill.status==='decision-pending'&&due>=r.day)candidates.push({kind:'family-bill',id:bill.id,from:due,to:due+RULES.butterfly.deadlineExtensionDays,family:true});
  }
  return candidates;
}
export function approvedDeadlineChanges(r:Run,chain:ButterflyState):DeadlineChange[]{
  const eligible=deadlineCandidates(r);
  return chain.facts.filter(f=>f.type==='deadlines_may_extend'&&f.day===r.day).flatMap(f=>f.deadlineChanges??[])
    .filter(c=>eligible.some(e=>e.kind===c.kind&&e.id===c.id&&e.from===c.from&&e.to===c.to));
}
export function applyApprovedDeadlines(r:Run,s:AuthoredDirectorState,chains:ButterflyState[],both:boolean):DeadlineChange[]{
  const candidates=chains.flatMap(c=>approvedDeadlineChanges({...r,authored:s},c));
  const unique=[...new Map(candidates.map(c=>[`${c.kind}:${c.id}`,c])).values()];
  if(both&&(!unique.some(c=>c.family)||!unique.some(c=>!c.family)))return[];
  const selected=both?unique:unique.slice(0,1);
  for(const target of selected){
    if(target.kind==='paper')s.paperDeadline=target.to;
    else if(target.kind==='family-bill')s.familyInvoices!.find(i=>i.id===target.id)!.dueDay=target.to;
    else for(const chain of s.chains){const c=chain.commitments.find(c=>c.id===target.id);if(c)c.due=target.to;}
  }
  return selected;
}
