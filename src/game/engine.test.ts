import { describe, expect, it } from 'vitest';
import { act, availableOptions, newMeta, publicState, reward, startRun, upgrade } from './engine';
import { assignBed, awaitingBed, buildDay, createPatient, makeWardCard, nextFreeBed } from './cards';
import { RULES } from './rules';
import { CASES } from './catalog';
import { tribunalEnding } from './endings';
import { decode, emptySave, encode, load, persist, SAVE_KEY, BACKUP_KEY } from './storage';
import { die, random } from './random';
import { conditionMet } from './stories';
import { runSimulation } from '../../scripts/simulate';
import type { Card, Run } from './types';
const fresh = () => startRun('fixed-test', '程医生', ['T06', 'T16', 'T11']);
const rest = (r: Run): Run => { r.phase = 'play'; r.shiftPhase='日终';r.queue = [{ id: 'test-rest', kind: 'rest', scope: { kind: 'personal', id: 'self' }, title: '睡觉', text: '睡觉', options: [{ id: 'sleep', label: '睡觉', ap: 0, cost: 0, minutes: 0, result: '醒来', effects: { emotion: 10 } }] }]; r.cursor = 0; return r; };
function cycleDay(r: Run): Run {
  r = act(rest(r), { type: 'choose', id: 'sleep' }); r = act(r, { type: 'continue' });
  if (r.phase === 'roll') r = act(r, { type: 'ack-roll' });
  while (r.phase === 'debuff') r = act(r, { type: 'debuff', id: r.offered[0] });
  if (r.phase === 'feedback') r = act(r, { type: 'continue' }); return r;
}
describe('deterministic choices and rolls', () => {
  it('uses an independent key for each roll', () => { const n = die('seed', 'target'); for (let i = 0; i < 100; i++) die('seed', `unrelated:${i}`); expect(die('seed', 'target')).toBe(n); });
  it('covers all twenty faces', () => { expect(new Set(Array.from({ length: 1000 }, (_, i) => die(`s${i}`, 'd'))).size).toBe(20); });
  it('commits a choice exactly once without mutating the prior snapshot', () => { const r = fresh(), original = JSON.stringify(r), id = availableOptions(r)[0].id; const next = act(r, { type: 'choose', id }); expect(JSON.stringify(r)).toBe(original); expect(next.committed).toEqual([id]); expect(act(next, { type: 'choose', id })).toBe(next); });
  it('ignores invalid and out-of-phase commands', () => { const r = fresh(); expect(act(r, { type: 'choose', id: 'missing' })).toBe(r); expect(act(r, { type: 'testify', response: 'admit' })).toBe(r); expect(act(r, { type: 'fund', method: 'credit' })).toBe(r); });
  it('same game data yields same result after reload', () => { const r = fresh(), o = availableOptions(r)[0]; const recovered = decode(encode({ ...emptySave(), run: r })).run!; expect(act(r, { type: 'choose', id: o.id })).toEqual(act(recovered, { type: 'choose', id: o.id })); });
  it('does not expose future results or hidden hazards in the playing projection', () => { const r = fresh(); const x = publicState(r); expect(x).not.toHaveProperty('hazards'); expect(JSON.stringify(x.card)).not.toContain('"result"'); expect(JSON.stringify(x.card)).not.toContain('"failure"'); });
});
describe('resources and provenance', () => {
  it('charges AP overdraw to stamina and all caps', () => { const r = fresh(); r.ap = 0; const o = availableOptions(r).find(o => o.ap === 1)!; delete o.check; const next = act(r, { type: 'choose', id: o.id }); expect(next.caps.san).toBe(r.caps.san - RULES.overtimeCapLoss); expect(next.ap).toBe(0); expect(next.overtime).toBe(1); });
  it('borrowing is limited and unavailable on day fourteen', () => { let r = fresh(); for (let i = 0; i < 4; i++) { r = act(r, { type: 'borrow' }); r = act(r, { type: 'continue' }); } expect(r.borrowed).toBe(4); expect(act(r, { type: 'borrow' })).toBe(r); r.day = 14; r.borrowed = 0; expect(act(r, { type: 'borrow' })).toBe(r); });
  it('salary repays credit before increasing cash', () => { let r = rest(fresh()); r.patients = []; r.day = 7; r.cash = 1000; r.debt = 2000; r = act(r, { type: 'choose', id: 'sleep' }); r = act(r, { type: 'continue' }); expect(r.debt).toBe(0); expect(r.income).toBe(2100); expect(r.cash).toBeGreaterThanOrEqual(1000); });
  it('two uncovered interest days trigger the debt ending', () => { let r = fresh(); r.cash = 20000; r.debt = 10000; r.uncoveredDays = 1; r = act(rest(r), { type: 'choose', id: 'sleep' }); r = act(r, { type: 'continue' }); expect(r.ending?.id).toBe('X28'); });
  it('income is not invented from a private loan', () => { let r = fresh(); r.cash = -1000; r.phase = 'funding'; r = act(r, { type: 'fund', method: 'credit' }); expect(r.debt).toBe(1000); expect(r.income).toBe(0); expect(r.cash).toBe(0); });
  it('family emergency funding can only be used once', () => { let r = fresh(); r.cash = -6000; r.phase = 'funding'; r = act(r, { type: 'fund', method: 'family' }); expect(r.cash).toBe(-1000); expect(act(r, { type: 'fund', method: 'family' })).toBe(r); });
  it('refunds an approved budget exception only once', () => {
    let r = fresh(); const p = r.patients[0]; p.spent = 1200; p.budget = 1000; p.charged = 200;
    const card: Card = { id: 'refund', kind: 'ward', scope: { kind: 'patient', id: p.uid }, patientId: p.uid, title: '申诉', text: '', options: [{ id: 'refund-a', label: '提交', ap: 0, cost: 0, minutes: 0, result: '批准', effects: { bill: -300 } }] };
    r.queue = [card]; r.cursor = 0; const prior = r.cash; r = act(r, { type: 'choose', id: 'refund-a' }); expect(r.cash).toBe(prior + 200); expect(r.patients[0].charged).toBe(0); expect(act(r, { type: 'choose', id: 'refund-a' })).toBe(r);
  });
  it('checks known facts, not adjacent names or unrelated patients', () => { expect(conditionMet({ 'helped:a': {} }, { all: ['helped:b'] })).toBe(false); expect(conditionMet({ 'helped:a': {} }, { all: ['helped:a'], none: ['consumed:a'] })).toBe(true); });
});
describe('early discharge and distinct endpoints', () => {
  it('after completed care, risk remains visible until clinical stability is established', () => {
    const r=fresh(),p=r.patients.find(p=>p.uid.includes('census'))!;
    expect(p.settled).toBe(true);expect(p.presetNode).toBeUndefined();p.stability=0;
    expect(makeWardCard(r,p).options.find(o=>o.effects.discharge)?.effects.plannedDischarge).not.toBe(true);
    p.stability=2;expect(makeWardCard(r,p).options.find(o=>o.effects.discharge)?.effects.plannedDischarge).toBe(true);
  });
  it('premature discharge returns the same patient, not a new random case', () => {
    let r = fresh(); r.seed = Array.from({ length: 100 }, (_, i) => `return-${i}`).find(seed => random(seed, `return:${r.patients[0].uid}`) < .8)!;
    const p = r.patients[0]; p.stability = 0; const c = makeWardCard(r, p); r.queue = [c]; r.cursor = 0;
    const id = c.options.find(o => o.effects.discharge)!.id; r = act(r, { type: 'choose', id }); r = cycleDay(r);
    const returned = r.patients.find(x => x.uid === p.uid)!; expect(returned.readmitted).toBe(true); expect(returned.damage).toBe(2); expect(r.hazards.some(h => h.scope.id === p.uid && h.type === 'R')).toBe(true); expect(r.queue.some(x => x.id === `return:${p.uid}`)).toBe(true);
  });
  it('past injury requires completed follow-up but is not erased by a safe discharge', () => {
    const r=fresh(),p=r.patients.find(p=>p.uid.includes('census'))!;p.damage=2;p.stability=3;
    expect(makeWardCard(r,p).options.find(o=>o.effects.discharge)?.effects.plannedDischarge).not.toBe(true);
    p.mitigated=2;
    expect(makeWardCard(r,p).options.find(o=>o.effects.discharge)?.effects.plannedDischarge).toBe(true);
    expect(p.damage).toBe(2);
  });
  it('mental and physical exhaustion open different real acute scenes before any ending', () => {
    const results = (['san','stamina'] as const).map(vital=>{
      let r=rest(fresh());r.vitals[vital]=0;r=act(r,{type:'choose',id:'sleep'});
      expect(r.phase).toBe('play');expect(r.ending).toBeUndefined();expect(r.emergency?.vital).toBe(vital);
      expect(availableOptions(r).length).toBeGreaterThan(1);return r.queue[r.cursor].id;
    });
    expect(results[0]).not.toBe(results[1]);
  });
  it('project records alone cannot manufacture a clinical criminal case', () => { const r = fresh(); r.facts['paper-submitted-false'] = { day: 8, source: 'paper', sequence: 0 }; r.hazards.push({ id: 'project', type: 'D', weight: 100, reason: '不实研究', norm: '真实性', causal: false, day: 8, scope: { kind: 'project', id: 'study' }, choiceId: 'paper', choice: '提交' }); expect(tribunalEnding(r, 'facts').category).toBe('行政'); expect(r.patients.every(p => p.damage === 0)).toBe(true); });
  it('emotion leave cannot be used for borrowing', () => { let r = fresh(); r.facts[`leave:${r.day}`] = { day: r.day, source: 'leave', sequence: 0 }; expect(act(r, { type: 'borrow' })).toBe(r); });
});
describe('persistence and growth', () => {
  it('detects a damaged save and reads the validated backup', () => { const old = { ...emptySave(), run: fresh() }, store = new Map([[SAVE_KEY, 'broken'], [BACKUP_KEY, encode(old)]]); const loaded = load({ getItem: k => store.get(k) ?? null }); expect(loaded.save.run).toEqual(old.run); expect(loaded.warning).toBeTruthy(); });
  it('reports quota errors without losing the live state', () => { expect(persist(emptySave(), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toContain('未写入'); });
  it('rejects checksum corruption and invalid shapes', () => { const text = encode(emptySave()); expect(() => decode(text.replace('checksum', 'invalid'))).toThrow(); expect(() => decode('{}')).toThrow(); });
  it('rewards an ended run only once', () => { const r = fresh(); r.day = 15; r.ending = tribunalEnding(r, 'facts'); r.phase = 'ending'; const one = reward(newMeta(), r); expect(one.xp).toBeGreaterThan(0); expect(reward(one, r)).toBe(one); });
  it('permanent growth has prices and caps', () => { let m = newMeta(); m.xp = 100; for (let i = 0; i < 5; i++) m = upgrade(m, 'skill', 'clinical'); expect(m.skills.clinical).toBe(3); expect(m.xp).toBe(91); expect(startRun('x', '', [], m).skills.clinical).toBe(3); });
});
describe('whole-run state machine', () => {
  it.each(Array.from({length:10},(_,i)=>(['random','careful','reckless'] as const).map(policy=>[i,policy] as const)).flat())('finishes seed %i with %s strategy without hangs or duplicate commits', async (i,policy) => {
    const {r,steps}=runSimulation(`test-${i}`,policy);
    expect(r.phase).toBe('ending');expect(steps).toBeLessThan(2400);
    expect(new Set(r.committed).size).toBe(r.committed.length);
    for(const value of [...Object.values(r.vitals),r.cash,r.debt])expect(Number.isFinite(value)).toBe(true);
    await new Promise(resolve=>setTimeout(resolve,0));
  },60000);
});

describe('twelve-bed census and safe handover', () => {
  it('starts a new run with one focus patient and five real ongoing patients', () => {
    const r = fresh();
    expect(r.patients).toHaveLength(6);
    expect(r.queue.filter(c => c.kind === 'clinical')).toHaveLength(1);
    expect(r.queue.find(c=>c.kind==='clinical')?.clinicalGraph).toBeDefined();
    const ongoing = r.patients.filter(p => p.uid.includes('census'));
    expect(ongoing).toHaveLength(RULES.ward.initialCensus);
    expect(ongoing.map(p => p.stability)).toEqual([2, 2, 1, 1, 1]);
    for (const p of ongoing) {
      expect(p.inpatient).toBe(true);
      expect(r.day - p.admitted + 1).toBe(2);
      expect(p.patience).toBe(80);
      expect(r.queue.some(c => c.kind === 'ward' && c.patientId === p.uid)).toBe(true);
    }
    expect(new Set(r.patients.map(p => p.name)).size).toBe(r.patients.length);
  });
  it('loads existing progress unchanged and never adds a retroactive first-day census', () => {
    const r = fresh(); r.patients = [r.patients[0]]; r.queue = r.queue.filter(c => c.patientId === r.patients[0].uid);
    r.patients[0].stability = 2; r.patients[0].spent = 1234;
    const loaded = decode(encode({ ...emptySave(), run: r })).run!;
    expect(loaded).toEqual(r);
    loaded.day = 2; const original = structuredClone(loaded.patients[0]); buildDay(loaded);
    expect(loaded.patients[0]).toEqual(original);
    expect(loaded.patients.some(p => p.uid.includes('census'))).toBe(false);
  });
  it('creates the scheduled new handovers without losing daily follow-ups', () => {
    const r = fresh(); r.day = 9;
    const previous = r.patients.filter(p => p.inpatient);
    const cards = buildDay(r);
    expect(r.patients.filter(p => p.uid.startsWith('D9-') && p.uid.includes('handover'))).toHaveLength(RULES.ward.arrivals[8]);
    for (const p of previous) {
      const pending=cards.find(c=>c.patientId===p.uid&&(c.kind==='ward'||c.kind==='clinical'));
      expect(pending,p.uid).toBeDefined();
      if(p.clinical&&!p.clinical.outcomeId)expect(pending!.clinicalGraph?.nodeId).toBe(p.clinical.nodeId);
      else expect(pending!.kind).toBe('ward');
    }
    expect(new Set(r.patients.map(p => p.name)).size).toBe(r.patients.length);
  });
  function fullWard() {
    const r = fresh(); r.patients = [];
    for (let i = 0; i < RULES.ward.capacity; i++) r.patients.push(createPatient(r, 'C015', `bed${i}`));
    return r;
  }
  it('allocates exactly beds 5–16 and gives overflow its own observation plan', () => {
    const r = fullWard();
    expect(r.patients.map(p => p.bed)).toEqual(Array.from({ length: 12 }, (_, i) => i + 5));
    expect(nextFreeBed(r)).toBe(0);
    const p = createPatient(r, 'C015', 'overflow'); r.patients.push(p);
    expect(p.bed).toBe(0); expect(p.inpatient).toBe(false); expect(awaitingBed(r, p)).toBe(true);
    const card = makeWardCard(r, p);
    expect(card.text).toContain('满床');
    expect(card.options.some(o => o.id.endsWith(':transfer'))).toBe(true);
    expect(card.options.some(o => o.effects.care && !o.effects.discharge)).toBe(true);
  });
  it('discharge releases a bed and the next admission can reuse it', () => {
    let r = fullWard(); const p = r.patients[4]; p.stability = 2;p.settled=true; // Completed-care boundary fixture.
    const card = makeWardCard(r, p); r.queue = [card]; r.cursor = 0;
    r = act(r, { type: 'choose', id: card.options.find(o => o.effects.plannedDischarge)!.id });
    expect(r.patients[4].bed).toBe(0); expect(r.patients[4].active).toBe(false);
    const next = createPatient(r, 'C015', 'replacement'); expect(next.bed).toBe(9);
  });
  it('death releases a bed even on a non-final ward card', () => {
    let r = fullWard(); const p = r.patients[2];
    r.queue = [{ ...makeWardCard(r, p), options: [{ id: 'documented-death', label: '记录死亡', ap: 0, minutes: 0, cost: 0, result: '已记录死亡。', effects: { damage: 3 } }] }]; r.cursor = 0;
    r = act(r, { type: 'choose', id: 'documented-death' });
    expect(r.patients[2].active).toBe(false); expect(nextFreeBed(r)).toBe(7);
  });
  it('a returning patient cannot take an occupied former bed', () => {
    const r = fullWard(), p = createPatient(r, 'C015', 'returning');
    p.bed = 5; p.inpatient = false; r.patients.push(p);
    assignBed(r, p);
    expect(p.bed).toBe(0); expect(awaitingBed(r, p)).toBe(true);
    r.patients[7].active = false;
    assignBed(r, p); expect(p.bed).toBe(12); expect(awaitingBed(r, p)).toBe(false);
    expect(new Set(r.patients.filter(p => p.active && p.inpatient).map(p => p.bed)).size).toBe(12);
  });
  it('the actual next-day return flow keeps a full ward free of duplicate beds', () => {
    let r = fullWard(); const p = r.patients[0];
    p.stability = 0;
    const card = makeWardCard(r,p);r.queue=[card];r.cursor=0;
    r=act(r,{type:'choose',id:card.options.find(o=>o.effects.discharge)!.id});
    expect(r.patients[0]).toMatchObject({active:false,bed:0,dischargedDay:1,planned:false});
    r.patients.push(createPatient(r, 'C015', 'replacement'));
    r.seed = Array.from({ length: 100 }, (_, i) => `full-return-${i}`).find(seed => random(seed, `return:${p.uid}`) < RULES.ward.earlyReturnChance)!;
    r = cycleDay(r);
    const returned = r.patients.find(x => x.uid === p.uid)!;
    expect(returned.readmitted).toBe(true); expect(returned.bed).toBe(0);
    expect(awaitingBed(r, returned)).toBe(true);
    const occupied = r.patients.filter(x => x.active && x.inpatient);
    expect(occupied).toHaveLength(12); expect(new Set(occupied.map(x => x.bed)).size).toBe(12);
    expect(r.queue.find(c => c.id === `return:${p.uid}`)?.text).toContain('观察区');
  });
  it('charges and updates patience for both beds and observation patients', () => {
    let r = fullWard(); const p = createPatient(r, 'C015', 'overflow'); r.patients.push(p);
    const before = p.spent; r = act(rest(r), { type: 'choose', id: 'sleep' }); r = act(r, { type: 'continue' });
    const after = r.patients.find(x => x.uid === p.uid)!;
    expect(after.spent - before).toBe(RULES.ward.observationDailyCost);
    expect(after.patience).toBe(RULES.ward.initialPatience - RULES.ward.patienceDaily);
  });
});

describe('clinical departures and historical severity', () => {
  function clinical(caseId: string) {
    const r=fresh(), p=r.patients[0], c=CASES.find(c=>c.id===caseId)!;
    p.caseId=caseId; p.damage=0; p.active=true; p.inpatient=true; p.settled=false;
    r.queue=c.steps.map((s,i)=>({...structuredClone(s),kind:'clinical' as const,patientId:p.uid,scope:{kind:'patient' as const,id:p.uid},last:i===c.steps.length-1}));
    r.cursor=0; return r;
  }
  it('records a clinical departure, releases the bed, and allows the later phone call', () => {
    let r=clinical('C014');r.cursor=2;
    r=act(r,{type:'choose',id:'C014-s3-c'});
    expect(r.patients[0]).toMatchObject({active:false,bed:0,dischargedDay:1,damage:2});
    r=act(r,{type:'continue'});
    expect(availableOptions(r).some(o=>o.id==='C014-s4-b')).toBe(true);
    const before=r.patients[0].spent;
    r=act(r,{type:'choose',id:'C014-s4-b'});
    expect(r.patients[0].active).toBe(false);expect(r.patients[0].spent).toBe(before);
  });
  it('normalizes a yet-unselected departure option from an old saved queue', () => {
    let r=clinical('C013');r.cursor=2;delete r.queue[2].options[2].effects.discharge;
    const original=JSON.stringify(r);
    expect(availableOptions(r).find(o=>o.id==='C013-s3-c')?.effects.discharge).toBe(true);
    expect(JSON.stringify(r)).toBe(original);
    r=act(r,{type:'choose',id:'C013-s3-c'});expect(r.patients[0].active).toBe(false);
  });
  it('never erases established harm with a later rescue or mitigation', () => {
    for(const damage of [1,2]) {
      let r=clinical('C003');r.cursor=3;r.patients[0].damage=damage;
      const before=r.income;r=act(r,{type:'choose',id:'C003-s4-a'});
      expect(r.patients[0].damage).toBe(damage);expect(r.patients[0].mitigated).toBe(1);
      expect(r.income).toBe(before+(damage===1?RULES.performance.ordinary:0));
    }
  });
  it('night and ward mitigation preserve severe harm and its causal evidence', () => {
    for (const kind of ['night','ward'] as const) {
      let r=clinical('C017'); const p=r.patients[0]; p.damage=2; p.settled=true;
      r.hazards=[{id:'injury',type:'R',weight:55,reason:'已记录的原处置',norm:'保留事实',causal:true,day:1,scope:{kind:'patient',id:p.uid},choiceId:'original',choice:'原处置'}];
      r.queue=[{...r.queue[0],kind,options:[{id:'support',label:'救治并交接',ap:0,cost:0,minutes:0,result:'继续救治，保留原记录。',effects:{mitigate:1}}]}];
      r=act(r,{type:'choose',id:'support'});
      expect(r.patients[0].damage).toBe(2);expect(r.hazards[0]).toMatchObject({id:'injury',weight:55,causal:true});
    }
  });
  it('removes future clinical treatment after an explicitly recorded death', () => {
    let r=clinical('C017');r.queue[0].options[0].effects={damage:3};
    r=act(r,{type:'choose',id:r.queue[0].options[0].id});
    expect(r.patients[0]).toMatchObject({active:false,bed:0,damage:3});
    expect(r.queue.slice(r.cursor).filter(c=>c.kind==='clinical')).toHaveLength(0);
  });
  it('a legacy dead-patient card permits only a zero-cost record handoff', () => {
    let r=clinical('C017');r.patients[0].damage=3;r.patients[0].active=false;
    const choices=availableOptions(r);expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({cost:0,ap:0,effects:{}});
    const spent=r.patients[0].spent;r=act(r,{type:'choose',id:choices[0].id});
    expect(r.patients[0].spent).toBe(spent);expect(r.patients[0].damage).toBe(3);
  });
});
