import {describe,it,expect}from 'vitest';
import {butterflySceneActor,butterflyResultVoiceActor}from './butterfly-cast';
import {startButterfly}from './butterfly';
import {dialogueSegments}from '../../ui/dialogue-voice';
import {BUTTERFLY_CHOICE_RESULTS}from './butterfly-prose';

describe('butterfly scene and response casting',()=>{
 it.each([
  ['BTF-001','N05','nurse'],['BTF-001','N06','chief'],
  ['BTF-002','N04','rep'],['BTF-002','N05','rep'],['BTF-002','N07','mother'],['BTF-002','N08','chief'],
  ['BTF-004','N01','chief'],['BTF-004','N02','research'],['BTF-004','N03','chief'],['BTF-004','N04','research'],['BTF-004','N05','rep'],['BTF-004','N06','chief'],
 ]as const)('%s %s uses the person in its scene', (id,node,actor)=>{
  expect(butterflySceneActor(startButterfly(id,'cast',{actorId:'voice',projectId:'cast-project'},node))).toBe(actor);
 });
 it('does not cast a peer or an insurance auditor as the project reviewer',()=>{
  const chain=startButterfly('BTF-002','cast',{actorId:'voice'},'N08');
  expect(butterflySceneActor(chain,['review_opened'])).toBeUndefined();
 });
 it('keeps the department project separate from a company invitation',()=>{
  const chain=startButterfly('BTF-004','cast',{actorId:'voice',projectId:'cast-project'},'N05');
  chain.entrySource='department-teaching';expect(butterflySceneActor(chain)).toBe('research');
 });
 it('uses the actual lender for the repayment scene',()=>{
  const chain=startButterfly('BTF-002','cast',{actorId:'voice'},'N06');
  expect(butterflySceneActor(chain)).toBe('rep');
  chain.receivable=1500;expect(butterflySceneActor(chain)).toBe('peer');
  chain.receivable=0;expect(butterflySceneActor(chain,['repayment_received'])).toBe('peer');
 });
 it.each(['BTF-001:N01b','BTF-001:N03c'])('voices the player refusal in %s as the player, not Li',id=>{
  expect(dialogueSegments(BUTTERFLY_CHOICE_RESULTS[id],butterflyResultVoiceActor(id,'peer'))[0].speaker).toBe('hero');
 });
 it('does not steal Li’s attributed or pronoun dialogue in other results',()=>{
  const id='BTF-001:N02a',parts=dialogueSegments(BUTTERFLY_CHOICE_RESULTS[id],butterflyResultVoiceActor(id,'peer'));
  expect(parts.find(s=>s.text.includes('一床一床交'))?.speaker).toBe('peer');
 });
});
