import { describe, expect, it } from 'vitest';
import { CASE_PRESETS, compatibleEntities, instantiatePreset } from '../content/patients';
import { initialGraphState } from '../content/clinical';
import { fullGraph, visibleClinicalReports } from '../game/clinical';
import type { Entry, Patient, Run } from '../game/types';
import { patientBaseline, patientNoteCategory, patientNotes, patientReports } from './record-notes';

function fixture() {
  const preset = CASE_PRESETS[0], entity = compatibleEntities(preset)[0];
  const p = { uid: 'notes-a', caseId: preset.id, preset: instantiatePreset(preset, entity, 'notes-a') } as Patient;
  const r = { queue: [], journal: [], patients: [p], facts: {}, vitals: { stamina: 100, san: 100, emotion: 100 }, seed: 'notes' } as unknown as Run;
  const entry = (patch: Partial<Entry> = {}): Entry => ({ id: 'entry', day: 1, title: '床旁', choice: '检查已经做完', result: '原始记录', scope: { kind: 'patient', id: p.uid }, flags: [], ...patch });
  return { r, p, entry };
}

describe('patient record categories follow committed action metadata', () => {
  it('does not infer an examination from a label, a step number, or a treatment mention', () => {
    const { r, p, entry } = fixture();
    expect(patientNoteCategory(r, p, entry({ operation: 'history' }))).toBe('history');
    expect(patientNoteCategory(r, p, entry({ operation: 'treatment', choice: '检查后继续治疗' }))).toBe('treatment');
    expect(patientNoteCategory(r, p, entry({ id: `${p.uid}:fake-s1`, choice: '复查核对检验' }))).toBe('treatment');
  });
  it('includes examination attempts with their actual result, including failed attempts', () => {
    const { r, p, entry } = fixture();
    r.journal = [entry({ operation: 'full-exam', choice: '床旁查体', result: '这次未取得可靠体征。' })];
    expect(patientNotes(r, p).examination[0].result).toBe('这次未取得可靠体征。');
    expect(patientNotes(r, p).history).toEqual([]);
  });
  it('classifies all 208 presets by exact authored action IDs for older saves', () => {
    const { r, p, entry } = fixture();
    for (const preset of CASE_PRESETS) {
      p.caseId = preset.id; p.preset = instantiatePreset(preset, compatibleEntities(preset)[0], p.uid);
      const actions = p.preset.steps.flatMap(s => s.options);
      const history = actions.find(o => o.id.endsWith(':entry:history'))!;
      const targeted = actions.find(o => o.id.endsWith(':investigate:targeted'))!;
      const treatment = actions.find(o => o.id.endsWith(':decision:tailored'))!;
      const entryCategory = history.mechanics?.operation === 'history' ? 'history' : ['observe', 'exam', 'full-exam'].includes(history.mechanics?.operation ?? '') ? 'examination' : 'treatment';
      expect(patientNoteCategory(r, p, entry({ id: history.id })), preset.id).toBe(entryCategory);
      if(preset.id==='C-158'){
        // Source 12/07: full-body examination directly reveals the rash;
        // the preserved historical :entry:history suffix is not its mechanism.
        expect(history.mechanics?.operation).toBe('full-exam');expect(history.result).toContain('双下肢与臀部');expect(entryCategory).toBe('examination');
      }
      const expected = targeted.mechanics?.operation === 'history' ? 'history' : ['observe', 'exam', 'full-exam'].includes(targeted.mechanics?.operation ?? '') ? 'examination' : 'treatment';
      expect(patientNoteCategory(r, p, entry({ id: targeted.id })), preset.id).toBe(expected);
      expect(patientNoteCategory(r, p, entry({ id: treatment.id })), preset.id).toBe('treatment');
    }
  });
  it('resolves legacy full-graph IDs to their authored operation, never their label', () => {
    const { r, p, entry } = fixture(); const graph = fullGraph('C001')!;
    p.caseId = graph.id; p.clinical = initialGraphState(graph, r.seed); delete p.preset;
    const history = graph.nodes.flatMap(n => n.options).find(o => o.mechanics?.operation === 'history')!;
    expect(patientNoteCategory(r, p, entry({ id: `${p.uid}:graph:${history.id}:0` }))).toBe('history');
  });
  it('keeps T02 old-chart clues separate and cannot manufacture a report', () => {
    const { r, p, entry } = fixture(); const graph = fullGraph('C001')!;
    p.caseId = graph.id; p.clinical = initialGraphState(graph, r.seed); delete p.preset;
    const before = visibleClinicalReports(r, p);
    r.journal = [entry({ id: `${p.uid}:graph:s1:ability:chart-review`, result: '旧病历提到既往用药。' })];
    expect(patientNotes(r, p).history).toHaveLength(1);
    expect(patientNotes(r, p).examination).toEqual([]);
    expect(visibleClinicalReports(r, p)).toEqual(before);
  });
  it('makes the source presentation visible before any new examination is performed', () => {
    const { r, p } = fixture(); const graph = fullGraph('C013')!;
    p.caseId = graph.id; p.clinical = initialGraphState(graph, r.seed); delete p.preset;
    const baseline = patientBaseline(p);
    expect(baseline.history).toEqual(graph.presentation.history);
    expect(baseline.observations).toEqual([graph.presentation.vitals, graph.presentation.appearance].filter(Boolean));
    expect(baseline.observations.join('')).toContain('186/108');
    expect(patientNotes(r, p).examination).toEqual([]);
    expect(visibleClinicalReports(r, p)).toEqual([]);
  });
  it('keeps other patients’ notes out and preserves every scoped note exactly once', () => {
    const { r, p, entry } = fixture();
    r.journal = [entry({ operation: 'history' }), entry({ id: 'exam', operation: 'exam' }), entry({ id: 'unknown' }), entry({ id: 'other', operation: 'exam', scope: { kind: 'patient', id: 'notes-b' } })];
    const notes = patientNotes(r, p);
    expect([notes.history.length, notes.examination.length, notes.treatment.length]).toEqual([1, 1, 1]);
    expect(Object.values(notes).flat().map(e => e.id)).not.toContain('other');
  });
  it('shows a dated authored critical result only for its real recipient without unlocking graph tests', () => {
    const {r,p,entry}=fixture(),graph=fullGraph('C013')!;
    p.caseId=graph.id;p.name='韩峻';p.bed=5;p.clinical=initialGraphState(graph,r.seed);delete p.preset;
    const original=structuredClone(p),lab='检验科本次电话报告：韩峻，5床，血钾 6.8 mmol/L。报告于第2天交班收到，处置尚待记录。';
    r.journal=[entry({id:'event:E-046:critical-report',day:2,result:lab,flags:[`critical-potassium-received:${p.uid}`]}),
      entry({id:'other:E-046:critical-report',result:'另一患者的危急值',scope:{kind:'patient',id:'other'},flags:['critical-potassium-received:other']}),
      entry({id:'not-a-lab:critical-report',result:'未接到危急值',flags:[]})];
    expect(patientReports(r,p)).toEqual([{id:'event:E-046:critical-report',title:'第2天 · 检验科危急值通知',full:lab,skimmed:lab,skimmedNow:false}]);
    expect(visibleClinicalReports(r,p)).toEqual([]);expect(p).toEqual(original);
  });
  it('uses the real primary bed and identity in the initial chart without merging the other same-name patient',()=>{
    const {p}=fixture();p.caseId='C009';p.name='靳砚舟';p.bed=5;delete p.preset;
    const baseline=patientBaseline(p),text=[...baseline.history,...baseline.observations].join('\n');
    expect(text).not.toMatch(/31\s*床|33\s*床/);
    expect(text).toContain('102/64');expect(text).toContain('5 床');expect(text).toContain('另一张同名患者的床');
  });
});
