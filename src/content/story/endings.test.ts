import { describe, expect, it } from 'vitest';
import { STORY_ENDING_IDS, STORY_ENDINGS, TRUE_ENDING_ID, isStoryEndingId, storyEndingImagePath } from './endings';

describe('STORY_ENDINGS', () => {
  it('covers exactly the 40 catalogued story keys', () => {
    expect(STORY_ENDING_IDS.length).toBe(40);
    for (const id of STORY_ENDING_IDS) expect(STORY_ENDINGS[id]).toBeDefined();
    expect(Object.keys(STORY_ENDINGS).length).toBe(40);
  });
  it('carries a title, author, scene and non-empty prose for every entry', () => {
    for (const id of STORY_ENDING_IDS) {
      const ending = STORY_ENDINGS[id];
      expect(ending.id).toBe(id);
      expect(ending.title.length).toBeGreaterThan(0);
      expect(ending.author.length).toBeGreaterThan(0);
      expect(ending.scene.length).toBeGreaterThan(0);
      expect(ending.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of ending.paragraphs) expect(paragraph.length).toBeGreaterThan(0);
    }
  });
  it('never duplicates a speech line outside its paragraph text', () => {
    for (const ending of Object.values(STORY_ENDINGS)) {
      const whole = ending.paragraphs.join('\n');
      for (const line of ending.speech) expect(whole).toContain(line.text);
    }
  });
  it('marks END-40 as the only non-dark true ending', () => {
    expect(TRUE_ENDING_ID).toBe('END-40');
    expect(isStoryEndingId('END-40')).toBe(true);
  });
  it('rejects ids outside the catalogued pool', () => {
    expect(isStoryEndingId('END-41')).toBe(false);
    expect(isStoryEndingId(undefined)).toBe(false);
    expect(isStoryEndingId('X24')).toBe(false);
  });
  it('points every id at its own webp under art/endings', () => {
    for (const id of STORY_ENDING_IDS) expect(storyEndingImagePath(id)).toBe(`art/endings/${id}.webp`);
  });
});
