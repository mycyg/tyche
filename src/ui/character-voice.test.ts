import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {CHARACTER_VOICE_CUES,CHARACTER_VOICES} from '../shared/character-voices';
import {characterSpeaker} from './character-voice';

describe('character reactions',()=>{
  it('every character has two or three unique short lines and no narrator pack',()=>{
    expect(CHARACTER_VOICES.narrator).toBeUndefined();
    for(const actor of Object.values(CHARACTER_VOICES)){
      expect(actor.lines.length).toBeGreaterThanOrEqual(2);expect(actor.lines.length).toBeLessThanOrEqual(3);
      expect(new Set(actor.lines).size).toBe(actor.lines.length);
      for(const line of actor.lines)expect(line.length).toBeLessThanOrEqual(12);
    }
  });
  it('keeps the interaction actor and leaves unattributed narration silent',()=>{
    expect(characterSpeaker('周乔抬头看了一眼钟。','research')).toBe('research');
    expect(characterSpeaker('主任把文件里的“按规定办理”圈起来。')).toBeUndefined();
    expect(characterSpeaker('护士长说：“慢慢说。”')).toBe('nurse');
    expect(characterSpeaker('病历已经归档。')).toBeUndefined();
    expect(characterSpeaker('病历已经归档。','constructor')).toBeUndefined();
  });
});

describe('the actual audio player',()=>{
  const played:string[]=[];
  let catalog:Record<string,{file:string;text:string;speaker:string;version:string}>;
  let rejectPlayback=false;
  beforeEach(()=>{
    vi.resetModules();played.length=0;rejectPlayback=false;
    catalog=Object.fromEntries(CHARACTER_VOICE_CUES.map(c=>[c.id,{...c,file:`${c.id}.mp3`,version:'fresh'}]));
    vi.stubGlobal('document',{hidden:false});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>catalog})));
    vi.stubGlobal('speechSynthesis',{speak:vi.fn()});
    vi.stubGlobal('Audio',class {
      volume=1;onended?:()=>void;onerror?:()=>void;onpause?:()=>void;
      constructor(readonly src:string){}
      play(){played.push(this.src);if(rejectPlayback)return Promise.reject(new Error('offline'));queueMicrotask(()=>this.onended?.());return Promise.resolve();}
      pause(){this.onpause?.();}
    });
  });
  afterEach(()=>{vi.unstubAllGlobals();});
  async function player(){const audio=await import('./audio');audio.configureAudio({sound:true,music:false,voice:true});audio.unlockAudio();return audio;}
  it('rotates three lines within one role and replays the same recording',async()=>{
    const audio=await player();
    for(let i=0;i<4;i++)await audio.narrateDialogue('周乔抬起头。','research');
    await audio.replayVoice();
    expect(played.map(url=>url.match(/reaction-[^?]+/)?.[0])).toEqual(['reaction-research-1.mp3','reaction-research-2.mp3','reaction-research-3.mp3','reaction-research-1.mp3','reaction-research-1.mp3']);
    expect(played.every(url=>url.includes('/audio/character-voice/'))).toBe(true);
    await audio.narrateDialogue('“嗯。”','chief');expect(played.at(-1)).toContain('reaction-chief-1.mp3');
  });
  it('never reads narration, records, or numeric rules with TTS',async()=>{
    const audio=await player();
    await audio.narrate('体力减少五点。');await audio.narrateDialogue('病历上写着“需要复查”。');
    expect(played).toEqual([]);expect(fetch).not.toHaveBeenCalled();expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });
  it('stays quiet for missing or wrong-role files and failed playback',async()=>{
    const audio=await player();delete catalog['reaction-chief-1'];
    await audio.narrate('','chief');catalog['reaction-chief-2'].speaker='mother';await audio.narrate('','chief');
    expect(played).toEqual([]);rejectPlayback=true;await audio.narrate('','chief');
    expect(played).toHaveLength(1);expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });
  it('invalidates a queued old character when another interaction begins',async()=>{
    let deliver!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{deliver=resolve;})));
    const audio=await player(),old=audio.narrate('','chief'),next=audio.narrate('','nurse');
    deliver({ok:true,json:async()=>catalog});await Promise.all([old,next]);
    expect(played).toHaveLength(1);expect(played[0]).toContain('reaction-nurse-1.mp3');
  });
  it('respects the character voice switch',async()=>{
    const audio=await player();audio.configureAudio({sound:true,music:false,voice:false});
    await audio.narrate('','nurse');expect(played).toEqual([]);
  });
});
