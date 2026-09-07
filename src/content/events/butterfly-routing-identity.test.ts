import {it,expect}from 'vitest';
import {startButterfly,type ButterflyState}from './butterfly';
import {hasUnansweredButterflyScene,type ButterflyCard}from '../../game/director';

const pending=(chain:ButterflyState):ButterflyCard=>({id:`${chain.id}:scene`,kind:'story',scope:chain.scope,title:'当面答复',text:'对方还在等你答复。',options:[],
 butterfly:{chainStateId:chain.id,nodeId:chain.cursor,day:6,phase:'结算'}});

it('a pending recording conversation with one patient does not freeze another patient’s route',()=>{
 const a=startButterfly('BTF-003','record-a',{actorId:'family-a',patientId:'patient-a'});
 const b=startButterfly('BTF-003','record-b',{actorId:'family-b',patientId:'patient-b'});
 const card=pending(a),s={published:{[card.id]:card}};
 expect(a.cursor).toBe(b.cursor);
 expect(hasUnansweredButterflyScene(s,a)).toBe(true);
 expect(hasUnansweredButterflyScene(s,b)).toBe(false);
 expect(hasUnansweredButterflyScene(s,{...a,consumed:[a.cursor]})).toBe(false);
});
it('the same colleague and node cannot substitute for the same research project',()=>{
 const a=startButterfly('BTF-004','paper-a',{actorId:'zhou',projectId:'project-a',datasetId:'data-a'});
 const b=startButterfly('BTF-004','paper-b',{actorId:'zhou',projectId:'project-b',datasetId:'data-b'});
 const card=pending(a),own=pending(b);
 expect(hasUnansweredButterflyScene({published:{[card.id]:card}},b)).toBe(false);
 expect(hasUnansweredButterflyScene({published:{[card.id]:card,[own.id]:own}},b)).toBe(true);
 expect(a.facts).toEqual([]);expect(b.facts).toEqual([]);
});
