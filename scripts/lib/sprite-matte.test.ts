import { describe, expect, it } from 'vitest';
import { removeSpriteMatte } from './sprite-matte.mjs';

describe('sprite matte extraction', () => {
  it('preserves opaque burgundy hair and its highlights, including the silhouette edge', () => {
    const colours = [[255,30,189,255], [92,25,61,255], [147,54,110,255], [182,80,138,255], [246,246,246,255]];
    const pixels = Buffer.from(colours.flat());
    removeSpriteMatte(pixels, colours.length, 1);
    expect([...pixels.subarray(0,4)]).toEqual([0,0,0,0]);
    expect([...pixels.subarray(4)]).toEqual(colours.slice(1).flat());
  });
  it('clears strong matte inside limb gaps and connected dark fringe, without erasing isolated dark purple', () => {
    const pixels = Buffer.from([[255,0,255,255],[80,10,80,255],[25,25,30,255],[80,10,80,255],[25,25,30,255],[255,0,255,255]].flat());
    removeSpriteMatte(pixels,6,1);
    expect([...pixels.subarray(0,8)]).toEqual(Array(8).fill(0));
    expect([...pixels.subarray(12,16)]).toEqual([80,10,80,255]);
    expect([...pixels.subarray(20,24)]).toEqual([0,0,0,0]);
  });
});
