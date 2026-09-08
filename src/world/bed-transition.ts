import { BED_TRANSITION_MS, type NpcActor } from './npc-runtime';
import type { FrameRect } from './npc-art';

export function bedTransitionFrame(actor: NpcActor, bed: { x: number; y: number; width: number; height: number; depth: number }): FrameRect & { depth: number } {
  const transition = actor.transition!;
  const elapsed = Math.min(1, transition.elapsed / BED_TRANSITION_MS);
  const progress = transition.kind === 'rise' ? elapsed : 1 - elapsed;
  const move = Math.max(0, (progress - .28) / .72);
  const eased = move * move * (3 - 2 * move);
  const size = bed.height + (72 - bed.height) * eased;
  const x = bed.x + bed.width / 2 + (actor.x - bed.x - bed.width / 2) * eased;
  const bottom = bed.y + bed.height * 122 / 128;
  const y = bottom + (actor.y - bottom) * eased;
  return { sx: Math.min(3, Math.floor(progress * 4)) * 128, sy: actor.def.walk!.row * 128, sw: 128, sh: 128,
    dx: x - size / 2, dy: y - size * 122 / 128, dw: size, dh: size,
    depth: bed.depth + (actor.y - bed.depth) * eased };
}
