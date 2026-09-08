import { describe, expect, it, vi } from "vitest";
import { act, availableOptions, startRun } from "./engine";
import { createPatient } from "./cards";
import { CASES } from "./catalog";
import { decode, emptySave, encode, load, persist, storageRunIssues, SAVE_MAX_BYTES, SAVE_KEY, BACKUP_KEY, type Save } from "./storage";
import { runSimulation } from "../../scripts/simulate";
import { createEventLedger, startButterfly, eventToCard, EVENT_BY_ID } from '../content/events';
import { initialTalentMemory } from './talents';
import { getClinicalGraph, initialGraphState, advanceClinicalGraph } from '../content/clinical';
import { clinicalCard } from './clinical';
import type { Card } from './types';
import {buildAuthoredEvents}from './director';
import {runDie}from './run-random';
import {GUIDE_EVENTS,GUIDE_VERSION}from '../shared/guide-state';

const fresh = (): Save => ({ ...emptySave(), run: startRun("storage-shapes", "程医生", ["T06", "T16", "T11"]) });
describe('plain probability roll persistence',()=>{
 const pending=()=>{
  const r=startRun('chance-storage','程医生',['T22']);r.phase='play';r.cursor=0;
  r.queue=[{id:'chance-card',kind:'story',title:'是否收到回复',text:'等待回复。',scope:{kind:'personal',id:r.id},options:[{id:'chance-option',label:'发出询问',ap:1,minutes:1,cost:0,effects:{cash:100},result:'收到了回复。',chanceCheck:{successAtLeast:12},check:{skill:'observe',dc:12,failure:{},failureText:'暂未收到回复。'}}]}];
  delete r.pendingCheck;delete r.roll;delete r.feedback;return act(r,{type:'choose',id:'chance-option'});
 };
 it('roundtrips without talent critical effects or reroll consumption and charges once on acceptance',()=>{
  const r=pending();expect(r.phase).toBe('roll');expect(r.roll).toMatchObject({chance:true,modifier:0,critical:null,revision:0});
  const saved=decode(encode({...emptySave(),run:r})).run!;expect(saved).toEqual(r);expect(act(saved,{type:'reroll'})).toBe(saved);
  const before=saved.ap,after=act(saved,{type:'ack-roll'});expect(after.ap).toBe(before-1);expect(after.talentMemory?.rerollsUsed??0).toBe(saved.talentMemory?.rerollsUsed??0);expect(act(after,{type:'ack-roll'})).toBe(after);
 });
 it.each([['kind','day'],['modifier',1],['second',3],['advantage',true],['critical','success'],['revision',1],['chance','true'],['dc',0]] as const)('rejects damaged probability roll %s', (key,value)=>{
  const r=pending();(r.roll as unknown as Record<string,unknown>)[key]=value;expect(()=>decode(encode({...emptySave(),run:r}))).toThrow();
 });
 it('rejects a flipped probability outcome or threshold mismatch',()=>{
  const r=pending();r.roll!.success=!r.roll!.success;expect(()=>decode(encode({...emptySave(),run:r}))).toThrow();
  const next=pending();next.queue[0].options[0].chanceCheck!.successAtLeast=11;expect(()=>decode(encode({...emptySave(),run:next}))).toThrow();
 });
});
describe('journal operation provenance',()=>{
 it.each([['operation','invented-operation'],['operation',4],['clinicalChoice','missing-source-option'],['talentAction','fake-ability'],['talentAction',{}]] as const)('rejects malformed %s', (key,value)=>{
  const save=fresh(),r=save.run!,p=createPatient(r,'C003','journal');r.patients.push(p);
  const entry={id:'clinical-entry',day:r.day,title:'病历',choice:'核对',result:'已核对。',scope:{kind:'patient' as const,id:p.uid},flags:[],operation:'history' as const,clinicalChoice:'s1_meds'};
  (entry as unknown as Record<string,unknown>)[key]=value;r.journal.push(entry);expect(()=>decode(encode(save))).toThrow();
 });
 it('preserves a real clinical operation and accepts historical entries without new metadata',()=>{
  const save=fresh(),r=save.run!,p=createPatient(r,'C003','journal');r.patients.push(p);
  r.journal.push({id:'clinical-entry',day:r.day,title:'病历',choice:'核对',result:'已核对。',scope:{kind:'patient',id:p.uid},flags:[],operation:'history',clinicalChoice:'s1_meds'});
  expect(decode(encode(save))).toEqual(save);
 });
});
// Corrupt the payload before recomputing its checksum, so these tests exercise shape validation.
function corrupt(path: string, value: unknown): string {
  const save = fresh();
  const keys = path.split(".");
  let target: Record<string, unknown> = save as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys[keys.length - 1]] = value;
  return encode(save);
}

describe("import integrity", () => {
  it.each([
    ["run.patients.0.name", null], ["run.patients.0.bed", "5"], ["run.patients.0.bed", -1],
    ["run.patients.0.active", undefined], ["run.patients.0.inpatient", 1], ["run.patients.0.settled", "false"],
    ["run.patients.0.planned", null], ["run.patients.0.mitigated", undefined], ["run.patients.0.caredDay", "1"],
    ["run.patients.0.explainedDay", null], ["run.patients.0.readmitted", 1], ["run.patients.0.dischargedDay", "2"],
    ["run.patients.0.caseId", "missing"], ["run.patients.0.spent", Infinity],
    ["run.relations.chief", 6], ["run.relations.nurse", -1], ["run.relations.peer", "3"],
    ["run.nap", undefined], ["run.skipNextDay", "false"], ["run.difficulty", "unknown"],
    ["run.pendingResume", "ending"], ["run.day", 1.5], ["run.cursor", 0.5],
    ["run.talents", ["missing"]], ["run.debuffs", ["missing"]], ["run.offered", ["missing"]],
    ["run.facts", { known: {} }], ["run.facts", { known: { day: 1, sequence: "0", source: "chart" } }],
    ["run.queue.0.scope", { kind: "unknown", id: "x" }], ["run.queue.0.kind", "unknown"],
    ["run.queue.0.caseId", "missing"], ["run.queue.0.patientId", "missing"],
    ["run.queue.0.options.0.effects", { stamina: "5" }],
    ["run.queue.0.options.0.effects", { caps: { san: "5" } }],
    ["run.queue.0.options.0.effects", { relations: { missing: 2 } }],
    ["run.queue.0.options.0.effects", { hazards: [{ type: "R", weight: 1, causal: "false", norm: "n", reason: "r" }] }],
    ["run.queue.0.options.0.effects", { flags: [3] }],
    ["run.queue.0.options.0.effects", { discharge: "false" }],
    ["run.queue.0.options.0.when", { relation: ["missing", 2] }],
    ["run.queue.0.options.0.when", { all: "known" }],
    ["run.queue.0.options.0.check", { skill: "missing", dc: 10, failure: {}, failureText: "失败" }],
    ["run.queue.0.options.0.check", { skill: "observe", dc: 10, failure: { cash: "5" }, failureText: "失败" }],
    ["run.queue.0.options.0.check", { skill: "observe", dc: 10, failure: {} }],
    ["run.feedback", { title: "结果", text: "记录", changes: [], next: "unknown" }],
    ["run.journal", [{ id: "x", title: "t", choice: "c", result: "r", day: 1, flags: [], scope: {} }]],
    ["run.hazards", [{ type: "R", weight: 1, reason: "r", norm: "n", causal: true, day: 1, scope: { kind: "personal", id: "self" } }]],
    ["guide", { version: 1, enabled: true, seen: ["unknown"] }],
    ["guide", { version: 2, enabled: true, seen: [] }],
  ])("rejects malformed %s (%j)", (path, value) => {
    expect(() => decode(corrupt(path, value))).toThrow();
  });

  it.each([
    { x: "100", y: 100, facing: 0, day: 1 }, { x: 1600, y: 100, facing: 0, day: 1 },
    { x: 100, y: -1, facing: 0, day: 1 }, { x: 100, y: 100, facing: 4, day: 1 },
    { x: 100, y: 100, facing: 1.5, day: 1 }, { x: 100, y: 100, facing: 1, day: null },
  ])("rejects malformed world position %j", world => expect(() => decode(corrupt("run.world", world))).toThrow());

  it.each([{ face: 0 }, { face: 21 }, { face: 2.5 }, { modifier: null }, { success: "true" }, { label: null }, { second: 21 }, { kind: "unknown" }])("rejects malformed roll %j", change => {
    const roll = { id: "roll", kind: "choice", face: 12, modifier: 2, dc: 10, success: true, label: "观察", ...change };
    expect(() => decode(corrupt("run.roll", roll))).toThrow();
  });

  it("falls back to a verified backup after a shape-corrupt primary save", () => {
    const healthy = fresh();
    const entries = new Map([[SAVE_KEY, corrupt("run.patients.0.name", null)], [BACKUP_KEY, encode(healthy)]]);
    const recovered = load({ getItem: key => entries.get(key) ?? null });
    expect(recovered.save).toEqual(healthy);
    expect(recovered.warning).toContain("恢复");
  });
});

describe("healthy save compatibility", () => {
  it('saves and reloads progress after viewing the schedule and recovery guide, including every guide milestone',()=>{
    const save=fresh(),entries=new Map<string,string>();
    const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)};
    save.guide={version:GUIDE_VERSION,enabled:true,seen:[]};
    for(const event of GUIDE_EVENTS){
      save.guide.seen.push(event);
      expect(persist(save,storage),event).toBe('');
      expect(load(storage)).toEqual({save,warning:''});
      expect(decode(encode(save))).toEqual(save);
    }
  });
  it("accepts the prior save format without guide or world and preserves old beds", () => {
    const save = fresh();
    delete save.guide; delete save.run!.world;
    // HEAD's published Run schema predates authored state; world was already optional.
    delete save.run!.authored;
    save.run!.patients[0].bed = 17;
    expect(decode(encode(save))).toEqual(save);
    expect(save.run!.facts[`corridor-bed:${save.run!.patients[0].uid}`]).toBeUndefined();
  });
  it('does not pass a modern unapproved corridor bed by removing optional guide and world fields',()=>{
    const save=fresh();delete save.guide;delete save.run!.world;save.run!.patients[0].bed=17;
    expect(storageRunIssues(save.run!)).toContain('references');expect(()=>decode(encode(save))).toThrow();
  });
  it('preserves an imported old bed after the director first initializes without creating an E048 admission',()=>{
    const save=fresh();delete save.run!.authored;save.run!.patients[0].bed=17;
    const old=decode(encode(save)).run!,built=buildAuthoredEvents(old,'结算'),migrated={...old,...built.patch};
    expect(migrated.authored!.legacyBedNumbers).toContainEqual({patientId:old.patients[0].uid,bed:17,source:'schema-1-before-authored'});
    expect(migrated.facts[`corridor-bed:${old.patients[0].uid}`]).toBeUndefined();expect(storageRunIssues(migrated)).toEqual([]);
    const broken=structuredClone(migrated);broken.authored!.legacyBedNumbers![0].patientId='missing-patient';expect(storageRunIssues(broken)).toContain('references');
  });
  it("preserves valid guide, world, current inpatient C020 and legacy non-inpatient C020", () => {
    const save = fresh();
    save.guide = { version: 1, enabled: false, seen: ["welcome-seen", "bed-near"] };
    save.run!.world = { x: 720, y: 246, facing: 3, day: 1 };
    const p = createPatient(save.run!, "C020", "records");
    save.run!.patients.push(p);
    expect(p.inpatient).toBe(true);
    expect(decode(encode(save))).toEqual(save);
    p.inpatient=false;p.bed=0;
    expect(decode(encode(save))).toEqual(save);
  });
  it("accepts all catalog checks and effects in a valid patient's queue", () => {
    const save = fresh();
    save.run!.queue = CASES.flatMap(c => c.steps.map(step => ({ ...step, kind: "clinical" as const, scope: { kind: "personal" as const, id: "catalog" }, caseId: c.id })));
    expect(decode(encode(save))).toEqual(save);
  });
  it("preserves an actual chosen result and its next action", () => {
    const save = fresh();
    save.run = act(save.run!, { type: "choose", id: availableOptions(save.run!)[0].id });
    const restored = decode(encode(save));
    expect(restored).toEqual(save);
    const action = save.run.phase === "roll" ? { type: "ack-roll" as const } : { type: "continue" as const };
    expect(act(restored.run!, action)).toEqual(act(save.run, action));
  });
  it("accepts real complete runs including generated stories, facts, hazards and endings", () => {
    // Stable IDs make event scheduling repeatable during persistence regressions.
    const clock=vi.spyOn(Date,'now').mockReturnValue(1_800_000_000_000);
    try {
    for (const policy of ["random", "careful", "reckless"] as const) {
      const save = { ...emptySave(), run: runSimulation(`storage-${policy}`, policy).r };
      expect(storageRunIssues(save.run)).toEqual([]);
      expect(new TextEncoder().encode(encode(save)).byteLength).toBeLessThan(SAVE_MAX_BYTES);
      expect(decode(encode(save))).toEqual(save);
    }
    } finally {clock.mockRestore();}
    // A second zero now opens a dark chain and the run keeps playing, so these
    // three simulations reach day fourteen instead of stopping in the first week.
  },180000);
});

function authoredFixture():Save {
  const save=fresh(),r=save.run!,uid=r.patients[0].uid,extraId=`${r.id}:event-patient:E-005`;
  const chain=startButterfly('BTF-003',`${r.id}:record-chain`,{actorId:'li',patientId:uid,recordId:`${uid}:record`});
  chain.facts.push({id:'fact-1',type:'explanation_delivered',scope:{kind:'patient',id:uid},sourceChoiceId:'BTF-003:N01a',day:1,subjects:{...chain.subjects},knownBy:['player','li'],observations:[{actorId:'li',source:'BTF-003:N01a',day:1,channel:'present'}]});
  chain.commitments.push({id:'promise-1',type:'record_delivery_requested',actorId:'li',task:'递交原始记录',status:'accepted',due:3,source:'BTF-003:N04a'});
  const scope={kind:'patient' as const,id:extraId};
  r.authored={schema:1,seen:{'E-005':1},activeFacts:{'pending-review':{day:1,source:'E-005-a'}},scheduled:['1:交班'],ledger:createEventLedger(),chains:[chain],participants:[{id:extraId,name:'鲁长顺',age:71,sex:'男',bed:0,admitted:1,category:'普通门诊',history:'清早从县城到院。',active:true,charges:100,budget:1200,charged:0,sourceEvent:'E-005'}],actor:{liCash:500,liAwayDays:[4],zhouAwayDays:[9],liFalseStatementWilling:false,datasetHasProblem:true,sharedResearch:false},published:{},pressure:10,endNotes:[]};
  r.authored.ledger.pending.push({id:'pending-1',delay:1,due:2,phase:'日终',effects:{cash:-30},description:'随访费用',scope,probability:.5});
  r.authored.ledger.modifiers.push({id:'modifier-1',kind:'sleep',value:.7,days:2,description:'睡眠受影响',scope,starts:1,expires:2});
  r.authored.ledger.facts.push({id:'fact-2',source:'E-005-a',day:1,scope,knownBy:['player']});
  const card=eventToCard(EVENT_BY_ID['E-005'],{scope,patientId:extraId,patientName:'鲁长顺',bed:0,instanceId:`${r.id}:late-patient`,day:1,phase:'门诊',actorId:'li'});
  r.authored.published[card.id]=card;r.queue=[card];r.cursor=0;r.phase='play';delete r.pendingCheck;delete r.roll;delete r.feedback;
  r.talentMemory=initialTalentMemory();r.talentMemory.firstContacts=[uid];r.talentMemory.intuitionReady=[uid];r.talentMemory.chartClues={[uid]:['history-1']};r.talentMemory.gainedDay={B01:1};
  return save;
}
function modify(save:Save,path:string,value:unknown):Save {
  const copy=structuredClone(save);let target=copy as unknown as Record<string,unknown>;const keys=path.split('.');
  for(const key of keys.slice(0,-1))target=target[key] as Record<string,unknown>;target[keys.at(-1)!]=value;return copy;
}
describe('authored ledger, participants and butterfly integrity',()=>{
  it('preserves the real E176 audit project binding through queue, ledger and completed journal records',()=>{
    const save=fresh(),r=save.run!,projectId=`${r.id}:audit-project`,scope={kind:'project' as const,id:projectId};
    const card=eventToCard(EVENT_BY_ID['E-176'],{scope,projectId,instanceId:`${r.id}:event:E-176:3`,day:3,phase:'交班'});
    r.queue=[card];r.cursor=0;r.authored!.published[card.id]=card;
    r.journal.push({id:card.options[0].id,day:3,title:card.title,choice:card.options[0].label,result:card.options[0].result,scope,flags:[],operation:'other'});
    expect(storageRunIssues(r)).toEqual([]);expect(decode(encode(save))).toEqual(save);
    const wrong=structuredClone(save);wrong.run!.journal.at(-1)!.scope={kind:'project',id:'a-different-run:audit-project'};expect(()=>decode(encode(wrong))).toThrow();
  });
  it.each(['research-project','representative-account','audit-project','audit','prescription-review'])('registers the exact authored %s project without accepting arbitrary project IDs',suffix=>{
    const save=fresh(),r=save.run!;
    r.journal.push({id:'project-review',day:r.day,title:'核对材料',choice:'核对',result:'材料已记录。',scope:{kind:'project',id:`${r.id}:${suffix}`},flags:[],operation:'other'});
    expect(decode(encode(save))).toEqual(save);
    const wrong=structuredClone(save);wrong.run!.journal.at(-1)!.scope.id+= '-not-registered';expect(()=>decode(encode(wrong))).toThrow();
  });
  it('accepts registered event patients outside the inpatient/outpatient roster',()=>{
    const save=authoredFixture();expect(save.run!.patients.some(p=>p.uid===save.run!.queue[0].patientId)).toBe(false);
    expect(storageRunIssues(save.run)).toEqual([]);expect(decode(encode(save))).toEqual(save);
  });
  it('rejects a second event identity for someone already in the actual care roster',()=>{
    const save=authoredFixture(),r=save.run!;
    r.authored!.participants.push({...r.authored!.participants[0],id:r.patients[0].uid});
    expect(storageRunIssues(r)).toContain('references');expect(()=>decode(encode(save))).toThrow();
  });
  it.each([
    ['run.authored.schema',2],['run.authored.seen',[]],['run.authored.seen.E-005','1'],['run.authored.activeFacts.pending-review',{}],
    ['run.authored.scheduled',['1:交班','1:交班']],['run.authored.ledger',{}],['run.authored.ledger.commits',[1]],
    ['run.authored.ledger.pending.0.effects',{cash:'30'}],['run.authored.ledger.pending.0.delay','1'],['run.authored.ledger.pending.0.due',-1],
    ['run.authored.ledger.pending.0.phase','午夜'],['run.authored.ledger.pending.0.probability',1.1],['run.authored.ledger.pending.0.scope',{kind:'patient',id:'missing'}],
    ['run.authored.ledger.pending.0.requires',{}],['run.authored.ledger.pending.0.otherwiseEffects',{san:'5'}],['run.authored.ledger.pending.0.otherwiseDescription',5],
    ['run.authored.ledger.outcomes',{}],['run.authored.ledger.outcomes',[{eventId:'E-005',choiceId:'x',success:'false',scope:{kind:'personal',id:'self'},day:1}]],
    ['run.queue.0.options.0.failureTotal',{cash:'5'}],['run.queue.0.options.0.chanceCheck',{successAtLeast:21}],
    ['run.authored.ledger.modifiers.0.kind','invalid'],['run.authored.ledger.modifiers.0.expires',0],['run.authored.ledger.modifiers.0.factor','0.7'],
    ['run.authored.ledger.facts.0.knownBy',[true]],['run.authored.ledger.facts.0.scope',{kind:'project',id:'missing-project'}],
    ['run.authored.chains.0.chain','BTF-999'],['run.authored.chains.0.cursor','BTF-004:N01'],['run.authored.chains.0.status','finished'],
    ['run.authored.chains.0.subjects.patientId','missing'],['run.authored.chains.0.facts.0.subjects.actorId',null],
    ['run.authored.chains.0.facts.0.observations.0.channel','telepathy'],['run.authored.chains.0.facts.0.knownBy',{}],
    ['run.authored.chains.0.commitments.0.status','promised'],['run.authored.chains.0.commitments.0.due','3'],['run.authored.chains.0.receivable',-1],
    ['run.authored.participants.0.sourceEvent','E-999'],['run.authored.participants.0.category','random'],['run.authored.participants.0.charges','100'],
    ['run.authored.participants.0.active','true'],['run.authored.actor.liAwayDays',[null]],['run.authored.actor.sharedResearch','false'],
    ['run.authored.published',[]],['run.shiftPhase','morning'],
  ])('rejects corrupt %s', (path,value)=>expect(()=>decode(encode(modify(authoredFixture(),path,value)))).toThrow());
  it('rejects dangling event scope, mismatched binding and malformed nested option scheduling',()=>{
    const save=authoredFixture();
    expect(()=>decode(encode(modify(save,'run.authored.participants',[])))).toThrow();
    expect(()=>decode(encode(modify(save,'run.queue.0.eventBinding.scope',{kind:'patient',id:save.run!.patients[0].uid})))).toThrow();
    expect(()=>decode(encode(modify(save,'run.queue.0.options.0.deferred',[{id:'bad',delay:1,phase:'日终',effects:{cash:3},description:'延迟',probability:'0.5'}])))).toThrow();
    expect(()=>decode(encode(modify(save,'run.authored.ledger.applied',['pending-1'])))).toThrow();
  });
  it('does not replace a healthy browser save with malformed live state',()=>{
    const healthy=authoredFixture();const entries=new Map([[SAVE_KEY,encode(healthy)],[BACKUP_KEY,encode(fresh())]]);const before=new Map(entries);
    const broken=modify(healthy,'run.authored.ledger.pending.0.effects',{cash:'bad'});
    const message=persist(broken,{getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)});
    expect(message).toContain('未写入');expect(message).toContain('校验');expect(entries).toEqual(before);
  });
  it('reports a distinct message when the live state is valid but the browser write itself fails',()=>{
    const save=fresh();
    const message=persist(save,{getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError');}});
    expect(message).toContain('未写入');expect(message).not.toContain('校验');
  });
  it('clears once a later write with the same storage succeeds',()=>{
    const entries=new Map<string,string>();
    const storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>entries.set(k,v)};
    expect(persist(fresh(),storage)).toBe('');
  });
});

describe('talent counter integrity',()=>{
  it.each([
    ['run.talentMemory',{}],['run.talentMemory.day',16],['run.talentMemory.rerollsUsed',2],['run.talentMemory.fullReviewsUsed',6],
    ['run.talentMemory.survivalUsed','false'],['run.talentMemory.permanentStomach',0],['run.talentMemory.fullSleepNights',1.5],
    ['run.talentMemory.chartClues',[]],['run.talentMemory.gainedDay.B01','1'],['run.talentMemory.gainedDay.B99',1],
    ['run.talentMemory.intuitionReady',['missing']],['run.talentMemory.firstContacts',[]],['run.talentMemory.transferredPatients',['missing']],
    ['run.talentMemory.concealedPatients',{missing:1}],['run.talentMemory.delayedRecords',[{patientId:'missing',recordId:'x',dueDay:2}]],
    ['run.talentMemory.beautifiedProjects',['missing']],['run.talentMemory.processed',[{}]],['run.metaRerolls',2],
    ['meta.fourthSlot','true'],['meta.insight',-1],['meta.usedTalents',['T99']],['meta.seedHistory',[{runId:'old',caseId:'missing',trapId:'trap'}]],
    ['meta.entities',['P-999']],['meta.debuffs',['B99']],['meta.extraRedraws',6],['meta.extraRedraws',.5],['meta.depressionRank',3],['meta.depressionRank',-1],
  ])('rejects corrupt %s',(path,value)=>expect(()=>decode(encode(modify(authoredFixture(),path,value)))).toThrow());
  it('accepts old saves with no talent, authored, seed or pending-check fields unchanged',()=>{
    const save=fresh();const r=save.run!;delete r.authored;delete r.talentMemory;delete r.priorSeeds;delete r.archiveTraps;delete r.pendingCheck;delete r.metaRerolls;delete r.shiftPhase;
    r.queue=[{id:'legacy',title:'交班',text:'接班记录',kind:'story',scope:{kind:'personal',id:'self'},options:[{id:'read',label:'阅读',ap:0,minutes:0,cost:0,result:'已阅',effects:{}}]}];r.cursor=0;
    expect(decode(encode(save))).toEqual(save);expect(decode(encode(save)).run).not.toHaveProperty('talentMemory');
  });
  it('preserves fractional experience and bounded metaprogression fields',()=>{
    const save=fresh();Object.assign(save.meta,{xp:3.75,entities:['P-001'],debuffs:['B01'],extraRedraws:5,depressionRank:2});expect(decode(encode(save))).toEqual(save);
  });
});

function pendingFixture():Save {
  const save={...emptySave(),run:startRun('storage-reroll','程医生',['T22','T11','T06'])};const r=save.run;
  const card:Card={id:'persistent-check',kind:'story',title:'沟通',text:'同事等你回答。',scope:{kind:'personal',id:'self'},actor:'peer',options:[{id:'persistent-option',label:'解释当前安排',ap:2,minutes:7,cost:0,result:'这次沟通已经结束。',effects:{cash:100,san:-1},mechanics:{operation:'comfort',checkOperation:'comfort',actor:'peer',quality:'neutral'},check:{skill:'comfort',dc:14,failure:{emotion:-2},failureText:'对方暂时不能接受。'}}]};
  r.queue=[card];r.cursor=0;r.phase='play';r.ap=10;r.vitals={stamina:80,san:80,emotion:80};r.cash=20000;
  save.run=act(r,{type:'choose',id:card.options[0].id});return save;
}
describe('pending roll reload transaction',()=>{
  it('preserves settled day-end fees through reload, reroll and one acknowledgement',()=>{
    const save=fresh(),r=save.run!;r.talents=['T22','T11','T06'];r.cash=20000;r.debt=1000;r.vitals={stamina:80,san:80,emotion:80};r.queue=[];r.cursor=0;r.shiftPhase='日终';r.phase='feedback';r.feedback={title:'交班',text:'当班结束',changes:[],next:'check'};
    const pending=act(r,{type:'continue'});expect(pending.pendingCheck?.kind).toBe('day');expect(pending.phase).toBe('roll');
    const baseline={cash:pending.cash,debt:pending.debt,income:pending.income,interest:pending.interest,bills:pending.patients.map(p=>p.charged),journal:pending.journal.length};
    const restored=decode(encode({...save,run:pending})).run!;expect(restored).toEqual(pending);
    const rerolled=act(restored,{type:'reroll'});const resumed=decode(encode({...save,run:rerolled})).run!;
    const accepted=act(resumed,{type:'ack-roll'});expect(accepted).toEqual(act(rerolled,{type:'ack-roll'}));
    expect({cash:accepted.cash,debt:accepted.debt,income:accepted.income,interest:accepted.interest,bills:accepted.patients.map(p=>p.charged),journal:accepted.journal.length}).toEqual(baseline);
    expect(accepted.pendingCheck).toBeUndefined();expect(act(accepted,{type:'ack-roll'})).toBe(accepted);
  });
  it('preserves a non-rerollable blocked history check without turning a natural 20 into success',()=>{
    const save=pendingFixture(),r=save.run!;r.pendingCheck!.context.operation='history';r.roll={...r.roll!,face:20,success:false,critical:null,blockedReason:'无可靠病史来源。'};
    const restored=decode(encode(save)).run!;expect(act(restored,{type:'reroll'})).toBe(restored);expect(restored.roll?.success).toBe(false);
    expect(()=>decode(encode(modify(save,'run.roll.blockedReason',true)))).toThrow();
    expect(()=>decode(encode(modify(save,'run.roll.success',true)))).toThrow();
  });
  it('keeps a pending roll uncharged, reloads its exact dice and commits once after a daily reroll',()=>{
    const save=pendingFixture(),pending=save.run!;expect(pending.phase).toBe('roll');expect(pending.pendingCheck?.rerolls).toBe(0);expect(pending.ap).toBe(10);expect(pending.cash).toBe(20000);expect(pending.committed).not.toContain('persistent-option');
    const restored=decode(encode(save));expect(restored.run!.roll).toEqual(pending.roll);
    const rerolled=act(restored.run!,{type:'reroll'});expect(rerolled.pendingCheck?.rerolls).toBe(1);expect(rerolled.roll?.revision).toBe(1);expect(rerolled.talentMemory?.rerollsUsed).toBe(1);expect(rerolled.ap).toBe(10);expect(rerolled.cash).toBe(20000);
    const reloaded=decode(encode({...save,run:rerolled}));expect(reloaded.run!.roll).toEqual(rerolled.roll);expect(act(reloaded.run!,{type:'reroll'})).toBe(reloaded.run);
    const accepted=act(reloaded.run!,{type:'ack-roll'});expect(accepted).toEqual(act(rerolled,{type:'ack-roll'}));expect(accepted.committed.filter(id=>id==='persistent-option')).toHaveLength(1);
    expect(accepted.ap).toBe(8);expect(accepted.cash).toBe(20100);expect(accepted.pendingCheck).toBeUndefined();expect(act(accepted,{type:'ack-roll'})).toBe(accepted);
  });
  it.each([
    ['run.pendingCheck',{}],['run.pendingCheck.kind','tribunal'],['run.pendingCheck.day',2],['run.pendingCheck.cardId','missing'],['run.pendingCheck.optionId','missing'],
    ['run.pendingCheck.context.operation','diagnosis'],['run.pendingCheck.context.actor','narrator'],['run.pendingCheck.context.advantage','yes'],['run.pendingCheck.rerolls',1],
    ['run.roll.revision',.5],['run.roll.advantage','yes'],['run.roll.critical','ordinary'],['run.roll.critical','success'],['run.committed',['persistent-option']],
  ])('rejects inconsistent pending %s',(path,value)=>expect(()=>decode(encode(modify(pendingFixture(),path,value)))).toThrow());
});

describe('clinical subgraph and preset continuity',()=>{
  it('preserves a patient-owned clinical event resume point even after that patient advances',()=>{
    const save=fresh(),r=save.run!,p=createPatient(r,'C005','event-resume');r.patients.push(p);p.clinical=initialGraphState(getClinicalGraph('C005')!,'resume');
    const event=Object.assign(eventToCard(EVENT_BY_ID['E-013'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,patientName:p.name,bed:p.bed,instanceId:`${r.id}:event-resume`,day:1,phase:'查房'}),{clinicalResume:{patientId:p.uid,nodeId:'s1'}});
    r.queue=[event];r.cursor=0;r.phase='play';r.authored!.published[event.id]=event;expect(decode(encode(save))).toEqual(save);
    p.clinical=advanceClinicalGraph(getClinicalGraph('C005')!,p.clinical,'s1_redflags').state;expect(decode(encode(save))).toEqual(save);
    for(const value of [null,{}, {patientId:p.uid,nodeId:'o_good'},{patientId:p.uid,nodeId:'missing'}, {patientId:p.uid,nodeId:3}, {patientId:'missing',nodeId:'s1'}, {patientId:r.patients[0].uid,nodeId:'s1'}])expect(()=>decode(encode(modify(save,'run.queue.0.clinicalResume',value)))).toThrow();
    const invalidPublished=structuredClone(save);(invalidPublished.run!.authored!.published[event.id] as typeof event).clinicalResume.nodeId='missing';expect(()=>decode(encode(invalidPublished))).toThrow();
  });
  it('accepts only the matched preset patient’s own resume step',()=>{
    const save=fresh(),r=save.run!,p=r.patients.find(p=>p.preset)!;expect(p).toBeDefined();
    const event=Object.assign(eventToCard(EVENT_BY_ID['E-013'],{scope:{kind:'patient',id:p.uid},patientId:p.uid,patientName:p.name,bed:p.bed,instanceId:`${r.id}:preset-resume`,day:1,phase:'查房'}),{clinicalResume:{patientId:p.uid,nodeId:p.preset!.steps[0].id}});
    r.queue=[event];r.cursor=0;r.phase='play';expect(decode(encode(save))).toEqual(save);
    for(const nodeId of ['END','s1','missing'])expect(()=>decode(encode(modify(save,'run.queue.0.clinicalResume.nodeId',nodeId)))).toThrow();
  });
  it('does not invent a clinical resume graph for an event-only participant',()=>{
    const save=authoredFixture(),r=save.run!;Object.assign(r.queue[0],{clinicalResume:{patientId:r.queue[0].patientId,nodeId:'s1'}});
    expect(()=>decode(encode(save))).toThrow();
  });
  it('preserves resolved consultation waiting minutes and rejects impossible durations',()=>{
    const save=fresh(),o=save.run!.queue[0].options[0];o.minutes=50;o.mechanics={operation:'consult',consultWaitMinutes:40};
    expect(decode(encode(save))).toEqual(save);
    for(const value of [-1,51,Infinity,NaN,'40'])expect(()=>decode(encode(modify(save,'run.queue.0.options.0.mechanics.consultWaitMinutes',value)))).toThrow();
  });
  it('round-trips the C005 interruption stack and resumes the correct original branch',()=>{
    const save=fresh(),r=save.run!,p=createPatient(r,'C005','resume');r.patients.push(p);const g=getClinicalGraph('C005')!;
    p.clinical=advanceClinicalGraph(g,initialGraphState(g,'resume'),'s1_migraine').state;r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';
    expect(r.queue[0].options[0].automatic).toBe(true);expect(p.clinical.resumeNodes?.[0].nodeId).toBe('s5');
    const decoded=decode(encode(save));const cp=decoded.run!.patients.find(q=>q.uid===p.uid)!;expect(advanceClinicalGraph(g,cp.clinical!,'s1_bag_notice',false).state.nodeId).toBe('s5');
    expect(()=>decode(encode(modify(save,`run.patients.${r.patients.length-1}.clinical.resumeNodes`,[{nodeId:'missing',preserveSelected:true}])))).toThrow();
    expect(()=>decode(encode(modify(save,'run.queue.0.options.0.automatic','yes')))).toThrow();
    expect(()=>decode(encode(modify(save,'run.queue.0.options.0.mechanics',{operation:'exam',checkOperation:'imaginary',actor:'patient',quality:'correct'})))).toThrow();
  });
  it('rejects unknown graph choices, counters, variants and mismatched graph identity',()=>{
    const save=fresh(),r=save.run!,p=createPatient(r,'C005','shape');r.patients.push(p);p.clinical=initialGraphState(getClinicalGraph('C005')!,'shape');const index=r.patients.length-1;
    for(const [key,value] of [['choices',['missing']],['variants',['missing']],['attempts',{s1_meds:2}],['selected',{s1:['s2_fundus']}],['outcomeId','o_good'],['resumeNodes',[{nodeId:'s1',preserveSelected:'true'}]]] as const)expect(()=>decode(encode(modify(save,`run.patients.${index}.clinical.${key}`,value)))).toThrow();
    expect(()=>decode(encode(modify(save,`run.patients.${index}.caseId`,'C004')))).toThrow();
  });
  it('rejects corrupt preset identity, entity, period, node and transition references',()=>{
    const save=fresh();const index=save.run!.patients.findIndex(p=>p.preset);expect(index).toBeGreaterThanOrEqual(0);const root=`run.patients.${index}`;
    for(const [key,value] of [['preset.entityId','missing'],['preset.presetId','missing'],['preset.period','清晨'],['preset.age',999],['presetNode','missing'],['preset.steps.0.options.0.next','missing'],['preset.steps.0.options.0.id','foreign-option'],['preset.steps.0.options.0.mechanics',{operation:'imaginary'}]] as const)expect(()=>decode(encode(modify(save,`${root}.${key}`,value)))).toThrow();
  });
});

function beforeDayEnd():Save {
  const save={...emptySave(),run:startRun('emergency-storage','程医生',['T22','T16','T06'])},r=save.run;
  r.cash=20000;r.debt=1000;r.vitals={stamina:80,san:80,emotion:80};r.queue=[];r.cursor=0;r.shiftPhase='日终';r.phase='feedback';r.feedback={title:'交班',text:'当班结束',changes:[],next:'check'};
  return save;
}
function acuteFixture():Save {
  const save=beforeDayEnd(),r=save.run!;r.vitals.stamina=0;
  save.run=act(r,{type:'continue'});return save;
}
describe('acute event suspended transaction persistence',()=>{
  it('interrupts before day-end fees, then settles them once after care and reload',()=>{
    const save=acuteFixture(),acute=save.run!,resume=structuredClone(acute.emergency!.resume);
    expect(acute.emergency?.vital).toBe('stamina');expect(acute.emergency?.resolved).toBe(false);expect(acute.pendingCheck).toBeUndefined();
    const restored=decode(encode(save)).run!;expect(restored.emergency?.resume).toEqual(resume);
    const option=availableOptions(restored).find(o=>o.id.endsWith('E-199-a'))!;expect(option).toBeDefined();
    const cared=act(restored,{type:'choose',id:option.id});expect(cared.phase).toBe('feedback');expect(cared.emergency?.resolved).toBe(true);
    expect(cared).toEqual(act(acute,{type:'choose',id:option.id}));expect(cared.cash).toBe(acute.cash-300);
    const reread=decode(encode({...save,run:cared})).run!,returned=act(reread,{type:'continue'});
    expect(resume.roll).toBeUndefined();expect(resume.pendingCheck).toBeUndefined();
    expect(acute.facts['day-ledger-settled:1']).toBeUndefined();
    expect(returned.emergency).toBeUndefined();expect(returned.phase).toBe('roll');
    expect(returned.pendingCheck).toMatchObject({kind:'day',day:1});expect(returned.facts['day-ledger-settled:1']).toBeDefined();
    const ordinary=act(beforeDayEnd().run!,{type:'continue'});
    expect(returned.cash).toBe(ordinary.cash-300);expect(returned.debt).toBe(ordinary.debt);
    expect(returned.roll?.face).toBe(ordinary.roll?.face);
    const pending=decode(encode({...save,run:returned})).run!;const accepted=act(pending,{type:'ack-roll'});
    expect(accepted.cash).toBe(returned.cash);expect(accepted.pendingCheck).toBeUndefined();expect(act(accepted,{type:'ack-roll'})).toBe(accepted);
  });
  it('preserves an already rolled and paid day when its real end-of-day pressure causes SAN zero',()=>{
    const save=beforeDayEnd(),r=save.run!;r.day=4;r.vitals.san=1;
    let acute=act(r,{type:'continue'});
    expect(acute.emergency?.vital).toBe('san');expect(acute.facts['day-ledger-settled:4']).toBeDefined();
    const resume=structuredClone(acute.emergency!.resume);
    expect(resume.pendingCheck?.kind).toBe('day');expect(resume.roll?.kind).toBe('day');
    const option=availableOptions(acute).find(o=>o.id.endsWith('E-200-b'))!;
    // Boundary-only selection of a successful rescue die; the suspended daily
    // die is an already committed real transaction and must remain unchanged.
    for(let i=0;i<1000;i++){acute.seed=`paid-rescue-${i}`;if(runDie(acute,`check:${option.id}`)===20)break;}
    acute=decode(encode({...save,run:acute})).run!;
    const rolled=act(acute,{type:'choose',id:option.id});expect(rolled.roll?.success).toBe(true);
    const cared=act(rolled,{type:'ack-roll'});expect(cared.emergency?.resolved).toBe(true);
    const returned=act(decode(encode({...save,run:cared})).run!,{type:'continue'});
    expect(returned.emergency).toBeUndefined();expect(returned.phase).toBe('roll');
    expect(returned.roll).toEqual(resume.roll);expect(returned.pendingCheck).toEqual(resume.pendingCheck);
    expect(returned.cash).toBe(cared.cash);expect(returned.debt).toBe(cared.debt);
    expect(returned.journal).toEqual(cared.journal);
  });
  it.each([
    ['run.emergency',{}],['run.emergency.cardId','missing'],['run.emergency.vital','health'],['run.emergency.resolved','false'],
    ['run.emergency.resume',{}],['run.emergency.resume.phase','ending'],['run.emergency.resume.roll.face',21],
    ['run.emergency.resume.pendingCheck.day',2],['run.emergency.resume.pendingCheck.context',{}],['run.emergency.resume.pendingCheck.rerolls',1],
    ['run.emergency.resume.feedback.changes',[1]],['run.emergency.resume.feedback.next','unknown'],
  ])('rejects corrupt suspended %s',(path,value)=>expect(()=>decode(encode(modify(acuteFixture(),path,value)))).toThrow());
  it('rejects corrupted saved entity profiles and revisit linkage',()=>{
    const save=fresh(),r=save.run!,p=r.patients.find(p=>p.preset)!,index=r.patients.indexOf(p);expect(p).toBeDefined();
    expect(()=>decode(encode(modify(save,`run.patients.${index}.preset.entityProfile`,{})))).toThrow();
    expect(()=>decode(encode(modify(save,`run.patients.${index}.preset.revisit`,{previousPatientId:'missing',priorGood:true,nonAdherent:false})))).toThrow();
    expect(()=>decode(encode(modify(save,`run.patients.${index}.preset.revisit`,{previousPatientId:p.uid,priorGood:true,nonAdherent:false})))).toThrow();
  });
});
