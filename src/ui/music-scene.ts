import type { MusicScene } from '../shared/audio-assets';
import type { Card } from '../game/types';

/** Family phone calls, fundraising asks and family milestone cards; scoped narrowly enough that
 * ordinary personal errands (rent, court prep) do not fall into it. */
function isFamilyCard(card: Card | undefined): boolean {
  if (!card) return false;
  if (card.actor === 'father' || card.actor === 'mother') return true;
  if (card.scope.kind !== 'personal') return false;
  return card.chain === 'FAMILY-FUNDING-CONTACT' || card.scope.id.includes('family');
}
/** The research/office thread: the co-worker himself, project-scoped work, or the academic-fraud chain. */
function isResearchCard(card: Card | undefined): boolean {
  if (!card) return false;
  return card.actor === 'research' || card.scope.kind === 'project' || card.chain === 'BTF-004';
}
/** Family recordings, complaints escalating through the medical-affairs office, and inspection interviews. */
function isComplaintCard(card: Card | undefined): boolean {
  if (!card) return false;
  if (card.kind === 'audit') return true;
  if (card.chain === 'BTF-003' || card.chain === 'dispute') return true;
  return (card as Card & { sourceFollowup?: { kind?: string } }).sourceFollowup?.kind === 'dispute';
}

export interface MusicSceneState {
  /** False on the title/setup screens, where no run state applies. */
  inGame: boolean;
  phase: string;
  san: number;
  day: number;
  /** True once queued cards are all night/rest, i.e. the shift has moved into the night block. */
  night: boolean;
  /** True for the small set of non-dark endings (old X33/X34/X36, or the new END-40 true ending). */
  endingGood: boolean;
  card?: Card;
}

/**
 * Pure: same input always yields the same track id. Priority mirrors the pre-existing
 * title/ending/tribunal/fracture/night ladder so those cues never regress; the three new
 * contextual scenes only apply to ordinary daytime play, and day>=9 keeps its own "pressure"
 * escalation track when no more specific scene applies. "ward-rounds" replaces the old bare
 * "day" fallback as the default daytime ambience.
 */
export function musicSceneFor(state: MusicSceneState): MusicScene {
  if (!state.inGame) return 'title';
  if (state.phase === 'ending') return state.endingGood ? 'ending-calm' : 'ending-dark';
  if (state.phase === 'tribunal') return 'inquiry';
  if (state.san < 30) return 'fracture';
  if (state.night) return 'night';
  if (isComplaintCard(state.card)) return 'complaint-pressure';
  if (isFamilyCard(state.card)) return 'family-call';
  if (isResearchCard(state.card)) return 'research-afterhours';
  if (state.day >= 9) return 'pressure';
  return 'ward-rounds';
}
