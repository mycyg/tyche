import { describe, expect, it } from 'vitest';
import { AUTHORED_EVENTS, EVENT_BY_ID, contextualOptions, eventEligible, eventToCard } from './catalog';
import { EVENT_RESULTS, EVENT_FAILURES } from './narrative';
import { RECORD_ONLY_EVENT_FACTS } from './fact-records';
import { assaultOutcome, collapseOutcome, crisisOutcome, darkChainEntry, darkChainOutcome, darkChainResolve, posthumousItems } from './dark-chains';
import type { EventCard, EventContext } from './types';
import type { Run } from '../../game/types';

const DARK = AUTHORED_EVENTS.filter(e => { const n = +e.id.slice(2); return n >= 213 && n <= 258; });
const NIGHT_POOL = AUTHORED_EVENTS.filter(e => { const n = +e.id.slice(2); return n >= 259 && n <= 274; });
/** These six close a chain: the outcome is already fixed by facts written
 * earlier, so they carry one acknowledgement instead of a false branch. */
const RESOLUTIONS = ['E-217', 'E-221', 'E-232', 'E-236', 'E-237', 'E-239'];
const context = (extra: Partial<EventContext> = {}): EventContext => ({ day: 8, phase: '结算', facts: {}, san: 60, emotion: 60, stamina: 60, depression: 20, cash: 5000, pressure: 50, ...extra });
const fact = (day = 1) => ({ day, source: 'test', sequence: day });
const run = (extra: Partial<Run> = {}) => ({ id: 'dark', day: 12, facts: {}, patients: [], committed: [], journal: [], receivable: 0, cash: 0, exhausted: 0, sanBreaks: 0, depression: 0, vitals: { stamina: 0, san: 0, emotion: 0 }, relations: { chief: 2, nurse: 2, peer: 2, family: 2 }, ...extra } as unknown as Run);

/** 合同 4.15 的新增事实。写入方分三处：事件选项、链末结算（dark-chains）、
 * 以及开局设置（`伴侣-在册` 由工程师 A 写入 Run）。 */
const CHAIN_FACTS = [
  '伤医-施暴者已确定', '伤医-明确威胁', '伤医-已报备', '伤医-已缓和', '伤医-现场冲突', '伤医-冲突升级',
  '伤医-已求援', '伤医-他人介入', '伤医-安保到场', '伤医-陪同离院', '伤医-避开单独会面', '伤医-再次接触',
  '伤医-袭击发生', '伤医-未遭伤害', '伤医-受伤生还',
  '伤医-手部功能损失', '伤医-长期行动障碍', '伤医-抢救无效', '伤医-家属证言',
  '刑事-评估已补', '刑事-风险已告知', '刑事-推动出院', '刑事-原件已交', '刑事-有限说明', '刑事-证据掩盖',
  '刑事-掩盖已承认', '刑事-掩盖被查实', '刑事-移交',
  '刑事-申报已更正', '刑事-申报已质疑', '刑事-虚假申报参与', '刑事-申报已退出', '刑事-申报取得款项',
  '刑事-回扣已履行交换', '利益-继续承接', '刑事-出行被拦',
  '共犯-限定署名', '共犯-共同签署', '共犯-留有复印件', '共犯-未参与分配', '共犯-分配已收', '共犯-转账留痕',
  '共犯-拒绝统一口径', '共犯-互相掩护', '共犯-本人翻供', '共犯-他人翻供', '共犯-交出原件',
  '精神-已交接', '精神-未交接', '危机-支持联系已建立', '危机-评估已做', '危机-失联', '精神-持续住院',
  '精神-无法复岗', '精神-长期症状', '自杀-死亡确认',
  '天台-危机发生', '危机-已发出消息', '天台-被找到', '天台-中止当班',
  '身体-已求援', '身体-已就医', '身体-救回', '身体-抢救无效', '身体-上限永久下调', '身体-自行离院',
  '家庭-已重新约定', '家庭-已委托代办', '家庭-再次许诺', '家庭-已说明', '家庭-争执', '家庭-划清负担',
  '家庭-断联', '家庭-留下东西', '家庭-婚事已付', '家庭-婚事已付一半', '家庭-婚事出资未付',
  '家庭-弟弟仍联系', '家庭-弟弟停止联系', '家庭-仍在追问出资', '家庭-本人陪护', '家庭-已请护工',
  '家庭-亲戚代办', '家庭-消息已接到', '家庭-消息未接到', '家庭-病重消息被压下', '家庭-已赶上告别',
  '家庭-未赶上告别', '家庭-担保已签', '家庭-资产已挂', '家庭-本人垫付', '家庭-已补缴', '家庭-担保违约',
  '家庭-资产耗尽', '家庭-住处失去', '家庭-借住已约定', '家庭-账目已交',
  '伴侣-已说明用途', '伴侣-挪用共同存款', '伴侣-隐瞒负债', '伴侣-已对账', '伴侣-继续隐瞒',
  '伴侣-承认做不到', '伴侣-已兑现', '伴侣-暂缓', '伴侣-分开', '伴侣-账已算清',
  '离岗-交接已完成', '离岗-交接口头', '离岗-代写记录', '离岗-手续已办', '离岗-新工作已落实',
  '离岗-住处已落实', '还款-已约定', '离岗-未安排', '复岗-已办理',
  '科室-本人承担', '科室-向新人转嫁', '科室-接受继续施压',
  '举报人', '知情', '互相把柄',
];
/** dark-chains 与导演在链末写入的结果，以及三处旧缺口的补写点。 */
const WRITTEN_ELSEWHERE = ['伤医-施暴者已确定', '伤医-受伤生还', '伤医-手部功能损失', '伤医-长期行动障碍', '伤医-抢救无效',
  '伤医-家属证言', '精神-无法复岗', '精神-长期症状', '身体-救回', '身体-抢救无效', '身体-上限永久下调',
  '举报人', '知情', '互相把柄'];

describe('dark chains DK-1 to DK-14', () => {
  it('imports forty-six chain rows and sixteen night rows with parsed triggers and phases', () => {
    expect(DARK.map(e => e.id)).toEqual(Array.from({ length: 46 }, (_, i) => `E-${213 + i}`));
    expect(NIGHT_POOL.map(e => e.id)).toEqual(Array.from({ length: 16 }, (_, i) => `E-${259 + i}`));
    for (const e of [...DARK, ...NIGHT_POOL]) {
      expect(e.phases.length, e.id).toBeGreaterThan(0);
      expect(e.options.length, e.id).toBeGreaterThanOrEqual(RESOLUTIONS.includes(e.id) ? 1 : 2);
      expect(EVENT_RESULTS[e.id], e.id).toHaveLength(e.options.length);
      expect(e.source.path).toContain('结局与暗黑链实施合同');
      for (const o of e.options) {
        expect(o.result, o.id).toBeTruthy();
        if (o.check) expect(EVENT_FAILURES[o.id], o.id).toBeTruthy();
      }
    }
    expect(RESOLUTIONS.every(id => EVENT_BY_ID[id].weight === 0 || id === 'E-232' || id === 'E-237')).toBe(true);
  });

  it('gives every new contract fact a writer in an option, at a chain close, or in the opening setting', () => {
    const emitted = new Set([...DARK, ...NIGHT_POOL].flatMap(e => e.options.flatMap(o => [...(o.effects.flags ?? []), ...(o.failureTotal?.flags ?? [])])));
    const missing = CHAIN_FACTS.filter(f => !emitted.has(f) && !WRITTEN_ELSEWHERE.includes(f));
    expect(missing).toEqual([]);
    expect(assaultOutcome(run({ facts: {} }))).toContain('伤医-抢救无效');
    expect(collapseOutcome(run({ facts: { '身体-已求援': fact() } }))).toEqual(['身体-救回']);
    expect(crisisOutcome(run({ facts: { '精神-持续住院': fact() } }))).toEqual(['精神-无法复岗']);
  });

  it('compiles the documented costs rather than only the recorded names', () => {
    expect(EVENT_BY_ID['E-215'].options[0].effects.income).toBe(-40);
    expect(EVENT_BY_ID['E-223'].options[1].effects.cash).toBe(8000);
    expect(EVENT_BY_ID['E-244'].options[2].effects.debt).toBe(8000);
    expect(EVENT_BY_ID['E-248'].options[0].effects.cash).toBe(-40000);
    expect(EVENT_BY_ID['E-254'].options[1].effects.privateDebt).toBe(30000);
    expect(EVENT_BY_ID['E-256'].options[0].ap).toBe(2);
    expect(EVENT_BY_ID['E-257'].options[0].effects.cash).toBe(-2400);
    expect(EVENT_BY_ID['E-231'].options[0].modifiers.some(m => m.kind === 'leave' && m.value === 2)).toBe(true);
    expect(EVENT_BY_ID['E-218'].options[2].effects.hazards).toEqual([expect.objectContaining({ type: 'R', weight: 20, causal: true })]);
    expect(EVENT_BY_ID['E-222'].options[2].effects.hazards).toEqual([expect.objectContaining({ type: 'F', weight: 25 })]);
  });

  it('keeps a check on both sides of the branch instead of writing the same record either way', () => {
    const threat = EVENT_BY_ID['E-213'].options[1];
    expect(threat.effects.flags).toEqual(['伤医-明确威胁', '伤医-已缓和']);
    expect(threat.failureTotal?.flags).toEqual(['伤医-明确威胁', '伤医-现场冲突']);
    const meeting = EVENT_BY_ID['E-216'].options[1];
    expect(meeting.effects.flags).toContain('伤医-未遭伤害');
    expect(meeting.failureTotal?.flags).toContain('伤医-袭击发生');
    expect(EVENT_BY_ID['E-247'].options[2].failureTotal?.flags).toContain('伴侣-分开');
  });

  it('does not offer a chain step before its own prerequisite exists', () => {
    expect(eventEligible(EVENT_BY_ID['E-213'], context({ day: 7, phase: '查房' }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-213'], context({ day: 7, phase: '查房', qualifiers: ['已确定施暴者'] }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-216'], context({ day: 9, phase: '门诊', facts: { '伤医-现场冲突': fact(9) } }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-216'], context({ day: 10, phase: '门诊', facts: { '伤医-现场冲突': fact(9) } }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-219'], context({ day: 8 }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-219'], context({ day: 8, facts: { '刑事-推动出院': fact(7) } }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-227'], context({ day: 11, facts: { '共犯-共同签署': fact(9) } }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-227'], context({ day: 11, facts: { '共犯-共同签署': fact(9), '药代-5回扣': fact(9) } }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-244'], context({ day: 9, pressure: 50 }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-244'], context({ day: 9, pressure: 30, qualifiers: ['伴侣在册'] }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-244'], context({ day: 9, pressure: 50, qualifiers: ['伴侣在册'] }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-233'], context({ day: 9, san: 0, depression: 60, qualifiers: ['再次归零'] }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-233'], context({ day: 9, san: 0, depression: 75, qualifiers: ['再次归零'] }))).toBe(true);
    expect(eventEligible(EVENT_BY_ID['E-258'], context({ day: 14, phase: '交班' }))).toBe(false);
    expect(eventEligible(EVENT_BY_ID['E-258'], context({ day: 14, phase: '交班', qualifiers: ['带教实习生'] }))).toBe(true);
  });

  it('runs the crisis entries as one exclusive group so a second zero opens one scene', () => {
    expect(EVENT_BY_ID['E-230'].exclusiveGroup).toBe('再次归零');
    expect(EVENT_BY_ID['E-233'].exclusiveGroup).toBe('再次归零');
    expect(eventEligible(EVENT_BY_ID['E-233'], context({ day: 9, san: 0, depression: 80, qualifiers: ['再次归零'], seen: { 'E-230': 8 } }))).toBe(false);
  });

  it('shows a choice that needs a person, a copy or an escort only when the run produced it', () => {
    expect(contextualOptions(EVENT_BY_ID['E-216'], context({ facts: {} })).map(o => o.id)).toEqual(['E-216-b', 'E-216-c']);
    const guarded = contextualOptions(EVENT_BY_ID['E-216'], context({ facts: { '伤医-安保到场': fact(), '伤医-陪同离院': fact() } }));
    expect(guarded.map(o => o.id)).toEqual(['E-216-a', 'E-216-b', 'E-216-c']);
    expect(guarded[1].check?.dc).toBe(8);
    expect(contextualOptions(EVENT_BY_ID['E-216'], context({ facts: { '伤医-安保到场': fact(), '伤医-避开单独会面': fact() } }))[1].check?.dc).toBe(11);
    expect(contextualOptions(EVENT_BY_ID['E-229'], context({ facts: {} })).map(o => o.id)).toEqual(['E-229-a', 'E-229-c']);
    expect(contextualOptions(EVENT_BY_ID['E-251'], context({ facts: {} })).map(o => o.id)).toEqual(['E-251-a', 'E-251-c']);
    expect(contextualOptions(EVENT_BY_ID['E-252'], context({ facts: {} })).map(o => o.id)).toEqual(['E-252-b', 'E-252-c']);
    expect(contextualOptions(EVENT_BY_ID['E-241'], context({ relations: { family: 1 } })).map(o => o.id)).toEqual(['E-241-a', 'E-241-c']);
  });

  it('decides the assault, collapse and crisis outcomes from facts already written, without a new die', () => {
    const escorted = run({ facts: { '伤医-已求援': fact(8), '伤医-陪同离院': fact(8) } });
    expect(assaultOutcome(escorted)).toEqual(['伤医-受伤生还', '伤医-家属证言']);
    const partial = run({ facts: { '伤医-已求援': fact(8), '伤医-现场冲突': fact(8), '伤医-安保到场': fact(8) } });
    expect(assaultOutcome(partial)).toEqual(['伤医-受伤生还', '伤医-手部功能损失', '伤医-家属证言']);
    const late = run({ facts: { '伤医-陪同离院': fact(12), '伤医-现场冲突': fact(8), '伤医-安保到场': fact(12) } });
    expect(assaultOutcome(late)).toEqual(['伤医-受伤生还', '伤医-长期行动障碍', '伤医-家属证言']);
    expect(assaultOutcome(run({ facts: {} }))).toEqual(['伤医-抢救无效', '伤医-家属证言']);
    expect(collapseOutcome(run({ facts: { '纸带': fact(5) } }))).toEqual(['身体-抢救无效']);
    expect(collapseOutcome(run({ facts: {} }))).toEqual(['身体-救回', '身体-上限永久下调']);
    expect(collapseOutcome(run({ facts: { '身体-已就医': fact(5), '未就诊': fact(5) } }))).toEqual(['身体-救回']);
    expect(crisisOutcome(run({ facts: { '危机-评估已做': fact(5) } }))).toEqual(['精神-长期症状']);
    expect(crisisOutcome(run({ facts: { '危机-失联': fact(5) } }))).toEqual([]);
  });

  it('hands the engine one entry card per repeated zero and writes the close into the run itself', () => {
    const entryId = (r: Run, kind: 'san' | 'stamina') => (darkChainEntry(r, kind) as EventCard | undefined)?.authoredEventId;
    expect(darkChainEntry(run({ sanBreaks: 1 }), 'san')).toBeUndefined();
    expect(darkChainEntry(run({ exhausted: 0 }), 'stamina')).toBeUndefined();
    expect(entryId(run({ sanBreaks: 2 }), 'san')).toBe('E-230');
    expect(entryId(run({ sanBreaks: 2, depression: 80 }), 'san')).toBe('E-233');
    expect(entryId(run({ exhausted: 1 }), 'stamina')).toBe('E-238');
    const closing = run({ day: 12, facts: { '伤医-袭击发生': fact(11), '伤医-已求援': fact(11), '伤医-陪同离院': fact(11) } });
    expect(darkChainOutcome(closing).flags).toContain('伤医-受伤生还');
    darkChainResolve(closing);
    expect(closing.facts['伤医-受伤生还']).toMatchObject({ day: 12, source: 'dark-chain' });
    expect(closing.facts['伤医-已求援'].day).toBe(11);
    darkChainResolve(closing);
    expect(closing.facts['伤医-受伤生还'].day).toBe(12);
  });

  it('writes the posthumous items from this run and never from a method or a preparation', () => {
    const withLoan = posthumousItems(run({ receivable: 3000 }));
    expect(withLoan).toContain('李恂');
    expect(posthumousItems(run({ receivable: 0 }))).toContain('姜蓉');
    for (const text of [withLoan, EVENT_BY_ID['E-236'].text, EVENT_BY_ID['E-237'].text, EVENT_BY_ID['E-233'].text, EVENT_BY_ID['E-234'].text]) {
      expect(text).not.toMatch(/坠|跳|割|服药|药量|绳|栏杆|边缘|遗书/);
    }
  });

  it('keeps the completed dark-chain acts in the record-only notes and out of promised future harm', () => {
    for (const id of ['伤医-已报备', '刑事-申报已更正', '共犯-限定署名', '家庭-已重新约定', '伴侣-已对账', '举报人', '知情', '互相把柄'])
      expect(RECORD_ONLY_EVENT_FACTS[id], id).toBeTruthy();
    expect(EVENT_BY_ID['E-054'].options[1].effects.flags).toContain('知情');
    expect(EVENT_BY_ID['E-158'].options[0].failureTotal?.flags).toContain('举报人');
    expect(EVENT_BY_ID['E-140'].options[3].effects.flags).toEqual(expect.arrayContaining(['药代-约谈-不实', '药代-串供']));
  });

  it('stocks the fourth and fifth night with rows that only a night shift can draw', () => {
    for (const day of [12, 14]) {
      const pool = AUTHORED_EVENTS.filter(e => e.weight > 0 && e.phases.includes('夜班') && !e.requiredQualifiers.length
        && eventEligible(e, context({ day, phase: '夜班', night: true })));
      expect(pool.length, `D${day}`).toBeGreaterThanOrEqual(6);
    }
    expect(NIGHT_POOL.every(e => e.phases.length === 1 && e.phases[0] === '夜班')).toBe(true);
    expect(NIGHT_POOL.every(e => !e.repeatable)).toBe(true);
  });

  it('binds a chain card to one bound subject without inventing a bed', () => {
    const card = eventToCard(EVENT_BY_ID['E-214'], { instanceId: 'assault', scope: { kind: 'patient', id: 'p1' }, patientId: 'p1', patientName: '钱学礼', bed: 9, day: 8, phase: '查房' });
    expect(card.options).toHaveLength(3);
    expect(card.text).not.toMatch(/\d+\s*床/);
    const settlement = eventToCard(EVENT_BY_ID['E-257'], { instanceId: 'exit', scope: { kind: 'personal', id: 'run' }, day: 14, phase: '结算' });
    expect(settlement.options.map(o => o.id)).toEqual(['exit:E-257-a', 'exit:E-257-b', 'exit:E-257-c']);
  });
});
