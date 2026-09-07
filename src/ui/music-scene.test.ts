import { describe, expect, it } from 'vitest';
import { musicSceneFor, type MusicSceneState } from './music-scene';
import type { Card } from '../game/types';

function state(overrides: Partial<MusicSceneState> = {}): MusicSceneState {
  return { inGame: true, phase: 'play', san: 100, day: 3, night: false, endingGood: false, ...overrides };
}
function card(overrides: Partial<Card> = {}): Card {
  return { id: 'c1', title: 't', text: 't', options: [], kind: 'ward', scope: { kind: 'patient', id: 'p1' }, ...overrides };
}

describe('musicSceneFor', () => {
  it('plays the title score outside a run', () => {
    expect(musicSceneFor(state({ inGame: false, phase: 'play' }))).toBe('title');
  });
  it('plays the matching ending score, dark by default and calm only for a good ending', () => {
    expect(musicSceneFor(state({ phase: 'ending', endingGood: false }))).toBe('ending-dark');
    expect(musicSceneFor(state({ phase: 'ending', endingGood: true }))).toBe('ending-calm');
  });
  it('plays the tribunal score during the hearing', () => {
    expect(musicSceneFor(state({ phase: 'tribunal' }))).toBe('inquiry');
  });
  it('prioritises fracture under low SAN over night, day count or any card context', () => {
    expect(musicSceneFor(state({ san: 20, night: true, day: 12 }))).toBe('fracture');
    expect(musicSceneFor(state({ san: 20, card: card({ actor: 'research' }) }))).toBe('fracture');
  });
  it('plays night ambience once the remaining queue is all night/rest, ahead of contextual cards', () => {
    expect(musicSceneFor(state({ night: true }))).toBe('night');
    expect(musicSceneFor(state({ night: true, card: card({ actor: 'mother' }) }))).toBe('night');
  });
  it('picks complaint-pressure for audit cards, the dispute chain and recording follow-ups', () => {
    expect(musicSceneFor(state({ card: card({ kind: 'audit', actor: 'auditor' }) }))).toBe('complaint-pressure');
    expect(musicSceneFor(state({ card: card({ chain: 'BTF-003' }) }))).toBe('complaint-pressure');
    expect(musicSceneFor(state({ card: card({ ...({ sourceFollowup: { kind: 'dispute' } } as Partial<Card>) }) }))).toBe('complaint-pressure');
  });
  it('picks family-call for the parents and for family-scoped personal cards', () => {
    expect(musicSceneFor(state({ card: card({ actor: 'father' }) }))).toBe('family-call');
    expect(musicSceneFor(state({ card: card({ actor: 'mother' }) }))).toBe('family-call');
    expect(musicSceneFor(state({ card: card({ actor: undefined, scope: { kind: 'personal', id: 'run-1:family' } }) }))).toBe('family-call');
    expect(musicSceneFor(state({ card: card({ chain: 'FAMILY-FUNDING-CONTACT', scope: { kind: 'personal', id: 'run-1' } }) }))).toBe('family-call');
  });
  it('does not treat an unrelated personal card (e.g. rent) as a family scene', () => {
    expect(musicSceneFor(state({ card: card({ scope: { kind: 'personal', id: 'rent' } }) }))).toBe('ward-rounds');
  });
  it('picks research-afterhours for the research colleague and project-scoped cards', () => {
    expect(musicSceneFor(state({ card: card({ actor: 'research' }) }))).toBe('research-afterhours');
    expect(musicSceneFor(state({ card: card({ scope: { kind: 'project', id: 'proj-1' } }) }))).toBe('research-afterhours');
    expect(musicSceneFor(state({ card: card({ chain: 'BTF-004' }) }))).toBe('research-afterhours');
  });
  it('falls back to pressure from day 9 and ward-rounds before it, when no contextual card applies', () => {
    expect(musicSceneFor(state({ day: 3 }))).toBe('ward-rounds');
    expect(musicSceneFor(state({ day: 8 }))).toBe('ward-rounds');
    expect(musicSceneFor(state({ day: 9 }))).toBe('pressure');
    expect(musicSceneFor(state({ day: 14 }))).toBe('pressure');
  });
  it('lets a contextual card override the day-9 pressure floor', () => {
    expect(musicSceneFor(state({ day: 12, card: card({ actor: 'mother' }) }))).toBe('family-call');
  });
});
