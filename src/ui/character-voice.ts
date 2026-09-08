import {CHARACTER_VOICES} from '../shared/character-voices';
import {dialogueSegments} from './dialogue-voice';

/** An interaction's explicit speaker owns its reaction, even when the panel
 * contains stage directions. A narrative-only panel has no reaction. */
export function characterSpeaker(text:string,actor='narrator'):string|undefined {
  if(Object.hasOwn(CHARACTER_VOICES,actor))return actor;
  return dialogueSegments(text).find(segment=>Object.hasOwn(CHARACTER_VOICES,segment.speaker))?.speaker;
}
