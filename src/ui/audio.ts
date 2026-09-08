import { audioLevel, crossfadeProgress } from './audio-mix';
import { voiceAssetUrl,type VoiceClip } from './voice-plan';
import { CHARACTER_VOICES,characterVoiceId } from '../shared/character-voices';
import { characterSpeaker } from './character-voice';
import { MUSIC_LOOP_POINTS, MUSIC_OGG_SCENES, type MusicScene } from '../shared/audio-assets';

export interface AudioSettings {
  sound: boolean;
  music?: boolean;
  voice?: boolean;
  musicVolume?: number;
  voiceVolume?: number;
  soundVolume?: number;
}
type VoiceAsset = VoiceClip;
let context: AudioContext | undefined;
let settings: AudioSettings = { sound: true, music: true, voice: true, musicVolume: .4, voiceVolume: .85, soundVolume: .5 };
let unlocked = false, activeScene: MusicScene = 'title', playingScene = '';
let score: HTMLAudioElement | undefined, outgoing: HTMLAudioElement | undefined;
let speech: HTMLAudioElement | undefined, speaking = false, narrationEpoch = 0, fadeFrame = 0;
let voiceIndex: Promise<Record<string, VoiceAsset>> | undefined;
const voiceTurns=new Map<string,number>();
let lastReaction:{speaker:string;id:string}|undefined;
let scoreMix = 1;
const volume = audioLevel;
const safePlay = (audio: HTMLAudioElement) => audio.play().catch(() => {});
const hidden = () => typeof document === 'undefined' || document.hidden;
function levels() {
  const music = settings.music !== false && !hidden() ? volume(settings.musicVolume, .4) * (speaking ? .26 : 1) : 0;
  if (score) score.volume = volume(music * scoreMix);
  if (outgoing) outgoing.volume = volume(music * (1 - scoreMix));
  if (speech) speech.volume = volume(settings.voiceVolume, .85);
}
let oggSupport: boolean | undefined;
/** Cached once: jsdom and very old browsers report no codec support, which just keeps every scene on mp3. */
function supportsOgg(): boolean {
  if (oggSupport !== undefined) return oggSupport;
  try { oggSupport = typeof Audio !== 'undefined' && !!new Audio().canPlayType('audio/ogg; codecs="vorbis"'); }
  catch { oggSupport = false; }
  return oggSupport;
}
function switchScore() {
  if (!unlocked || settings.music === false || hidden()) { score?.pause(); outgoing?.pause(); return; }
  if (activeScene === playingScene && score) { levels(); void safePlay(score); return; }
  cancelAnimationFrame(fadeFrame);
  outgoing?.pause(); outgoing = score;
  const ext = MUSIC_OGG_SCENES.has(activeScene) && supportsOgg() ? 'ogg' : 'mp3';
  const audio = new Audio(`${import.meta.env.BASE_URL}audio/music/${activeScene}.${ext}`);
  const loop = MUSIC_LOOP_POINTS[activeScene];
  if (loop) {
    // Seek to the manifest's loop point instead of native <audio loop>, which just restarts
    // at 0:00 and would ignore a future track whose loop body starts after an intro.
    const loopStart = loop.loopStart / loop.sampleRate, loopEnd = loop.loopEndSamples / loop.sampleRate;
    audio.addEventListener('timeupdate', () => { if (audio.currentTime >= loopEnd) audio.currentTime = loopStart; });
  } else audio.loop = true;
  audio.preload = 'metadata'; audio.volume = 0;
  score = audio;
  playingScene = activeScene; scoreMix = outgoing ? 0 : 1;
  void safePlay(score);
  const start = performance.now();
  const fade = (time: number) => {
    scoreMix = crossfadeProgress(time, start); levels();
    if (scoreMix < 1) fadeFrame = requestAnimationFrame(fade);
    else { outgoing?.pause(); outgoing = undefined; }
  };
  fadeFrame = requestAnimationFrame(fade);
}
export function configureAudio(next: AudioSettings) {
  settings = { ...settings, ...next };
  if (settings.voice === false) stopVoice();
  levels(); switchScore();
}
export function unlockAudio() {
  if (!unlocked) unlocked = true;
  try { context ??= new AudioContext(); void context.resume().catch(() => {}); } catch { /* Audio is optional on unsupported devices. */ }
  switchScore();
}
export function setMusicScene(scene: MusicScene) { activeScene = scene; switchScore(); }
export function stopVoice() {
  narrationEpoch++; speech?.pause(); speech = undefined; speaking = false;
  levels();
}
function index(): Promise<Record<string, VoiceAsset>> {
  return voiceIndex ??= fetch(`${import.meta.env.BASE_URL}audio/character-voice/index.json`,{cache:'no-cache'})
    .then(response => response.ok ? response.json() as Promise<Record<string, VoiceAsset>> : {} as Record<string, VoiceAsset>)
    .catch(() => ({} as Record<string, VoiceAsset>));
}
async function assetLine(asset: VoiceAsset, epoch: number): Promise<boolean> {
  return new Promise(resolve => {
    if (epoch !== narrationEpoch) { resolve(true); return; }
    const audio = new Audio(voiceAssetUrl(import.meta.env.BASE_URL,asset,'character-voice'));
    speech = audio; audio.volume = volume(settings.voiceVolume, .85);
    audio.onended = () => resolve(true); audio.onerror = () => resolve(false);
    audio.onpause = () => { if (epoch !== narrationEpoch) resolve(true); };
    void audio.play().catch(() => resolve(false));
  });
}
/** Each interaction plays one fixed character reaction. Narration remains silent. */
async function playCharacter(speaker:string,replay=false) {
  stopVoice();
  const actor=Object.hasOwn(CHARACTER_VOICES,speaker)?CHARACTER_VOICES[speaker]:undefined;
  if(!actor){lastReaction=undefined;return;}
  if(!unlocked||settings.voice===false||hidden())return;
  const turn=voiceTurns.get(speaker)??0;
  const id=replay&&lastReaction?.speaker===speaker?lastReaction.id:characterVoiceId(speaker,turn%actor.lines.length);
  if(!replay)voiceTurns.set(speaker,turn+1);
  lastReaction={speaker,id};
  const epoch=narrationEpoch,catalog=await index();
  if(epoch!==narrationEpoch||hidden())return;
  const asset=catalog[id];
  // Wrong-role, absent and unavailable clips stay quiet. Never substitute a narrator or system voice.
  if(!asset||asset.file!==`${id}.mp3`||asset.speaker!==speaker||!actor.lines.includes(asset.text))return;
  speaking=true;levels();
  await assetLine(asset,epoch);
  if(epoch===narrationEpoch){speaking=false;levels();}
}
export function narrate(_text:string,speaker='narrator'){return playCharacter(speaker);}
export function narrateDialogue(text:string,actor='narrator'){return playCharacter(characterSpeaker(text,actor)??'narrator');}
export function replayVoice(){if(lastReaction)return playCharacter(lastReaction.speaker,true);}
export function bindAudioLifecycle() {
  const unlock = () => unlockAudio();
  const visibility = () => {
    if (hidden()) { stopVoice(); score?.pause(); outgoing?.pause(); }
    else switchScore();
  };
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', visibility);
  return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility); stopVoice(); score?.pause(); outgoing?.pause(); cancelAnimationFrame(fadeFrame); };
}
export function cue(enabled: boolean, kind: 'choice' | 'dice' | 'paper' = 'choice') {
  if (!enabled || !unlocked || hidden()) return;
  try {
    context ??= new AudioContext(); void context.resume().catch(() => {});
    const now = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = kind === 'dice' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'dice' ? 160 : kind === 'paper' ? 280 : 440, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'dice' ? 70 : 220, now + .09);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.04 * volume(settings.soundVolume, .5) + .0001, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .12);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + .13);
  } catch { /* Failed audio never interrupts or repeats a committed game action. */ }
}
