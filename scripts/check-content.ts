import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { clinicalGraphs, initialGraphState, getAvailableGraphOptions, canContinueGraph, advanceClinicalGraph } from '../src/content/clinical';
import { CASE_PRESETS, PATIENT_ENTITIES, compatibleEntities, instantiatePreset, PRESET_END } from '../src/content/patients';
import { TROLLEY_DEFINITIONS, trolleyBindings, makeTrolleyCard } from '../src/content/events/trolley';
import { RECORD_ONLY_EVENT_FACTS } from '../src/content/events/fact-records';
import { AUTHORED_EVENTS, EVENT_SOURCES, DOCUMENTED_ENDINGS, DOCUMENTED_ROUTES, eventToCard } from '../src/content/events';
import { BUTTERFLY_NODES, BUTTERFLY_MERGES, BUTTERFLY_RESOLUTIONS, BUTTERFLY_FACT_CONNECTIONS } from '../src/content/events/butterfly';
import { TALENTS, DEBUFFS } from '../src/game/catalog';
import { RULES } from '../src/game/rules';
import { startRun } from '../src/game/engine';
import patientTuning from '../src/content/patients/tuning.json';
import type { Condition, Scene, Patient } from '../src/game/types';

// Structural checks and sampled model traversal are not manual playthroughs.
// --details emits a source/consumer/reachability record for every definition.
const siblingSources=resolve('..','..','..','平面互动游戏');
const sourceRoot = process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? process.env.TYCHE_DESIGN_ROOT ?? (existsSync(siblingSources) ? siblingSources : undefined);
const errors: string[] = [], gaps: string[] = [], records: Record<string, unknown>[] = [];
const check = (truth: unknown, message: string) => { if (!truth) errors.push(message); };
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const sourceText = (path: string) => sourceRoot ? read(join(sourceRoot, path.split('#')[0])) : '';
function sourceFiles(dir: string) { const root = sourceRoot && join(sourceRoot, dir); return root && existsSync(root) ? readdirSync(root).filter(n => n.endsWith('.md')).map(n => `${dir}/${n}`) : []; }
function consecutive(ids: string[], prefix: string, count: number, digits = 3) {
  check(new Set(ids).size === ids.length, `${prefix}: duplicate ID`);
  for (let i = 1; i <= count; i++) check(ids.includes(`${prefix}${String(i).padStart(digits, '0')}`), `${prefix}${i}: missing definition`);
}
const engine = read('src/game/engine.ts'), cards = read('src/game/cards.ts'), director = read('src/game/director.ts');
const integration = [
  ['clinical', engine.includes('progressClinical') && cards.includes('beginClinical'), 'game/clinical → engine.progressClinical'],
  ['presets', engine.includes('presetCard') && cards.includes('instantiatePatientPreset'), 'game/presets → cards.createPatient → engine'],
  ['events', engine.includes('buildAuthoredEvents') && engine.includes('afterAuthoredChoice'), 'director.buildAuthoredEvents / afterAuthoredChoice'],
  ['butterflies', director.includes('routeButterfly') && director.includes('commitButterflyChoice'), 'director → butterfly route / commit'],
  ['merges', director.includes('mergeEligible') && director.includes('commitButterflyMerge'), 'director → merge eligibility / commit'],
  ['endings', engine.includes('documentedEnding'), 'engine → documentedEnding → ending-adapter'],
  ['trolley', director.includes('pickTrolley') && director.includes('trolleyEchoCard') && director.includes('tc.trolley.stage'), 'director → pickTrolley / same-object follow-up / committed stages'],
] as const;
integration.forEach(([name, present]) => check(present, `${name}: runtime call site missing`));
consecutive(clinicalGraphs.map(g => g.id), 'C', 20);
let graphRuns = 0, graphActions = 0, rand = 17381;
const random = () => { rand = (Math.imul(rand, 1664525) + 1013904223) >>> 0; return rand / 4294967296; };
for (const g of clinicalGraphs) {
  const options = g.nodes.flatMap(n => n.options), ids = options.map(o => o.id), liveSource = sourceText(g.source.file);
  check(new Set(ids).size === ids.length, `${g.id}: duplicate action`);
  for (const m of (liveSource || g.source.raw).matchAll(/^\| (s\w+) \|/gm)) check(ids.includes(m[1]), `${g.id}: omitted source action ${m[1]}`);
  const targets = new Set([...g.nodes.map(n => n.id), ...g.outcomes.map(o => o.id), 'outcomes', 'resume']);
  for (const n of g.nodes) {
    check(n.kind === 'auto' || n.options.length, `${g.id}/${n.id}: empty interactive node`);
    const links = [n.exit, ...(n.transitions ?? []).map(t => t.next), ...n.options.flatMap(o => [o.next, o.successNext, o.failureNext, o.retry?.exhaustedNext, o.followUp?.node, ...(o.transitions ?? []).map(t => t.next)])].filter(Boolean);
    links.forEach(t => check(targets.has(t!), `${g.id}/${n.id}: broken target ${t}`));
    n.options.forEach(o => check(o.ap >= 0 && o.minutes >= 0 && o.cost >= 0 && o.mechanics, `${g.id}/${o.id}: bad cost/metadata`));
  }
  const visitedNodes = new Set<string>(), visitedOptions = new Set<string>(), outcomes = new Set<string>();
  for (let sample = 0; sample < 400; sample++) {
    let state = initialGraphState(g, `coverage-${sample}`); graphRuns++;
    for (let step = 0; step < 100 && !state.outcomeId; step++) {
      visitedNodes.add(state.nodeId); const available = getAvailableGraphOptions(g, state).map(o => o.id);
      if (canContinueGraph(g, state)) available.push('continue');
      if (!available.length) { errors.push(`${g.id}/${state.nodeId}: reachable deadlock ${sample}`); break; }
      const action = available[Math.floor(random() * available.length)]; visitedOptions.add(action); graphActions++;
      state = advanceClinicalGraph(g, state, action, random() > .35).state;
    }
    if (state.outcomeId) outcomes.add(state.outcomeId); else errors.push(`${g.id}: no terminal within 100 decisions, sample ${sample}`);
  }
  const unseenActions = ids.filter(id => !visitedOptions.has(id)), unseenOutcomes = g.outcomes.filter(o => !outcomes.has(o.id)).map(o => o.id);
  if (unseenActions.length || unseenOutcomes.length) gaps.push(`${g.id}: sample has not witnessed ${unseenActions.length} actions / ${unseenOutcomes.length} outcomes; dedicated path tests still required`);
  const flags = [...new Set(options.flatMap(o => [...(o.effects.flags ?? []), ...(o.check?.failure.flags ?? []), ...o.rules.flatMap(r => r.effects.flags ?? [])]))];
  const orphanFlags = flags.filter(f => !g.flagConsumers[f]?.length); orphanFlags.forEach(f => errors.push(`${g.id}: no declared consumer for ${f}`));
  records.push({ kind: 'clinical', id: g.id, source: g.source.file, sourcePresent: !!liveSource, consumer: 'engine.progressClinical', actions: ids.length, visitedNodes: [...visitedNodes], visitedActions: [...visitedOptions], witnessedOutcomes: [...outcomes], unseenActions, unseenOutcomes, orphanFlags, recordOnlyFlags: flags.filter(f => g.flagConsumers[f]?.every(c => ['record', 'tribunal'].includes(c.kind))) });
}
function allowed(w: Condition | undefined, f: Set<string>) { return !w || (!w.all || w.all.every(x => f.has(x))) && (!w.any || w.any.some(x => f.has(x))) && (!w.none || w.none.every(x => !f.has(x))); }
function walkPreset(steps: Scene[]) {
  const queue = [{ id: steps[0].id, facts: new Set<string>() }], seen = new Set<string>(), visited = new Set<string>(); let endpoints = 0;
  while (queue.length) {
    const s = queue.pop()!, key = `${s.id}|${[...s.facts].sort().join('|')}`;
    if (seen.has(key)) continue; seen.add(key);
    if (seen.size > 30000) { errors.push(`${steps[0].id}: graph exceeded state bound`); break; }
    if (s.id === PRESET_END) { endpoints++; continue; }
    const n = steps.find(n => n.id === s.id); if (!n) { errors.push(`${steps[0].id}: broken next ${s.id}`); continue; }
    const options = n.options.filter(o => allowed(o.when, s.facts)); check(options.length, `${n.id}: reachable deadlock`);
    for (const o of options) { visited.add(o.id); for (const e of [o.effects, ...(o.check ? [o.check.failure] : [])]) { const facts = new Set(s.facts); e.flags?.forEach(f => facts.add(f)); e.clear?.forEach(f => facts.delete(f)); queue.push({ id: o.next!, facts }); } }
  }
  return { visited, endpoints, states: seen.size };
}
consecutive(CASE_PRESETS.map(p => p.id), 'C-', 208); consecutive(PATIENT_ENTITIES.filter(e => e.original).map(e => e.id), 'P-', 222);
if (sourceRoot) for (const [dir, pattern, ids] of [['12_病例预设库', /^\|\s*(C-\d{3})\s*\|/gm, CASE_PRESETS.map(p => p.id)], ['11_患者实体库', /^\|\s*(P-\d{3})\s*\|/gm, PATIENT_ENTITIES.map(e => e.id)]] as const) {
  for (const path of sourceFiles(dir)) for (const m of sourceText(path).matchAll(pattern)) check(ids.includes(m[1]), `${m[1]}: current source row omitted`);
}
for (const p of CASE_PRESETS) {
  const w = walkPreset(p.scenes), options = p.scenes.flatMap(s => s.options), compatible = compatibleEntities(p);
  check(compatible.length && w.endpoints, `${p.id}: missing entity/terminal`);
  options.forEach(o => { check(w.visited.has(o.id), `${o.id}: unreachable action`); check(o.ap >= 0 && o.minutes >= 0 && o.cost >= 0, `${o.id}: invalid cost`); });
  const flags = [...new Set(options.flatMap(o => [...(o.effects.flags ?? []), ...(o.check?.failure.flags ?? [])]))];
  const consumers = options.flatMap(o => [...(o.when?.all ?? []), ...(o.when?.any ?? []), ...(o.when?.none ?? []), ...(o.effects.clear ?? [])]);
  records.push({ kind: 'preset', id: p.id, source: p.source, consumer: 'engine.presetCard / next / patient-director', compatibleEntities: compatible.map(e => e.id), scenario: p.constraints.scenario, scenes: p.scenes.length, options: options.length, visitedOptions: w.visited.size, terminalPaths: w.endpoints, states: w.states, recordOnlyFlags: flags.filter(f => !consumers.includes(f) && !Object.values(p.echoFlags).includes(f)) });
}
for (const e of PATIENT_ENTITIES) {
  const pairs = CASE_PRESETS.flatMap(p => p.constraints.periods.filter(period => compatibleEntities(p, period).some(x => x.id === e.id)).map(period => `${p.id}:${period}`));
  check(pairs.length, `${e.id}: no legal pairing`); records.push({ kind: 'entity', id: e.id, original: e.original, source: e.source, consumer: 'presets.instantiatePatientPreset / patient-director', legalPairs: pairs });
}
consecutive(AUTHORED_EVENTS.map(e => e.id), 'E-', 264);
// Chain resolutions carry a single acknowledgement: the outcome is already
// fixed by facts written earlier, so offering a second branch would be a lie.
const RESOLUTION_EVENTS = ['E-217', 'E-221', 'E-232', 'E-236', 'E-237', 'E-239'];
const eventConsumers = [director, read('src/content/events/catalog.ts').split('function has(ctx:')[1] ?? '', ...['modifiers', 'ending-adapter', 'followups', 'trolley', 'talent-adapter', 'fact-records'].map(name => read(`src/content/events/${name}.ts`)), engine, read('src/game/talents.ts'), ...AUTHORED_EVENTS.flatMap(e => [e.trigger, ...e.options.flatMap(o => [...o.deferred.flatMap(d => d.until ?? []), ...o.modifiers.flatMap(m => m.until ?? [])])])].join('\n');
const unverifiedEventFlags: { event: string; flag: string }[] = [];
for (const e of AUTHORED_EVENTS) {
  check(e.options.length >= (RESOLUTION_EVENTS.includes(e.id) ? 1 : 2) && e.phases.length, `${e.id}: no usable choices/phase`);
  const card = eventToCard(e, { scope: { kind: e.scopeKind, id: 'audit-subject' }, patientId: e.scopeKind === 'patient' ? 'audit-subject' : undefined, instanceId: `audit-${e.id}`, day: 6, phase: e.phases[0], patients: [{ id: 'audit-subject', bed: 1 }, { id: 'audit-second', bed: 2 }] });
  check(card.options.length, `${e.id}: empty emitted card`);
  const flags = [...new Set(e.options.flatMap(o => [...(o.effects.flags ?? []), ...(o.failureTotal?.flags ?? []), ...o.deferred.flatMap(d => d.effects.flags ?? [])]))];
  // E159's flag is a decision receipt, not the switch used to apply risk.
  // Verify the source choice's real timed modifier and its UID-scoped consumer
  // instead of pretending a second flag lookup is required or implemented.
  const modifierReceipts=e.id==='E-159'&&e.options.some(o=>o.id==='E-159-c'&&o.effects.flags?.includes('DIP-自我限制')&&o.modifiers.some(m=>m.target==='outpatientHazardR'&&m.value===5&&m.startsAfter===1&&m.days===3))&&director.includes('tuning.outpatientHazardR')&&director.includes('outpatient-limit:${patient.uid}')
    ?[{flag:'DIP-自我限制',consumer:'E-159-c.modifiers → recordEventChoice → eventTuning.outpatientHazardR → afterAuthoredChoice/applyOnce(outpatient UID)',test:'director.test: real E159 choice, next-day three-day window, per-patient deduplication'}]:[];
  const unverified = flags.filter(f => !eventConsumers.includes(f)&&!modifierReceipts.some(receipt=>receipt.flag===f)); unverified.forEach(flag => unverifiedEventFlags.push({ event: e.id, flag }));
  records.push({ kind: 'event', id: e.id, source: e.source.path, consumer: 'director.eligibleAuthoredEvents → eventToCard → afterAuthoredChoice', phases: e.phases, qualifiers: e.requiredQualifiers, options: card.options.map(o => o.id), reachability: 'construction verified; all real world trigger paths not certified', flagsWithoutNamedConsumer: unverified, modifierReceipts, recordOnlyFlags: flags.filter(f => f in RECORD_ONLY_EVENT_FACTS), recordOnlyConsumer: 'eventFactNotes → documentedEnding annexes (history, not an additional mechanic)' });
}
if (sourceRoot) for (const path of sourceFiles('13_事件库')) for (const m of sourceText(path).matchAll(/^###?\s+(E-\d{3})/gm)) check(AUTHORED_EVENTS.some(e => e.id === m[1]), `${m[1]}: source event omitted`);
if (unverifiedEventFlags.length) gaps.push(`${unverifiedEventFlags.length} event flags lack a named consumer candidate; history-only use is not certified gameplay impact`);
gaps.push('All 264 actual host-world event trigger paths have not been individually replayed by this audit');
check(BUTTERFLY_NODES.length === 32 && BUTTERFLY_MERGES.length === 3, 'Expected 32 butterfly nodes / 3 merges');
const butterflyTargets = new Set([...BUTTERFLY_NODES.map(n => n.id), ...BUTTERFLY_RESOLUTIONS.map(r => r.id)]);
for (const n of BUTTERFLY_NODES) { check(n.options.length, `${n.id}: no choices`); records.push({ kind: 'butterfly', id: n.id, source: n.source.path, consumer: 'director → routeButterfly / commitButterflyChoice', requiredFacts: n.requiredFacts, options: n.options.map(o => o.id), textualTargetsNotIds: n.options.flatMap(o => o.targets).filter(t => !butterflyTargets.has(t)), reachability: 'dedicated legal commitment tests required; acceptance is not completion' }); }
for (const m of BUTTERFLY_MERGES) records.push({ kind: 'merge', id: m.id, source: m.source.path, consumer: 'director → mergeEligible / commitButterflyMerge', options: m.options.map(o => o.id), reachability: 'requires concurrent real source obligations' });
for (const c of BUTTERFLY_FACT_CONNECTIONS) check(c.producers.length || c.completionOnly, `${c.fact}: no producer or completion contract`);
consecutive(DOCUMENTED_ENDINGS.map(e => e.id), 'X', 41, 2);
const endingCode = read('src/content/events/ending-adapter.ts'), endingTests = read('src/game/endings.test.ts');
for (const e of DOCUMENTED_ENDINGS) { check(endingCode.includes(`'${e.id}'`), `${e.id}: no named eligibility branch`); records.push({ kind: 'ending', id: e.id, source: e.source.path, consumer: 'ending-adapter.endingEligibility / documentedEnding', namedTest: endingTests.includes(e.id), reachability: 'manual collection not claimed' }); }
const trolleySection = sourceText('03_主线与支线.md').split('## 4. 电车难题原则与 20 张难题卡')[1]?.split('### 4.1')[0] ?? '';
const trolleyRows = trolleySection.split('\n').filter(line => /^\| \d+ \|/.test(line)).map(line => line.split('|').slice(1, -1).map(x => x.trim()));
if (sourceRoot) check(trolleyRows.length === 20, 'Source trolley inventory should contain 20 rows');
consecutive(TROLLEY_DEFINITIONS.map(d => d.id), 'TROLLEY-', 20, 1);
for (const d of TROLLEY_DEFINITIONS) {
  const sourceRow = trolleyRows.find(row => Number(row[0]) === d.source.row);
  if (sourceRoot) check(sourceRow && d.source.sha256 === createHash('sha256').update(sourceText(d.source.path)).digest('hex'), `${d.id}: missing or stale source mapping`);
  const preset = instantiatePreset(CASE_PRESETS[0], compatibleEntities(CASE_PRESETS[0])[0], 'trolley-a');
  const p = { uid: 'trolley-a', name: '绑定患者甲', caseId: preset.id, preset: { ...preset, age: 72, complaint: '肺炎并高钾，晚期肺癌', history: ['已使用抗菌药'] }, active: true, inpatient: true, damage: 0, admitted: 1, spent: 3000, budget: 2000, charged: 0 } as Patient;
  const other = { ...structuredClone(p), uid: 'trolley-b', name: '绑定患者乙' };
  const facts = ['verified-colleague-false-data', 'family-icu', 'recent-family-icu', 'representative-contact', 'audit-open', `recording:${p.uid}`];
  // This construction fixture supplies actual patient arrears from the E024
  // follow-up contract; a doctor's DIP overrun is not patient debt.
  if (d.id === 'TROLLEY-13') facts.push(`three-day-debt:${p.uid}`);
  if (d.requires.includes('two-night-patients')) p.inpatient = other.inpatient = false;
  if (d.requires.includes('pregnant-patient')) {
    const source=CASE_PRESETS.find(p=>p.id==='C-164')!,entity=compatibleEntities(source)[0];
    p.preset=instantiatePreset(source,entity,p.uid);p.caseId=source.id;p.entityId=entity.id;p.name=entity.name;p.inpatient=false;
  }
  if (d.requires.includes('young-trauma-and-elder')) { p.preset!.age = 28; p.preset!.history = ['车祸外伤']; }
  const world = { day: 6, phase: d.phases[0], patients: [p, other], nightArrivalIds:[p.uid,other.uid], facts, peerAvailable: true };
  const r = startRun('trolley-audit', '程医生', []);
  r.day = world.day; r.shiftPhase = world.phase; r.patients = world.patients;
  const bound = trolleyBindings(d, world, r);
  check(bound, `${d.id}: specified requirements cannot bind a world`);
  if (!bound) continue;
  const card = makeTrolleyCard(d, r, bound);
  check(card.options.length === 3, `${d.id}: source three-way choice missing from ordinary conditions`);
  records.push({ kind: 'trolley', id: d.id, source: d.source, sourceTitle: sourceRow?.[1], sourceChoices: sourceRow?.slice(2), consumer: 'director.pickTrolley → makeTrolleyCard → afterAuthoredChoice → trolleyEchoCard', phases: d.phases, requires: d.requires, boundPatientIds: bound.map(p => p.uid), options: card.options.map(o => ({ id: o.id, label: o.label, ap: o.ap, minutes: o.minutes, effects: o.effects, check: o.check })), object: d.object, reachability: 'explicit condition-binding fixture and construction verified; actual host triggers and three-stage continuations covered by separate trolley tests, not manual playthrough' });
}
gaps.push('Trolley construction fixtures do not certify all 20 naturally generated host-world situations or manual follow-up playthroughs');
for (const t of TALENTS) records.push({ kind: 'talent', id: t.id, consumer: 'game/talents → costs / abilities / engine / event talent-adapter', reachability: 'rule-specific tests required; UI listing alone is not proof' });
for (const d of DEBUFFS) records.push({ kind: 'debuff', id: d.id, consumer: 'game/talents → costs / recovery / engine', reachability: 'gain and removal condition tests required' });
const numericalSource = sourceText('01_核心机制与数值.md');
const daily = numericalSource.split('\n').filter(line => /^\| D\d+ \|/.test(line)).map(line => line.split('|').slice(1, -1).map(x => x.trim())).filter(row => row.length === 6 && /^\d+%$/.test(row[2]));
if (daily.length) {
  check(JSON.stringify(daily.map(r => Number(r[1]))) === JSON.stringify(RULES.patientCount), 'Patient count differs from design 01');
  check(JSON.stringify(daily.map(r => Number(r[4]))) === JSON.stringify(RULES.dc), 'Day-end DC differs from design 01');
  check(JSON.stringify(daily.map(r => parseFloat(r[2]) / 100)) === JSON.stringify(patientTuning.hiddenRates), 'Hidden rate differs from design 01');
  check(JSON.stringify(daily.map(r => Number(r[3]))) === JSON.stringify(patientTuning.clinicalDc), 'Clinical baseline DC differs from design 01');
  for (const [label, value] of [['住院基础费用预算比例', patientTuning.inpatientBaseRate], ['门急诊基础费用预算比例', patientTuning.outpatientBaseRate], ['精神障碍史安抚失败后自行离院概率', patientTuning.departureAfterFailedComfortRate]] as const) check(numericalSource.includes(`| ${label} | ${value * 100}% |`), `${label}: generated parameter differs from source`);
}
if (sourceRoot && read('docs/design/01_核心机制与数值.md') !== numericalSource) gaps.push('docs/design/01 differs from the authoritative design source; confirm a single source before treating the mirror as current');
const sourceHashes = EVENT_SOURCES.map(s => ({ path: s.path, expected: s.sha256, actual: sourceRoot && existsSync(join(sourceRoot, s.path)) ? createHash('sha256').update(readFileSync(join(sourceRoot, s.path))).digest('hex') : null }));
const staleSources = sourceHashes.filter(s => s.actual && s.expected !== s.actual);
if (staleSources.length) gaps.push(`${staleSources.length} source hashes differ from imported snapshots; compare changes and rerun importer`);
if (!sourceRoot) gaps.push('Design source checks skipped: pass --source=/absolute/design/path');
const assets = ['hospital','characters-a','characters-b','ward-map','hero-walk','npc-sprites','npc-idle','patient-portraits','bedside','bed-patients','bedside-patients'];
assets.forEach(n => check(existsSync(`public/art/${n}.webp`) && readFileSync(`public/art/${n}.webp`).length > 1000, `Missing art ${n}`));
console.log(JSON.stringify({ status: errors.length ? 'failed' : 'structurally-valid-with-unverified-coverage', counts: { clinicalGraphs: clinicalGraphs.length, presets: CASE_PRESETS.length, originalEntities: PATIENT_ENTITIES.filter(e => e.original).length, addedEntities: PATIENT_ENTITIES.filter(e => !e.original).length, events: AUTHORED_EVENTS.length, butterflyNodes: BUTTERFLY_NODES.length, merges: BUTTERFLY_MERGES.length, routes: DOCUMENTED_ROUTES.length, endings: DOCUMENTED_ENDINGS.length, talents: TALENTS.length, debuffs: DEBUFFS.length }, graphRuns, graphActions, sourceRoot: sourceRoot ?? null, integration, errors, gaps, staleSources, unverifiedEventFlags, manualPlaythroughsCertified: false, ...(process.argv.includes('--details') ? { records, sourceHashes, butterflyFactConnections: BUTTERFLY_FACT_CONNECTIONS } : {}) }, null, 2));
if (errors.length) process.exitCode = 1;
