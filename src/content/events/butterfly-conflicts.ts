import type {Run}from '../../game/types';
import type {AuthoredDirectorState}from '../../game/director';
import type {ButterflyState}from './butterfly';
import type {EventPhase}from './types';
import {RULES}from '../../game/rules';

/** A collision concerns outstanding, dated work and a real family request.
 * A continuing ICU flag or a manuscript deadline alone supplies neither. */
export function hasDueFamilyWorkConflict(r:Run,s:AuthoredDirectorState,chain:ButterflyState,phase:EventPhase):boolean {
 if(phase!=='结算')return false;
 const due=(c:ButterflyState['commitments'][number])=>c.status==='accepted'&&c.due<=r.day&&(c.resumeDay??0)<=r.day;
 const bills=(s.familyInvoices??[]).filter(b=>b.status==='decision-pending'&&(b.dueDay??b.day)<=r.day);
 const familyTasks=s.chains.filter(c=>c.status!=='closed').flatMap(c=>c.commitments).filter(c=>due(c)&&/family_attendance|family_delegate/.test(c.type));
 if(!bills.length&&!familyTasks.length)return false;
 const workDue=(c:ButterflyState)=>{
  if(c.status==='closed')return false;
  if(c.commitments.some(k=>due(k)&&/verification|labor_exchange|clinical_explanation|contribution_division|handoff|time_help/.test(k.type)))return true;
  return c.chain==='BTF-004'&&!!c.subjects.projectId&&c.facts.some(f=>f.type==='project_accepted')
    &&!c.facts.some(f=>['submitted','project_refused','authorship_withdrawn','cooperation_ended'].includes(f.type))
    &&r.day>=(s.paperDeadline??RULES.butterfly.paperDeadline);
 };
 if(!s.chains.some(workDue))return false;
 if(chain.chain==='BTF-002')return !chain.subjects.familyBillId?bills.length>0||familyTasks.length>0:bills.some(b=>b.id===chain.subjects.familyBillId);
 return workDue(chain);
}
