import { hash } from '../game/random';

/** Stable, desynchronised idle timing. It never consumes the gameplay RNG. */
export function idlePose(time: number, identity: string, motion: boolean) {
  if (!motion) return { frame:0, breathe:0, lean:0 };
  const offset=hash(identity), t=time+(offset%7000), cycle=t%6800;
  const frame=cycle<1300 ? 0 : cycle<2500 ? 1 : cycle<2700 ? 2 : cycle<4800 ? 0 : 3;
  return {frame,breathe:Math.sin(t/(610+offset%170))*.6,lean:Math.sin(t/(1730+offset%300))*.4};
}

/** A cosmetic dropout may affect only a setting noun in ambient prose, never
 * a negation, a measurement, a person's name or any interactive control. */
export function ambientDropout(text:string,identity:string):number {
  const candidates=[...text].flatMap((glyph,index)=>/[墙影廊床铃钟]/.test(glyph)?[index]:[]);
  return candidates.length?candidates[hash(identity)%candidates.length]:-1;
}
