import { pronounce, voiceKey, voiceSentences, voiceText } from './voice-text';
import { audioLevel, crossfadeProgress } from './audio-mix';
import { createVoicePlanner,voiceAssetUrl,type VoiceClip } from './voice-plan';
import { dialogueSegments,type SpeechSegment } from './dialogue-voice';
import type {MusicScene}from '../shared/audio-assets';

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
let planVoice:ReturnType<typeof createVoicePlanner>|undefined;
let lastNarration: SpeechSegment[] | undefined;
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
function switchScore() {
  if (!unlocked || settings.music === false || hidden()) { score?.pause(); outgoing?.pause(); return; }
  if (activeScene === playingScene && score) { levels(); void safePlay(score); return; }
  cancelAnimationFrame(fadeFrame);
  outgoing?.pause(); outgoing = score;
  score = new Audio(`${import.meta.env.BASE_URL}audio/music/${activeScene}.mp3`);
  score.loop = true; score.preload = 'metadata'; score.volume = 0;
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
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  levels();
}
function index(): Promise<Record<string, VoiceAsset>> {
  return voiceIndex ??= fetch(`${import.meta.env.BASE_URL}audio/voice/index.json`,{cache:'no-cache'})
    .then(response => response.ok ? response.json() as Promise<Record<string, VoiceAsset>> : {} as Record<string, VoiceAsset>)
    .catch(() => ({} as Record<string, VoiceAsset>));
}
function nativeLine(text: string, speaker: string, epoch: number): Promise<void> {
  return new Promise(resolve => {
    if (typeof speechSynthesis === 'undefined' || epoch !== narrationEpoch) { resolve(); return; }
    const utterance = new SpeechSynthesisUtterance(pronounce(text));
    const chinese = speechSynthesis.getVoices().filter(v => /^zh/.test(v.lang));
    utterance.voice = chinese.find(v => /tingting|婷婷|xiaoxiao|晓晓/i.test(v.name)) ?? chinese[0] ?? null;
    utterance.lang = 'zh-CN'; utterance.rate = 1; utterance.pitch = ['chief', 'father', 'peer', 'patient-male'].includes(speaker) ? .8 : 1;
    utterance.volume = volume(settings.voiceVolume, .85);
    utterance.onend = () => resolve(); utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}
async function assetLine(asset: VoiceAsset, epoch: number): Promise<boolean> {
  return new Promise(resolve => {
    if (epoch !== narrationEpoch) { resolve(true); return; }
    const audio = new Audio(voiceAssetUrl(import.meta.env.BASE_URL,asset));
    speech = audio; audio.volume = volume(settings.voiceVolume, .85);
    audio.onended = () => resolve(true); audio.onerror = () => resolve(false);
    audio.onpause = () => { if (epoch !== narrationEpoch) resolve(true); };
    void audio.play().catch(() => resolve(false));
  });
}
/** One serial channel. Changing scenes invalidates every pending playback callback. */
async function playNarration(segments:SpeechSegment[]) {
  lastNarration = segments;
  stopVoice();
  if (!unlocked || settings.voice === false || hidden() || !segments.some(s=>voiceText(s.text))) return;
  const epoch = narrationEpoch, catalog = await index();
  if (epoch !== narrationEpoch) return;
  speaking = true; levels();
  for(const {text,speaker}of segments){
   const whole = catalog[voiceKey(text, speaker)] ?? catalog[voiceKey(text)];
   const lines = whole ? [text] : voiceSentences(text);
   for (const line of lines) {
    if (epoch !== narrationEpoch || hidden()) break;
    const asset = catalog[voiceKey(line, speaker)] ?? catalog[voiceKey(line)];
    if(asset){if(!await assetLine(asset,epoch))await nativeLine(line,speaker,epoch);continue;}
    const composed=(planVoice??=createVoicePlanner(catalog))(line,speaker);
    if(!composed){await nativeLine(line,speaker,epoch);continue;}
    // Never skip a missing word. Composition is accepted only when the entire
    // line can be voiced; native synthesis is the network-error fallback.
    for(const part of composed){if(epoch!==narrationEpoch||hidden())break;if(!await assetLine(part,epoch)){await nativeLine(part.text,part.speaker,epoch);}}
   }
  }
  if (epoch === narrationEpoch) { speaking = false; levels(); }
}
export function narrate(text:string,speaker='narrator'){return playNarration([{text,speaker}]);}
export function narrateDialogue(text:string,actor='narrator'){return playNarration(dialogueSegments(text,actor));}
export function replayVoice() { if (lastNarration) void playNarration(lastNarration); }
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
