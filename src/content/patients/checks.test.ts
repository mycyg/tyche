import { describe, expect, it } from 'vitest';
import { CASE_PRESETS } from './index';
import { presetProbes } from './checks';
describe('source probes report only the evidence actually obtained', () => {
  it('retains every source DC while keeping full work-up separate', () => {
    for (const p of CASE_PRESETS) for (const [index, probe] of presetProbes(p).entries()) {
      const o = p.scenes.flatMap(s => s.options).find(o => o.id.includes(`source-probe-${index + 1}`))!;
      expect(o.check!.dc).toBe(probe.dc);
      expect(o.effects.flags).not.toContain(`preset:${p.id}:revealed`);
      expect(o.result.length).toBeGreaterThan(20);
      expect(o.check!.failure.flags).not.toContain(`preset:${p.id}:revealed`);
    }
  });
  it('does not get blood tests, an angiogram or an ultrasound from a history answer', () => {
    for (const [id, forbidden, evidence] of [['C-165', /76×|310|980/, '头痛'], ['C-090', /M1|闭塞/, '利伐沙班'], ['C-173', /320,000|蜂窝状/, '宫底'], ['C-022', /已确诊|确认妊娠/, '月经']] as const) {
      const p = CASE_PRESETS.find(p => p.id === id)!;
      const o = p.scenes.flatMap(s => s.options).find(o => o.id.includes('source-probe-1'))!;
      expect(o.result).not.toMatch(forbidden); expect(o.result).toContain(evidence);
    }
  });
  it('does not reinterpret an unperformed C013 CT as an already available image', () => {
    const p = CASE_PRESETS.find(p => p.id === 'C-013')!;
    const o = p.scenes.find(s => s.id.endsWith(':decision'))!.options.find(o => o.id.includes('source-probe-2'))!;
    expect(o.when!.all).toContain('preset:C-013:revealed');
    expect(o.when!.none).toContain('preset:C-013:probe-2-passed');
  });
  it('does not promote targeted history and physical assessment into imaging reports', () => {
    for (const [id, forbidden] of [['C-090', /M1|闭塞/], ['C-087', /上矢状窦|确诊/], ['C-161', /硬膜下出血|视网膜出血|肋骨骨折/]] as const) {
      const p = CASE_PRESETS.find(p => p.id === id)!;
      const o = p.scenes.flatMap(s => s.options).find(o => o.id.endsWith(':investigate:targeted'))!;
      expect(o.result).not.toMatch(forbidden);
      expect(o.result).toContain('尚未完成');
    }
  });
});
