import type {Effects,Run}from '../../game/types';
import type {EventCard,EventPhase}from './types';
import {EVENT_BY_ID,eventToCard}from './catalog';
import {recordedSanBreaks}from '../../game/interruption';

/** Entry points and closing records for the dark chains DK-1、DK-5～DK-8.
 *
 * 接线（给工程师 A）：
 * - `darkChainEntry(r,'san')` 在 `engine.ts` 的 `interrupt()` 里，SAN 再次归零、
 *   准备调用 `stop(r,'san')` 之前调用。返回卡时先把卡交给玩家，本局不收口；
 *   返回 undefined 时按原来的 `stop(r,'san')` 收口。
 * - `darkChainEntry(r,'stamina')` 同理，用在体力再次归零、`stop(r,'stamina')` 之前。
 * - `darkChainResolve(r)` 在链末（结算或 `stop()` 之前）调用，把本局已经发生的
 *   事实所决定的结果标记写进 `r.facts`，返回值为空。它只读已写入的事实，不掷骰，
 *   也不覆盖任何既有记录；要拿到标记本身而不写入，用 `darkChainOutcome(r)`。
 * - 导演已在 `forceZeroEvent` 里按同一规则派发这两张入口卡。A 在 `interrupt()`
 *   里若已经走 `forceZeroEvent`，只需在收口前补一次 `darkChainResolve(r)`。
 *
 * 三条链的结果都由此前的求援、退出、就医与陪同事实决定，没有额外抽签。 */

const has = (r: Run, key: string): boolean => Boolean(r.facts[key] ?? r.authored?.activeFacts[key]);
const writtenOn = (r: Run, key: string): number | undefined => (r.facts[key] ?? r.authored?.activeFacts[key])?.day;

/** DK-1 的伤情分档：求援是否发出、安保是否在冲突当日或次日到场、是否有他人介入。
 * 三项都不利时为长期行动障碍，部分不利时为手部功能损失。 */
export function assaultOutcome(r: Run): string[] {
  const rescued = has(r, '伤医-已求援');
  const withdrew = has(r, '伤医-陪同离院') || has(r, '伤医-避开单独会面');
  const conflict = writtenOn(r, '伤医-现场冲突'), guard = writtenOn(r, '伤医-安保到场');
  const prompt = conflict !== undefined && guard !== undefined && guard - conflict <= 1;
  const helped = has(r, '伤医-他人介入');
  const result = rescued && withdrew ? ['伤医-受伤生还']
    : rescued || withdrew ? ['伤医-受伤生还', rescued || prompt || helped ? '伤医-手部功能损失' : '伤医-长期行动障碍']
    : ['伤医-抢救无效'];
  return [...result, '伤医-家属证言'];
}

/** DK-8：当场求援或此前就医的人被救回；两者都没有而本局出现过身体异常的，
 * 这一次抢救没有成功；身体线从未开启的按上限永久下调结算。 */
export function collapseOutcome(r: Run): string[] {
  if (has(r, '身体-已求援') || has(r, '身体-已就医')) return ['身体-救回'];
  if (has(r, '健康-确诊') || has(r, '纸带') || has(r, '未就诊')) return ['身体-抢救无效'];
  return ['身体-救回', '身体-上限永久下调'];
}

/** DK-5 的收口：住院的人不再复岗，只做过评估的人留下长期症状。
 * 走到失联的人由 DK-6 与 DK-7 承接，这里不写结果。 */
export function crisisOutcome(r: Run): string[] {
  if (has(r, '精神-持续住院')) return ['精神-无法复岗'];
  if (has(r, '危机-评估已做')) return ['精神-长期症状'];
  return [];
}

/** DK-7 的身后事项，按本局实际发生的关系与借贷取三段。不写方法与经过。 */
export function posthumousItems(r: Run): string {
  const items = ['母亲把衣服和证件收进袋子，一件一件对着清单核。'];
  items.push(r.receivable > 0
    ? '李恂把一个信封交到她手里，说这是之前借的钱。她对着借条上的名字看了很久。'
    : '姜蓉把储物柜里的东西装成两箱，登记完把钥匙交回护士站。');
  items.push(r.patients.some(p => p.active && p.inpatient)
    ? '桌上的工作电话又响了一次，是病区问某张床的复查怎么安排。护士接起来，说这件事已经转给别人。'
    : '桌上的工作电话又响了一次，科里的人接起来，说这件事已经转给别人。');
  return items.join('');
}

/** `engine.interrupt` raises `sanBreaks` before it asks for the card, so the
 * second SAN zero already reads as two; the exhaustion counter is raised after
 * the card is built, so the second exhaustion still reads as one. */
const ENTRY: Record<'san' | 'stamina', (r: Run) => string | undefined> = {
  san: r => recordedSanBreaks(r) < 2 ? undefined
    : r.depression >= 70 && !has(r, '危机-支持联系已建立') && !has(r, '精神-持续住院') ? 'E-233' : 'E-230',
  stamina: r => r.exhausted < 1 ? undefined : 'E-238',
};

/** 返回该链的首张卡；首次归零仍走既有的 E-197～E-202，此时返回 undefined。 */
export function darkChainEntry(r: Run, kind: 'san' | 'stamina', phase: EventPhase = r.shiftPhase ?? '日终'): EventCard | undefined {
  const id = ENTRY[kind](r);
  const event = id ? EVENT_BY_ID[id] : undefined;
  if (!event) return;
  const instanceId = `${r.id}:dark-chain:${kind}:${r.day}`;
  return eventToCard(event, { instanceId, day: r.day, phase, scope: { kind: 'personal', id: r.id }, actorId: 'jiang' });
}

/** 链末结算的标记本身：按已经写入的事实取值，不掷骰、不覆盖既有记录。 */
export function darkChainOutcome(r: Run): Effects {
  const flags: string[] = [];
  if (has(r, '伤医-袭击发生') && !has(r, '伤医-受伤生还') && !has(r, '伤医-抢救无效')) flags.push(...assaultOutcome(r));
  if (has(r, '身体-本次归零已处理') && !has(r, '身体-救回') && !has(r, '身体-抢救无效')) flags.push(...collapseOutcome(r));
  if (!has(r, '精神-无法复岗') && !has(r, '精神-长期症状')) flags.push(...crisisOutcome(r));
  return flags.length ? { flags: [...new Set(flags)] } : {};
}

/** 链末结算：把上面的标记写进 `r.facts`。已经存在的记录保持原值与原日期。 */
export function darkChainResolve(r: Run): void {
  for (const key of darkChainOutcome(r).flags ?? [])
    if (!r.facts[key]) r.facts[key] = { day: r.day, source: 'dark-chain', sequence: r.journal.length };
}
