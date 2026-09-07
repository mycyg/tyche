import { runRandom } from './run-random';
import { RULES } from './rules';
import type { Card, Option, Run } from './types';
import {talentSkimChance}from './talents';
import {talentContext}from './traits';

export type PerceptionBand = 'clear' | 'tense' | 'distorted' | 'fractured';
export function perceptionBand(san: number): PerceptionBand {
  return san >= RULES.perception.tense ? 'clear' : san >= RULES.perception.distorted ? 'tense'
    : san >= RULES.perception.fractured ? 'distorted' : 'fractured';
}
export function skimProbability(r: Run): number {
  const fatigue = r.vitals.stamina < RULES.perception.exhausted ? .6 : r.vitals.stamina < RULES.perception.tired ? .3 : 0;
  const mental = r.vitals.san < RULES.perception.distorted ? .4 : 0;
  return talentSkimChance(talentContext(r),Math.max(fatigue,mental));
}
export function isSkimmed(r: Run, reportId: string): boolean {
  return runRandom(r, `report-presentation:${reportId}`) < skimProbability(r);
}
export function perceptionOption(r: Run, card: Card): Option | undefined {
  if (r.vitals.san >= RULES.perception.distorted || !card.patientId ||
    r.facts[`perception-checked:${card.patientId}`] || !['clinical', 'quick', 'night'].includes(card.kind)) return;
  return {
    id: `${card.patientId}:perception-check`, interaction: 'hallucination',
    label: '回头查看刚才叫你的那张空床', ap: RULES.perception.hallucinationAp,
    minutes: RULES.perception.hallucinationMinutes, cost: 0,
    result: '床是空的。护士说没有人叫你。你核对了床号，回到原来的患者身边。',
    effects: { flags: [`perception-checked:${card.patientId}`] },
  };
}

/** Non-diagnostic environmental impressions, never a fabricated lab value. */
export function ambientPerception(r: Run): string | undefined {
  const band = perceptionBand(r.vitals.san);
  if (band === 'clear' && !r.debuffs.includes('B06')) return;
  if (band === 'tense') return '你看了一眼护士站的钟，又核对了一遍待办。';
  const lines = band === 'fractured' || r.debuffs.includes('B06')
    ? ['监护仪像是响了。护士核对后说，这次没有报警。', '你在值班室听到呼叫铃，走廊里没有人找你。', '空床边像是站着一个人。抬头再看，只有输液架。']
    : ['你在交班单上找了两遍同一个名字。', '墙上的影子动了一下。你停下来，重新数了床号。'];
  return lines[Math.floor(runRandom(r, `perception:${r.day}:${r.cursor}`) * lines.length)];
}
