import { CASES } from "./catalog";
import presenceA from '../patient-presence-a.json';
import presenceB from '../patient-presence-b.json';
import { RULES } from "./rules";
import { random, shuffled } from "./random";
import { STORIES, conditionMet } from "./stories";
import type { Card, Run, Option, Patient, HazardInput, Story } from "./types";

export const patientCase = (p: Patient) =>
  CASES.find((x) => x.id === p.caseId)!;
const familyNames = ['顾', '乔', '陆', '宋', '陶', '叶', '邵', '方', '白', '江', '孟', '程', '徐', '邱', '齐', '温'];
const givenNames = {
  男: ['知远', '明川', '文景', '亦舟', '怀安', '承礼', '启林', '修平', '景初', '若衡', '闻溪', '书成'],
  女: ['清禾', '知夏', '静宜', '若晴', '安宁', '书瑶', '映秋', '念慈', '佳音', '晓棠', '舒然', '云笙'],
};
function newPatientName(r: Run, caseId: string, uid: string, sex: string) {
  const base = [...presenceA, ...presenceB].find(p => p.caseId === caseId)?.name;
  if (base && !r.patients.some(p => p.caseId === caseId || p.name === base)) return base;
  const pool = familyNames.flatMap(last => givenNames[sex === '男' ? '男' : '女'].map(first => last + first));
  const start = Math.floor(random(r.seed, `${uid}:name`) * pool.length);
  return Array.from({ length: pool.length }, (_, i) => pool[(start + i) % pool.length])
    .find(name => !r.patients.some(p => p.name === name)) ?? pool[start];
}
export const awaitingBed = (r: Run, p: Patient) => p.active && !p.inpatient && !!r.facts[`awaiting-bed:${p.uid}`];
export function nextFreeBed(r: Run): number {
  const occupied = new Set(r.patients.filter(p => p.active && p.inpatient && p.damage < 3).map(p => p.bed));
  return Array.from({ length: RULES.ward.capacity }, (_, i) => RULES.ward.firstBed + i).find(bed => !occupied.has(bed)) ?? 0;
}
export function assignBed(r: Run, p: Patient) {
  p.bed = nextFreeBed(r);
  p.inpatient = p.bed > 0;
  if (p.inpatient) delete r.facts[`awaiting-bed:${p.uid}`];
  else r.facts[`awaiting-bed:${p.uid}`] = { day: r.day, source: 'ward-capacity', sequence: r.journal.length };
}
const option = (
  id: string,
  label: string,
  ap: number,
  result: string,
  effects: Option["effects"],
  minutes = ap * 12,
  cost = 0,
): Option => ({ id, label, ap, minutes, cost, result, effects });
const hazard = (
  type: HazardInput["type"],
  weight: number,
  reason: string,
  norm: string,
  causal = false,
): HazardInput => ({ type, weight, reason, norm, causal });

export function makeWardCard(r: Run, p: Patient): Card {
  const c = patientCase(p);
  const stay = r.day - p.admitted + 1;
  const over = stay > p.expectedDays;
  const prefix = `ward:${p.uid}:${r.day}`;
  const ready = p.stability >= RULES.ward.stabilityNeed;
  const choices: Option[] = [
    option(
      `${prefix}:review`,
      "床旁监测、复核并解释后续安排",
      1,
      "完成床旁监测，核对恢复情况，解释继续观察的依据并留下下一次评估时间。",
      {
        stability: RULES.ward.reviewStability,
        patience: RULES.ward.explanationGain,
        care: true,
        stamina: -3,
      },
      20,
      RULES.ward.reviewCost,
    ),
    option(
      `${prefix}:discharge`,
      ready ? "完成出院评估与随访交接" : "风险未排除，仍办理出院",
      ready ? 1 : 0,
      ready
        ? "出院条件逐项确认，警示症状与复诊时间交到家属手里。床位腾了出来。"
        : "你决定今天出院。家属录下了这次谈话，带走出院小结和你的解释。",
      ready
        ? {
            discharge: true,
            plannedDischarge: true,
            care: true,
            emotion: 3,
            reputation: 1,
          }
        : {
            discharge: true,
            flags: [`early-discharge:${p.uid}`, `family-record:${p.uid}`],
            emotion: -2,
            hazards: [
              hazard(
                "R",
                RULES.ward.earlyDischargeRisk,
                "危险因素未排除即决定提前出院",
                "出院须完成风险评估和后续处置交接",
                true,
              ),
            ],
          },
      12,
    ),
    option(
      `${prefix}:wait`,
      "维持医嘱，暂不床旁复核",
      0,
      "家属等到探视结束。原医嘱继续，新的问题留到了下一班。",
      { stability: RULES.ward.neglectStability, patience: -RULES.ward.patienceOverdue, flags: [`ward-deferred:${p.uid}`] },
      2,
    ),
  ];
  if (awaitingBed(r, p)) choices.splice(1, 1, option(
    `${prefix}:transfer`, '落实接收科室与转接交班', RULES.ward.transferAp,
    '确认接收团队，交接现有处置和风险后完成院内转接；原有记录与损害继续保留。',
    { discharge: true, plannedDischarge: true, care: true }, RULES.ward.transferMinutes, RULES.ward.transferCost,
  ));
  if (over)
    choices.push({
      ...option(
        `${prefix}:appeal`,
        "整理超期依据，申请预算例外",
        RULES.ward.appealAp,
        "审核接受了这次住院必要性说明，追加病组预算；继续住院仍需每日复核。",
        {
          bill: -Math.round(p.initialBudget * RULES.ward.appealGrantRate),
          care: true,
          patience: 8,
          stamina: -4,
          flags: [`appeal:${p.uid}:${r.day}`],
        },
        30,
      ),
      when: { none: [`appeal:${p.uid}:${r.day}`] },
      check: {
        skill: "record",
        dc: 12 + Math.floor(r.day / 3),
        purpose: "住院必要性材料能否通过预算审核",
        failureHint: "申请仍耗时耗力，但本次不追加预算；家属耐心下降。",
        failure: {
          stamina: -4,
          patience: -5,
          flags: [`appeal-denied:${p.uid}:${r.day}`],
        },
        failureText:
          "申请材料收到，但审核认为依据不足。本次未追加预算。家属问还要等多久。",
      },
    });
  return {
    id: prefix,
    kind: "ward",
    title: `${p.bed ? `${p.bed} 床` : '留观区'} · ${over ? "观察超期" : "床旁随访"}`,
    actor: "nurse",
    text: `${p.name} · ${c.title}。${awaitingBed(r, p) ? '病区满床，暂在留观区等待床位或院内转接。' : ''}接诊观察第 ${stay} 天，预计 ${p.expectedDays} 天。${ready ? "当前已达到出院评估条件。" : "风险尚未排除，仍需持续评估。"}${over ? "审核开始收紧额度，家属又来问费用。" : "现有治疗仍需逐日复核。"}${p.patience < 30 ? "家属要求留下完整谈话。" : ""}`,
    options: choices,
    scope: { kind: "patient", id: p.uid },
    patientId: p.uid,
    caseId: c.id,
  };
}

export function readmissionCard(r: Run, p: Patient): Card {
  const id = `return:${p.uid}`;
  return {
    id,
    kind: "audit",
    actor: "nurse",
    title: "出院之后的急诊",
    scope: { kind: "patient", id: p.uid },
    patientId: p.uid,
    caseId: p.caseId,
    text: `${p.name}出院后病情恶化，经急诊抢救${p.bed ? `安排至${p.bed}床` : '暂留观察区，等待病床或转接'}。家属把出院谈话录音发给医务科，另向受理窗口提交举报。「昨天不是说可以走了吗？」`,
    options: [
      option(
        `${id}:rescue`,
        "参与抢救，提交出院决策依据",
        2,
        "患者交给二线继续救治。你的原始评估与谈话记录送进卷宗，实际伤害仍需调查。",
        {
          stamina: -8,
          san: -5,
          emotion: -8,
          mitigate: 1,
          care: true,
          flags: [`return-rescued:${p.uid}`],
        },
        35,
        500,
      ),
      option(
        `${id}:explain`,
        "配合复核，不否认原有录音",
        1,
        "你承认当时作过出院决定，向家属说明调查流程。原件已经签收。",
        { emotion: -10, patience: 5, flags: [`return-cooperated:${p.uid}`] },
        20,
      ),
      option(
        `${id}:tamper`,
        "覆盖风险记录，改写出院依据",
        0,
        "覆盖操作留下日志。家属带走的出院小结与院内新记录出现差异。",
        {
          flags: [`tampered:${p.uid}`],
          hazards: [
            hazard(
              "D",
              40,
              "患者回院后覆盖原有风险评估记录",
              "补充说明须保留原始记录和修改痕迹",
              true,
            ),
          ],
        },
        5,
      ),
    ],
  };
}

const QUICK = [
  {
    title: "窗口外的第十二个号",
    text: "一名老人要求续方，说药名都在旧药盒上，药盒今天没带。",
    good: "核对旧处方与实际服药",
    fast: "按记忆抄一张处方",
    risk: "未核实实际用药即续开处方",
    norm: "续方须核对用药、剂量与当前病情",
  },
  {
    title: "走廊里的咨询",
    text: "家属拿着检查单找你，问题从一个变成了六个，门外还有人在排队。",
    good: "核对身份后逐项说明",
    fast: "一句“都没事”结束谈话",
    risk: "未经核实保证全部检查正常",
    norm: "解释结果须基于对应患者的完整资料",
  },
  {
    title: "没有签名的交班",
    text: "交班纸上留着一行空白。上一班已经在电梯里。",
    good: "电话核实并补交接记录",
    fast: "原样收下，不再核实",
    risk: "未核实未完成事项即接管医嘱",
    norm: "交班须明确未完成处置与风险",
  },
  {
    title: "医保窗口退回的单子",
    text: "窗口把审核单退回，治疗项目与病程记录不一致。",
    good: "核查真实项目，说明差异",
    fast: "把病程改成报销需要的样子",
    risk: "为匹配医保申报改写诊疗事实",
    norm: "费用申报应与实际诊療一致",
  },
  {
    title: "探视时间过了",
    text: "病房门口还站着一位家属。她今天请了半天假，想听一次完整的解释。",
    good: "约定时间并完成一次谈话",
    fast: "让她明天再来",
    risk: "重复推迟必要病情沟通",
    norm: "病情变化与处置计划应及时告知",
  },
  {
    title: "少一张确认单",
    text: "检查已经排上，系统中的知情同意页却没有签名。",
    good: "完成告知，核实后签署",
    fast: "让家属空白处先签名",
    risk: "使用未填写内容的空白知情同意",
    norm: "知情同意须在具体风险告知后取得",
  },
] as const;

export function makeQuickCard(r: Run, index: number): Card {
  const t = shuffled(QUICK, r.seed, `quick:${r.day}`)[index % QUICK.length];
  const id = `quick:${r.day}:${index}`;
  return {
    id,
    kind: "quick",
    title: t.title,
    text: t.text,
    actor: "nurse",
    scope: { kind: "personal", id },
    options: [
      option(
        `${id}:full`,
        t.good,
        1,
        "该核对的内容落在了纸上。你返回诊室，下一位已经等在门口。",
        {
          stamina: -3,
          reputation: 1,
          income: RULES.consultationPay,
          emotion: 2,
        },
        15,
      ),
      option(
        `${id}:short`,
        t.fast,
        0,
        "这一次只用了几分钟。家属带走的记录里留下了你的回答。",
        {
          income: RULES.consultationPay,
          hazards: [
            hazard(t.title.includes("医保") ? "F" : "C", 12, t.risk, t.norm),
          ],
        },
        3,
      ),
      option(
        `${id}:help`,
        "请同事一起处理",
        0,
        "同事接过材料，要求你下次还他一段时间。",
        { relations: { peer: -1 }, income: 80, flags: ["team-help-used"] },
        10,
      ),
    ],
  };
}

const NIGHT = [
  [
    "突然下降的血氧",
    "患者的呼吸比交班时费力。家属按着呼叫铃，护士要你到床旁。",
    "到床旁评估，启动急救与会诊",
    "只调整给氧，等下一次监测",
    "呼吸衰竭危险征象未得到评估",
    "病情突变须床旁评估并启动必要救治",
  ],
  [
    "再次响起的危急值",
    "检验科报来危急值，输液还在继续。值班电话同时亮起第二路来电。",
    "复述危急值，核实并处置",
    "先接另一通，稍后再回拨",
    "危急值接报后拖延处置",
    "危急值须核实、记录并启动处置",
  ],
  [
    "浸透的敷料",
    "术后患者的敷料渗血，血压下降。家属说刚才已经找过人。",
    "评估循环，联系手术组急处置",
    "换块敷料后继续观察",
    "循环不稳定时仅作局部处理",
    "术后活动性出血须评估并及时处置",
  ],
  [
    "走错的床边",
    "护士推着治疗车回来，说腕带与医嘱上的名字不一致。",
    "暂停操作，逐项核对身份",
    "照床号执行，天亮再查",
    "身份核对异常时仍执行治疗",
    "身份存在疑问时须暂停操作并复核",
  ],
] as const;
export function makeNightCard(r: Run, index: number, p: Patient): Card {
  const t = shuffled(NIGHT, r.seed, `night:${r.day}`)[index % NIGHT.length];
  const id = `night:${r.day}:${index}`;
  return {
    id,
    kind: "night",
    title: t[0],
    text: t[1],
    actor: "nurse",
    scope: { kind: "patient", id: p.uid },
    patientId: p.uid,
    caseId: p.caseId,
    options: [
      option(
        `${id}:full`,
        t[2],
        2,
        "你到床旁完成评估和处置，把后续监测交给接班人员。",
        {
          stamina: -8,
          san: -3,
          care: true,
          stability: 1,
          mitigate: 1,
          income: RULES.nightPay,
        },
        70,
        220,
      ),
      option(
        `${id}:call`,
        "请二线接管，自己协助并交班",
        1,
        "二线到场后接管救治。你留下协助，交接记录注明各自完成的处置。",
        {
          stamina: -5,
          relations: { peer: -1 },
          stability: 1,
          care: true,
          mitigate: 1,
          income: 60,
        },
        85,
        400,
      ),
      option(
        `${id}:delay`,
        t[3],
        0,
        "病情在等待中恶化，二线赶来接手。家属记下了两次呼叫的时间。",
        {
          damage: 2,
          san: -8,
          emotion: -5,
          hazards: [hazard("R", 35, t[4], t[5], true)],
        },
        20,
      ),
    ],
  };
}

export function storyCard(r: Run, story: Story): Card {
  let options = story.options
    .filter((o) => conditionMet(r.facts, o.when, r.cash, r.relations))
    .map((o) => structuredClone(o));
  // Social rolls change promises into actual outcomes only on success.
  if (story.id === "cash-2") {
    const aid = options.find((x) => x.id === "cash-2-b")!;
    aid.check = {
      skill: "persuade",
      dc: 13,
      failure: { stamina: -5, emotion: -7, flags: ["family-aid-pending"] },
      failureText:
        "缓缴材料收下，救助尚未获批。窗口要求补交证明，母亲在长椅上等你。",
    };
  }
  if (story.id === "record-3") {
    const talk = options.find((x) => x.id === "record-3-a")!;
    talk.check = {
      skill: "comfort",
      dc: 14,
      failure: {
        emotion: -8,
        flags: ["record-reviewed", "family-not-persuaded"],
      },
      failureText:
        "你完成逐句核对，家属仍不接受解释。她要求把谈话材料交医务科处理。",
    };
  }
  if (story.id === "shift-6") {
    const leave = options.find((x) => x.id === "shift-6-b")!;
    leave.check = {
      skill: "persuade",
      dc: 16,
      failure: {
        emotion: -10,
        relations: { family: -1 },
        flags: ["inquiry-postpone-denied", "shift-inquiry-attended"],
      },
      failureText: "改期申请未获批准。你留在核查室，母亲请了邻居帮忙。",
    };
  }
  let text =
    story.variants?.find((v) => conditionMet(r.facts, v.when))?.text ??
    story.text;
  if (story.id === "cash-7" && !r.debt && !r.privateDebt)
    text =
      "父亲问起这一周的花销。「别总是只说够用。」你的借贷账户目前没有欠款。";
  if (story.id === "cash-7" && !r.debt && !r.privateDebt)
    options = options.map((x) =>
      x.id === "cash-7-b"
        ? { ...x, result: "你说钱已经安排好了，没有展开讲来源。父亲点了点头。" }
        : x,
    );
  if (story.id === "record-3")
    text += r.facts["discharge-promise"]
      ? "录音里，你曾保证三天内出院。"
      : "录音里，你没有承诺固定出院日期。";
  return {
    ...story,
    options,
    text,
    kind: "story",
    scope: story.scope ?? { kind: "personal", id: story.chain },
  };
}

export function restCard(day: number): Card {
  const id = `rest:${day}`;
  return {
    id,
    kind: "rest",
    title: "灯还亮着",
    text: "病区交到了下一班手里。值班室门口，有外卖袋，也有你没回的电话。",
    scope: { kind: "personal", id: "self" },
    options: [
      option(
        `${id}:sleep`,
        "吃饭，放下手机睡觉",
        0,
        "你关掉通知，把手机扣在床头。",
        { san: 8, emotion: 8, flags: [`slept:${day}`] },
        0,
      ),
      option(
        `${id}:family`,
        "给家里打一通完整的电话",
        1,
        "电话打到电量提醒响起。这次没有在半句话里挂断。",
        {
          san: 5,
          emotion: 10,
          relations: { family: 1 },
          flags: ["family-boundary-talk"],
        },
        25,
      ),
      option(
        `${id}:care`,
        "付费休养，处理自己的不适",
        0,
        "值班医生做了评估，给你留了休息安排。",
        {
          cash: -600,
          san: 12,
          emotion: 12,
          flags: [`self-care:${day}`],
          clear: ["unused"],
        },
        0,
      ),
      option(
        `${id}:notes`,
        "核查当天记录，写补充说明",
        2,
        "你保留原记录，把今天仍能核实的事项补在后面。",
        { san: 3, emotion: -3, reputation: 2, flags: [`notes:${day}`] },
        25,
      ),
    ],
  };
}

export function createPatient(
  r: Run,
  caseId: string,
  suffix = "focus",
): Patient {
  const c = CASES.find((x) => x.id === caseId)!;
  const uid = `D${r.day}-${caseId}-${suffix}`;
  const inpatient = !c.dipGroup.includes("门诊") && c.id !== "C020" && !suffix.startsWith('night');
  const bed = inpatient ? nextFreeBed(r) : 0;
  const name = newPatientName(r, caseId, uid, c.sex);
  const p: Patient = {
    uid,
    caseId,
    name,
    bed,
    admitted: r.day,
    expectedDays:
      RULES.ward.expectedMin + Math.floor(random(r.seed, `${uid}:stay`) * (RULES.ward.expectedMax - RULES.ward.expectedMin + 1)),
    budget: c.budget,
    initialBudget: c.budget,
    spent: c.baseCost,
    charged: 0,
    stability: 0,
    patience: RULES.ward.initialPatience,
    damage: 0,
    mitigated: 0,
    active: true,
    inpatient: inpatient && bed > 0,
    caredDay: 0,
    explainedDay: 0,
    planned: false,
    settled: false,
  };
  if (inpatient && !bed) r.facts[`awaiting-bed:${uid}`] = { day: r.day, source: 'ward-capacity', sequence: r.journal.length };
  return p;
}

export function buildDay(r: Run): Card[] {
  const cards: Card[] = [];
  const initialRun = r.day === 1 && r.patients.length === 0;
  for (const p of r.patients.filter(p => awaitingBed(r, p) && p.damage < 3)) if (nextFreeBed(r)) assignBed(r, p);
  for (const p of r.patients.filter(
    (x) => x.readmitted && !r.facts[`seen:return:${x.uid}`],
  ))
    cards.push(readmissionCard(r, p));
  // More crowded wards create more work, not merely larger dice DCs.
  for (const p of r.patients.filter(
    (x) => x.active && (x.inpatient || awaitingBed(r, x)) && x.admitted < r.day,
  ))
    cards.push(makeWardCard(r, p));
  const order = shuffled(
    CASES.filter((x) => x.id !== "C020"),
    r.seed,
    "clinical-deck",
  );
  const selected =
    r.day === 14 && r.patients.some((x) => x.damage === 3)
      ? CASES.find((x) => x.id === "C020")!
      : order[(r.day - 1) % order.length];
  const patient = createPatient(r, selected.id);
  r.patients.push(patient);
  for (const [stepIndex, step] of selected.steps.entries()) {
    const card: Card = {
      ...structuredClone(step),
      id: `${patient.uid}:${step.id}`,
      kind: "clinical",
      scope: { kind: "patient", id: patient.uid },
      patientId: patient.uid,
      caseId: selected.id,
      options: step.options.map((o) => ({
        ...structuredClone(o),
        id: `${patient.uid}:${o.id}`,
      })),
      last: step.id === selected.steps.at(-1)!.id,
    };
    if (stepIndex === 0) for (const o of card.options.filter(o => o.ap > 0 && !o.effects.hazards?.length)) {
      o.check = { skill: selected.id === 'C020' ? 'record' : 'observe', dc: 10 + Math.floor(r.day / 3),
        purpose: selected.id === 'C020' ? '能否一次核清善后记录' : '能否一次核清病史与记录',
        failureHint: '仍会完成核查，但额外消耗 1 行动和 3 体力。',
        failure: { ...o.effects, ap: -1, stamina: (o.effects.stamina ?? 0) - 3 },
        failureText: `${o.result} 为核实这些信息，你又做了一轮补核，消耗额外一个行动。` };
    }
    cards.push(card);
  }
  const censusCases = order.filter(c => c.id !== selected.id && !c.dipGroup.includes('门诊'));
  const handovers = initialRun ? RULES.ward.initialCensus : RULES.ward.arrivals[r.day - 1];
  for (let i = 0; i < handovers; i++) {
    const c = censusCases[(r.day + i) % censusCases.length];
    const p = createPatient(r, c.id, initialRun ? `census${i}` : `handover${i}`);
    p.settled = true;
    p.stability = initialRun && i < RULES.ward.initialStableCount ? RULES.ward.stabilityNeed : RULES.ward.handoverStability;
    if (initialRun) p.admitted = r.day - RULES.ward.initialStay + 1;
    r.patients.push(p);
    const card = makeWardCard(r, p);
    card.text = `${initialRun ? '原班已完成急性期处置，交接持续观察与康复评估。' : '接收已完成初步处置的住院交接，后续观察由本班跟进。'}${card.text}`;
    cards.push(card);
  }
  if (awaitingBed(r, patient)) cards.push(makeWardCard(r, patient));
  const due = STORIES.filter(
    (s) =>
      s.day <= r.day &&
      !r.facts[`seen:${s.id}`] &&
      (!s.after || r.facts[`seen:${s.after}`]) &&
      !(
        s.chain === "research" &&
        r.facts["research-withdrawn"] &&
        !r.facts["paper-submitted-false"]
      ) &&
      conditionMet(r.facts, s.when, r.cash, r.relations),
  );
  // Old deadlines take precedence; independent equal-day scenes are seeded.
  const stories = shuffled(due, r.seed, `story:${r.day}`)
    .sort((a, b) => a.day - b.day)
    .slice(0, r.day < 4 ? 2 : 4);
  for (const story of stories) cards.push(storyCard(r, story));
  for (let i = 1; i < RULES.patientCount[r.day - 1]; i++)
    cards.push(makeQuickCard(r, i - 1));
  const night = RULES.nightDays.indexOf(r.day as never);
  if (night >= 0) {
    r.nightBudget = RULES.nightBudget[night];
    r.nightMinutes = r.nightBudget;
    for (let i = 0; i < RULES.nightCases[night]; i++) {
      // Each emergency has its own patient; unrelated routine patients do not inherit it.
      const emergency = createPatient(
        r,
        order[(r.day + i + 3) % order.length].id,
        `night${i}`,
      );
      emergency.bed = 0;
      emergency.inpatient = false;
      r.patients.push(emergency);
      const card = makeNightCard(r, i, emergency);
      for (const o of card.options.filter(o => !o.effects.hazards?.length)) o.check = {
        skill: 'clinical', dc: 11 + Math.floor(r.day / 3),
        purpose: '能否按计划完成急救与支援协调',
        failureHint: '仍会执行所选处置，但额外消耗 1 行动和 3 体力。',
        failure: { ...o.effects, ap: -1, stamina: (o.effects.stamina ?? 0) - 3 },
        failureText: `${o.result} 反复核对和追加支援占用了额外一个行动。` };
      cards.push(card);
    }
  } else {
    r.nightBudget = 0;
    r.nightMinutes = 0;
  }
  cards.push(restCard(r.day));
  return cards;
}
