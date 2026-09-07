import entityData from './entities.json';
import presetData from './presets.json';
import tuning from './tuning.json';
import { CLINICAL_COPY } from './clinical-copy';
import { applyEntityMechanics } from './entity-rules';
import { addPresetProbes } from './checks';
import { investigationOperation } from './investigation-operations';
import { PRESET_ENTRY_COPY,applyEntryEvidence } from './entry-copy';
import {projectParticipantScene} from './participant-copy';
import {projectPresetAgeBranches} from './age-branches';
import {projectInvestigationCopy}from './middle-copy';
import { assessedClues } from './probe-copy';
import { performanceForBudget } from '../../game/performance';
import {RULES}from '../../game/rules';
import { PRESET_SCENARIOS, scenarioCompatible, entityScenario } from './scenarios';
import type { Effects, HazardInput, Option, Scene } from '../../game/types';
import type { CasePreset, InstantiatedPreset, PatientCategory, PatientEntity, PatientPeriod, PresetConstraints, PresetSource } from './types';
export type * from './types';

export const PATIENT_ENTITIES: PatientEntity[] = entityData as PatientEntity[];
export const PRESET_END = 'END';
const ages: Record<string, [number, number]> = { '婴儿': [0, 0.999], '幼儿': [1, 5.999], '学龄': [6, 12.999], '青少年': [13, 17.999], '青年': [18, 39.999], '中年': [40, 59.999], '老年': [60, 120] };
const departments: [number, string, PatientCategory[]][] = [
  [22, '呼吸', ['呼吸']], [44, '心血管', ['心血管']], [66, '消化与肝胆', ['消化']],
  [86, '内分泌与肾', ['内分泌', '肾']], [106, '神经', ['神经']], [131, '外科', ['外科', '创伤']],
  [161, '儿科', ['儿科']], [176, '妇产', ['妇产']], [196, '中毒与环境急症', ['中毒']],
  [208, '精神、感染与血液', ['精神', '感染', '血液']],
];
const knownFlags = ['多重用药', '认知障碍', '语言障碍', '孕晚期', '哺乳期', '被押送', '医护同行', '精神障碍史', '宗教约束'];

function constraints(source: PresetSource): PresetConstraints {
  const ranges = Object.entries(ages).filter(([name]) => source.compatibility.includes(name)).map(([, range]) => range);
  let ageMin = ranges.length ? Math.min(...ranges.map(x => x[0])) : 0;
  let ageMax = ranges.length ? Math.max(...ranges.map(x => x[1])) : 120;
  if (source.compatibility.includes('新生儿')) { ageMin = 0; ageMax = 28 / 365; }
  const number = Number(source.id.slice(2));
  const group = departments.find(([end]) => number <= end)!;
  let categories = number >= 197 ? (number <= 201 ? ['精神'] : number <= 204 ? ['感染'] : ['血液']) as PatientCategory[] : group[2];
  if (number >= 67 && number <= 86) categories = [70, 72, 73, 77, 82, 83, 84, 86].includes(number) ? ['肾'] : ['内分泌'];
  if (number >= 107 && number <= 131) categories = [111, 112, 115, 116, 117, 118, 119, 120, 128].includes(number) ? ['外科', '创伤'] : ['外科'];
  const requiredFlags = knownFlags.filter(x => source.compatibility.includes(x));
  if (/；独居(?:$|；)/.test(source.compatibility)) requiredFlags.push('独居');
  const periods: PatientPeriod[] = [source.period];
  for (const p of ['门诊', '病区', '夜班'] as const) if (source.variants.includes(`${p}时段变体`) && !periods.includes(p)) periods.push(p);
  return { ageMin, ageMax, sex: /；\s*女/.test(source.compatibility) ? '女' : /；\s*男/.test(source.compatibility) ? '男' : '不限', categories, periods, requiredFlags, forbiddenFlags: [], scenario: PRESET_SCENARIOS[source.id], presetId: source.id };
}

export function isCompatible(entity: PatientEntity, preset: Pick<CasePreset, 'constraints'>, period?: PatientPeriod): boolean {
  const c = preset.constraints;
  return (entity.ageYears >= c.ageMin && entity.ageYears <= c.ageMax || !!c.scenario.ageVariants?.some(([min, max]) => entity.ageYears >= min && entity.ageYears <= max))
    && (c.sex === '不限' || entity.sex === c.sex)
    && c.categories.some(category => entity.categories.includes(category))
    && c.requiredFlags.every(flag => entity.flags.includes(flag))
    && c.forbiddenFlags.every(flag => !entity.flags.includes(flag))
    && c.periods.some(p => (!period || period === p) && entity.periods.includes(p))
    && scenarioCompatible(entity, c.scenario, c.presetId);
}
export function compatibleEntities(preset: Pick<CasePreset, 'constraints'>, period?: PatientPeriod): PatientEntity[] {
  return PATIENT_ENTITIES.filter(entity => isCompatible(entity, preset, period));
}

/** Historic orders and accidental exposure amounts are evidence. Only action
 * instructions omit prescription quantities; source rows remain lossless. */
function prose(text: string, historical = false): string {
  const quantities = /\d+(?:\.\d+)?(?:[–~—-]\d+(?:\.\d+)?)?\s*(?:mg|μg|ug|g|U|IU|mmol)(?!\/(?:d?l|ml)\b)(?:\/(?:kg|m²|d|h|min))*\b(?:\s*(?:qd|bid|tid|qid|q\d+h|iv|静注|静推|静滴))?/gi;
  return (historical ? text : text.replace(quantities, '')).replace(/⚠待核[^；。）（]*/g, '').replace(/【假设】/g, '')
    .replace(/(?:问诊|察觉)\s*DC\s*\d+(?:[（(][^）)]*[）)])?/g, '')
    .replace(/\b(?:explicit|causal)\b/g, '')
    .replace(/[①②③④⑤]/g, '').replace(/真实诊断[：:]/g, '')
    .replace(/SpO[₂2]/g, '血氧饱和度').replace(/\bHR\b/g, '心率').replace(/\bBP\b/g, '血压').replace(/\bRR\b/g, '呼吸频率')
    .replace(/\bECG\b/g, '心电图').replace(/\bWBC\b/g, '白细胞').replace(/\bCRP\b/g, '炎症指标')
    .replace(/\bGCS\b/g, '意识评分').replace(/\bCr\b/g, '肌酐').replace(/\bCTPA\b/g, '肺动脉增强影像')
    .replace(/\bHELLP\b/g, '溶血、肝酶升高与血小板减少').replace(/\bICU\b/g, '重症监护室')
    .replace(/\bDKA\b/g, '糖尿病酮症酸中毒').replace(/\bHHS\b/g, '高渗高血糖状态')
    .replace(/\bBPH\b/g, '前列腺增生').replace(/\bCKD\b/g, '慢性肾病')
    .replace(/\bPEF\b/g, '呼气峰流速').replace(/→/g, '，继而出现')
    .replace(/\bCURB-65\b/g, '肺炎严重度评分（CURB-65）').replace(/\bPSI\b/g, '肺炎严重度指数（PSI）').replace(/\bCAT\b/g, '慢阻肺症状评分（CAT）')
    .replace(/\bCAP\b/g, '社区获得性肺炎').replace(/\bSTEMI\b/g, 'ST 段抬高型心肌梗死')
    .replace(/\bACEI\b/g, '血管紧张素转换酶抑制剂').replace(/\bNSAID\b/g, '非甾体抗炎药')
    .replace(/\bSSRI\b/g, '选择性血清素再摄取抑制剂').replace(/\bSIADH\b/g, '抗利尿激素分泌异常')
    .replace(/\bNICU\b/g, '新生儿重症监护室').replace(/\bNIHSS\b/g, '卒中严重度评分（NIHSS）')
    .replace(/\bINR\b/g, '国际标准化比值（INR）').replace(/\beGFR\b/g, '估算肾小球滤过率（eGFR）')
    .replace(/\bALT\b/g, '丙氨酸转氨酶').replace(/\bAST\b/g, '天门冬氨酸转氨酶').replace(/\bLDH\b/g, '乳酸脱氢酶')
    .replace(/\bALP\b/g, '碱性磷酸酶').replace(/\bCK\b/g, '肌酸激酶').replace(/\bPCT\b/g, '降钙素原')
    .replace(/\bBUN\b/g, '尿素氮').replace(/\bPTH\b/g, '甲状旁腺激素').replace(/\bHbA1c\b/g, '糖化血红蛋白')
    .replace(/\bBMI\b/g, '体重指数（BMI）').replace(/\bhCG\b/g, '人绒毛膜促性腺激素')
    .replace(/\bNT-proBNP\b/g, '心衰相关标志物（NT-proBNP）').replace(/PaO₂\/FiO₂/g, '氧合指数')
    .replace(/\bPPI\b/g, '抑酸药').replace(/\bACS\b/g, '急性冠脉综合征').replace(/\bBNP\b/g, '心衰相关标志物（BNP）')
    .replace(/\bAKI\b/g, '急性肾损伤').replace(/\bMTC\b/g, '甲状腺髓样癌').replace(/\bMEN2\b/g, '多发性内分泌腺瘤病 2 型')
    .replace(/\bCTV\b/g, '静脉增强 CT').replace(/\bMRV\b/g, '磁共振静脉成像').replace(/\bCTA\b/g, '动脉增强 CT')
    .replace(/\bHI\b/g, '超出仪器测量上限').replace(/\bKernig\b/g, '脑膜刺激').replace(/\bGraves\b/g, '格雷夫斯')
    .replace(/\bRBC\b/g, '红细胞').replace(/\bHCO3\b|HCO₃⁻/g, '碳酸氢根').replace(/\bAG\b/g, '阴离子间隙')
    .replace(/\bNa(?:[⁺+]|\b)/g, '血钠').replace(/\bK(?:[⁺+]|\b)/g, '血钾').replace(/\bCa\b/g, '血钙').replace(/\bMg\b/g, '血镁').replace(/Cl⁻/g, '氯离子')
    .replace(/\bT\s*(?=\d)/g, '体温 ').replace(/\bG(\d+)P(\d+)\b/g, '孕 $1 次、产 $2 次')
    .replace(/(\d+(?:\.\d+)?)\s*h\b/g, '$1 小时').replace(/(\d+(?:\.\d+)?)\s*d\b/g, '$1 天')
    .replace(/(\d+(?:\.\d+)?)\s*min\b/g, '$1 分钟').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/（\s*）|\(\s*\)/g,'').replace(/；\s*；/g, '；').replace(/\s+([，。；])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
function hiddenCopy(source: PresetSource): string {
  // The source keeps authoring checks. The player receives the established facts,
  // not the directions for exposing those facts or editorial encounter objectives.
  return prose(source.hidden.split(/(?<=[。；])/).filter(part => !/\bDC\s*\d+|揭示|家属在场[^；。]*−|本例(?:目标|核心)|选项/.test(part)).join(''), true)
    .replace(/(?:真实情况|真实诊断)[：:]/g, '').replace(/[；。]+$/, '。');
}
function parseTraps(source: PresetSource): { label: string; hazard: HazardInput[] }[] {
  const parts = source.traps.split(/[。；]/).filter(x => /[RDCF]\s*\d+/.test(x));
  return parts.map(part => {
    const before = part.split(/：|:/)[0].replace(/^[①②③④⑤]/, '').trim();
    // Quantities inside an unsafe choice distinguish the actual error. Removing
    // them can turn a threshold into a broken sentence or a different decision.
    const label = prose(before,true) || '省略当前关键核对';
    const hazard = [...part.matchAll(/([RDCF])\s*(\d+)/g)].map(m => ({
      type: m[1] as HazardInput['type'], weight: Number(m[2]), reason: label,
      norm: `本院诊疗制度：${source.title}须完成对应评估、知情沟通与原始记录。`,
      causal: m[1] === 'R' && (part.includes('causal') || Number(m[2]) >= 25),
    }));
    return { label, hazard };
  }).filter(trap => trap.hazard.length);
}
/** A concealed fact and a gap left by the previous shift are closed by different
 * actions. The label states what the doctor does, never what is hidden. */
function gapClosure(source: PresetSource, investigation: string): { label: string; result: string; pending: string } {
  const handover = /交接|交班|换班|接班|下一班|原科|转入前|产院|上次|未复查|未去|中断|预约/.test(source.hidden)
    || /交接|交班|复查|随访/.test(source.traps);
  const dueBy = source.severity >= 3 ? '两小时内' : source.severity === 2 ? '本班内' : source.severity === 1 ? '今天之内' : '次日晨';
  if (handover) return {
    label: '逐项追问交接与既往记录里没有写明的用药和检查',
    result: `你把交接单、原始医嘱和既往记录逐项对了一遍，问清了没有写进来的部分，并把要补做的项目写进医嘱：${investigation}；复查时点定在${dueBy}，由接班的主管医师复核。`,
    pending: '尚未逐项核对交接与既往记录里没有写明的用药和检查，也没有写明要补做哪些复查、在什么时点由谁复核。',
  };
  return {
    label: '单独向患者本人追问尚未说明的经过',
    result: `你请其他人暂时回避，单独问了患者本人，把他此前没有说出来的经过记进病历，并写明接下来要核对的项目：${investigation}；复查时点定在${dueBy}。`,
    pending: '尚未单独追问患者本人此前没有说出来的经过，本次风险的来源仍未核实。',
  };
}

function option(id: string, label: string, ap: number, minutes: number, cost: number, result: string, effects: Effects, next: string, when?: Option['when']): Option {
  return { id, label, ap, minutes, cost, result, effects, next, ...(when ? { when } : {}) };
}

function build(source: PresetSource): CasePreset {
  const number = Number(source.id.slice(2)); const department = departments.find(([end]) => number <= end)![1];
  const budget = Number(source.dip.match(/[¥￥]\s*([\d,]+)/)?.[1].replaceAll(',', '') ?? 500);
  const base = `preset:${source.id}`; const f = (name: string) => `${base}:${name}`;
  const hasHidden = !/^(无|.*直白)/.test(source.hidden) && !/无隐瞒/.test(source.hidden);
  const hiddenFact = hasHidden ? hiddenCopy(source) : '';
  const rawPath = source.pathway.split('→').map(x => prose(x.trim())).filter(Boolean);
  const copy = CLINICAL_COPY[source.id] ?? [rawPath[0], rawPath[1], rawPath.slice(2, 4).join('，'), rawPath.slice(4).join('，')];
  const [opening, investigation, management, followup] = copy.map(text => prose(text));
  const entryCopy=PRESET_ENTRY_COPY[source.id];
  if(!entryCopy)throw new Error(`Missing reviewed entry copy: ${source.id}`);
  const traps = parseTraps(source);
  const hazards = traps.flatMap(x => x.hazard);
  const clinicalRisk = hazards.some(h => h.type === 'R');
  const fees = { assess: Math.min(600, Math.round(budget * .13 / 10) * 10), manage: Math.round(budget * .22 / 10) * 10, review: Math.min(200, Math.round(budget * .04 / 10) * 10) };
  const total = source.minutes;
  const times = [Math.max(4, Math.round(total * .16)), Math.max(5, Math.round(total * .20)), Math.max(6, Math.round(total * .24)), Math.max(4, Math.round(total * .15)), Math.max(3, Math.round(total * .13))];
  const echoMinutes = total - times.reduce((a, b) => a + b, 0);
  const make = (node: string, action: string, label: string, ap: number, minutes: number, cost: number, result: string, effects: Effects, next: string, when?: Option['when']) => option(f(`${node}:${action}`), label, ap, minutes, cost, result, effects, next === PRESET_END ? next : f(next), when);
  const finding = hasHidden ? hiddenFact : `现有记录与复核结果一致。接下来需要${management}。`;
  const closure = gapClosure(source, investigation);
  const checkFinding = hasHidden && ['history', 'observe'].includes(investigationOperation(source.id)) ? assessedClues(source) ?? finding : finding;
  const scenes: Scene[] = [
    { id: f('entry'), title: source.title, text: prose(source.presentation, true), options: [
      make('entry', 'history', opening, 1, times[0], 0, entryCopy.result, { stamina: -2, flags: [f('history')] }, 'investigate'),
      make('entry', 'skim', '先依据现有记录安排下一步', 0, 2, 0, '你按手头的记录继续安排，未核实的项目仍然不详。', { flags: [f('skimmed')] }, 'decision'),
      make('entry', 'team', '请同事到场共同核对', 0, times[0] + 3, 0, `同事核对了现有叙述，并与你确认接下来要做的评估：${investigation}。尚未完成的检查没有结果。`, { stamina: -1, relations: { peer: -1 }, flags: [f('history'), f('team-support')] }, 'investigate'),
    ] },
    { id: f('investigate'), title: `${source.title} · 关键核对`, text: `本次需要核对：${investigation}。你可以决定检查范围，也可以先补问病史。`, options: [
      make('investigate', 'targeted', investigation, 1, times[1], fees.assess, checkFinding, { stamina: -2, flags: [f('revealed')] }, 'decision'),
      make('investigate', 'verbal', '先向患者与原接诊人核对，暂缓新增检查', 1, times[1], 0, hasHidden ? '你补问了病史，必要的查体和检查还没做完。' : '你问清了病史，接下来要根据病情决定还需做哪些检查。', { stamina: -2, flags: [f('history-full')] }, 'decision'),
      make('investigate', 'all', '加开与当前问题无关的全套检查', 1, times[1] + 10, fees.assess * 3 + 300, `${finding} 你开的额外项目也记入了账单，其中一部分与本次病情无关。`, { stamina: -3, flags: [f('revealed'), f('excess-tests')], hazards: [{ type: 'F', weight: 10, reason: '对当前病情无指征加开全套检查', norm: '检查需有具体适应依据，费用选择不能替代临床评估。', causal: false }] }, 'decision'),
    ] },
    { id: f('decision'), title: `${source.title} · 处置决定`, text: '患者仍在等待具体安排。核对尚未完成时，你可以追加评估或请专科会诊；已有结果和刚才的病史补充保存在记录中。', options: [
      make('decision', 'tailored', management, 1, times[2], fees.manage, `你依据已核实的情况安排处置。接下来，你需要${followup}。`, { care: true, stamina: -3, stability: source.severity >= 2 ? 8 : 5, flags: [f('treated'), f('pending')] }, 'communication', hasHidden ? { all: [f('revealed')] } : undefined),
      make('decision', 'second-look', `补做核对：${investigation}`, 1, times[1] + 3, fees.assess, checkFinding, { stamina: -3, flags: [f('revealed'), f('second-look')] }, 'decision', { none: [f('revealed')] }),
      make('decision', 'consult', '请专科共同评估后安排处置', 2, times[2] + 6, fees.manage + fees.assess, `${finding} 会诊团队与你共同确认处置限制和交接事项。`, { care: true, stamina: -4, stability: 7, flags: [f('revealed'), f('treated'), f('pending'), f('consulted')] }, 'communication'),
      // Closing the hidden card costs the shift clock and the doctor's own reserves,
      // not another action point or another billed item.
      ...(hasHidden ? [make('decision', 'close-gap', closure.label, 0, times[1] + times[3], 0, `${closure.result}\n${checkFinding}`, { stamina: -4, san: -1, flags: [f('revealed'), f('second-look')] }, 'decision', { none: [f('revealed')] })] : []),
      ...traps.map((trap, index) => {
        const hurts = trap.hazard.some(h => h.type === 'R' && h.causal);
        return make('decision', `trap-${index + 1}`, trap.label, 0, 3, trap.hazard.some(h => h.type === 'F') ? fees.assess + 200 : 0,
          hurts ? `你采用了这一安排。你没有查清「${source.title}」涉及的风险，患者在后续观察中出现了需要补救的问题。` : '你把这项安排写进了处方、费用或沟通记录，还需要继续评估病情，向患者解释。',
          { stamina: -1, stability: hurts ? -8 : 0, damage: hurts ? Math.min(2, Math.max(1, source.severity - 1)) : 0, flags: [f('mismanaged'), f('pending'), ...(hurts ? [f('clinical-injury')] : [])], hazards: trap.hazard }, 'rescue');
      }),
    ] },
    { id: f('rescue'), title: `${source.title} · 再次评估`, text: `你需要再次核对患者的处置与记录，${investigation}，并${followup}。原来的处置经过仍有记录。`, options: [
      make('rescue', 'rescue', `重新评估并补救：${management}`, 2, times[2] + times[1], fees.manage + fees.assess, `${finding} 你与团队实施补救，安排持续监护和后续解释。已发生的问题仍记在病程中。`, { care: true, stamina: -6, san: -2, mitigate: clinicalRisk ? 1 : 0, stability: 5, flags: [f('revealed'), f('treated'), f('rescued')] }, 'communication'),
      make('rescue', 'transfer', '确认专科接收，带原始资料转接', 1, times[2] + 5, fees.assess + 150, '接收团队确认了床位，也了解了当前风险。你把处置经过和病情变化的时间告诉接班人，原始记录随患者一起转交。', { care: true, stamina: -3, stability: 3, flags: [f('transferred'), f('treated')] }, 'communication'),
      make('rescue', 'defer', '维持当前安排，留给下一班再评估', 0, 3, 0, '必要评估仍未落实，接班人从患者当前的变化开始处理。', { stability: -10, damage: 1, flags: [f('unresolved')] }, 'communication', { all: [f('clinical-injury')] }),
      make('rescue', 'defer-record', '维持当前安排，留给下一班再解释', 0, 3, 0, '你还没有向患者解释记录和费用中的问题，接班人需要继续核对。你的处置记录仍会接受复核。', { patience: -5, flags: [f('unresolved')] }, 'communication', { none: [f('clinical-injury')] }),
    ] },
    { id: f('communication'), title: `${source.title} · 患者的决定`, text: `处置计划需要患者理解。你需要${followup}。患者还关心费用、能否回家，以及谁负责接下来的照护。`, options: [
      make('communication', 'explain', '讲清当前风险、可选安排和费用，请患者复述', 1, times[3], 0, `患者复述了下一步安排。你记录了已说明的风险与本人决定：${followup}。`, { stamina: -2, patience: 10, flags: [f('informed')] }, 'handoff'),
      make('communication', 'refusal', '尊重拒绝，签具体拒绝记录并落实替代支持', 1, times[3] + 4, 0, '记录写明拒绝的是哪一项、已解释的风险和仍继续提供的照护。你把后续照护安排告诉了患者或获授权的人。', { stamina: -3, patience: 6, flags: [f('informed'), f('refused'), f('alternative-support')] }, 'handoff'),
      make('communication', 'promise', '答应没有风险，尽快结束谈话', 0, 2, 0, '患者记住了没有风险的承诺，尚未获得完整的风险说明与后续安排。', { patience: -8, flags: [f('uninformed')], hazards: [{ type: 'C', weight: 15, reason: '未按实际风险告知，承诺处置没有风险', norm: '说明应包括实际风险、替代选择与复诊条件。', causal: false }] }, 'handoff'),
    ] },
    { id: f('handoff'), title: `${source.title} · 交接`, text: `下一班需要知道哪些项目已经完成。你需要${followup}，说清下次复评的内容、时间，以及由谁负责。`, options: [
      make('handoff', 'complete', followup, 1, times[4], 0, '你交接了原始结果和本人决定，明确了由谁负责下次复评。接班人复述了尚未完成的事项。', { stamina: -2, care: true, flags: [f('handoff')] }, 'echo'),
      make('handoff', 'team', '请同事复核交班，自己补齐已发生的记录', 0, times[4] + 3, 0, '同事核对了接收事项，原始记录与补记时间分别保存。', { relations: { peer: -1 }, flags: [f('handoff'), f('team-handoff')] }, 'echo'),
      make('handoff', 'blank', '只写继续观察，不写复查与负责人', 0, 1, 0, '交班单没有回答何时复查、查什么、由谁核实结果。', { flags: [f('handoff-missing')], hazards: [{ type: 'D', weight: 10, reason: '交班缺少待办项目与复评责任人', norm: '交接须注明未完成项目、复评时点及责任人。', causal: false }] }, 'echo'),
    ] },
    { id: f('echo'), title: `${source.title} · 复评结果`, text: '接班人带回这次处置后的记录，患者也有了回应。你需要决定怎样处理后续事项。', options: [
      make('echo', 'closed', '核实改善情况，完成本次随访交接', 0, Math.max(2, echoMinutes), fees.review, `你核对了处置后的变化，确认接下来要${followup}。患者知道下一次该找谁。`, { care: true, patience: 6, emotion: 2, reputation: 1, stability: 4, flags: [f('resolved'), f('success')], clear: [f('pending')] }, PRESET_END, { all: [f('treated'), f('informed'), f('handoff')], none: [f('unresolved')] }),
      make('echo', 'repair', '逐项补上未完成的沟通、复查与交接', 1, Math.max(5, echoMinutes + 6), fees.review + 100, '你补齐了能够补救的项目，保留原记录和补记时间。此前的风险与已发生的损害仍需按事实处理。', { care: true, stamina: -4, patience: 4, mitigate: 1, flags: [f('resolved'), f('repaired')], clear: [f('pending'), f('unresolved')] }, PRESET_END),
      make('echo', 'ignore', '暂不处理回访，结束本次接诊', 0, 1, 0, '未完成事项留在了患者的记录里。后续审查仍能看到当时的处置、告知和交班。', { patience: -10, reputation: -1, flags: [f('resolved'), f('followup-neglected')], clear: [f('pending')] }, PRESET_END),
    ] },
  ];
  const rescue = scenes.find(s => s.id === f('rescue'))!;
  applyEntryEvidence(source.id,scenes[0].options[0]);
  addPresetProbes(scenes, source, finding, base);
  for (const scene of scenes) for (const o of scene.options) {
    const part = o.id.slice(base.length + 1);
    if (!o.mechanics) {
      const operation = part === 'entry:history' ? entryCopy.operation : part === 'investigate:verbal' || part === 'decision:close-gap' ? 'history'
        : part === 'investigate:targeted' || part === 'decision:second-look' ? investigationOperation(source.id)
        : part.startsWith('investigate:') || part === 'decision:second-look' ? 'exam'
        : part.includes('consult') ? 'consult'
        : part === 'rescue:transfer' ? 'treatment'
        : part === 'communication:explain' ? 'comfort' : part === 'communication:refusal' ? 'refusal-signature'
        : part.startsWith('handoff:') ? 'progress-record' : part === 'decision:tailored' || part === 'rescue:rescue' ? 'treatment' : 'other';
      o.mechanics = { operation, actor: 'patient', quality: o.effects.hazards?.length ? 'incorrect' : 'correct' };
    }
    if(part==='entry:history'&&o.check?.skill==='observe')o.mechanics.checkOperation='observe';
    // The additional six minutes in this authored branch are arrival waiting;
    // assessment and treatment retain the original management time (design 01).
    if(o.mechanics.operation==='consult') {
      o.mechanics.actor='peer';
      o.mechanics.consultWaitMinutes=part==='decision:consult'?6:0;
    }
    if(source.id==='C-158'&&part==='entry:history') {
      o.mechanics.operation='full-exam';
      o.result='经同意完成全身皮肤查体，双下肢与臀部可见对称紫癜样皮疹。尿液、凝血与腹部影像尚待完成，不能只凭皮疹结束评估。';
      o.effects.flags=[...o.effects.flags??[],f('full-exam-done'),f('key-fact-known')];
    }
    if(o.mechanics.operation==='full-exam')o.effects.stamina=-3;
    if (part === 'communication:explain') o.check = { skill: 'comfort', dc: 11, purpose: '确认患者理解当前安排并愿意继续配合',
      failureHint: '患者还没有理解安排，后续需要补充说明。', failure: { stamina: -2, patience: -4, flags: [f('communication-incomplete')] },
      failureText: '患者仍有顾虑，没有完整复述后续安排。此前的治疗仍然有效，你还需要把告知内容说明白。' };
  }
  rescue.options = rescue.options.filter(o =>
    o.id !== f('rescue:defer') || traps.some(t => t.hazard.some(h => h.type === 'R' && h.causal)))
    .filter(o => o.id !== f('rescue:defer-record') || traps.some(t => !t.hazard.some(h => h.type === 'R' && h.causal)));
  // The routine appointment costs one action in total. Reading, receiving a result,
  // consent and handing over remain separate decisions but share that appointment.
  // Extra consultation, repeated work and rescue retain their explicit AP costs.
  for (const scene of scenes) for (const o of scene.options) {
    if (['entry:history', 'investigate:targeted', 'investigate:verbal', 'communication:explain', 'communication:refusal', 'handoff:complete'].some(id => o.id === f(id))) o.ap = 0;
  }
  return { ...source, department, constraints: constraints(source), budget, baseCost: Math.round(budget * (source.dip.startsWith('住院') ? RULES.billing.inpatientBaseRate : RULES.billing.outpatientBaseRate)),
    performanceGood: performanceForBudget(budget, source.performanceGood),
    expectedDays: source.period === '门诊' && !source.dip.startsWith('住院') ? 1 : source.severity >= 3 ? 5 : source.severity === 2 ? 4 : 3,
    hiddenFact, hasHidden, hazards, scenes:scenes.map(scene=>projectInvestigationCopy(scene,source.id)), entry: f('entry'),
    safeRoute: ['entry:history', 'investigate:targeted', 'decision:tailored', 'communication:explain', 'handoff:complete', 'echo:closed'].map(f),
    echoFlags: { success: f('success'), pending: f('pending'), resolved: f('resolved') },
    riskClosure: {
      requires: [...(hasHidden ? [f('revealed')] : []), f('treated'), f('informed'), f('handoff')],
      pending: [
        ...(hasHidden ? [closure.pending] : []),
        `尚未按本次病情安排处置：${management}。`,
        '尚未向患者说明风险与可选安排，也没有记下本人的决定。',
        `尚未把复查项目、时点与负责人写进交接：${followup}。`,
      ],
    },
  };
}
export const CASE_PRESETS: CasePreset[] = (presetData as PresetSource[]).map(build);
export const PRESET_BY_ID = new Map(CASE_PRESETS.map(preset => [preset.id, preset]));
export const ENTITY_BY_ID = new Map(PATIENT_ENTITIES.map(entity => [entity.id, entity]));

export function instantiatePreset(preset: CasePreset, entity: PatientEntity, uid = entity.id, period?: PatientPeriod): InstantiatedPreset {
  if (!isCompatible(entity, preset, period)) throw new Error(`${entity.id} is not compatible with ${preset.id}`);
  const selectedPeriod = period ?? (entity.periods.includes(preset.period) ? preset.period : preset.constraints.periods.find(p => entity.periods.includes(p))!);
  const oldPrefix = `preset:${preset.id}`; const newPrefix = `${oldPrefix}:${uid}`;
  let steps = JSON.parse(JSON.stringify(preset.scenes).replaceAll(oldPrefix, newPrefix)) as Scene[];
  if (entity.ageYears < 12 || entity.flags.includes('被押送')) {
    steps.forEach(scene => { scene.options = scene.options.filter(option => !option.id.endsWith(':private')); });
  }
  if (entity.companion === '无') steps.forEach(scene => scene.options.forEach(option => {
    if (option.id.endsWith(':private')) { option.label = option.label.replace(/^请陪同者暂时回避，/, '单独'); option.ap = 0; }
  }));
  const demographic = `${entity.name}，${entity.age}${/岁|月|天|小时/.test(entity.age) ? '' : ' 岁'}，${entity.sex}。`;
  let situation = prose(preset.presentation, true).replace(/^(?:男|女)?\s*\d+(?:\.\d+)?\s*(?:岁|月|周|天|小时)(?:\s*(?:男|女))?[,，。]?\s*/, '').replace(/^(?:男|女)\s*\d+\s*岁[。]?/, '')
    .replace(/([；;。])\s*\d+\s*岁\s*[男女][，,]?/g, '$1').replace(/\d+\s*床(?=血|患者|病人)/g, '这位患者的');
  const context = entityScenario(entity);
  if (preset.id === 'C-164' && context.pregnancy?.state === 'pregnant' && context.pregnancy.value === 32) situation = situation.replace('孕 34 周', '孕 32 周');
  if (preset.id === 'C-170' && context.pregnancy?.state === 'postpartum' && context.pregnancy.value === 20) situation = situation.replace('产后 3 周', '产后 20 天');
  if (entity.ageYears < 18 && preset.constraints.scenario.ageVariants?.length) {
    if (preset.id === 'C-152' && entity.ageYears >= 6) situation = situation.replace('15 kg', entity.ageYears < 9 ? '24 kg' : '32 kg');
    const clinical = steps.find(scene => scene.id === `${newPrefix}:decision`)!;
    const treatment = clinical.options.find(option => option.id.endsWith(':tailored'))!;
    if (preset.id === 'C-047') treatment.label = '请儿科结合警示症状与既往资料，确定复核和治疗安排';
    treatment.result += '患者未成年，你已按年龄复核方案，没有照搬成人处方。后续决定还须核实监护人授权或急诊备案。';
  }
  steps[0].text = `${demographic}${situation}\n${entity.companion === '无' ? '患者独自就诊。' : `陪同：${entity.companion}。`}支付方式：${entity.payment}。\n${entity.dialogue}`;
  const title = prose(({ 'C-137': '抽搐之后还在嗜睡', 'C-154': '新生儿的绿色呕吐', 'C-156': '吐完还要吃的婴儿' } as Record<string, string>)[preset.id] ?? preset.title);
  steps.forEach(scene => { scene.title = scene.title.replace(preset.title, title); });
  steps = applyEntityMechanics(steps, entity, newPrefix);
  steps = steps.map(scene=>projectParticipantScene(scene,entity));
  steps = steps.map(scene=>projectPresetAgeBranches(scene,preset.id,entity.ageYears));
  return { id: preset.id, presetId: preset.id, entityId: entity.id, title, department: preset.department,
    performanceGood: preset.performanceGood,
    age: entity.ageYears, sex: entity.sex, complaint: situation, history: [entity.occupation, `陪同：${entity.companion}`, `支付：${entity.payment}`],
    findings: [preset.hasHidden ? '部分病史与检查信息尚未核实。' : '当前病史已提供，仍需完成分级评估。'],
    dipGroup: preset.dip.replace(/[¥￥].*$/, '').trim(), budget: preset.budget, baseCost: preset.baseCost,
    critical: preset.severity >= 3, steps, expectedDays: preset.expectedDays, period: selectedPeriod,
    companion: entity.companion, payment: entity.payment, portraitArchetype: entity.portraitArchetype,
  };
}
