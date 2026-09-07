import { describe, expect, it } from 'vitest';
import { audioLevel, crossfadeProgress } from './audio-mix';

describe('music crossfade boundaries', () => {
  it('accepts an animation timestamp earlier than the request without a negative media volume', () => {
    expect(crossfadeProgress(999.64, 1000)).toBe(0);
    expect(crossfadeProgress(1600, 1000)).toBe(.5);
    expect(crossfadeProgress(9000, 1000)).toBe(1);
  });
  it('never exposes invalid media volume at pause, narration cleanup or scene transitions', () => {
    for (const value of [-Infinity, -2, -.0003, 0, .26, 1, 3, Infinity, NaN, undefined]) {
      const level = audioLevel(value, .4);
      expect(Number.isFinite(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });
});
