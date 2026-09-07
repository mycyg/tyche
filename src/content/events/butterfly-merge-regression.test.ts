import {it,expect}from 'vitest';
import {startButterfly,mergeEligible,mergeParticipantGroups,commitButterflyMerge,butterflyMergeClaim,type ButterflyWorld,type ButterflyState}from './butterfly';

const world:ButterflyWorld={day:11,cash:30000,ap:8,actorAvailable:true,facts:[]};
const fact=(s:ButterflyState,type:string)=>s.facts.push({id:`${s.id}:${type}`,type,scope:s.scope,subjects:{...s.subjects},day:8,sourceChoiceId:'boundary-source',knownBy:['player']});
const sameFunding=()=>[
 startButterfly('BTF-002','money',{actorId:'li',projectId:'p',paymentId:'cash-1',sponsorId:'ye'},'N05'),
 startButterfly('BTF-004','work',{actorId:'zhou',projectId:'p',paymentId:'cash-1',sponsorId:'ye'},'N05'),
];
it('does not claim a paused research appointment merely because another job is due today',()=>{
 const s=startButterfly('BTF-004','paused-work',{actorId:'zhou',projectId:'p'},'N05');
 s.commitments.push({id:'paused',actorId:'zhou',type:'labor_exchange_accepted',task:'核对',source:'original',status:'accepted',due:10,resumeDay:12});
 expect(butterflyMergeClaim('XJ-01',s,{...world,facts:['commitment_collision']})).toBeUndefined();
 expect(butterflyMergeClaim('XJ-01',s,{...world,day:12,facts:['commitment_collision']})).toBe('BTF-004:LABOR');
});
it('requires the same actual project, payment and sponsor instead of matching missing values',()=>{
 const pair=sameFunding();expect(mergeEligible('XJ-02',pair,world)).toBe(true);
 delete pair[0].subjects.sponsorId;delete pair[1].subjects.sponsorId;expect(mergeEligible('XJ-02',pair,world)).toBe(false);
 pair[0].subjects.sponsorId='ye';pair[1].subjects.sponsorId='ye';pair[1].subjects.paymentId='another-payment';expect(mergeEligible('XJ-02',pair,world)).toBe(false);
});
it('does not combine an unrelated patient and research file into the same internal review',()=>{
 const pair=[startButterfly('BTF-001','ward',{actorId:'li',patientId:'patient-a'},'N06'),startButterfly('BTF-004','paper',{actorId:'zhou',projectId:'project-b'},'N07')];
 expect(mergeEligible('XJ-03',pair,{...world,facts:['same_review_received']})).toBe(false);
});
it('selects matching source groups without letting another patient or payment suppress their merge',()=>{
 const pair=sameFunding(),other=startButterfly('BTF-004','unrelated',{actorId:'zhou',projectId:'other-project',paymentId:'other-payment',sponsorId:'ye'},'N05');
 expect(mergeParticipantGroups('XJ-02',[other,...pair])).toEqual([pair]);
 const a=startButterfly('BTF-001','handoff',{actorId:'li',patientId:'same'},'N06');
 const b=startButterfly('BTF-003','record',{actorId:'li',patientId:'same'},'N05');
 expect(mergeParticipantGroups('XJ-03',[a,other,b])).toEqual([[a,b]]);
 expect(mergeParticipantGroups('XJ-03',[a,other])).toEqual([]);
});
it('does not turn overlapping but different material identities into a transitive three-way merge',()=>{
 const a=startButterfly('BTF-001','patient',{actorId:'li',patientId:'same'},'N06');
 const b=startButterfly('BTF-003','bridge',{actorId:'li',patientId:'same',recordId:'record'},'N05');
 const c=startButterfly('BTF-004','project',{actorId:'zhou',projectId:'project',recordId:'record'},'N07');
 expect(mergeParticipantGroups('XJ-03',[a,b,c])).toEqual([[a,b],[b,c]]);
});
it('signing a knowingly false statement is not a fictional paper submission',()=>{
 const pair=sameFunding();pair.forEach(s=>{fact(s,'verified_problem');fact(s,'problem_known');});
 const declined=commitButterflyMerge('XJ-02','XJ02c',pair,world);
 for(const s of declined.states){
  expect(s.facts.some(f=>f.type==='cooperation_ended')).toBe(true);
  expect(s.facts.some(f=>['knowingly_false_statement','responsibility_statement_signed','submitted'].includes(f.type))).toBe(false);
 }
 const result=commitButterflyMerge('XJ-02','XJ02c',pair,{...world,conditions:{XJ02c:true},transactionId:'actual-merge-choice'});
 for(const s of result.states){expect(s.facts.some(f=>f.type==='responsibility_statement_signed')).toBe(true);expect(s.facts.some(f=>['submitted','knowingly_false_submission','exchange_performed'].includes(f.type))).toBe(false);expect(s.facts.find(f=>f.type==='knowingly_false_statement')?.sourceChoiceId).toBe('actual-merge-choice');}
 expect(result.effects.hazards?.every(h=>!h.causal)).toBe(true);
});
it('a shared family errand is still a promise until its own receipt, and division creates no extra assistant',()=>{
 const pair=[startButterfly('BTF-001','shift',{actorId:'li'},'N07'),startButterfly('BTF-002','cash',{actorId:'li'},'N07')],w={...world,facts:['commitment_collision','family_delegate_agreed'],conditions:{XJ01b:true},transactionId:'shared-family-choice'};
 const next=commitButterflyMerge('XJ-01','XJ01b',pair,w).states;
 for(const s of next){expect(s.commitments).toHaveLength(1);expect(s.commitments[0]).toMatchObject({status:'accepted',actorId:'brother',source:'shared-family-choice'});expect(s.facts.some(f=>f.type==='family_task_completed')).toBe(false);}
 const divided=commitButterflyMerge('XJ-01','XJ01d',pair,{...w,conditions:{XJ01d:true}}).states;
 expect(divided.flatMap(s=>s.commitments)).toHaveLength(0);
 expect(divided.flatMap(s=>s.facts).some(f=>f.type==='handoff_completed')).toBe(false);
});
it('selective disclosure cancels only unfulfilled help and keeps previous work and the player own work',()=>{
 const a=startButterfly('BTF-001','shift-record',{actorId:'li',patientId:'same'},'N06'),b=startButterfly('BTF-003','record',{actorId:'li',patientId:'same'},'N05');
 a.commitments=[{id:'old-help',actorId:'li',type:'time_help_accepted',task:'已完成的帮助',source:'old',status:'completed',due:10},{id:'promised-help',actorId:'li',type:'time_help_accepted',task:'尚未完成的帮助',source:'new',status:'accepted',due:12},{id:'own-work',actorId:'player',type:'self_verification_accepted',task:'自己的工作',source:'own',status:'accepted',due:12}];
 const unaware=commitButterflyMerge('XJ-03','XJ03c',[a,b],{...world,facts:['same_review_received'],reviewChainIds:[a.id,b.id],conditions:{XJ03c:true}}).states[0];
 expect(unaware.commitments.map(c=>c.status)).toEqual(['completed','accepted','accepted']);
 fact(a,'false_exam_entry');a.facts.at(-1)!.knownBy.push('li');
 const next=commitButterflyMerge('XJ-03','XJ03c',[a,b],{...world,facts:['same_review_received'],reviewChainIds:[a.id,b.id],conditions:{XJ03c:true}}).states[0];
 expect(next.commitments.map(c=>c.status)).toEqual(['completed','cancelled','accepted']);
});
