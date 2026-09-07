import { DEBUFF_DEFINITIONS, TALENT_DEFINITIONS, TALENT_SYNERGIES } from '../content/talents';

const detailClarifications: Partial<Record<string, string>> = {
  T02:'在交班或查房阶段，走到仍有未知线索的住院患者床旁，选择「翻阅旧病历」。每次花 2 点行动值，只核对一条尚未发现的线索；同一张待办限用一次，换到后续待办仍须有新的线索。没有相关旧记录时不出现这个选项。',
  T03:'首次接触确有相应气味的患者时自动生效，不必另按技能键。每位患者只触发一次，触发时你的情绪减少 2 点；没有气味线索就不触发，也不扣这份代价。辨认出气味仍不等于确诊。',
  T08: '只缩短会诊医师到场的等待。申请、电话沟通、检查、治疗与转运仍按原时长；预约次晨到场不会变成当夜完成。确认页的总耗时已计入这项减免，每次会诊仍会增加该患者的费用隐患。',
  T12: '完整查体额外消耗 1 点体力；基础消耗为 3 点时，合计 4 点。其他状态仍按确认页计算。信任增益只作用于接受查体的患者，简单观察不算完整查体。',
  T17: '夜间操作本身的体力消耗减少 30%；超时和其他天赋明确列出的额外代价仍另算。白天上限惩罚不永久写入基础上限；与「长跑」同时持有，夜班次日起床时体力为上限减 15 点。',
  T05: '只重看已经取得的报告；每位患者限首次处置时一次，本局合计最多 5 次。未做检查不能提前读取结果，后续处置不能补用首次机会。',
  T15: '向家属问诊或安抚时，优势掷两枚骰取高；直接向患者问诊时，劣势取低。其他来源的优势与劣势同时存在时抵消，观察、记录和说服不受这一项影响。',
  T22: '每天可重掷一次尚未结算的检定，并必须保留新骰点。天然 1 和 2 都是大失败，不因能力加成足够而通过；已经结算的处置不能重选。成长令牌的每局额外次数另外记录。',
  T23: '本局只保护一次，体力、精神与情绪共用这次机会。用于首次精神归零时，代替这局唯一的掷骰自救；精神再次归零必定结束。触发后的精神与抑郁代价仍然结算，患者病情、债务和处分不受保护。',
  T27: '需完成说明并得到转诊同意；拒绝时原处置继续，不能把未完成检查写成已经做完。转出后旧病史、风险、损伤和费用都保留。',
};
const benefitClarifications: Partial<Record<string, string>> = {T17:'夜间操作体力消耗减少 30%；免除夜班次日减少 2 点行动的惩罚。'};
const priceClarifications: Partial<Record<string, string>> = {T12:'完整查体额外消耗 1 点体力，按该项操作的基础消耗累加。'};
export const talentCopy = Object.fromEntries(TALENT_DEFINITIONS.map(t => [t.id, {name: t.name, family: t.family, rarity: t.rarity, benefit: benefitClarifications[t.id] ?? t.benefit, price: priceClarifications[t.id] ?? t.price, detail: detailClarifications[t.id] ?? t.detail}]));
export const debuffCopy = Object.fromEntries(DEBUFF_DEFINITIONS.map(d => [d.id, {name: d.name, text: d.text, recovery: d.recovery}]));
export function activeTalentSynergies(ids: readonly string[]): string[] {
  return TALENT_SYNERGIES.filter(s => s.ids.every(id => ids.includes(id))).map(s => s.text);
}
