import {TALENT_DEFINITIONS} from '../content/talents';
import { talentCopy } from './talent-copy';
import { RULES } from '../game/rules';
import { RELATION_LABELS, VITAL_LABELS } from '../game/rules';
import { optionCosts } from '../game/costs';
import { talentEffects } from '../game/talents';
import { talentContext } from '../game/traits';
import {nightClinicalCharge}from '../game/night-costs';
import type { Card, Effects, Option, Run, Vital, Relation } from '../game/types';
export const TALENT_GUIDE:Record<string,{summary:string;use:string;tradeoff:string}>=Object.fromEntries(TALENT_DEFINITIONS.map(t=>[t.id,{summary:talentCopy[t.id].benefit,use:talentCopy[t.id].detail,tradeoff:talentCopy[t.id].price}]));

export const TERM_GUIDE: { term: string; meaning: string }[] = [
  { term: "行动值 / AP", meaning: "安排当天事务的额度，基础每天 10 点。选择会消耗标出的行动值；它与体力、夜班分钟数分开计算。" },
  { term: "预支", meaning: `你可以提前使用明天的行动值。每预支一次，今天加 1 点行动值，明天少 1 点，体力、精神和情绪上限还会各减 ${RULES.borrowCapLoss} 点。每天最多 ${RULES.borrowMax} 次，最后一个工作日不能预支。` },
  { term: "透支", meaning: "你在行动值不足时继续处置，每缺 1 点行动值，体力、精神和情绪上限就各减 2 点，当前体力再减 5 点。当天各项能力检定还会少 1 点加成。" },
  { term: "精神 / SAN", meaning: "看你还能不能撑住眼前的压力。低于 50 时，安抚和说服检定少 2 点加成。每局只有一次归零后掷骰自救的机会，成功才可能继续；再次归零，本局结束。" },
  { term: "情绪 / 体力", meaning: "情绪反映心理承受程度，体力支持处置和日常活动。两者归零都会打断日程；看当前值之外，也要看已经降低的上限。" },
  { term: "声望", meaning: "科室和外界对你工作的评价。第十五天的复核会引用声望，用于判断医院愿不愿意为你的处置分担责任，并影响最终走到哪一种结局；声望高不能删掉已发生的诊疗问题或伤害。" },
  { term: "关系", meaning: "主任、护士长、同事和家人各有自己的关系值，会影响对应的沟通检定、帮助和后续职业安排。第十五天的复核也会引用主任和同事关系，用于判断医院是否为你担责，并影响结局走向；关系好不代表对方已同意签字、作证或交出资料。" },
  { term: "抑郁倾向", meaning: "你长期积累的心理负担。抑郁倾向会减少抗压加成，影响状态上限；它也会被复核阶段引用，长期过高会指向精神方面的结局。它与当下的情绪分开计算。" },
  { term: "病组预算 / DIP / DRG", meaning: "每位患者可用的诊疗费用额度，DIP、DRG 是病组支付的简称。预算不是给你的现金，也不代表患者已经适合出院。" },
  { term: "诊疗记账", meaning: "检查、用药和治疗费用先累计到该患者账上，住院也会继续产生费用；这笔数额不等于立刻从你的余额扣除。" },
  { term: "个人自付", meaning: "本次从医生余额扣除的钱，包括患者预算超支中由你承担的部分，以及个人就诊、垫付等已说明的支出。患者全部诊疗账单不会自动变成个人自付，已扣过的超支也不会重复扣。" },
  { term: "收入 / 余额", meaning: "工资和绩效记为收入，到账时先偿还信用债，余款才进入个人余额。赠款和借款另记；患者诊疗费不计入医生收入。" },
  { term: "检定 / 能力加成", meaning: "掷骰决定这次能不能办成。普通检定把骰点和能力加成相加，达到要求就成功；骰子本身掷出 20 必成、1 必败，「再来一次」使 2 也算大失败。标为概率判定时只看界面给出的门槛，不加能力。病史没问到，就得找知情人或旧记录，骰子不会替你补出答案。" },
  { term: "持续状态", meaning: "失眠、手抖等会在获得后继续影响行动或检定。部分可按说明解除，标为永久的状态通常持续本局，不会因换一天自动消失。" },
  { term: "经验 / 永久成长", meaning: `用于提升以后新局的起点：${RULES.meta.skillCost} 经验升 1 点能力，${RULES.meta.capCost} 经验升 ${RULES.meta.capRank} 点状态上限，${RULES.meta.cashCost} 经验升 ¥${RULES.meta.cashStep.toLocaleString('zh-CN')} 初始余额。各项有购买上限，不在当前局补回损失。` },
  { term: "悟性", meaning: "与经验分开记账的成长资源，可解锁第 4 天赋槽、额外的开局重抽、每局重掷令牌和主治难度。购买前查看各项价格，余额不足不会自动借用经验。" },
  { term: "重抽 / 重掷", meaning: "重抽更换开局的天赋池；重掷重新投一次尚未结算的骰子。「再来一次」每天限一次，成长令牌每局额外一次；重掷必须保留新骰点，不撤回已经发生的处置。" },
];

export interface ResourceCopy {text:string;danger:boolean;}
import {isRepresentativeBenefit}from '../game/representative-benefit';
export function visibleChoiceEffects(r:Run,e:Effects,card:Card|undefined=r.queue[r.cursor]):Effects {
  return talentEffects(talentContext(r),e,{randomEvent:!!card&&'authoredEventId'in card&&!('butterfly'in card),dispute:card?.chain==='BTF-003'||card?.chain==='dispute',departmentNotice:card?.actor==='chief',representativeBenefit:isRepresentativeBenefit(card,e),isNight:card?.kind==='night'});
}
/** Show only explicit immediate resource effects. Never inspect hidden flags,
 * hazards, delayed effects, outcome tables or the predetermined roll. */
export function choiceResourceCopy(r:Run,o:Option,card:Card|undefined=r.queue[r.cursor]):ResourceCopy[] {
  const rows:ResourceCopy[]=[],cost=optionCosts(r,o,card),conditional=!!o.check&&!card?.clinicalGraph;
  const add=(text:string,danger=false)=>rows.push({text,danger});
  const show=(e:Effects,prefix:string,includeStamina:boolean)=>{
    const effect=visibleChoiceEffects(r,e,card);
    if((e.cash??0)>0&&effect.cash!==e.cash)add(`${prefix}原金额 ¥${e.cash!.toLocaleString('zh-CN')}；天赋调整后实际到账 ¥${Math.floor(effect.cash??0).toLocaleString('zh-CN')}`,false);
    for(const vital of ['stamina','san','emotion'] as Vital[]){
      if(vital==='stamina'&&!includeStamina)continue;
      const raw=effect[vital]??0,value=raw<0?Math.ceil(raw):Math.floor(raw);
      if(value)add(`${prefix}${VITAL_LABELS[vital]} ${value>0?'+':'−'}${Math.abs(value)} 点${value>0?'（不超过上限）':''}`,value<0);
    }
    for(const vital of ['stamina','san','emotion'] as Vital[]){const n=effect.caps?.[vital];if(n&&n<0)add(`${prefix}${VITAL_LABELS[vital]}上限 −${Math.abs(n)} 点`,true);}
    if((effect.ap??0)<0)add(`${prefix}另扣 ${Math.abs(effect.ap!)} 点行动`,true);
    if((effect.reputation??0)<0)add(`${prefix}声望 −${Math.abs(effect.reputation!)} 点`,true);
    if((effect.depression??0)>0)add(`${prefix}抑郁倾向 +${effect.depression} 点`,true);
    for(const relation of Object.keys(RELATION_LABELS) as Relation[]){const n=effect.relations?.[relation];if(n&&n<0)add(`${prefix}${RELATION_LABELS[relation]}关系 −${Math.abs(n)} 点`,true);}
    if((effect.debt??0)>0)add(`${prefix}信用债 +¥${effect.debt!.toLocaleString('zh-CN')}`,true);
    if((effect.privateDebt??0)>0)add(`${prefix}私人借款 +¥${effect.privateDebt!.toLocaleString('zh-CN')}`,true);
    if(prefix.startsWith('未通过')&&(effect.cash??0)<0)add(`${prefix}个人余额 −¥${Math.abs(effect.cash!).toLocaleString('zh-CN')}`,true);
  };
  const failure=o.check?('failureTotal'in o?(o as Option&{failureTotal?:Effects}).failureTotal??o.check.failure:o.check.failure):undefined;
  const failedCost=conditional&&failure?optionCosts(r,{...o,effects:failure},card):undefined;
  const prefix=conditional?'通过后：':'';
  if(card?.kind!=='night'&&cost.ap>o.ap)add(`本步基础 ${o.ap} 点行动，当前工作分担与状态追加 ${cost.ap-o.ap} 点，合计 ${cost.ap} 点`,true);
  add(`${failedCost?.stamina===cost.stamina?'':prefix}操作体力${cost.stamina?` −${cost.stamina} 点`:'消耗 0 点'}`,cost.stamina>0);
  show(o.effects,prefix,(o.effects.stamina??0)>0);
  if(o.check&&failure){
    // Full clinical graphs retain the performed operation and add failure costs;
    // other checks replace their result effects, but still spend action time.
    if(failedCost&&failedCost.stamina!==cost.stamina)add(`未通过：操作体力${failedCost.stamina?` −${failedCost.stamina} 点`:'消耗 0 点'}`,failedCost.stamina>0);
    show(failure,card?.clinicalGraph?'未通过另计：':'未通过：',!conditional||(failure.stamina??0)>0);
  }
  const overflow=card?.kind==='night'?0:Math.max(0,cost.ap-r.ap);
  if(overflow)add(`透支 ${overflow} 点行动：另扣体力 ${overflow*RULES.overtimeStamina} 点，体力、精神、情绪上限各减 ${overflow*RULES.overtimeCapLoss} 点`,true);
  if(card?.kind==='night'){
    if(r.nightMinutes-cost.minutes<0)add('本次夜班超时：另扣体力 5 点、精神 3 点',true);
    const baseline=nightClinicalCharge(r,card,o);
    if(baseline.key)add(`接诊这起急诊：另扣体力 ${baseline.stamina} 点、精神 ${baseline.san} 点（本起仅一次）`,true);
  }
  return rows;
}
