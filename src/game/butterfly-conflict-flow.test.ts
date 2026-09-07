import {describe,it,expect}from 'vitest';
import {startRun,act,availableOptions,availableEncounters}from './engine';
import {authoredGraphWorld,buildAuthoredEvents,refreshButterflyOptions}from './director';
import {startButterfly,commitButterflyChoice,type ButterflyState}from '../content/events/butterfly';
import {eventToCard,EVENT_BY_ID}from '../content/events/catalog';
import {registerFamilyInvoice}from '../content/events/family-accounts';
import {emptySave,encode,decode,storageRunIssues}from './storage';
import type {ButterflyCard,ButterflyMergeCard}from './director';
import {runRandom}from './run-random';
import {RULES}from './rules';
import {butterflyCommitmentCard}from '../content/events/butterfly-commitments';
const fact=(s:ButterflyState,type:string,day=7)=>s.facts.push({id:`${s.id}:${type}`,type,scope:s.scope,subjects:{...s.subjects},day,sourceChoiceId:'fixture-source',knownBy:['player']});
function conflict(choice='BTF-004:N04b',seed='collision-fixture'){
 const r=startRun(seed,'程医生',[]);r.day=8;r.ap=40;r.cash=30000;r.shiftPhase='结算';
 const s=r.authored!;s.actor.liAwayDays=[];s.actor.zhouAwayDays=[];
 const source=startButterfly('BTF-004','work',{actorId:'zhou',projectId:'real-project'},'N04');
 fact(source,'original_file_retained');fact(source,'zhou_saw_original');
 const accepted=commitButterflyChoice(source,choice,{day:7,cash:30000,ap:10,actorAvailable:true,facts:['materials_received','collaboration_agreed'],conditions:{[choice]:true}}).state;
 s.chains=[accepted];
 const family=eventToCard(EVENT_BY_ID['E-105'],{instanceId:'family-due',scope:{kind:'personal',id:r.id},day:8,phase:'结算'});
 family.shiftPhase='结算';s.published[family.id]=family;r.queue=[family];r.cursor=0;
 registerFamilyInvoice(s,family,'E-105',8);
 return {r,s,accepted,family};
}
describe('real simultaneous work and family obligations',()=>{
 it.each(['missing','foreign','non-collaboration','no-continuations'])('rejects a %s commitment snapshot in a saved merge',kind=>{
  const {r}=conflict(),built=buildAuthoredEvents(r,'结算');
  const next={...r,...built.patch,queue:[...r.queue,...built.cards]};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(storageRunIssues(next)).toEqual([]);
  if(kind==='missing')merge.butterflyMerge.claimedCommitmentIds=['missing-task'];
  if(kind==='foreign'){
   const other=structuredClone(next.authored!.chains[0]);other.id='other-work';
   other.commitments[0].id='other-work-task';next.authored!.chains.push(other);
   merge.butterflyMerge.claimedCommitmentIds=['other-work-task'];
  }
  if(kind==='non-collaboration')next.authored!.chains[0].commitments[0].type='family_attendance_chosen';
  if(kind==='no-continuations'){delete merge.butterflyMerge.continuations;delete merge.butterflyMerge.claimedSceneIds;}
  expect(storageRunIssues(next).length).toBeGreaterThan(0);
 });
 it('keeps a deferred morning task due, merges it in the evening, and permits a new delivery without rewriting the morning answer',()=>{
  const {r,s,accepted,family}=conflict('BTF-004:N04a');r.phase='play';r.shiftPhase='交班';
  const job=butterflyCommitmentCard(r,s,accepted,accepted.commitments[0],authoredGraphWorld(r,s,accepted,'交班'),'交班')!;
  s.published[job.id]=job;r.queue=[job];r.cursor=0;
  const defer=job.options.find(o=>o.id.endsWith(':defer'))!.id;
  let next=act(r,{type:'choose',id:defer});expect(next.authored!.chains[0].commitments[0].status).toBe('accepted');
  // Evening execution boundary; all ordinary echo slots were used earlier.
  next.phase='play';next.shiftPhase='结算';next.queue=[family];next.cursor=0;
  const used=Array.from({length:RULES.events.echoDailyCaps[r.day-1]},(_,i)=>`${r.id}:answered-echo:${i}`);
  for(const id of used){
   next.authored!.published[id]={id,kind:'story',title:'已答复消息',text:'',scope:{kind:'personal',id:r.id},options:[{id:`${id}:answer`,label:'已读',ap:0,cost:0,minutes:0,effects:{},result:'收到。'}]};
   next.committed.push(`${id}:answer`);
  }
  next.authored!.echoDays=[{day:r.day,cardIds:used}];
  const built=buildAuthoredEvents(next,'结算'),merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge).toBeDefined();expect(merge.butterflyMerge.claimedCommitmentIds).toEqual([job.butterflyCommitment.commitmentId]);
  next={...next,...built.patch,queue:[...next.queue,...built.cards]};next=act(next,{type:'focus',id:merge.id});
  next=act(next,{type:'choose',id:availableOptions(next).find(o=>o.id.endsWith(':XJ01d'))!.id});
  expect(storageRunIssues(next)).toEqual([]);next=decode(encode({...emptySave(),run:next})).run!;next=act(next,{type:'continue'});
  const delivery=availableEncounters(next).find(c=>'butterflyCommitment'in c)!;expect(delivery).toBeDefined();expect(delivery.id).not.toBe(job.id);
  next=act(next,{type:'focus',id:delivery.id});next=act(next,{type:'choose',id:availableOptions(next).find(o=>o.id.endsWith(':complete'))!.id});
  expect(next.committed).toContain(defer);expect(next.authored!.chains[0].facts.filter(f=>f.type==='verification_completed')).toHaveLength(1);
  expect(next.authored!.familyInvoices![0].status).toBe('decision-pending');expect(storageRunIssues(next)).toEqual([]);
 });
 it('does not reopen the original research delivery today after choosing to leave for family',()=>{
  const {r}=conflict(),built=buildAuthoredEvents(r,'结算');
  const next={...r,...built.patch,phase:'play' as const,queue:[...r.queue,...built.cards]};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;next.cursor=next.queue.indexOf(merge);
  const option=availableOptions(next).find(o=>o.id.endsWith(':XJ01a'))!;expect(option).toBeDefined();
  const after=act(next,{type:'choose',id:option.id});
  expect(after.authored!.chains[0].commitments.filter(c=>c.type!=='family_attendance_chosen').every(c=>c.status==='accepted'&&c.resumeDay===r.day+1)).toBe(true);
  expect(after.queue.some(c=>merge.butterflyMerge.claimedSceneIds?.includes(c.id))).toBe(false);
  expect(after.authored!.familyInvoices![0].status).toBe('decision-pending');
 });
 it('delivers the actual department assignment on day six even after the echo quota was used',()=>{
  const r=startRun('teaching-assigned-today','程医生',[]);r.day=6;r.shiftPhase='结算';r.authored!.actor.sharedResearch=true;
  const old={id:'answered-echo',kind:'story' as const,title:'旧消息',text:'',scope:{kind:'personal' as const,id:r.id},options:[]};
  r.authored!.published[old.id]=old;r.authored!.echoDays=[{day:6,cardIds:[old.id]}];
  const built=buildAuthoredEvents(r,'结算');
  const teaching=built.cards.filter(c=>(c as Partial<ButterflyCard>).butterfly?.nodeId==='BTF-004:N01');
  expect(teaching).toHaveLength(1);
  expect(built.patch.authored.chains.find(c=>c.id===(teaching[0]as ButterflyCard).butterfly.chainStateId)?.entrySource).toBe('department-teaching');
  expect(buildAuthoredEvents({...r,...built.patch},'结算').cards).toEqual([]);
 });
 it.each(['BTF-004:N04a','BTF-004:N04b','BTF-004:N04d'])('can fulfil the original %s assignment on the same day after agreeing division',choice=>{
  const {r}=conflict(choice),built=buildAuthoredEvents(r,'结算');
  let next={...r,...built.patch,phase:'play' as const,queue:[...r.queue,...built.cards]};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;next.cursor=next.queue.indexOf(merge);
  const id=availableOptions(next).find(o=>o.id.endsWith(':XJ01d'))!.id;
  let after=act(next,{type:'choose',id});
  expect(after.authored!.chains[0].commitments.every(c=>c.status==='accepted')).toBe(true);
  const source=merge.butterflyMerge.claimedSceneIds!.find(id=>!id.includes('clinical_explanation'))!;
  expect(after.queue.some(c=>c.id===source)).toBe(true);
  expect(after.authored!.familyInvoices![0].status).toBe('decision-pending');
  after=decode(encode({...emptySave(),run:after})).run!;
  expect(act(after,{type:'choose',id})).toBe(after);
  after=act(after,{type:'continue'});
  expect(availableEncounters(after).some(c=>c.id===source)).toBe(true);
  after=act(after,{type:'focus',id:source});
  const complete=availableOptions(after).find(o=>o.id.endsWith(':complete'))!;
  after=act(after,{type:'choose',id:complete.id});
  expect(after.authored!.chains[0].facts.some(f=>f.type==='verification_completed')).toBe(true);
  expect(after.day).toBe(r.day);expect(after.authored!.familyInvoices![0].status).toBe('decision-pending');
  expect(storageRunIssues(after)).toEqual([]);
 });
 it.each(['BTF-004:N04a','BTF-004:N04b','BTF-004:N04d'])('allows agreed division with the present collaborator from %s',choice=>{
  const {r}=conflict(choice),built=buildAuthoredEvents(r,'结算'),next={...r,...built.patch};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(refreshButterflyOptions(next,merge).some(o=>o.id.endsWith(':XJ01d'))).toBe(true);
  expect(Object.values(next.authored!.published).some(c=>'butterflyPermission'in c&&c.id.includes('family-delegation'))).toBe(true);
  next.authored!.actor.zhouAwayDays=[r.day];
  expect(refreshButterflyOptions(next,merge).some(o=>o.id.endsWith(':XJ01d'))).toBe(false);
 });
 it('does not turn the player own remaining explanation into a second person who can split the work',()=>{
  const {r,s}=conflict();s.chains[0].commitments.find(c=>c.type==='labor_exchange_accepted')!.status='completed';
  const built=buildAuthoredEvents(r,'结算'),next={...r,...built.patch};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge).toBeDefined();
  expect(refreshButterflyOptions(next,merge).some(o=>o.id.endsWith(':XJ01d'))).toBe(false);
 });
 it('allows a selected random family request to collide with existing work in the same stage',()=>{
  const {r,s}=conflict('BTF-004:N04b','random-family-12');r.queue=[];s.familyInvoices=[];delete s.published['family-due'];
  // Other research scenes were answered before this execution boundary.
  s.chains[0].consumed.push('BTF-004:N01','BTF-004:N02','BTF-004:N03','BTF-004:N05');
  const built=buildAuthoredEvents(r,'结算'),bill=built.cards.find(c=>'authoredEventId'in c&&['E-099','E-105'].includes(c.authoredEventId as string));
  expect(bill).toBeDefined();
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge?.butterflyMerge.familyBillId).toBe(bill!.id);
  expect(built.cards.indexOf(merge)).toBeLessThan(built.cards.indexOf(bill!));
  expect(built.cards.some(c=>merge.butterflyMerge.claimedSceneIds?.includes(c.id))).toBe(false);
 });
 it.each(['BTF-004:N04a','BTF-004:N04d'])('includes the real collaboration accepted through %s',choice=>{
  const {r}=conflict(choice),built=buildAuthoredEvents(r,'结算');
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge?.butterflyMerge.continuations).toEqual([{chainStateId:'work',sourceNode:'BTF-004:LABOR',targetNode:'BTF-004:N05'}]);
  expect(merge.butterflyMerge.claimedSceneIds).toHaveLength(1);
  const next={...r,...built.patch,queue:[...r.queue,...built.cards]};
  expect(storageRunIssues(next)).toEqual([]);
 });
 it('registers the actual ICU-course bill and applies bereavement entry costs once',()=>{
  const seed=Array.from({length:100},(_,i)=>`family-course-${i}`).find(seed=>runRandom({id:'course',seed},'family:icu-course')<RULES.family.deathChance)!;
  const r=startRun(seed,'程医生',[]);r.day=8;r.shiftPhase='结算';
  r.authored!.activeFacts['家庭-车祸-ICU中']={day:1,source:'actual-prior-family-call'};
  const built=buildAuthoredEvents(r,'结算'),card=built.cards.find(c=>'authoredEventId'in c&&c.authoredEventId==='E-102')!;
  expect(card.title).toBe('家里的电话');
  expect(built.patch.authored.familyInvoices?.find(b=>b.id===card.id)?.requested).toBe(3000);
  const charges=built.effects.filter(e=>e.effects.flags?.includes('father-deceased'));
  expect(charges).toHaveLength(1);expect(charges[0].effects.san).toBe(-RULES.family.bereavementSan);
 });
 it('allows one real research appointment to conflict with the actual family bill, without requiring a second butterfly chain',()=>{
  const {r}=conflict(),built=buildAuthoredEvents(r,'结算');
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge?.butterflyMerge.mergeId).toBe('XJ-01');
  expect(merge.butterflyMerge.chainStateIds).toEqual(['work']);
  expect(merge.butterflyMerge.claimedSceneIds?.some(id=>id.includes('labor_exchange_accepted'))).toBe(true);
  expect(built.removeCardIds).not.toContain('family-due');
  const next={...r,...built.patch,queue:[...r.queue,...built.cards]};
  expect(storageRunIssues(next)).toEqual([]);
  expect(decode(encode({...emptySave(),run:next})).run?.authored?.familyInvoices?.[0].status).toBe('decision-pending');
 });
 it('includes the mandatory family bill delivered in this scheduling pass, before payment is selected',()=>{
  const {r,s}=conflict();r.day=10;r.cash=1000;r.queue=[];s.familyInvoices=[];
  delete s.published['family-due'];
  const built=buildAuthoredEvents(r,'结算');
  const bill=built.cards.find(c=>'authoredEventId'in c&&['E-099','E-105'].includes(c.authoredEventId as string));
  expect(bill).toBeDefined();
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge?.butterflyMerge.mergeId).toBe('XJ-01');
  expect(built.cards.indexOf(merge)).toBeLessThan(built.cards.indexOf(bill!));
 expect(built.patch.authored.familyInvoices?.find(b=>b.id===bill!.id)?.status).toBe('decision-pending');
 });
 it('does not substitute a different bill after the offered family request has been settled',()=>{
  const {r}=conflict(),built=buildAuthoredEvents(r,'结算');
  const next={...r,...built.patch},merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge.butterflyMerge.familyBillId).toBe('family-due');
  next.authored!.familyInvoices![0].status='paid';
  const other=eventToCard(EVENT_BY_ID['E-105'],{instanceId:'other-bill',scope:{kind:'personal',id:r.id},day:8,phase:'结算'});
  next.authored!.published[other.id]=other;registerFamilyInvoice(next.authored!,other,'E-105',8);
  expect(refreshButterflyOptions(next,merge).map(o=>o.id.split(':').at(-1))).toEqual(['separate']);
  merge.butterflyMerge.familyBillId='missing';
  expect(storageRunIssues({...next,queue:[...r.queue,...built.cards]})).toContain('references');
 });
 it('does not complete research or pay the bill when separating the two pending obligations',()=>{
  const {r}=conflict(),built=buildAuthoredEvents(r,'结算');
  const next={...r,...built.patch,phase:'play' as const,queue:[...r.queue,...built.cards]};
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;next.cursor=next.queue.indexOf(merge);
  const choice=availableOptions(next).find(o=>o.id.endsWith(':separate'))!;
  const after=act(next,{type:'choose',id:choice.id});
  expect(after.cash).toBe(next.cash);expect(after.ap).toBe(next.ap);
  expect(after.authored!.familyInvoices![0].status).toBe('decision-pending');
  expect(after.authored!.chains[0].commitments.every(c=>c.status==='accepted')).toBe(true);
  expect(after.queue.filter(c=>'butterflyCommitment'in c)).toHaveLength(2);
  expect(storageRunIssues(after)).toEqual([]);
 });
 it.each(['paid','completed','not-due','paused'] as const)('does not publish a conflict for %s obligations',variant=>{
  const {r,s,accepted}=conflict();
  if(variant==='paid')s.familyInvoices![0].status='paid';
  if(variant==='completed')accepted.commitments.forEach(c=>c.status='completed');
  if(variant==='not-due')accepted.commitments.forEach(c=>c.due=9);
  if(variant==='paused')accepted.commitments.forEach(c=>c.resumeDay=9);
  const built=buildAuthoredEvents(r,'结算');expect(built.cards.some(c=>'butterflyMerge'in c)).toBe(false);
 });
 it('recognizes an accepted research task due today, without requiring a paper deadline or manuscript acceptance',()=>{
  const {r,s,accepted}=conflict();
  expect(s.paperDeadline).toBeUndefined();
  expect(accepted.facts.some(f=>f.type==='project_accepted')).toBe(false);
  expect(authoredGraphWorld(r,s,accepted,'结算').facts).toContain('commitment_collision');
 });
 it('does not turn a paid family request, completed task, or tomorrow appointment into a collision',()=>{
  const {r,s,accepted}=conflict();
  s.familyInvoices![0].status='paid';
  expect(authoredGraphWorld(r,s,accepted,'结算').facts).not.toContain('commitment_collision');
  s.familyInvoices![0].status='decision-pending';
  accepted.commitments.forEach(c=>c.status='completed');
  expect(authoredGraphWorld(r,s,accepted,'结算').facts).not.toContain('commitment_collision');
  accepted.commitments.forEach(c=>{c.status='accepted';c.due=9;});
  expect(authoredGraphWorld(r,s,accepted,'结算').facts).not.toContain('commitment_collision');
 });
 it('replaces an already queued standalone node when the matching merge is published',()=>{
  const r=startRun('merge-queued-fixture','程医生',[]);r.day=12;r.ap=40;r.shiftPhase='结算';
  const s=r.authored!;s.actor.sharedResearch=true;s.actor.zhouAwayDays=[];s.actor.liAwayDays=[];
  const subjects={projectId:'same-project',paymentId:'same-payment',sponsorId:'ye'};
  const cash=startButterfly('BTF-002','cash',{actorId:'li',...subjects},'N05');
  const work=startButterfly('BTF-004','research',{actorId:'zhou',...subjects},'N05');
  fact(cash,'conditional_offer_accepted');fact(cash,'exchange_request_received');fact(work,'same_project_invitation');
  s.chains=[cash,work];
  const previous:ButterflyCard={id:'cash:N05',title:'旧待办',text:'等候处理。',kind:'story',shiftPhase:'结算',scope:cash.scope,chain:cash.chain,options:[{id:'cash:BTF-002:N05b',label:'拒绝',ap:0,minutes:0,cost:0,effects:{},result:'拒绝。'}],butterfly:{chainStateId:cash.id,nodeId:cash.cursor,day:11,phase:'结算'}};
  s.published[previous.id]=previous;r.queue=[previous];r.cursor=0;
  const built=buildAuthoredEvents(r,'结算');
  const merge=built.cards.find(c=>'butterflyMerge'in c)as ButterflyMergeCard;
  expect(merge?.butterflyMerge.mergeId).toBe('XJ-02');
  expect(built.removeCardIds).toContain(previous.id);
  expect(built.patch.authored.chains.flatMap(c=>c.consumed)).not.toContain(cash.cursor);
 });
});
