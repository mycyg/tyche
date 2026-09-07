import type { Card, Option, Run } from './types';
import { RULES } from './rules';
import { eventTuning } from '../content/events/modifiers';

/** Approved full absence, not a half-day release or tomorrow's request. */
export function isFullDayLeave(r: Run, day = r.day): boolean {
  return !!r.facts[`leave:${day}`] || (day === r.day + 1 && r.skipNextDay)
    || !!(r.authored?.activeFacts['wedding-due']?.day===day&&r.authored.activeFacts['wedding-due'].source.endsWith('E-106-a'))
    || !!(r.authored && eventTuning(r.authored.ledger, day, {kind:'personal',id:r.id}, Object.keys(r.facts)).leave >= 1);
}

/** Actual attendance. Explicit history survives even if leave was granted later. */
export function hasWorkedNight(r: Run): boolean {
  if (r.facts[`worked-night:${r.day}`] || r.facts[`night-duty-started:${r.day}`]) return true;
  // Older saves have no entry marker: a populated night already reached is evidence,
  // but the same budget left behind on a full leave day is not attendance.
  return !isFullDayLeave(r) && r.nightBudget > 0 && (r.shiftPhase === '夜班' || r.shiftPhase === '日终');
}

/** A prediction may include future attendance; a settled day may not. */
export function hasPlannedNight(r: Run): boolean {
  if (isFullDayLeave(r)) return false;
  return RULES.nightDays.includes(r.day as never) || r.nightBudget > 0
    || !!r.authored?.activeFacts?.[`extra-night:${r.day}`]
    || !!(r.authored && eventTuning(r.authored.ledger, r.day, {kind:'personal',id:r.id}, Object.keys(r.facts)).addedNightBudget > 0);
}

/** Ordinary bedside work/rounds left in an older queue, not personal obligations. */
export function isLeaveHandoffCard(r: Run, card: Card): boolean {
  if (!isFullDayLeave(r) || 'acuteVital' in card) return false;
  if ('authoredEventId' in card) return ['E-041','E-048','E-161','E-162','E-164','E-165','E-168','E-171','E-172','E-174','E-176'].includes(String(card.authoredEventId));
  return ['clinical','quick','ward'].includes(card.kind)
    || (card.kind === 'night' && (!!card.clinicalGraph || !!card.presetNode || !!card.patientId || !!r.authored?.activeFacts[`extra-night-task:${card.id}`]));
}

export function leaveHandoffOption(card: Card): Option {
  return {id:`${card.id}:leave-handoff`, label:'确认由当班同事接手，本次不执行原定工作',ap:0,minutes:0,cost:0,effects:{},
    result:'今天已停诊休息，原定的本次工作由当班同事接手。你没有执行原选项，也没有为它新增诊疗费用。此前已完成的处置、费用和病历记录保留。'};
}
