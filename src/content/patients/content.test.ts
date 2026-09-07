import { describe, it, expect } from 'vitest';
import { CASE_PRESETS, PATIENT_ENTITIES, compatibleEntities, instantiatePreset, PRESET_END } from './index';
import type { Condition, Scene } from '../../game/types';

const available = (when: Condition | undefined, facts: Set<string>) => !when ||
  (!when.all || when.all.every(f => facts.has(f))) && (!when.any || when.any.some(f => facts.has(f))) && (!when.none || when.none.every(f => !facts.has(f)));

function walk(steps: Scene[]) {
  const queue: { node: string; facts: Set<string> }[] = [{ node: steps[0].id, facts: new Set() }];
  const seen = new Set<string>(); const choices = new Set<string>(); let endpoints = 0;
  while (queue.length) {
    const state = queue.pop()!;
    const key = `${state.node}|${[...state.facts].sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 30000) throw new Error(`Unbounded graph: ${steps[0].id}`);
    if (state.node === PRESET_END) { endpoints++; continue; }
    const node = steps.find(s => s.id === state.node);
    if (!node) throw new Error(`Missing target: ${state.node}`);
    const options = node.options.filter(o => available(o.when, state.facts));
    if (!options.length) throw new Error(`Deadlock: ${node.id}`);
    for (const o of options) {
      choices.add(o.id);
      for (const effects of [o.effects, ...(o.check ? [o.check.failure] : [])]) {
        const facts = new Set(state.facts);
        effects.flags?.forEach(f => facts.add(f)); effects.clear?.forEach(f => facts.delete(f));
        queue.push({ node: o.next!, facts });
      }
    }
  }
  return { choices, endpoints };
}

describe('complete patient and preset library', () => {
  it('preserves every original identity and every numbered preset', () => {
    expect(PATIENT_ENTITIES.filter(e => e.original)).toHaveLength(222);
    expect(CASE_PRESETS).toHaveLength(208);
    expect(new Set(PATIENT_ENTITIES.map(e => e.name)).size).toBe(PATIENT_ENTITIES.length);
    CASE_PRESETS.forEach((p, i) => expect(p.id).toBe(`C-${String(i + 1).padStart(3, '0')}`));
    PATIENT_ENTITIES.forEach((e, i) => expect(e.id).toBe(`P-${String(i + 1).padStart(3, '0')}`));
  });
  it('has strict legal entity matches for all presets, including newborns', () => {
    for (const p of CASE_PRESETS) expect(compatibleEntities(p).length, p.id).toBeGreaterThan(0);
    for (const entity of PATIENT_ENTITIES) expect(CASE_PRESETS.some(p => compatibleEntities(p).some(e => e.id === entity.id)), entity.id).toBe(true);
    for (const id of ['C-134', 'C-145', 'C-149', 'C-153', 'C-154']) {
      for (const entity of compatibleEntities(CASE_PRESETS.find(p => p.id === id)!)) expect(entity.ageYears).toBeLessThanOrEqual(28 / 365);
    }
  });
  it('keeps each routine route at one action and exactly the source duration', () => {
    for (const p of CASE_PRESETS) {
      const route = p.safeRoute.map(id => p.scenes.flatMap(s => s.options).find(o => o.id === id)!);
      expect(route.reduce((n, o) => n + o.ap, 0), p.id).toBe(1);
      expect(route.reduce((n, o) => n + o.minutes, 0), p.id).toBe(p.minutes);
      expect(route.every(o => !o.effects.hazards?.length)).toBe(true);
    }
  });
  it('uses explicit period variants and patient-led base billing', () => {
    for (const entity of PATIENT_ENTITIES) {
      const legal = CASE_PRESETS.flatMap(p => p.constraints.periods.filter(period => compatibleEntities(p, period).some(e => e.id === entity.id)).map(period => ({ p, period })));
      expect(legal.length, entity.id).toBeGreaterThan(0);
      for (const { p, period } of legal) expect(instantiatePreset(p, entity, 'period-test', period).period).toBe(period);
    }
    for (const p of CASE_PRESETS) expect(p.baseCost, p.id).toBe(Math.round(p.budget * (p.dip.startsWith('住院') ? .6 : .08)));
  }, 30000);
  it('does not expose authoring checks in player scene copy', () => {
    for (const p of CASE_PRESETS) {
      expect(p.hasHidden ? p.hiddenFact.length : 1, p.id).toBeGreaterThan(0);
      const instance = instantiatePreset(p, compatibleEntities(p)[0], 'copy');
      const text = instance.steps.flatMap(s => [s.text, ...s.options.flatMap(o => [o.label, o.result])]).join('\n');
      expect(text, p.id).not.toMatch(/\bDC\s*\d+|直接揭示|本例(?:目标|核心)|家属在场[^；。]*−/);
    }
  });
  it('preserves diagnostic laboratory concentrations and historic order evidence', () => {
    const p67 = CASE_PRESETS.find(p => p.id === 'C-067')!;
    const current67 = instantiatePreset(p67, compatibleEntities(p67).find(e=>e.id==='P-174')!,'actual-elderly-sodium');
    expect(current67.complaint).toContain('血钠 118 mmol/L');
    expect(current67.steps.find(s=>s.id.endsWith(':entry'))!.text).toContain('血钠 118 mmol/L');
    expect(current67.complaint).toContain('氢氯噻嗪 25 mg qd');
    expect(current67.complaint).not.toContain('舍曲林');
    const p70 = CASE_PRESETS.find(p => p.id === 'C-070')!;
    const instance = instantiatePreset(p70, compatibleEntities(p70)[0], 'lab-safe');
    const text = instance.steps.map(s => s.text).join('\n');
    expect(text).toContain('6.8 mmol/L');
    expect(text).not.toContain('71 岁男');
    expect(text).not.toContain('3 床血钾');
    const p83 = CASE_PRESETS.find(p => p.id === 'C-083')!;
    expect(instantiatePreset(p83, compatibleEntities(p83)[0]).steps.map(s => s.text).join('\n')).toContain('46,000 U/L');
    const anticoagulant = CASE_PRESETS.find(p => p.id === 'C-027')!;
    expect(instantiatePreset(anticoagulant, compatibleEntities(anticoagulant)[0]).complaint).toMatch(/华法林.*3 mg.*调至.*4.5 mg/);
    const infant = CASE_PRESETS.find(p => p.id === 'C-156')!;
    const instance156 = instantiatePreset(infant, compatibleEntities(infant)[0]);
    expect(instance156.complaint).not.toMatch(/^男\s*5\s*周/);
    expect(instance156.title).toBe('吐完还要吃的婴儿');
    for (const preset of CASE_PRESETS) {
      const instance = instantiatePreset(preset, compatibleEntities(preset)[0]);
      expect(instance.complaint, preset.id).not.toMatch(/^(?:男|女)?\s*\d+\s*(?:岁|月|周|天|小时)/);
      expect(instance.steps.flatMap(s => [s.text, ...s.options.flatMap(o => [o.label, o.result])]).join('\n'), preset.id).not.toMatch(/累计约\s*\/|调至\s*已\s*\d/);
    }
  });
  it('preserves every sourced baseline concentration, measured unit and comparator across all 208 presets',()=>{
    const measurement=/(?:[<>≤≥]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*[–~—-]\s*\d+(?:\.\d+)?)?\s*(?:mmol\/[Ll]|[μµu]mol\/[Ll]|mg\/(?:d[Ll]|[Ll])|g\/[Ll]|(?:I?U)\/[Ll]|mmHg|%)/g;
    const comparator=/[<>≤≥]\s*\d+(?:\.\d+)?/g;
    let measurements=0;
    for(const p of CASE_PRESETS){
      const instance=instantiatePreset(p,compatibleEntities(p)[0],`baseline-audit-${p.id}`);
      const rendered=instance.complaint.replace(/\s/g,'');
      for(const pattern of [measurement,comparator])for(const [value]of p.presentation.matchAll(pattern)){
        expect(rendered,`${p.id}: ${value}`).toContain(value.replace(/\s/g,''));
        if(pattern===measurement)measurements++;
      }
      expect(instance.complaint,p.id).not.toMatch(/(?:Na|K|血钠|血钾)\s*\/[Ll]\b/);
    }
    expect(measurements).toBeGreaterThan(25);
    // Present baseline rows use words rather than inequality symbols. Exercise
    // comparator parsing explicitly without inserting invented patient results.
    const p=CASE_PRESETS.find(p=>p.id==='C-067')!,source={...p,presentation:'Na <118 mmol/L，K >6.5 mmol/L，Cr ≥78 μmol/L，血糖 ≤3.1 mmol/L'};
    const explicit=instantiatePreset(source,compatibleEntities(p)[0],'comparator-fixture').complaint;
    for(const value of ['<118 mmol/L','>6.5 mmol/L','≥78 μmol/L','≤3.1 mmol/L'])expect(explicit).toContain(value);
  });
  it('does not grant diagnostic results merely by calling a colleague to the first encounter', () => {
    for (const p of CASE_PRESETS) {
      const team = p.scenes[0].options.find(o => o.id.endsWith(':team'))!;
      expect(team.next).toBe(`preset:${p.id}:investigate`);
      expect(team.effects.flags).not.toContain(`preset:${p.id}:revealed`);
    }
  });
  it('all original trap weights appear in a real selectable option', () => {
    for (const p of CASE_PRESETS) {
      const options = p.scenes.flatMap(s => s.options);
      for (const h of p.hazards) expect(options.some(o => o.effects.hazards?.some(actual => actual.type === h.type && actual.weight === h.weight && actual.reason === h.reason)), `${p.id} ${h.type}${h.weight}`).toBe(true);
    }
  });
  it('every option is reachable, all branches terminate, and identities stay scoped', () => {
    for (const p of CASE_PRESETS) {
      const entity = compatibleEntities(p)[0];
      const instance = instantiatePreset(p, entity, 'test-a');
      const result = walk(instance.steps);
      expect(result.endpoints, p.id).toBeGreaterThan(0);
      for (const o of instance.steps.flatMap(s => s.options)) expect(result.choices.has(o.id), o.id).toBe(true);
      expect(JSON.stringify(instance.steps)).not.toContain(`preset:${p.id}:test-b`);
    }
  }, 30000);
  it('a hidden entity fact changes which treatment actions are available', () => {
    const preset = CASE_PRESETS.find(p => compatibleEntities(p).some(e => e.concealment >= 2))!;
    const entity = compatibleEntities(preset).find(e => e.concealment >= 2)!;
    const instance = instantiatePreset(preset, entity, 'secret');
    const treatment = instance.steps.flatMap(s => s.options).find(o => o.id.endsWith(':tailored'))!;
    expect(treatment.when?.all).toContain(`preset:${preset.id}:secret:entity-verified`);
    const actions = instance.steps.flatMap(s => s.options);
    expect(actions.some(o => o.id.endsWith(':entity-recheck') && o.ap > 0)).toBe(true);
  });
  it('a cost or paperwork trap cannot automatically acquire clinical injury on deferral', () => {
    for (const p of CASE_PRESETS) {
      for (const option of p.scenes.flatMap(s => s.options).filter(o => o.id.includes(':trap-'))) {
        if (!option.effects.hazards?.some(h => h.type === 'R' && h.causal)) {
          const facts = new Set(option.effects.flags);
          const rescue = p.scenes.find(s => s.id === option.next)!;
          const defer = rescue.options.find(o => o.id.includes(':defer') && available(o.when, facts))!;
          expect(defer.effects.damage ?? 0, option.id).toBe(0);
        }
      }
    }
  });
});
