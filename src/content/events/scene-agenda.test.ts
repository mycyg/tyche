import {it,expect}from 'vitest';
import {scheduleEchoScenes,randomSceneSlots,pendingSceneNotes,type SceneAgendaState}from './scene-agenda';
import {startRun}from '../../game/engine';
import {emptySave,encode,decode}from '../../game/storage';
import type {Card}from '../../game/types';

const scene=(id:string):Card=>({id,kind:'story',title:`待办${id}`,text:'材料已经送到，请核对本次事项。',scope:{kind:'personal',id:'agenda'},options:[{id:`${id}:reply`,label:'核对并答复',ap:1,minutes:10,cost:0,effects:{},result:'这次事项已答复。'}]});
const chainScene=(id:string,chainStateId:string)=>({...scene(id),butterfly:{chainStateId,nodeId:`BTF-004:${id}`,day:6,phase:'结算'}});
it('shows the fixed department teaching assignment on its assigned day without consuming a delayed echo slot',()=>{
 const teaching=chainScene('N01','department-work'),ordinary=scene('ordinary');
 const state:SceneAgendaState&{chains:{id:string;entrySource:string}[]}={published:{},chains:[{id:'department-work',entrySource:'department-teaching'}]};
 const offered=scheduleEchoScenes({day:6,committed:[]},state,'结算',[ordinary,teaching]);
 expect(offered.map(c=>c.id)).toEqual(['N01','ordinary']);
 expect(scheduleEchoScenes({day:6,committed:[]},state,'结算',[teaching])).toEqual([]);
});
it('a merge replacing an accepted delivery inherits that appointment instead of waiting for a random slot',()=>{
 const task={...scene('due-labor'),butterflyCommitment:{chainStateId:'research',commitmentId:'labor',phase:'结算'}},
  merge={...scene('collision'),butterflyMerge:{mergeId:'XJ-01',chainStateIds:['research'],claimedSceneIds:[task.id]}};
 const state:SceneAgendaState={published:{[task.id]:task},sceneAgenda:[{cardId:task.id,due:2,phase:'结算'}]};
 expect(scheduleEchoScenes({day:2,committed:[]},state,'结算',[merge,scene('optional')]).map(c=>c.id)).toEqual(['collision']);
 expect(state.sceneAgenda?.map(a=>a.cardId)).toEqual(['optional']);
 expect(scheduleEchoScenes({day:2,committed:[]},state,'结算',[merge])).toEqual([]);
});
it('merging answered chains retains continuation priority without expanding their quota',()=>{
 const prior=chainScene('prior','research'),merge={...scene('merged'),butterflyMerge:{mergeId:'XJ-02',chainStateIds:['research','cash'],claimedSceneIds:[]}},old=scene('old');
 const state:SceneAgendaState={published:{[prior.id]:prior,[old.id]:old},sceneAgenda:[{cardId:old.id,due:4,phase:'结算'}]};
 expect(scheduleEchoScenes({day:7,committed:[prior.options[0].id]},state,'结算',[merge]).map(c=>c.id)).toEqual(['merged']);
 expect(state.sceneAgenda?.map(a=>a.cardId)).toEqual(['old']);
});
it('continues a chain the player answered before optional echoes without expanding the daily quota',()=>{
 const prior=chainScene('prior','research-a'),next=chainScene('next','research-a'),old=scene('older-echo');
 const state:SceneAgendaState={published:{[prior.id]:prior,[old.id]:old},sceneAgenda:[{cardId:old.id,due:4,phase:'结算'}]};
 const r={day:7,committed:[prior.options[0].id]};
 expect(scheduleEchoScenes(r,state,'交班',[next]).map(c=>c.id)).toEqual([next.id]);
 expect(scheduleEchoScenes(r,state,'结算',[])).toEqual([]);
 expect(state.sceneAgenda).toEqual([{cardId:old.id,due:4,phase:'结算'}]);
 expect(state.echoDays?.[0].cardIds).toEqual([next.id]);
});
it.each(['unanswered','different-instance'])('does not invent continuation priority from %s history',variant=>{
 const prior=chainScene('prior','research-a'),next=chainScene('next',variant==='different-instance'?'research-b':'research-a'),old=scene('older-echo');
 const state:SceneAgendaState={published:{[prior.id]:prior,[old.id]:old},sceneAgenda:[{cardId:old.id,due:4,phase:'结算'}]};
 const r={day:7,committed:variant==='unanswered'?[]:[prior.options[0].id]};
 expect(scheduleEchoScenes(r,state,'交班',[next])).toEqual([]);
 expect(scheduleEchoScenes(r,state,'结算',[]).map(c=>c.id)).toEqual([old.id]);
});
it('keeps early pending scenes without spending a prohibited echo slot',()=>{
 const state:SceneAgendaState={published:{}},cards=[scene('a'),scene('b')];
 expect(scheduleEchoScenes({day:2,committed:[]},state,'结算',cards)).toEqual([]);expect(state.sceneAgenda?.map(a=>a.cardId)).toEqual(['a','b']);
 const next=scheduleEchoScenes({day:4,committed:[]},state,'结算',[]);expect(next.map(c=>c.id)).toEqual(['a']);expect(state.sceneAgenda).toEqual([{cardId:'b',due:2,phase:'结算'}]);
 expect(scheduleEchoScenes({day:4,committed:[]},state,'日终',[scene('c')])).toEqual([]);
 expect(pendingSceneNotes(state)).toHaveLength(2);
});
it('uses late-game slots for actual due scenes and never offers one scene twice',()=>{
 const state:SceneAgendaState={published:{}},cards=['a','b','c','d'].map(scene);
 const offered=scheduleEchoScenes({day:12,committed:[]},state,'结算',cards);expect(offered).toHaveLength(3);expect(state.sceneAgenda?.map(a=>a.cardId)).toEqual(['d']);
 expect(scheduleEchoScenes({day:12,committed:[]},state,'结算',cards)).toEqual([]);
 expect(scheduleEchoScenes({day:13,committed:[]},state,'结算',[]).map(c=>c.id)).toEqual(['d']);
 expect(randomSceneSlots(8,'结算')).toBe(2);expect(randomSceneSlots(12,'结算')).toBe(3);expect(randomSceneSlots(12,'夜班')).toBe(1);
});
it('mandatory family-recording milestones do not consume the delayed-echo quota',()=>{
 const state:SceneAgendaState={published:{}},card={...scene('unrest'),sourceFollowup:{kind:'dispute',stage:1}};
 expect(scheduleEchoScenes({day:2,committed:[]},state,'查房',[card]).map(c=>c.id)).toEqual(['unrest']);
 expect(state.sceneAgenda).toEqual([]);
});
it('an accepted task can be delivered before D4 and cannot be crowded out by optional echoes',()=>{
 const state:SceneAgendaState={published:{}},card={...scene('promised-delivery'),butterflyCommitment:{chainStateId:'a',commitmentId:'b',phase:'交班'}};
 expect(scheduleEchoScenes({day:2,committed:[]},state,'交班',[scene('optional'),card]).map(c=>c.id)).toEqual(['promised-delivery']);
 expect(state.sceneAgenda?.map(a=>a.cardId)).toEqual(['optional']);
});
it('saves a queued scene with its original date and resumes the same queue after a reload',()=>{
 const r=startRun('scene-agenda-storage','程医生',[]);r.day=3;scheduleEchoScenes(r,r.authored!,'结算',[scene('a'),scene('b')]);
 const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();expect(restored.authored?.sceneAgenda).toEqual(r.authored?.sceneAgenda);
 restored.day=4;expect(scheduleEchoScenes(restored,restored.authored!,'结算',[]).map(c=>c.id)).toEqual(['a']);
 expect(restored.authored!.sceneAgenda?.[0]).toMatchObject({cardId:'b',due:3});
});
it('does not let a new morning arrival displace an older evening appointment',()=>{
 const old=scene('older-evening'),fresh=scene('new-morning');
 const state:SceneAgendaState={published:{[old.id]:old},sceneAgenda:[{cardId:old.id,due:6,phase:'结算'}]};
 expect(scheduleEchoScenes({day:7,committed:[]},state,'交班',[fresh])).toEqual([]);
 expect(state.echoDays?.[0].cardIds).toEqual([]);
 expect(state.sceneAgenda).toEqual([{cardId:old.id,due:6,phase:'结算'},{cardId:fresh.id,due:7,phase:'交班'}]);
 expect(scheduleEchoScenes({day:7,committed:[]},state,'结算',[]).map(c=>c.id)).toEqual([old.id]);
 expect(scheduleEchoScenes({day:8,committed:[]},state,'交班',[]).map(c=>c.id)).toEqual([fresh.id]);
});
it('retains phase capacity when the same stage is visited again',()=>{
 const state:SceneAgendaState={published:{}};
 expect(scheduleEchoScenes({day:12,committed:[]},state,'交班',[scene('morning-a'),scene('morning-b')])).toHaveLength(1);
 expect(scheduleEchoScenes({day:12,committed:[]},state,'交班',[])).toEqual([]);
 expect(scheduleEchoScenes({day:12,committed:[]},state,'结算',[scene('evening-a'),scene('evening-b')])).toHaveLength(2);
 expect(state.echoDays?.[0].cardIds).toHaveLength(3);
 expect(state.sceneAgenda).toEqual([{cardId:'morning-b',due:12,phase:'交班'}]);
});
it('a later-stage reservation does not suppress an obligatory delivery',()=>{
 const old=scene('reserved'),mandatory={...scene('accepted-delivery'),butterflyCommitment:{chainStateId:'a',commitmentId:'b',phase:'交班'}};
 const state:SceneAgendaState={published:{[old.id]:old},sceneAgenda:[{cardId:old.id,due:6,phase:'结算'}]};
 expect(scheduleEchoScenes({day:7,committed:[]},state,'交班',[scene('fresh'),mandatory]).map(c=>c.id)).toEqual([mandatory.id]);
 expect(scheduleEchoScenes({day:7,committed:[]},state,'结算',[]).map(c=>c.id)).toEqual([old.id]);
});
it('reservations keep their first due date and do not count as delivered after reload',()=>{
 const r=startRun('reserved-scene-storage','程医生',[]);r.day=7;
 const old=scene('reserved');
 r.authored!.published[old.id]=old;r.authored!.sceneAgenda=[{cardId:old.id,due:6,phase:'结算'}];
 expect(scheduleEchoScenes(r,r.authored!,'交班',[scene('fresh')])).toEqual([]);
 const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();
 expect(restored.committed).not.toContain(`${old.id}:reply`);
 expect(restored.authored!.echoDays?.find(d=>d.day===7)?.cardIds).not.toContain(old.id);
 expect(restored.authored!.sceneAgenda?.find(a=>a.cardId===old.id)?.due).toBe(6);
 expect(scheduleEchoScenes(restored,restored.authored!,'结算',[]).map(c=>c.id)).toEqual([old.id]);
 expect(scheduleEchoScenes(restored,restored.authored!,'结算',[])).toEqual([]);
});
