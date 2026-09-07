import {it,expect}from 'vitest';
import {startRun}from '../../game/engine';
import {authoredGraphWorld,afterAuthoredChoice}from '../../game/director';
import {offerLiaisonRole,butterflyRoleDutyCard}from './butterfly-role';
import {startButterfly,butterflyChoices,commitButterflyChoice,type ButterflyState}from './butterfly';
import {butterflyCommitmentCard}from './butterfly-commitments';
import {pendingScheduledWork,scheduledChoiceWork}from '../../ui/scheduled-work';
import {RULES}from '../../game/rules';
const exchange=(s:ButterflyState)=>s.facts.push({id:`${s.id}:exchange`,type:'exchange_performed',scope:s.scope,subjects:{...s.subjects},sourceChoiceId:'BTF-002:N05a',day:8,knownBy:['player','ye']});

// These are boundary transactions, not proof of a natural N05-to-N08 route.
it('requires actual exchange, a dated vacancy notice and no formal inquiry for the appointment branch',()=>{
 const r=startRun('liaison-notice','程医生',[]);r.day=9;r.relations.chief=3;
 const chain=startButterfly('BTF-002','role',{actorId:'li'},'N08');r.authored!.chains.push(chain);
 expect(offerLiaisonRole(r,chain)).toBe(false);exchange(chain);
 expect(offerLiaisonRole(r,chain)).toBe(true);expect(offerLiaisonRole(r,chain)).toBe(false);
 const w=authoredGraphWorld(r,r.authored!,chain,'结算');expect(w.facts).toContain('review_due');expect(w.facts).not.toContain('review_opened');
 expect(butterflyChoices(chain,w).find(c=>c.choice.id==='BTF-002:N08c')?.available).toBe(true);
 r.authored!.activeFacts['药代-约谈']={day:9,source:'actual-inquiry'};
 expect(butterflyChoices(chain,authoredGraphWorld(r,r.authored! ,chain,'结算')).find(c=>c.choice.id==='BTF-002:N08c')?.available).toBe(true);
 chain.facts.push({id:'scoped-review',type:'review_opened',scope:chain.scope,subjects:{...chain.subjects},sourceChoiceId:'E-140:a',day:9,knownBy:['player']});
 expect(butterflyChoices(chain,authoredGraphWorld(r,r.authored!,chain,'结算')).find(c=>c.choice.id==='BTF-002:N08c')?.available).toBe(false);
});
it('keeps accepting, signing the appointment and doing each subsequent duty separate',()=>{
 const r=startRun('liaison-work','程医生',[]);r.day=9;r.relations.chief=3;
 const chain=startButterfly('BTF-002','role-work',{actorId:'li'},'N08');exchange(chain);r.authored!.chains.push(chain);offerLiaisonRole(r,chain);
 const accepted=commitButterflyChoice(chain,'BTF-002:N08c',authoredGraphWorld(r,r.authored!,chain,'结算')).state;
 r.authored!.chains=r.authored!.chains.map(c=>c.id===chain.id?accepted:c);
 expect(accepted.facts.some(f=>f.type==='liaison_appointed')).toBe(false);expect(butterflyRoleDutyCard(r,accepted)).toBeUndefined();
 const commitment=accepted.commitments.find(c=>c.type==='liaison_role_accepted')!;expect(commitment.actorId).toBe('tang');r.day=10;
 const card=butterflyCommitmentCard(r,r.authored!,accepted,commitment,authoredGraphWorld(r,r.authored!,accepted,'结算'),'结算')!;
 expect(card.actor).toBe('chief');r.authored=afterAuthoredChoice(r,card,card.options[0],true).patch.authored;
 const appointed=r.authored.chains.find(c=>c.id===chain.id)!;expect(butterflyRoleDutyCard(r,appointed)).toBeUndefined();r.day=11;
 const duty=butterflyRoleDutyCard(r,appointed)!;expect(duty.options[0]).toMatchObject({ap:RULES.butterfly.liaisonDailyAp,minutes:RULES.butterfly.liaisonDailyMinutes});expect(duty.options[0].effects.cash).toBeUndefined();
 expect(pendingScheduledWork(r,12).some(x=>x.id.endsWith('liaison-duty:12'))).toBe(true);
 expect(scheduledChoiceWork(r,{...duty.options[0],id:'role-work:BTF-002:N08c'})[0]).toContain('没有额外工资');
});
