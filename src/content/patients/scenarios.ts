import type { PatientEntity } from './types';

export type CompanionRole = 'family' | 'parent' | 'mother' | 'father' | 'grandparent' | 'grandmother' | 'grandfather' | 'child' | 'son' | 'daughter' | 'spouse' | 'colleague' | 'coach' | 'mother-partner';
export interface PresetScenario {
  patientPresent: true;
  accompaniment: 'any' | 'alone' | 'with-person';
  companions: CompanionRole[];
  onlyCompanion?: CompanionRole;
  pregnancy?: { state: 'pregnant'; weeks: number[] } | { state: 'postpartum'; days: number[] };
  context: string[];
  infantAge?: [number, number];
  ageVariants?: [number, number][];
}
const defaults = (): PresetScenario => ({ patientPresent: true, accompaniment: 'any', companions: [], context: [] });
const overrides: Record<number, Partial<PresetScenario>> = {};
function companion(role: CompanionRole, ids: number[]) { for (const id of ids) overrides[id] = { ...overrides[id], accompaniment: 'with-person', companions: [...overrides[id]?.companions ?? [], role] }; }
companion('family', [3, 19, 21, 35, 36, 45, 46, 49, 54, 61, 63, 64, 65, 67, 77, 80, 89, 91, 95, 98, 100, 102, 105, 114, 117, 123, 126, 130, 132, 138, 150, 184, 188, 190, 194, 196, 198, 201, 202, 203, 206, 207]);
companion('son', [4, 10, 17, 20]);
companion('daughter', [11, 90]);
companion('mother', [134, 137, 142, 146, 147, 148, 151, 157, 158, 159, 162]);
companion('father', [135, 143, 153]);
companion('grandmother', [133, 149, 155]);
companion('grandfather', [140]);
companion('grandparent', [144]);
companion('parent', [150, 154, 160]);
companion('spouse', [171, 176]);
companion('colleague', [56, 68, 111, 118, 181]);
companion('coach', [31]);
companion('mother', [161]); companion('mother-partner', [161]);
for (const id of [76, 120, 174]) overrides[id] = { ...overrides[id], accompaniment: 'alone', companions: [] };
for (const id of [177, 180, 182, 185]) overrides[id] = { ...overrides[id], accompaniment: 'with-person' };
overrides[135] = { ...overrides[135], onlyCompanion: 'father', context: ['parents-separated'] };
const contexts: Record<string, number[]> = {
  'long-term-bedridden': [16, 60, 123], 'nasogastric-feeding': [16], 'institutional-care': [79, 86],
  'university-student': [83], 'professional-driver': [101], 'sport-team': [31],
  'factory-work': [56, 178], 'farm-work': [179], 'active-employment': [111, 118, 119, 181, 193],
  'mother-blood-O-child-B': [134], 'mother-diabetes': [153],
};
for (const [context, ids] of Object.entries(contexts)) for (const id of ids) overrides[id] = { ...overrides[id], context: [...overrides[id]?.context ?? [], context] };
for (const [id, week] of [[22, 6], [162, 7], [163, 6], [164, 34], [165, 33], [167, 39], [168, 8], [169, 30], [171, 35], [173, 11], [175, 7], [176, 36]]) overrides[id] = { ...overrides[id], pregnancy: { state: 'pregnant', weeks: [week] } };
// Explicit variants retain the original week while allowing the two existing
// fixed-week entities to present the same independently specified dilemma.
overrides[164].pregnancy = { state: 'pregnant', weeks: [32, 34] };
overrides[170] = { ...overrides[170], pregnancy: { state: 'postpartum', days: [20, 21] } };
for (const [id, day] of [[166, 1 / 24], [172, .25], [174, 6]]) overrides[id] = { ...overrides[id], pregnancy: { state: 'postpartum', days: [day] } };
for (const id of [134, 145, 149, 153, 154]) overrides[id] = { ...overrides[id], infantAge: [0, 28 / 365] };
for (const id of [135, 136, 137, 155, 156, 161]) overrides[id] = { ...overrides[id], infantAge: [1 / 12, 1] };
overrides[156] = { ...overrides[156], infantAge: [1 / 12, .25] };
for (const id of [28, 47, 115]) overrides[id] = { ...overrides[id], ageVariants: [[6, 17.999]] };
overrides[152] = { ...overrides[152], ageVariants: [[6, 12.999]] };
export const PRESET_SCENARIOS: Record<string, PresetScenario> = Object.fromEntries(Array.from({ length: 208 }, (_, i) => [`C-${String(i + 1).padStart(3, '0')}`, { ...defaults(), ...overrides[i + 1] }]));

export function entityScenario(entity: PatientEntity) {
  const description = `${entity.occupation}；${entity.flagDescription}`;
  const companion = entity.companion.replace(/[（(]录音者[）)]/g, '');
  const roles = new Set<CompanionRole>();
  const add = (...values: CompanionRole[]) => values.forEach(role => roles.add(role));
  const alone = /^(无|本人(?:（录音者）)?)$/.test(entity.companion) || companion.includes('（电话）');
  if (!alone) {
    if (/父母|母亲|父亲/.test(companion)) {
      add('parent', 'family');
      if (!/母亲已故|父亲一人带|仅父亲/.test(description) && /父母|母亲/.test(companion)) add('mother');
      if (!/父亲已故|母亲一人带|仅母亲/.test(description) && /父母|父亲/.test(companion)) add('father');
    }
    if (/祖辈|祖父|祖母|外婆|外公/.test(companion)) {
      add('grandparent', 'family');
      if (/祖辈|祖父|外公/.test(companion) && (!/外婆|奶奶|祖母/.test(description) || /祖父|外公/.test(companion))) add('grandfather');
      if (/祖辈|祖母|外婆/.test(companion) && (!/外公|爷爷|祖父/.test(description) || /祖母|外婆/.test(companion))) add('grandmother');
    }
    if (/子女|儿子|女儿/.test(companion)) {
      add('child', 'family');
      if (/子女|儿子/.test(companion) && !/无子女|儿子失联|儿子拒绝/.test(description)) add('son');
      if (/子女|女儿/.test(companion) && !/无子女/.test(description)) add('daughter');
    }
    if (/配偶|丈夫|妻子/.test(companion)) add('spouse', 'family');
    if (/孙辈|家属/.test(companion)) add('family');
    if (/同事|工友/.test(companion)) add('colleague');
    if (/教练/.test(companion)) add('coach');
    if (/母亲.*男友/.test(companion)) add('mother', 'parent', 'family', 'mother-partner');
    if (companion === '多人' && /父母|家里|家庭|子女|同堂|家属/.test(description)) add('family');
  }
  const week = description.match(/孕\s*(\d+)\s*周/);
  const postpartum = description.match(/产后\s*(\d+(?:\.\d+)?)\s*(天|小时|周)/);
  const pregnancy = week ? { state: 'pregnant' as const, value: Number(week[1]) } : postpartum ? { state: 'postpartum' as const, value: Number(postpartum[1]) * (postpartum[2] === '小时' ? 1 / 24 : postpartum[2] === '周' ? 7 : 1) } : undefined;
  const context: string[] = [];
  const rules: [string, RegExp][] = [
    ['long-term-bedridden', /长期卧床|重度失能|下肢瘫|长期失能/], ['nasogastric-feeding', /鼻饲/], ['institutional-care', /养老院/],
    ['university-student', /大一|大二|大三|大四|大学生|研究生|留学生/], ['professional-driver', /司机/], ['sport-team', /体校|运动队/],
    ['factory-work', /厂|车间|流水线/], ['farm-work', /农民|农事|农业|收割|种菜|养殖/], ['active-employment', /工|员|司机|老板|经营|职员|技师|师傅/],
    ['parents-separated', /父母离异|夫妻分居/], ['mother-blood-O-child-B', /母亲 O 型.*[婴儿子女] B 型/], ['mother-diabetes', /母亲妊娠期糖尿病/],
  ];
  for (const [key, pattern] of rules) if (pattern.test(description)) context.push(key);
  if (/退休|失能|卧床|婴儿|幼儿/.test(entity.occupation)) { const i = context.indexOf('active-employment'); if (i >= 0) context.splice(i, 1); }
  const dedicated = [...description.matchAll(/专用预设：(C-\d{3})/g)].map(match => match[1]);
  return { present: !/本人未到|代取药|代诊/.test(description), alone, roles, pregnancy, context, dedicated };
}

export function scenarioCompatible(entity: PatientEntity, scenario: PresetScenario, presetId: string) {
  const actual = entityScenario(entity);
  if (!actual.present || actual.dedicated.length && !actual.dedicated.includes(presetId)) return false;
  if (scenario.accompaniment === 'alone' && !actual.alone || scenario.accompaniment === 'with-person' && actual.alone) return false;
  if (!scenario.companions.every(role => actual.roles.has(role))) return false;
  if (scenario.onlyCompanion && (scenario.onlyCompanion === 'father' ? !/^(父亲)(?:（.*）)?$/.test(entity.companion) : !actual.roles.has(scenario.onlyCompanion))) return false;
  if (scenario.infantAge && (entity.ageYears < scenario.infantAge[0] || entity.ageYears > scenario.infantAge[1])) return false;
  if (!scenario.context.every(context => actual.context.includes(context))) return false;
  if (scenario.pregnancy) {
    if (scenario.pregnancy.state === 'pregnant') {
      if (actual.pregnancy && (actual.pregnancy.state !== 'pregnant' || !scenario.pregnancy.weeks.includes(actual.pregnancy.value))) return false;
      if (!actual.pregnancy && (entity.flags.includes('哺乳期') || entity.flags.includes('孕晚期') || Math.min(...scenario.pregnancy.weeks) > 12)) return false;
    } else if (!actual.pregnancy || actual.pregnancy.state !== 'postpartum' || !scenario.pregnancy.days.includes(actual.pregnancy.value)) return false;
  }
  return true;
}
