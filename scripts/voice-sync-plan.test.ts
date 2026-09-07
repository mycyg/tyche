import {describe, expect, it} from 'vitest';
import {needsVoiceTransfer, remoteVoicePaths, type SyncVoiceRecord} from './voice-sync-plan';

const expected = {textSha256: 'spoken-text', speaker: 'narrator'};
const clip: SyncVoiceRecord = {...expected, file: 'v-0123456789abcdef.mp3', sha256: 'recording-a'};

describe('voice transfer selection', () => {
  it('supports isolated Linux workspaces and preserves the Windows default', () => {
    expect(remoteVoicePaths()).toEqual({output:'E:/TycheAudio/output',archive:'E:/TycheAudio/transfer.tar',tar:'tar.exe'});
    expect(remoteVoicePaths('/srv/tyche-audio')).toEqual({output:'/srv/tyche-audio/output',archive:'/srv/tyche-audio/transfer.tar',tar:'tar'});
    for (const root of ['relative','/srv/../other','/srv/audio;echo bad','/srv/$(whoami)']) expect(()=>remoteVoicePaths(root)).toThrow();
  });
  it('copies a new recording even when text and actor are unchanged', () => {
    expect(needsVoiceTransfer(expected, {...clip, sha256: 'recording-b'}, clip, true)).toBe(true);
  });
  it('reuses an unchanged recording without copying or hashing its file', () => {
    expect(needsVoiceTransfer(expected, clip, {...clip}, true)).toBe(false);
  });
  it('restores absent files and records', () => {
    expect(needsVoiceTransfer(expected, clip, clip, false)).toBe(true);
    expect(needsVoiceTransfer(expected, clip, undefined, false)).toBe(true);
  });
  it('does not import an unfinished old text or wrong actor', () => {
    expect(needsVoiceTransfer(expected, {...clip, textSha256: 'old'}, clip, true)).toBe(false);
    expect(needsVoiceTransfer(expected, {...clip, speaker: 'hero'}, clip, true)).toBe(false);
    expect(needsVoiceTransfer(expected, undefined, clip, true)).toBe(false);
  });
});
