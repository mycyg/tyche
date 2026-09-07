import { RULES } from './rules';
import { talentBaseAp, talentWakingStamina, talentStaminaCap } from './talents';
import { eventTuning, emptyEventTuning } from '../content/events/modifiers';
import type { Run } from './types';
import { hasPlannedNight, hasWorkedNight, isFullDayLeave } from './duty-state';

export const scheduleTuning = (r: Run, day: number) => r.authored
  ? eventTuning(r.authored.ledger, day, { kind: 'personal', id: r.id }, Object.keys(r.facts)) : emptyEventTuning();

/** Read-only projection from the current day. Reuse before advancing r.day.
 * Permanent caps are supplied by Run; talentStaminaCap produces the live cap. */
export function nextShiftForecast(r: Run, extraBorrow = 0, includePlannedNight = true) {
  const day = r.day + 1;
  const tuning = scheduleTuning(r, day);
  const afterNight = hasWorkedNight(r) || (includePlannedNight && hasPlannedNight(r));
  const debuffs = day >= 8 && r.talents.includes('T20') && !r.debuffs.includes('B03') ? [...r.debuffs, 'B03'] : r.debuffs;
  const context = { talents: r.talents, debuffs, day, memory: r.talentMemory };
  const liveCap = talentStaminaCap(context, Math.max(1, r.caps.stamina - extraBorrow * RULES.borrowCapLoss), false);
  const leave = isFullDayLeave(r, day);
  // Half-day leave matches the authored director's four-action release.
  const halfLeaveAp = tuning.leave > 0 && tuning.leave < 1 ? RULES.halfDayAp : 0;
  return { day, tuning, afterNight, liveCap, leave,
    ap: leave ? 0 : Math.max(0, talentBaseAp(context, RULES.ap, afterNight) - r.borrowed - extraBorrow - Number(r.depression >= 50) - halfLeaveAp),
    stamina: Math.max(1, Math.floor(Math.min(talentWakingStamina(context, liveCap, afterNight), liveCap * tuning.sleep))),
  };
}
