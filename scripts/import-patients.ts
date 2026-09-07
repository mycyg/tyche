import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import type { PatientEntity, PresetSource, PatientCategory, PatientPeriod } from '../src/content/patients/types';
import { performanceForBudget } from '../src/game/performance';
import { CASES } from '../src/game/catalog';

if (!process.argv[2]) throw new Error('Usage: npx tsx scripts/import-patients.ts <design-directory>');
const design = resolve(process.argv[2]);
const output = resolve('src/content/patients');
const numbers = readFileSync(join(design, '01_核心机制与数值.md'), 'utf8');
const rate = (label: string) => {
  const match = numbers.match(new RegExp(`\\| ${label} \\| (\\d+)% \\|`));
  if (!match) throw new Error(`Missing design fee parameter: ${label}`);
  return Number(match[1]) / 100;
};
mkdirSync(output, { recursive: true });
const dailyRows = numbers.split('\n').filter(line => /^\| D\d+ \|/.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(row => row.length === 6 && /^\d+%$/.test(row[2]));
if (dailyRows.length !== 14) throw new Error('Expected 14 daily hidden-rate rows in design 01');
writeFileSync(join(output, 'tuning.json'), JSON.stringify({ inpatientBaseRate: rate('住院基础费用预算比例'), outpatientBaseRate: rate('门急诊基础费用预算比例'), departureAfterFailedComfortRate: rate('精神障碍史安抚失败后自行离院概率'), hiddenRates: dailyRows.map(row => parseFloat(row[2]) / 100), clinicalDc: dailyRows.map(row => Number(row[3])) }, null, 2) + '\n');
const rows = (file: string, prefix: string) => readFileSync(file, 'utf8').split('\n')
  .filter(line => new RegExp(`^\\| ${prefix}-\\d{3} \\|`).test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
const flagNames = ['认知障碍', '语言障碍', '关系户', '医保欠费', '独居', '多重用药', '孕晚期', '哺乳期', '被押送', '医护同行', '律师', '自媒体', '外来务工', '宗教约束', '精神障碍史', '无家属', 'VIP'];
const ageYears = (age: string) => {
  if (/天/.test(age)) return parseFloat(age) / 365;
  if (/小时/.test(age)) return parseFloat(age) / 8760;
  const year = age.match(/(\d+)\s*岁/); const month = age.match(/(\d+)\s*月/);
  return year || month ? Number(year?.[1] ?? 0) + Number(month?.[1] ?? 0) / 12 : Number(age);
};
const entities: PatientEntity[] = [];
for (const file of readdirSync(join(design, '11_患者实体库')).filter(x => /^0[1-9]_/.test(x)).sort()) {
  for (const r of rows(join(design, '11_患者实体库', file), 'P')) {
    if (r.length !== 14) throw new Error(`${file}: ${r[0]} has ${r.length} fields`);
    const years = ageYears(r[2]); const male = r[3] === '男';
    const [cats, periods] = r[12].split('；');
    entities.push({ id: r[0], name: r[1], age: r[2], ageYears: years, sex: r[3] as '男' | '女',
      occupation: r[4], companion: r[5], payment: r[6], personality: r[7],
      concealment: Number(r[8][0]), concealedFact: r[8].replace(/^\d[（(]?/, '').replace(/[）)]$/, ''),
      complaintTendency: Number(r[9]), adherence: r[10] as PatientEntity['adherence'], dialogue: r[11],
      categories: cats.split('／') as PatientCategory[], periods: periods.split('／') as PatientPeriod[],
      flags: flagNames.filter(flag => r[13].includes(flag)), flagDescription: r[13],
      portraitArchetype: years < 1 ? 'infant' : years < 18 ? (male ? 'child-boy' : 'child-girl') : years < 40 ? (male ? 'young-man' : 'young-woman') : years < 60 ? (male ? 'adult-man' : 'adult-woman') : male ? 'elder-man' : 'elder-woman',
      transferred: r[4].includes('他组转入'), source: `11_患者实体库/${file}`, original: Number(r[0].slice(2)) <= 222,
    });
  }
}
const presets: PresetSource[] = [];
for (const file of readdirSync(join(design, '12_病例预设库')).filter(x => /^(0[1-9]|10)_/.test(x)).sort()) {
  const fileText = readFileSync(join(design, '12_病例预设库', file), 'utf8');
  for (const r of rows(join(design, '12_病例预设库', file), 'C')) {
    if (r.length !== 13) throw new Error(`${file}: ${r[0]} has ${r.length} fields`);
    const periodVariants = ['门诊', '病区', '夜班'].filter(period => fileText.includes(`- ${r[0]}：${period}时段变体`));
    const explicitPay = r[12].match(/绩效\s*[¥￥]\s*([\d,]+)/)?.[1];
    const budget = Number(r[8].match(/[¥￥]\s*([\d,]+)/)?.[1].replaceAll(',', '') ?? 500);
    presets.push({ id: r[0], title: r[1], period: r[2] as PatientPeriod, presentation: r[3], hidden: r[4], traps: r[5], pathway: r[6], reference: r[7], dip: r[8], minutes: Number(r[9]), severity: Number(r[10]), compatibility: r[11], variants: [r[12], ...periodVariants.map(period => `${period}时段变体`)].join('；'), source: `12_病例预设库/${basename(file)}`, performanceGood: performanceForBudget(budget, explicitPay ? Number(explicitPay.replaceAll(',', '')) : undefined) });
  }
}
for (const [name, values, prefix] of [['entities', entities, 'P'], ['presets', presets, 'C']] as const) {
  const sorted = [...values].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(sorted.map(x => x.id)).size !== sorted.length) throw new Error(`${name}: duplicate IDs`);
  if (name === 'entities' && entities.filter(x => x.original).length !== 222) throw new Error('Original entities must remain 222');
  if (name === 'presets' && presets.length !== 208) throw new Error(`Expected 208 presets, got ${presets.length}`);
  sorted.forEach((row, i) => { if (row.id !== `${prefix}-${String(i + 1).padStart(3, '0')}`) throw new Error(`${name}: gap at ${row.id}`); });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `${name}.json`), JSON.stringify(sorted, null, 2) + '\n');
}
console.log(`Imported ${entities.length} entities (${entities.filter(x => x.original).length} original), ${presets.length} presets.`);

const { CASE_PRESETS, compatibleEntities } = await import('../src/content/patients/index');
const matrix = ['# 12 · 内容矩阵', '',
  '208 条预设使用独立的 C- 编号。完整病例 C001–C020 由各自分支图承载，不按编号替换本库条目。', '',
  '| ID | 科室 | 核心诊断或评估目标 | 场景 | 独特决策点 | 底牌类型 | 主要隐患 | 游戏内制度 | 完整病例关联 | 重合检查 | 审核状态 |',
  '|---|---|---|---|---|---|---|---|---|---|---|'];
const overlaps: Record<string, string> = {
  'C-027': '已经发生的抗凝出血；C-041处理未出血前的重复处方',
  'C-041': '防止重复抗凝；不复写C-027出血逆转',
  'C-051': '可疑药物性肝损伤；C-186是共同食物暴露的迟发监测',
  'C-055': '肝病相关意识变化；C-201处理住院急性谵妄',
  'C-107': '唯一以成人阑尾炎外科会诊为目标；C-158是皮疹鉴别',
  'C-108': '成人梗阻的绞窄评估；C-135是婴儿肠套叠',
  'C-109': '消化道穿孔急评；C-045是消化道出血',
  'C-110': '腹主动脉破裂危险；C-024是胸主动脉夹层',
  'C-130': '肠道血管缺血；C-108是机械性梗阻',
  'C-186': '食源暴露短暂缓解后的器官复查；非药物性肝损重复',
  'C-190': '饮酒中断后的监护；非一般谵妄或肝病意识障碍',
  'C-201': '住院急性谵妄诱因；C-055/C-190各有特定病因',
};
const cell = (text: string) => text.replaceAll('|', '／').replaceAll('\n', ' ').replace(/⚠待核[^；。]*/g, '').trim();
for (const p of CASE_PRESETS) {
  const n = Number(p.id.slice(2));
  const newRow = n >= 28 && n <= 66 || n >= 92 && n <= 131 || n >= 177;
  const option = p.scenes.find(s => s.id.endsWith(':decision'))!.options.find(o => o.id.endsWith(':tailored'))!;
  matrix.push(`| ${[p.id, p.department, p.hasHidden ? p.hiddenFact.split(/[。；]/)[0] : p.title, p.period, option.label, p.hasHidden ? '待核实病史／不典型线索' : '直白呈现／知情与资源决策', [...new Set(p.hazards.map(h => `${h.type}${h.weight}`))].join('、'), newRow ? p.reference : '本院相应病情评估、知情与交接制度', '独立预设', overlaps[p.id] ?? '主题、线索与决策组合独立', `已生成可达分支；${compatibleEntities(p).length}个严格兼容实体；整局试玩另验`].map(cell).join(' | ')} |`);
}
const stats = (values: (string | number)[]) => [...new Set(values)].map(key => `${key}：${values.filter(v => v === key).length}`).join('；');
matrix.push('', '## 覆盖统计', '',
  `- 原患者实体：222；新增兼容实体：${entities.length - 222}；全部原编号保留。`,
  '- 预设：208；原有97条和补充111条均有完整的接诊、核对、处置、告知、交接、复评及补救分支。',
  `- 场景：${stats(CASE_PRESETS.map(p => p.period))}。`,
  `- 严重度：${stats(CASE_PRESETS.map(p => p.severity))}。`,
  `- 底牌：${CASE_PRESETS.filter(p => p.hasHidden).length}；直白：${CASE_PRESETS.filter(p => !p.hasHidden).length}。`,
  `- 含隐患类型的预设数：${['R', 'C', 'D', 'F'].map(t => `${t}：${CASE_PRESETS.filter(p => p.hazards.some(h => h.type === t)).length}`).join('；')}。`,
  `- 预算范围：¥${Math.min(...CASE_PRESETS.map(p => p.budget))}–¥${Math.max(...CASE_PRESETS.map(p => p.budget))}；常规路径耗时：${Math.min(...CASE_PRESETS.map(p => p.minutes))}–${Math.max(...CASE_PRESETS.map(p => p.minutes))}分钟。`,
  '- 常规接诊总行动值为1；完整药物清单、翻译等实体需求按原规则额外计费。补问、会诊与补救增加行动及耗时。',
  '- 每条预设至少有一个满足年龄、性别、类别、时段、固定标记和情境约束的实体。陪同关系、孕周、产后天数与本人到场单独核对；年龄变体在《11_情境兼容与年龄变体》中明列。',
  '', '## 实体补充依据', '',
  '- P-223、P-224 为真正的新生儿，承接新生儿条目。既有最幼实体为2个月，不用于新生儿病例。',
  '- P-225 补青年呼吸科住院匹配；P-226 补中年呼吸科多重用药匹配；P-227 补中年孕晚期夜间匹配；P-228 补老年内分泌、认知障碍夜班匹配。',
  '- P-229–P-250 为具备明确陪同、照护、职业暴露或妊娠阶段的专用人物，来源单列于患者库 07，不替换原人物。',
  '- 预设呈现中的年龄和姓名是原示例资料；生成接诊时使用合法实体的真实人口学信息，不改变实体年龄。',
  '', '## 验收边界', '',
  '本矩阵可从预设与实体源文件重建。行数、严格兼容、图可达、源陷阱选项与行动／耗时核对由内容检查完成；运行时逐节点推进、存档、延迟事件和多周目结局仍由整局验证报告提供证据。');
matrix.push('', '## 病组绩效', '', '以下为非夜诊、处置得当的绩效金额。夜诊为 ¥100，处置一般为 ¥40；原预算映射规则与例外见设计 01。', '', '| 病例 | 原预算 | 处置得当绩效 |', '|---|---:|---:|');
for (const p of CASE_PRESETS) matrix.push(`| ${p.id} | ¥${p.budget} | ¥${p.performanceGood} |`);
for (const c of CASES) matrix.push(`| ${c.id}（完整病例） | ¥${c.budget} | ¥${performanceForBudget(c.budget)} |`);
writeFileSync(join(design, '12_病例预设库/00_内容矩阵.md'), matrix.join('\n') + '\n');
