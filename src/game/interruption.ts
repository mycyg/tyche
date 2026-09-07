import type { EventPhase } from '../content/events/types';
import type { Card, ResumePhase, Run } from './types';

/** The queue cursor may already point at tomorrow's work. Only the actual
 * triggering card, the active period, or an existing acute episode is evidence. */
export function interruptionPhase(r: Run, source?: Card): EventPhase {
  if (r.emergency?.occurred) return r.emergency.occurred.phase;
  const acute = r.emergency && r.queue.find(c => c.id === r.emergency!.cardId);
  if (acute) {
    const saved = acute as Card & { authoredEventId?: string; eventBinding?: { phase?: EventPhase } };
    if (saved.eventBinding?.phase) return saved.eventBinding.phase;
    if (['E-201', 'E-204'].includes(saved.authoredEventId ?? '')) return '夜班';
    if (['E-200', 'E-203'].includes(saved.authoredEventId ?? '')) return '查房';
    if (acute.shiftPhase) return acute.shiftPhase;
  }
  return source?.shiftPhase ?? r.shiftPhase ?? (source?.kind === 'night' ? '夜班' : '日终');
}

/** Old saves did not store the counter, but their completed acute choices and
 * zero-state facts still prove that this run has already used its first episode. */
export function recordedSanBreaks(r: Run): number {
  const prior = r.committed.some(id => /(?:^|:)E-20[012]-[a-c]$/.test(id)) ||
    !!r.facts['san-ever-zero'] || !!r.facts['SAN归零'] || !!r.authored?.activeFacts['SAN归零'];
  return Math.max(r.sanBreaks ?? 0, Number(prior));
}

export function resumePhase(r: Run): ResumePhase {
  const phase = r.phase === 'funding' || r.phase === 'collapse' ? r.pendingResume ?? 'play' : r.phase;
  if (phase === 'feedback' && !r.feedback || phase === 'ending') return 'play';
  return phase;
}

export function captureContinuation(r: Run): NonNullable<Run['emergency']>['resume'] {
  const phase = resumePhase(r);
  return { phase, ...(phase === 'roll' ? { roll: structuredClone(r.roll), pendingCheck: structuredClone(r.pendingCheck) } : {}),
    ...(phase === 'feedback' ? { feedback: structuredClone(r.feedback) } : {}) };
}

export function restoreContinuation(r: Run, resume: NonNullable<Run['emergency']>['resume']): void {
  r.phase = resume.phase === 'feedback' && !resume.feedback ? 'play' : resume.phase;
  if (r.phase === 'roll') { r.roll = resume.roll; r.pendingCheck = resume.pendingCheck; }
  else { delete r.roll; delete r.pendingCheck; }
  if (r.phase === 'feedback') r.feedback = resume.feedback;
  else delete r.feedback;
}
