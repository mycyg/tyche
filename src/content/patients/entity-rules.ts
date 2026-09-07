import type { Effects, HazardInput, Scene } from '../../game/types';
import type { PatientEntity } from './types';
import { entityScenario } from './scenarios';
import {minorDialogue} from './participant-copy';

interface Need { flag: string; question: string; action: string; done: string; hazard: HazardInput; ap: number }
const risk = (type: HazardInput['type'], weight: number, reason: string, norm: string, causal = false): HazardInput => ({ type, weight, reason, norm, causal });
const needs: Need[] = [
  { flag: '语言障碍', question: '你已经口头说明，但还没有确认患者是否听懂。', action: '安排翻译并请患者复述', done: '患者借助适合自己的沟通方式，确认了症状、决定和后续安排。', hazard: risk('C', 10, '沟通存在障碍时未经确认便完成告知', '须采用患者可以理解的沟通方式并核实理解。'), ap: 1 },
  { flag: '认知障碍', question: '病史和照护安排需要与知情照护者或原始记录核对；签字须确认决定能力。', action: '核对照护者病史并确认合法签字安排', done: '你注明了每项病史的来源，也确认了患者的决定能力和合法签字途径。', hazard: risk('C', 15, '未确认决定能力及签字途径便完成知情手续', '认知障碍时须核对决定能力、代理权限或备案途径。'), ap: 0 },
  { flag: '多重用药', question: '患者的药物来自多个处方，清单尚需逐项核对。', action: '逐项核对完整药物清单', done: '你核实了药名和实际服用情况，查明哪些药用途重复，后续处置将按完整药单复核。', hazard: risk('R', 15, '多重用药患者处置前未核对完整药物清单', '需核对现用药物与潜在冲突。'), ap: 1 },
  { flag: '独居', question: '出院后没有同住家属，返院与照看安排需要具体落实。', action: '落实回家后的照护人与联络方式', done: '你确认了患者能自行完成哪些照护，也找到了愿意帮忙的联系人。', hazard: risk('C', 10, '未向独居患者落实出院后照护与联系安排', '出院评估应包括照护能力及可用支持。'), ap: 0 },
  { flag: '无家属', question: '现有陪同者不能自动代替本人作决定。', action: '确认本人签字或医务科备案途径', done: '患者清醒且具决定能力时，由本人作决定。你也按备案途径确认了需要额外授权的事项。', hazard: risk('C', 10, '无家属患者签字时未核实本人或备案途径', '签字权限需要真实确认，不能由送诊者自动代签。'), ap: 0 },
  { flag: '孕晚期', question: '当前病情与检查安排需要产科共同评估。', action: '联系产科核对母胎风险与处置限制', done: '你记录了产科意见，并根据母胎风险和检查限制调整了当前计划。', hazard: risk('R', 15, '孕晚期患者未安排产科共同评估', '孕晚期的诊疗计划应包含产科意见。'), ap: 0 },
  { flag: '哺乳期', question: '患者需要知道处置是否影响哺乳，以及暂时变化时怎样安排喂养。', action: '核对哺乳相容性并写清喂养安排', done: '哺乳相关注意事项与替代安排写在患者持有的清单上。', hazard: risk('C', 10, '哺乳期处置未说明相关注意事项', '处方与检查说明须考虑哺乳需要。'), ap: 0 },
  { flag: '医保欠费', question: '欠费影响患者愿意接受的项目，必要评估仍需安排。', action: '解释必要费用并联系救助及后续结算', done: '你继续安排必要项目，并确认了后续结算联系人和可用援助。', hazard: risk('R', 15, '仅因欠费省略当前必要评估', '急症必要评估不能以预缴款是否到齐决定。'), ap: 0 },
  { flag: '被押送', question: '押送者催促出具没有问题的证明，患者病史仍需独立核对。', action: '据实记录病史、押送信息与证明范围', done: '记录注明信息来源及押送单位；证明只写本次能够确认的事实。', hazard: risk('D', 10, '未独立核对便按押送方要求填写证明', '押送不改变首诊义务，证明须据实。'), ap: 0 },
  { flag: '医护同行', question: '患者熟悉流程，仍需要按本次病情独立评估。', action: '与同行核对病史并完整执行必要流程', done: '你听取了患者提供的专业信息，按本次病情完成了必要评估。', hazard: risk('R', 10, '因患者是同行而省略必要临床核对', '同行就诊同样须按病情完成必要评估。'), ap: 0 },
  { flag: '关系户', question: '患者提到主任曾答应照顾，要求优先或少做检查。', action: '向主任说明分级依据，按病情安排', done: '你说明了优先顺序和必要检查依据，接诊次序按病情处理。', hazard: risk('R', 15, '因私人关系省略当前必要评估', '私人关系不能代替病情分级和必要检查。'), ap: 0 },
  { flag: '律师', question: '患者要求逐项查看告知与拒绝记录，签字前需要说明清楚。', action: '逐项完成告知与签字核对', done: '患者确认了说明内容，涉及的决定与签名一一对应。', hazard: risk('C', 20, '具体知情内容未核对便要求签字', '患者须在理解具体告知后作决定。'), ap: 0 },
  { flag: '自媒体', question: '患者正在记录看病过程，镜头也可能拍到其他患者。', action: '确认录音边界并保护其他患者隐私', done: '你解释了本人的诊疗安排，约定拍摄不包含他人资料。', hazard: risk('C', 15, '公开沟通时未保护其他患者隐私', '录音不免除必要沟通，也不得暴露无关患者资料。'), ap: 0 },
  { flag: '外来务工', question: '患者担心费用和误工，工作相关事实可能受到陪同者影响。', action: '分别核对本人陈述、费用与工作信息', done: '你分别记录了患者本人和陪同者的说法。雇主的说法还需要核实。', hazard: risk('D', 10, '未核对本人便按雇主口径记录伤病经过', '工作相关事实应据实记载并注明来源。'), ap: 0 },
  { flag: '宗教约束', question: '患者对可接受的药物成分、饮食或治疗方式有明确限制。', action: '确认可接受范围，讨论替代支持并记录决定', done: '你和患者确认了可接受的照护范围，拒绝的具体项目与替代支持均有记录。', hazard: risk('C', 20, '未取得本人同意便忽略已提出的治疗限制', '应说明风险、核对决定能力并尊重知情选择。'), ap: 0 },
  { flag: '精神障碍史', question: '既往精神症状不能解释全部躯体不适，常用药也需要核对。', action: '独立评估躯体问题并核对精神科用药', done: '你根据体征评估了躯体症状，分别记录了相关用药和患者需要的支持。', hazard: risk('R', 25, '因精神障碍史跳过必要躯体评估', '躯体主诉需独立评估，不能凭既往精神病史排除。', true), ap: 0 },
  { flag: 'VIP', question: '患者要求全套加急检查，称费用不是问题。', action: '说明必要项目和公平分级，拒绝无依据加项', done: '你按当前病情安排了检查，向患者解释了费用和接诊先后顺序的依据。', hazard: risk('F', 8, '为满足特需要求增加无指征检查', '支付能力不能作为过度检查的适应依据。'), ap: 0 },
];

/** Entity needs affect real choices and hazards, while clinical diagnosis remains preset-scoped. */
export function applyEntityMechanics(steps: Scene[], entity: PatientEntity, prefix: string): Scene[] {
  const speaker=minorDialogue(entity)?.listener??'患者';
  const matched = needs.filter(n => entity.flags.includes(n.flag));
  if (entity.ageYears < 18 && !entityScenario(entity).roles.has('parent')) matched.push({
    flag: '监护人授权', question: '患者未满十八岁，当前陪同者不能仅凭陪诊关系代替监护人作决定。',
    action: '联系监护人核实具体同意；紧急情况请上级落实备案',
    done: '你核实了监护人的身份、联系方式和具体决定。不能等待授权的紧急事项由上级确认备案，普通陪同者不能代替监护人决定。',
    hazard: risk('C', 15, '未核实监护人权限或紧急备案，便由一般陪同者代替未成年人作决定', '须确认监护人权限、具体决定或紧急备案依据。'), ap: 0,
  });
  const special = entity.id === 'P-199' ? matched.filter(n => n.flag !== '语言障碍') : matched;
  const moneyNote = entity.payment.startsWith('商保') ? `${speaker}提出能否把相关检查一次全开。` : entity.payment.startsWith('自费') ? `${speaker}先问了自付费用，希望明确每项必要性。` : entity.payment.startsWith('工伤') ? '本次工作相关经过需要按原话记录。' : '';
  const verified = `${prefix}:entity-verified`;
  const originalEntry = steps[0].id;
  const nodeId = `${prefix}:entity-needs`;
  const functionalNeed = special.length > 0 || entity.concealment >= 2 || entity.payment.startsWith('工伤') || entity.payment.startsWith('商保');
  if (!functionalNeed) return steps;
  const action = special.length ? special.map(n => n.action).join('；') : entity.payment.startsWith('工伤') ? '单独核对受伤经过，按事实留下记录' : entity.payment.startsWith('商保') ? '说明必要项目，先核对近期已做检查' : `给${speaker}留出单独说话的机会，核对未说全的病史`;
  const charge = special.reduce((sum, need) => sum + need.ap, 0) - (entity.id === 'P-164' && special.some(n => n.flag === '多重用药') ? 1 : 0);
  const scopeHazards = special.map(n => n.hazard);
  if (entity.payment.startsWith('工伤') && !scopeHazards.some(h => h.type === 'D')) scopeHazards.push(risk('D', 10, '未核实工伤经过便使用陪同者指定说法', '工作相关损伤须客观记录并标明来源。'));
  if (entity.payment.startsWith('商保') && !scopeHazards.some(h => h.type === 'F')) scopeHazards.push(risk('F', 8, '为满足商保要求开具与当前问题无关的全套检查', '支付来源不能代替检查适应依据。'));
  const exposed = entity.concealedFact ? `病史补充：${entity.concealedFact}。` : `${speaker}确认了现有病史和就诊诉求。`;
  const extra: Scene = { id: nodeId, title: `${entity.name} · 接诊前的核对`, text: `${entity.dialogue}\n${special.map(n => n.question).join('')} ${moneyNote}`.trim(), options: [
    { id: `${nodeId}:address`, label: action, ap: Math.max(0, charge), minutes: charge * 5, cost: 0,
      result: `${special.map(n => n.done).join('')}${exposed}`, effects: { flags: [verified, ...special.map(n => `${prefix}:entity:${n.flag}:addressed`)], ...(special.some(n => n.flag === '关系户') ? { relations: { chief: -1 } } : {}) }, next: originalEntry },
    { id: `${nodeId}:support`, label: '请合适的同事协助核对，并确认结果', ap: 1, minutes: 5, cost: 0,
      result: `同事协助完成所需沟通和核对。${exposed} 结果交回给你，后续处置仍由你完成。`, effects: { flags: [verified, ...special.map(n => `${prefix}:entity:${n.flag}:addressed`)], relations: { peer: -1 } }, next: originalEntry },
    { id: `${nodeId}:skip`, label: special.length ? '省略上述核对，直接按原叙述接诊' : entity.payment.startsWith('工伤') ? '按陪同者指定的说法登记' : entity.payment.startsWith('商保') ? '答应加开无关的全套检查' : '保持现有病史，暂不单独补问', ap: 0, minutes: 0, cost: entity.payment.startsWith('商保') ? 360 : 0,
      result: '你继续接诊，尚未核实的信息仍然不详。记录里也留下了本次未完成的必要核对。', effects: { flags: [`${prefix}:entity-unresolved`], hazards: scopeHazards }, next: originalEntry },
  ] };
  extra.options[0].mechanics = { operation: entity.concealment > 0 ? 'history' : 'consent', actor: entity.ageYears < 18 ? 'family' : 'patient', quality: 'correct' };
  extra.options[1].mechanics = { operation: 'other', actor: 'peer', quality: 'correct' };
  extra.options[2].mechanics = { operation: 'other', actor: 'patient', quality: 'incorrect' };
  if (entity.concealment > 0) extra.options[0].check = { skill: 'clinical', dc: 10, purpose: '核实患者或陪同者尚未说全的信息', failureHint: '病史仍不完整，需要同事协助或后续补问。',
    failure: { flags: [`${prefix}:entity-unresolved`] }, failureText: '你这次没有问到完整、可靠的说法，还需要照顾患者已知的特殊需要。未核实的病史仍然不详。' };
  if (entity.flags.includes('被押送')) extra.options[0].check = { skill: 'persuade', dc: 14, purpose: '拒绝不实证明，说明记录只能依据已确认的事实', failureHint: '押送方仍在催促，未确认的信息不能写成正常。',
    failure: { flags: [`${prefix}:entity-unresolved`] }, failureText: '押送方仍不接受目前的证明范围。你尚未出具不实证明，需要联系同事或医务部门继续处理。' };
  // Hidden history must affect a later action. Skipping its source leaves the targeted
  // plan unavailable until a paid re-check; merely revealing the preset does not grant it.
  if (entity.concealment >= 2) {
    const decision = steps.find(s => s.id === `${prefix}:decision`)!;
    const tailored = decision.options.find(o => o.id.endsWith(':tailored'))!;
    tailored.when = { ...tailored.when, all: [...tailored.when?.all ?? [], verified] };
    decision.options.push({ id: `${prefix}:decision:entity-recheck`, label: `重新核对${speaker}不愿提及的病史`, ap: 1, minutes: 6, cost: 0, result: exposed,
      effects: { flags: [verified], clear: [`${prefix}:entity-unresolved`] }, next: decision.id, when: { none: [verified] } });
    const consult = decision.options.find(o => o.id.endsWith(':consult'))!;
    consult.effects.flags = [...consult.effects.flags ?? [], verified]; consult.result += ` ${exposed}`;
  }
  const closed = steps.find(s => s.id === `${prefix}:echo`)?.options.find(o => o.id.endsWith(':closed'));
  if (closed && scopeHazards.length) closed.when = { ...closed.when, all: [...closed.when?.all ?? [], verified] };
  const repair = steps.find(s => s.id === `${prefix}:echo`)?.options.find(o => o.id.endsWith(':repair'));
  if (repair) { repair.effects.flags = [...repair.effects.flags ?? [], verified]; repair.effects.clear = [...repair.effects.clear ?? [], `${prefix}:entity-unresolved`]; }
  return [extra, ...steps];
}
