import {it,expect}from 'vitest';
import {startButterfly,commitButterflyChoice,completeButterflyCommitment,commitmentOwner,type ButterflyWorld,type ButterflyState}from './butterfly';
import {commitmentDelivery,butterflyCommitmentCard}from './butterfly-commitments';
import {authoredGraphWorld,afterAuthoredChoice}from '../../game/director';
import {startRun}from '../../game/engine';
import {settleEventLedger,createEventLedger}from './ledger';

const world:ButterflyWorld={day:6,cash:30000,ap:10,facts:['original_file_retained','materials_received','collaboration_agreed'],actorAvailable:true};
const add=(s:ButterflyState,type:string)=>s.facts.push({id:`${s.id}:${type}`,type,scope:s.scope,subjects:{...s.subjects},day:5,sourceChoiceId:'boundary-source',knownBy:['player']});
it('stores the real task owner and permits late non-shift delivery without erasing the deadline',()=>{
 const start=startButterfly('BTF-004','self-review',{actorId:'zhou',projectId:'self-project'},'N04');add(start,'original_file_retained');
 const accepted=commitButterflyChoice(start,'BTF-004:N04c',world).state,c=accepted.commitments[0];
 expect(c.actorId).toBe('player');expect(c.status).toBe('accepted');expect(c.due).toBe(7);
 expect(accepted.facts.some(f=>f.type==='verification_completed')).toBe(false);
 const done=completeButterflyCommitment(accepted,c.id,{...world,day:9,facts:[...world.facts,`completed:${c.id}`]});
 expect(done.commitments[0]).toMatchObject({status:'completed',due:7,completedDay:9});expect(done.facts.some(f=>f.type==='duty_overdue')).toBe(true);
 expect(completeButterflyCommitment(done,c.id,{...world,day:10,facts:[`completed:${c.id}`]})).toBe(done);
});
it('does not manufacture a past night shift from a late receipt',()=>{
 const start=startButterfly('BTF-001','late-shift',{actorId:'li'});
 const accepted=commitButterflyChoice(start,'BTF-001:N01a',{...world,conditions:{'BTF-001:N01a':true}}).state,c=accepted.commitments[0];
 expect(c.actorId).toBe('player');
 expect(completeButterflyCommitment(accepted,c.id,{...world,day:c.due+1,facts:[`completed:${c.id}`]})).toBe(accepted);
});
it('self verification does not summon Li or Zhou back from absence',()=>{
 const r=startRun('self-materials','程医生',[]);r.day=8;r.authored!.actor.liAwayDays=[8];r.authored!.actor.zhouAwayDays=[8];
 const chain=startButterfly('BTF-004','own-work',{actorId:'zhou',projectId:'own-project'},'N04');add(chain,'original_file_retained');
 const accepted=commitButterflyChoice(chain,'BTF-004:N04c',world).state;r.authored!.chains.push(accepted);
 const w=authoredGraphWorld(r,r.authored!,accepted,'结算'),c=accepted.commitments[0];
 expect(commitmentDelivery(r,r.authored!,accepted,c,w)?.actor).toBeUndefined();
 expect(butterflyCommitmentCard(r,r.authored!,accepted,c,w,'结算')?.options[0].result).toContain('逾期');
 expect(commitmentOwner(chain,'joint_verification_accepted','BTF-004:N04a')).toBe('zhou');
 expect(commitmentOwner(chain,'source_preservation_requested','BTF-004:N02d')).toBe('records-office');
});
it('refunds only the matching unaccepted asset, without treating escrow as spendable money',()=>{
 const r=startRun('escrow-refund','程医生',[]);r.day=8;
 const chain=startButterfly('BTF-002','refund',{actorId:'li'},'N04');
 const a={id:'event:E-134-c:pending',kind:'pending-asset' as const,value:3000,scope:{kind:'project' as const,id:'representative-account'},starts:2,expires:3,description:'待退回款'};
 r.authored!.ledger.modifiers.push(a,{...a,id:'other-unaccepted-asset',value:500});
 const accepted=commitButterflyChoice(chain,'BTF-002:N04d',{...world,conditions:{'BTF-002:N04d':true}}).state;accepted.subjects.offerAssetId=a.id;r.authored!.chains.push(accepted);
 const w=authoredGraphWorld(r,r.authored!,accepted,'结算'),card=butterflyCommitmentCard(r,r.authored!,accepted,accepted.commitments[0],w,'结算')!;
 expect(card.text).toContain('3000');expect(card.options[0].effects.cash).toBeUndefined();
 const result=afterAuthoredChoice(r,card,card.options[0],true);
 expect(result.patch.authored.ledger.modifiers.map(m=>m.id)).toEqual(['other-unaccepted-asset']);
 expect(result.patch.authored.chains.find(c=>c.id===accepted.id)?.facts.some(f=>f.type==='offer_returned')).toBe(true);
 expect(result.effects.some(e=>e.effects.cash||e.effects.privateDebt)).toBe(false);
 const ledger=createEventLedger();ledger.modifiers=[a];expect(settleEventLedger(ledger,15,'日终',[],()=>0,true).ledger.modifiers).toEqual([a]);
});
