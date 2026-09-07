export const MUSIC_SCENES=['title','day','night','pressure','fracture','inquiry','ending-calm','ending-dark','ward-rounds','family-call','research-afterhours','complaint-pressure'] as const;
export type MusicScene=typeof MUSIC_SCENES[number];

/** Exact loop window from public/audio/music/manifest.json, used to seek precisely instead of
 * relying on the file's own tail silence. Every current entry loops the full file (loopStart 0
 * through the whole duration), so a scene missing here just uses native <audio loop>. */
export interface MusicLoopPoint { loopStart: number; loopEndSamples: number; sampleRate: number; }
export const MUSIC_LOOP_POINTS: Partial<Record<MusicScene, MusicLoopPoint>> = {
  'ward-rounds': { loopStart: 0, loopEndSamples: 1280000, sampleRate: 32000 },
  'family-call': { loopStart: 0, loopEndSamples: 1861818, sampleRate: 32000 },
  'research-afterhours': { loopStart: 0, loopEndSamples: 1365333, sampleRate: 32000 },
  'complaint-pressure': { loopStart: 0, loopEndSamples: 1059310, sampleRate: 32000 },
};
/** Scenes shipped with an .ogg alongside the .mp3; every other scene is mp3-only. */
export const MUSIC_OGG_SCENES: ReadonlySet<MusicScene> = new Set(['ward-rounds', 'family-call', 'research-afterhours', 'complaint-pressure']);
