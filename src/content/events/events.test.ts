import { describe, expect, it } from 'vitest';
import {BUTTERFLY_CHOICE_RESULTS}from './butterfly-prose';
import { AUTHORED_EVENTS, EVENT_BY_ID, DOCUMENTED_ENDINGS, DOCUMENTED_ROUTES, eventEligible, eventToCard, eventWeight, pickEvent, contextualOptions, authoredChoiceEffects } from './catalog';
import {EVENT_RESULTS,EVENT_FAILURES}from './narrative';
import { createEventLedger, recordEventChoice, settleEventLedger } from './ledger';
import { BUTTERFLY_NODES, BUTTERFLY_RESOLUTIONS, BUTTERFLY_MERGES, startButterfly, butterflyChoices, commitButterflyChoice, completeButterflyCommitment, resolveButterfly, mergeEligible,butterflyMergeClaim,commitButterflyMerge } from './butterfly';
import type { EventContext } from './types';
import type { ButterflyWorld } from './butterfly';
import {eventTuning}from './modifiers';

/** Chain resolutions have no branch: the outcome is fixed by earlier facts. */
const CHAIN_RESOLUTIONS=['E-217','E-221','E-232','E-236','E-237','E-239'];
const context = (extra: Partial<EventContext> = {}): EventContext => ({ day: 6, phase: '结算', cash: 8000, san: 70, emotion: 60, stamina: 70, facts: {}, ...extra });
describe('authored event coverage and meaningful execution', () => {
  it('keeps butterfly branch feedback readable without source instructions or punctuation-only results',()=>{
    for(const [id,text]of Object.entries(BUTTERFLY_CHOICE_RESULTS)){expect(text,id).not.toMatch(/沿用|BTF-|E-\d|同[①②③]|、。|^[^\p{L}]*$/u);}
    expect(BUTTERFLY_CHOICE_RESULTS['BTF-001:N01b']).toContain('这班我接不了');
  });
  it('projects the real bedside into every selectable sentence and never invents a zero bed',()=>{
    const card=eventToCard(EVENT_BY_ID['E-039'],{instanceId:'actual-bed',scope:{kind:'patient',id:'actual-person'},patientId:'actual-person',patientName:'焉奶奶',bed:7,day:3,phase:'交班'});
    expect(card.text).toContain('7 床');expect(card.options[0].label).toBe('翻病历，核对昨夜体温和处理经过');expect(JSON.stringify(card.options.map(o=>[o.label,o.result,o.hint,o.check?.failureText]))).not.toMatch(/3\s*床|床\s*3/);
    const chair=eventToCard(EVENT_BY_ID['E-046'],{instanceId:'source-presentation',scope:{kind:'patient',id:'chair'},patientId:'chair',patientName:'小闾',bed:0,day:3,phase:'门诊'});expect(chair.text).not.toMatch(/0\s*床/);expect(chair.text).toContain('小闾所在诊位');
  });
  it('claims the actual due research labor appointment in XJ01 without needing a nonexistent node',()=>{
    const research=startButterfly('BTF-004','actual-labor',{actorId:'zhou',projectId:'real-project'},'N04');
    const w:ButterflyWorld={day:10,cash:10000,ap:10,facts:['materials_received','collaboration_agreed'],actorAvailable:true,conditions:{'BTF-004:N04b':true}};
    const accepted=commitButterflyChoice(research,'BTF-004:N04b',w).state,other=startButterfly('BTF-002','family-money',{actorId:'li'},'N07');
    const collision={...w,day:11,facts:['commitment_collision'],conditions:{XJ01c:true}};
    expect(butterflyMergeClaim('XJ-01',accepted,w)).toBeUndefined();expect(butterflyMergeClaim('XJ-01',accepted,collision)).toBe('BTF-004:LABOR');
    expect(mergeEligible('XJ-01',[accepted,other],collision)).toBe(true);
    const completed=commitButterflyMerge('XJ-01','XJ01c',[accepted,other],collision);expect(completed.states[0].consumed).toContain('BTF-004:LABOR');
    expect(butterflyMergeClaim('XJ-01',completed.states[0],collision)).toBeUndefined();
  });
  it('has authored readable results for all 274 events and every actual check, including delayed replies',()=>{
    expect(Object.keys(EVENT_RESULTS)).toHaveLength(274);
    const remnants=/同[①②③]|强制。|[RCDF]\s*[+−-]\s*\d|DC\s*\d|写入\s*`|[、，]\s*[、。]|或\s*[−-]\d/;
    for(const e of AUTHORED_EVENTS)for(const [i,o]of e.options.entries()){
      expect(EVENT_RESULTS[e.id][i],o.id).toBeTruthy();expect(o.result,o.id).not.toMatch(remnants);
      if(o.check){expect(EVENT_FAILURES[o.id],o.id).toBeTruthy();expect(o.check.failureText,o.id).not.toMatch(remnants);}
      for(const delayed of [...o.deferred,...o.failureDeferred??[]])expect(delayed.description,delayed.id).not.toMatch(remnants);
    }
  });
  it('preserves common collapse cost and full failure totals without replacing them with only the increment',()=>{
    const a=EVENT_BY_ID['E-198'].options[0],fail=authoredChoiceEffects(a,false),b=EVENT_BY_ID['E-199'].options[2];
    expect(fail.reputation).toBe(-15);expect(fail.relations?.nurse).toBe(-1);expect(authoredChoiceEffects(b,false).relations?.chief).toBe(-1);
  });
  it('records only the actual failed branch in the persistent evidence ledger',()=>{
    const card=eventToCard(EVENT_BY_ID['E-027'],{scope:{kind:'patient',id:'questioned'},patientId:'questioned',instanceId:'question',day:3,phase:'门诊'});
    const ledger=recordEventChoice(createEventLedger(),card,card.options[0].id,false);
    expect(ledger.facts.some(f=>f.id==='质疑-化解')).toBe(false);expect(ledger.facts.some(f=>f.id==='质疑-2网传')).toBe(true);
  });
  it('keeps raw chance branches despite unrelated future costs and D documentation markers',()=>{
    for(const id of ['E-041','E-083','E-154','E-155','E-163','E-167'])expect(EVENT_BY_ID[id].options.some(o=>o.chanceCheck),id).toBe(true);
    const qualification=EVENT_BY_ID['E-078'].options[0];expect(qualification.chanceCheck?.successAtLeast).toBe(8);expect(qualification.effects.emotion).toBe(10);expect(authoredChoiceEffects(qualification,false).emotion).toBe(-15);
    const reward=EVENT_BY_ID['E-142'].options[0];expect(reward.effects.cash??0).toBe(0);expect(reward.deferred[0]).toMatchObject({day:14,probability:.45,effects:{cash:20000}});
    expect(EVENT_BY_ID['E-196'].options[1].deferred[0]).toMatchObject({day:16,probability:.5,effects:{cash:3000}});
  });
  it('waits for the actual scoped discharge before possible unpaid fees, without borrowing another discharge',()=>{
    const card=eventToCard(EVENT_BY_ID['E-024'],{scope:{kind:'patient',id:'one'},patientId:'one',instanceId:'debt',day:3,phase:'查房'}),ledger=recordEventChoice(createEventLedger(),card,card.options[0].id,true);
    expect(settleEventLedger(ledger,5,'结算',['patient-discharged:other'],()=>0).effects).toHaveLength(0);
    expect(settleEventLedger(ledger,5,'结算',['patient-discharged:one'],()=>0).effects[0].effects.cash).toBe(-500);
  });
  it('starts per-day patient spending changes tomorrow without changing the budget',()=>{
    const e=EVENT_BY_ID['E-023'],card=eventToCard(e,{scope:{kind:'patient',id:'patient'},patientId:'patient',instanceId:'daily-bill',day:5,phase:'查房'});
    const ledger=recordEventChoice(createEventLedger(),card,card.options[1].id,true);
    expect(card.options[1].effects.bill).toBe(800);
    expect(eventTuning(ledger,5,card.scope).patientDailyCost).toBe(0);
    expect(eventTuning(ledger,6,card.scope).patientDailyCost).toBe(800);
    expect(eventTuning(ledger,6,{kind:'patient',id:'other'}).patientDailyCost).toBe(0);
  });
  it('imports every E id exactly once with source hashes, authored choices and all X definitions', () => {
    expect(AUTHORED_EVENTS.map(e => e.id)).toEqual(Array.from({ length: 274 }, (_, i) => `E-${String(i + 1).padStart(3, '0')}`));
    for (const e of AUTHORED_EVENTS) {
      expect(e.source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(e.options.length).toBeGreaterThanOrEqual(CHAIN_RESOLUTIONS.includes(e.id) ? 1 : 2);
      expect(e.options.every(o => o.label.length > 0 && o.consequence.length > 0)).toBe(true);
      expect(e.phases.length).toBeGreaterThan(0);
    }
    expect(DOCUMENTED_ENDINGS).toHaveLength(81);
    expect(DOCUMENTED_ENDINGS.filter(e => e.id.startsWith('X'))).toHaveLength(41);
    expect(DOCUMENTED_ENDINGS.filter(e => e.id.startsWith('END-'))).toHaveLength(40);
    expect(DOCUMENTED_ROUTES).toHaveLength(10);
  });
  it('preserves E-001 true clinical choice, AP costs, causal forbidden use and successful information', () => {
    const e = EVENT_BY_ID['E-001'];
    expect(e.options.map(o => o.ap)).toEqual([1, 0, 2]);
    expect(e.options[1].effects.hazards).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'R', weight: 25, causal: true })]));
    expect(e.options[0].effects.flags).toContain('隐瞒-被抓');
    expect(e.options[0].check?.failure.clear).toContain('隐瞒-被抓');
    expect(e.options[2].effects.stamina).toBe(-3);
  });
  it('gates exact day, phase, patient prerequisites and one-run repetition', () => {
    const e = EVENT_BY_ID['E-001'];
    const c = context({ day: 1, phase: '查房', qualifiers: ['当前病人用药方案含抗菌药'] });
    expect(eventEligible(e, c)).toBe(true);
    expect(eventEligible(e, { ...c, qualifiers: [] })).toBe(false);
    expect(eventEligible(e, { ...c, phase: '日终' })).toBe(false);
    expect(eventEligible(e, { ...c, seen: { 'E-001': 1 } })).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-027'], context({ day: 3, phase: '门诊' }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-027'], context({ day: 4, phase: '门诊' }))).toBe(false);
  });
  it('allows ICU cost once per day and checks its actual prerequisite', () => {
    const e = EVENT_BY_ID['E-100'];
    expect(eventEligible(e, context())).toBe(false);
    expect(eventEligible(e, context({ facts: { '家庭-车祸-ICU中': { day: 4 } }, seen: { 'E-100': 5 } }))).toBe(true);
    expect(eventEligible(e, context({ facts: { '家庭-车祸-ICU中': { day: 4 } }, seen: { 'E-100': 6 } }))).toBe(false);
  });
  it('does not collect a pending gift merely because a refusal check fails', () => {
    const refusal = EVENT_BY_ID['E-134'].options[2];
    expect(refusal.check).toBeDefined();
    expect(refusal.check?.failure.cash ?? 0).toBe(0);
    expect(refusal.check?.failure.flags ?? []).not.toContain('药代-2讲课费');
    expect(refusal.failureModifiers?.some(m => m.kind === 'pending-asset')).toBe(true);
  });
  it('binds risk to one patient and keeps research in its project', () => {
    expect(() => eventToCard(EVENT_BY_ID['E-001'], { scope: { kind: 'personal', id: 'me' }, instanceId: 'e1', day: 1, phase: '查房' })).toThrow();
    const card = eventToCard(EVENT_BY_ID['E-001'], { scope: { kind: 'patient', id: 'p7' }, patientId: 'p7', instanceId: 'e1', day: 1, phase: '查房', bed: 7 });
    expect(card.scope.id).toBe('p7');
    expect(() => eventToCard(EVENT_BY_ID['E-191'], { scope: { kind: 'patient', id: 'p7' }, patientId: 'p7', instanceId: 'e191', day: 12, phase: '结算' })).toThrow();
  });
  it('keeps a three-day invoice pending, settles exactly once, and does not charge it now', () => {
    const e = EVENT_BY_ID['E-070'];
    expect(e.options[0].effects.cash ?? 0).toBe(0);
    expect(e.options[0].deferred[0]).toMatchObject({ delay: 3, effects: { cash: -3900 } });
    const card = eventToCard(e, { scope: { kind: 'personal', id: 'rent' }, instanceId: 'rent-1', day: 3, phase: '日终' });
    let ledger = recordEventChoice(createEventLedger(), card, card.options[0].id, true);
    expect(recordEventChoice(ledger, card, card.options[0].id, true)).toEqual(ledger);
    expect(settleEventLedger(ledger, 5, '结算', [], () => 0).effects).toHaveLength(0);
    const due = settleEventLedger(ledger, 6, '结算', [], () => 0);
    expect(due.effects[0].effects.cash).toBe(-3900);
    ledger = due.ledger;
    expect(settleEventLedger(ledger, 6, '结算', [], () => 0).effects).toHaveLength(0);
  });
  it('does not grant future insurance reimbursement at an early ending', () => {
    const card = eventToCard(EVENT_BY_ID['E-124'], { scope: { kind: 'personal', id: 'family' }, instanceId: 'claim-1', day: 10, phase: '结算' });
    const ledger = recordEventChoice(createEventLedger(), card, card.options[1].id, true);
    const final = settleEventLedger(ledger, 12, '日终', [], () => 0, true);
    expect(final.effects.reduce((n,e) => n + (e.effects.cash ?? 0), 0)).toBe(0);
    expect(final.epilogue.length).toBeGreaterThan(0);
  });
  it('resolves real research history instead of charging both branches', () => {
    const clean = contextualOptions(EVENT_BY_ID['E-188'], context());
    expect(clean[0].effects.flags).toContain('科研-诚实');
    expect(clean[0].effects.flags).not.toContain('科研-造假');
    expect(clean[0].effects.stamina).toBe(-10);
    expect(clean[0].effects.reputation ?? 0).toBe(0);
    const falseData = contextualOptions(EVENT_BY_ID['E-188'], context({ facts: { '科研-诱惑-美化': true } }));
    expect(falseData[0].effects.flags).toContain('科研-造假');
    expect(falseData[0].effects.flags).not.toContain('科研-诚实');
    expect(falseData[0].effects.reputation).toBe(5);
  });
  it('weights actual pressure and keeps keyed selection deterministic', () => {
    const e = EVENT_BY_ID['E-131'];
    expect(eventWeight(e, context({ pressure: 60 }))).toBe(e.weight * 2);
    const c = context({ day: 2 });
    expect(pickEvent(c, 0.312)?.id).toBe(pickEvent(c, 0.312)?.id);
    expect(eventEligible(EVENT_BY_ID['E-137'], c)).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-134'], context({ day: 8, facts: { '药代-1餐叙': true } }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-134'], context({ day: 8, facts: { '药代-1餐叙': true, '药代-上交': true } }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-099'], context({ day: 5 }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-099'], context({ day: 10 }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-143'], context({ day: 8, facts: { '药代-拒绝': 1 } }))).toBe(true);
  });
});

const world = (extra: Partial<ButterflyWorld> = {}): ButterflyWorld => ({ day: 4, cash: 8000, ap: 10, actorAvailable: true, facts: [], ...extra });
describe('authored butterfly branches', () => {
  it('exports every 32-node, 20-resolution and 3-merge graph without flattening conditional choices', () => {
    expect(BUTTERFLY_NODES).toHaveLength(32); expect(BUTTERFLY_RESOLUTIONS).toHaveLength(20); expect(BUTTERFLY_MERGES).toHaveLength(3);
    expect(BUTTERFLY_NODES.find(n => n.id === 'BTF-002:N02')?.options).toHaveLength(5);
    for (const n of BUTTERFLY_NODES) for (const o of n.options) { expect(o.produces.length).toBeGreaterThan(0); expect(o.requires.length).toBeGreaterThan(0); }
  });
  it('borrowing versus refusal changes liquidity and later available repayment', () => {
    const start = startButterfly('BTF-002', 'b2', { actorId: 'li' });
    const loan = commitButterflyChoice(start, 'BTF-002:N01a', world());
    expect(loan.effects.cash).toBe(-3000); expect(loan.state.receivable).toBe(3000);
    const refused = commitButterflyChoice(start, 'BTF-002:N01c', world());
    expect(refused.state.receivable).toBe(0); expect(refused.effects.cash ?? 0).toBe(0);
    const atRepayment = { ...loan.state, cursor: 'BTF-002:N03' };
    expect(butterflyChoices(atRepayment, world({ repaymentAvailable: 0 })).find(o => o.choice.localId === 'N03a')?.available).toBe(false);
    const repaid = commitButterflyChoice(atRepayment, 'BTF-002:N03a', world({ repaymentAvailable: 900 }));
    expect(repaid.effects.cash).toBe(900); expect(repaid.state.receivable).toBe(2100);
  });
  it('accepting a shift is not completing it or generating spendable favors', () => {
    const s = startButterfly('BTF-001', 'b1', { actorId: 'li', patientId: 'patient-1', shiftId: 'shift-4' });
    const w = world({ conditions: { 'BTF-001:N01a': true } });
    const accepted = commitButterflyChoice(s, 'BTF-001:N01a', w).state;
    expect(accepted.facts.some(f => f.type === 'favor_available')).toBe(false);
    const id = accepted.commitments[0].id;
    expect(completeButterflyCommitment(accepted, id, w)).toEqual(accepted);
    const done = completeButterflyCommitment(accepted, id, world({ facts: [`completed:${id}`] }));
    expect(done.facts.some(f => f.type === 'favor_available')).toBe(true);
    expect(completeButterflyCommitment(done, id, world({ facts: [`completed:${id}`] }))).toEqual(done);
    expect(resolveButterfly(done, world())).toBe('BTF-001:R01');
  });
  it('retaining original slides enables sharing, missing citation alone is not knowingly false submission', () => {
    const s = startButterfly('BTF-004', 'b4', { actorId: 'zhou', projectId: 'pr1', datasetId: 'ds1' });
    const retained = commitButterflyChoice(s, 'BTF-004:N01b', world()).state;
    const atShare = { ...retained, cursor: 'BTF-004:N02' };
    expect(butterflyChoices(atShare, world({ facts: ['project_share_authorization'] })).find(o => o.choice.localId === 'N02a')?.available).toBe(true);
    const noOriginal = commitButterflyChoice(s, 'BTF-004:N01a', world()).state;
    expect(butterflyChoices({ ...noOriginal, cursor: 'BTF-004:N02' }, world({ facts: ['project_share_authorization'] })).find(o => o.choice.localId === 'N02a')?.available).toBe(false);
    const submitted = commitButterflyChoice({ ...noOriginal, cursor: 'BTF-004:N06' }, 'BTF-004:N06b', world({ facts: ['citation_gap'] }));
    expect(submitted.state.facts.some(f => f.type === 'knowingly_false_submission')).toBe(false);
    const known = commitButterflyChoice({ ...retained, cursor: 'BTF-004:N06' }, 'BTF-004:N06b', world({ facts: ['verified_problem', 'problem_known'] }));
    expect(resolveButterfly(known.state, world())).toBe('BTF-004:R04');
  });
  it('does not merge different projects or let another patient inherit testimony', () => {
    const a = { ...startButterfly('BTF-002', 'a', { actorId: 'ye', projectId: 'pr1', paymentId: 'pay1', sponsorId:'ye' }), cursor: 'BTF-002:N05' };
    const b = { ...startButterfly('BTF-004', 'b', { actorId: 'zhou', projectId: 'pr2', paymentId: 'pay2', sponsorId:'ye' }), cursor: 'BTF-004:N05' };
    expect(mergeEligible('XJ-02', [a, b], world())).toBe(false);
    b.subjects.projectId = 'pr1'; b.subjects.paymentId = 'pay1';
    expect(mergeEligible('XJ-02', [a, b], world())).toBe(true);
  });
  it('interrupted cooperation keeps the real debt without creating an exchange', () => {
    const s = { ...startButterfly('BTF-002', 'loan', { actorId: 'ye' }), cursor: 'BTF-002:N04' };
    const accepted = commitButterflyChoice(s, 'BTF-002:N04a', world({ conditions: { 'BTF-002:N04a': true } })).state;
    const ended = commitButterflyChoice({ ...accepted, cursor: 'BTF-002:N05' }, 'BTF-002:N05b', world()).state;
    expect(ended.privateDebt).toBe(10000);
    expect(ended.facts.some(f => f.type === 'exchange_performed')).toBe(false);
    expect(resolveButterfly(ended, world())).toBe('BTF-002:R02');
    expect(startButterfly('BTF-002', 'new-run', { actorId: 'ye' }).facts).toHaveLength(0);
  });
});

describe('compiled promises that the 2026-09-06 review found dropped', () => {
  it('gives a reduced hazard its own relief entry for both minus signs', () => {
    expect(EVENT_BY_ID['E-211'].options[0].effects.hazardRelief).toEqual({ R: 10 });
    expect(EVENT_BY_ID['E-211'].options[1].effects.hazardRelief).toEqual({ D: 5 });
    expect(EVENT_BY_ID['E-208'].options[1].effects.hazardRelief).toEqual({ D: 5 });
  });
  it('books tomorrow’s forced leave even without an explicit zero-action note', () => {
    for (const id of ['E-203-b', 'E-203-c']) {
      const option = EVENT_BY_ID['E-203'].options.find(o => o.id === id)!;
      expect(option.modifiers.some(m => m.kind === 'leave' && m.days === 1), id).toBe(true);
    }
  });
  it('settles this patient’s unpaid excess once and keeps the daily six hundred', () => {
    const card = eventToCard(EVENT_BY_ID['E-171'], { instanceId: 'excess', scope: { kind: 'patient', id: 'bed-9' }, patientId: 'bed-9', patientName: '费女士', bed: 9, day: 6, phase: '结算' },
      context({ cash: 2000, facts: { 'patient-budget-unpaid': 3000, 'patient-budget-excess': 5000 } }));
    expect(card.options[0].effects.cash).toBe(-2000);
    expect(card.options[0].deferred[0].effects).toEqual({ bill: 600 });
    const paid = eventToCard(EVENT_BY_ID['E-171'], { instanceId: 'settled', scope: { kind: 'patient', id: 'bed-9' }, patientId: 'bed-9', bed: 9, day: 6, phase: '结算' },
      context({ cash: 9000, facts: { 'patient-budget-unpaid': 0, 'patient-budget-excess': 5000 } }));
    expect(paid.options[0].effects.cash).toBe(-0);
  });
  it('sends “写入 X 或 Y” to the option that actually happened', () => {
    const options = EVENT_BY_ID['E-205'].options;
    expect(options[0].effects.flags).toContain('被接走');
    expect(options[2].effects.flags).toContain('家人到访');
    expect(options[2].effects.flags).not.toContain('被接走');
    const first = contextualOptions(EVENT_BY_ID['E-207'], context({ facts: {} }));
    expect(first[0].effects.flags).toEqual(['卖车']);
    const second = contextualOptions(EVENT_BY_ID['E-207'], context({ facts: { 卖车: { day: 4 } } }));
    expect(second[0].effects.flags).toEqual(['卖表']);
  });
  it('keeps a followup write whose recorded name ends in “候选”, and scopes a failed one', () => {
    for (const option of EVENT_BY_ID['E-150'].options) expect(option.effects.flags).toContain('药代-刑拘候选');
    const explain = EVENT_BY_ID['E-006'].options[0];
    expect(explain.check!.failure.flags).toContain('质疑-2网传');
    expect(explain.effects.flags).not.toContain('质疑-2网传');
  });
  it('reduces cash pressure on the day the insurance money actually arrives', () => {
    for (const id of [1, 2]) {
      const delayed = EVENT_BY_ID['E-124'].options[id].deferred[0];
      expect(delayed.effects.cash).toBe(30000);
      expect(delayed.effects.cashPressure).toBe(-15);
    }
  });
  it('puts both walkout scenes and all three breakdown scenes in one group each', () => {
    expect(EVENT_BY_ID['E-203'].exclusiveGroup).toBe('情绪归零');
    expect(EVENT_BY_ID['E-204'].exclusiveGroup).toBe('情绪归零');
    for (const id of ['E-200', 'E-201', 'E-202']) expect(EVENT_BY_ID[id].exclusiveGroup, id).toBe('SAN归零');
    const seen = { 'E-203': 4 };
    expect(eventEligible(EVENT_BY_ID['E-204'], context({ phase: '夜班', seen }))).toBe(false);
  });
  it('measures the nurse’s loan by another ten thousand of debt, not by the calendar', () => {
    expect(EVENT_BY_ID['E-206'].repeatEvery).toEqual({ resource: 'debt', amount: 10000 });
    const again = (debt: number, times: number) => eventEligible(EVENT_BY_ID['E-206'], context({ day: 9, debt, seen: { 'E-206': 7 }, facts: { 'event-count:E-206': times }, qualifiers: ['结算阶段'] }));
    expect(again(35000, 1)).toBe(false);
    expect(again(41000, 1)).toBe(true);
    expect(again(41000, 2)).toBe(false);
  });
  it('binds a written bed number to a real patient and records the tape on that patient', () => {
    expect(EVENT_BY_ID['E-065'].scopeKind).toBe('patient');
    expect(EVENT_BY_ID['E-211'].scopeKind).toBe('patient');
    const card = eventToCard(EVENT_BY_ID['E-065'], { instanceId: 'reminder', scope: { kind: 'patient', id: 'ward-8' }, patientId: 'ward-8', patientName: '柳先生', bed: 8, day: 3, phase: '交班' });
    expect(card.text).toContain('8 床');
    expect(card.text).not.toContain('6 床');
    expect(card.scope).toEqual({ kind: 'patient', id: 'ward-8' });
    expect(card.options[1].check!.failure.flags).toContain('录音在手');
  });
  it('reads both relative-day clauses instead of ignoring them', () => {
    const wedding = (day: number) => eventEligible(EVENT_BY_ID['E-106'], context({ day, facts: { '家庭-婚事': { day: 2 } }, qualifiers: ['结算阶段'] }));
    expect(wedding(9)).toBe(true);
    expect(wedding(8)).toBe(false);
    const cover = (day: number) => eventEligible(EVENT_BY_ID['E-210'], context({ day, phase: '交班', facts: { 人情债: { day: 5 } }, qualifiers: ['写入 人情债', '同事需要'] }));
    expect(cover(7)).toBe(false);
    expect(cover(8)).toBe(true);
  });
  it('offers only the two real ways to pack up, each leaving its own record', () => {
    expect(EVENT_BY_ID['E-209'].options).toHaveLength(2);
    expect(EVENT_BY_ID['E-209'].options[0].effects.flags).toContain('离职-带走白大褂');
    expect(EVENT_BY_ID['E-209'].options[1].effects.flags).toContain('离职-留下白大褂');
    expect(JSON.stringify(EVENT_BY_ID['E-209'].options)).not.toContain('`');
  });
  it('treats “或 D13 结算” as an alternative to the end-of-run check', () => {
    const arrest = (qualifiers: string[]) => eventEligible(EVENT_BY_ID['E-208'], context({ day: 13, facts: { 统方: { day: 9 } }, qualifiers }));
    expect(arrest(['写入 统方 或 回扣', '或 D13 结算'])).toBe(true);
    expect(arrest(['写入 统方 或 回扣', '局末判定命中'])).toBe(true);
    expect(arrest(['局末判定命中', '或 D13 结算'])).toBe(false);
  });
  it('opens the department talk on the published notice as well as on the overspend', () => {
    const talk = (facts: EventContext['facts'], overspend: number) => eventEligible(EVENT_BY_ID['E-160'], context({ day: 7, facts, overspend, qualifiers: [] }));
    expect(talk({}, 2000)).toBe(false);
    expect(talk({ 'DIP-首通报': { day: 7 } }, 2000)).toBe(true);
    expect(talk({}, 9000)).toBe(true);
  });
  it('names the hospital order system without the leftover spaces around it', () => {
    expect(EVENT_BY_ID['E-150'].text).toContain('调走了院内医嘱系统的导出日志');
    expect(EVENT_BY_ID['E-150'].text).not.toMatch(/\s院内医嘱系统\s/);
  });
  it('warns before a silent roll and keeps design shorthand out of the warning', () => {
    expect(EVENT_BY_ID['E-096'].options[1].hint).toContain('掷一次骰子');
    for (const event of AUTHORED_EVENTS) for (const option of event.options) {
      expect(option.hint ?? '', option.id).not.toMatch(/按 0\d|§|权重|D\d+ 结算|`/);
      if (option.check || option.chanceCheck) expect(option.hint, option.id).toBeTruthy();
    }
  });
  it('states each event’s scope in the source row instead of guessing from the consequence', () => {
    for (const event of AUTHORED_EVENTS) expect(['patient', 'personal', 'project'], event.id).toContain(event.scopeKind);
    expect(AUTHORED_EVENTS.filter(e => /(?:床\s*\d+|\d+\s*床)/.test(e.text) && e.scopeKind !== 'patient').map(e => e.id)).toEqual(['E-200', 'E-202']);
  });
  it('keeps the night pool stocked and never builds a night beat on a day without one', () => {
    const night = AUTHORED_EVENTS.filter(e => e.phases.includes('夜班') && e.weight > 0);
    expect(night.length).toBeGreaterThanOrEqual(15);
    expect(night.filter(e => e.category === 1).length).toBeGreaterThanOrEqual(13);
    expect(eventEligible(EVENT_BY_ID['E-014'], context({ day: 4, phase: '夜班', night: false }))).toBe(true);
  });
});
