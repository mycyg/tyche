export const GUIDE_VERSION = 1 as const;
export const GUIDE_STORAGE_KEY = 'tyche.guide.1';
export const GUIDE_EVENTS = [
  'welcome-seen', 'bed-near', 'chart-open', 'choice-committed',
  'choice-roll-seen', 'choice-without-check', 'handoff-completed',
  'schedule-open', 'recovery-open',
] as const;
export type GuideEvent = typeof GUIDE_EVENTS[number];
export interface GuideState {
  version: typeof GUIDE_VERSION;
  enabled: boolean;
  seen: GuideEvent[];
}
