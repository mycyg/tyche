import { CASES, DEBUFFS } from "./catalog";
import { assignBed, awaitingBed, buildDay, patientCase } from "./cards";
import { earlyEnding, tribunalEnding, auditScore } from "./endings";
import { die, random, shuffled } from "./random";
import { conditionMet } from "./stories";
import { RULES, VITAL_LABELS, RELATION_LABELS } from "./rules";
import { actionMinutes, personalLiability, skillModifier, treatmentCost } from "./costs";
export { skillModifier } from './costs';
import type {
  Action,
  Card,
  Effects,
  Feedback,
  Meta,
  Option,
  Run,
  Skill,
  Vital,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const has = (r: Run, id: string) =>
  r.talents.includes(id) || r.debuffs.includes(id);
export const currentCard = (r: Run) => r.queue[r.cursor];
/** Only the first unfinished scene for a patient can be visited. Night duty
 * opens after daytime encounters, and sleep never skips unfinished work. */
export function availableEncounters(r: Run): Card[] {
  if (r.phase !== "play") return [];
  const pending = r.queue.slice(r.cursor);
  const day = pending.filter(c => c.kind !== "night" && c.kind !== "rest");
  const pool = day.length ? day : pending.some(c => c.kind === "night")
    ? pending.filter(c => c.kind === "night") : pending;
  const visited = new Set<string>();
  return pool.filter(c => {
    const key = c.patientId ?? `${c.scope.kind}:${c.scope.id}:${c.actor ?? c.id}`;
    if (visited.has(key)) return false;
    visited.add(key);
    return true;
  });
}
export function newMeta(): Meta {
  return {
    schema: 1,
    xp: 0,
    runs: 0,
    rewarded: [],
    endings: [],
    cases: [],
    scenes: [],
    skills: {
      observe: 0,
      clinical: 0,
      record: 0,
      persuade: 0,
      comfort: 0,
      endure: 0,
    },
    caps: { stamina: 0, san: 0, emotion: 0 },
    cashRank: 0,
  };
}
export function startRun(
  seed: string,
  name: string,
  talents: string[],
  meta = newMeta(),
  difficulty: Run["difficulty"] = "rotation",
): Run {
  const caps = {
    stamina: 100 + meta.caps.stamina * 5,
    san: 100 + meta.caps.san * 5,
    emotion: 100 + meta.caps.emotion * 5,
  };
  if (talents.includes("T16")) caps.stamina += 20;
  if (talents.includes("T17")) caps.stamina -= 15;
  const r: Run = {
    schema: 1,
    id: `${seed}:${Date.now().toString(36)}`,
    seed: seed.slice(0, 48),
    name: name.trim().slice(0, 12) || "程医生",
    day: 1,
    difficulty,
    phase: "play",
    vitals: { ...caps },
    caps,
    relations: {
      chief: talents.includes("T14") ? 3 : 2,
      nurse: 2,
      peer: talents.includes("T14") ? 1 : 2,
      family: 2,
    },
    ap: RULES.ap - (talents.includes("T04") ? 1 : 0),
    borrowed: 0,
    overtime: 0,
    cash:
      RULES.cash -
      RULES.rent +
      meta.cashRank * RULES.meta.cashStep +
      (talents.includes("T24") ? 5000 : 0),
    debt: 0,
    privateDebt: 0,
    receivable: 0,
    income: 0,
    interest: 0,
    uncoveredDays: 0,
    reputation: talents.includes("T11") ? 40 : 50,
    depression: 10,
    talents: [...new Set(talents)].slice(0, 3),
    debuffs: [],
    skills: { ...meta.skills },
    coffee: 0,
    nap: false,
    exhausted: 0,
    emotionalBreaks: 0,
    skipNextDay: false,
    nightMinutes: 0,
    nightBudget: 0,
    patients: [],
    queue: [],
    cursor: 0,
    facts: {},
    journal: [],
    hazards: [],
    committed: [],
    offered: [],
    debuffPicks: 0,
    streak: 0,
  };
  r.queue = buildDay(r);
  return r;
}
function flag(r: Run, key: string, source: string) {
  if (!r.facts[key])
    r.facts[key] = { day: r.day, source, sequence: r.journal.length };
}
function capLoss(r: Run, amount: number) {
  for (const vital of Object.keys(r.caps) as Vital[]) {
    r.caps[vital] = Math.max(1, r.caps[vital] - amount);
    r.vitals[vital] = Math.min(r.vitals[vital], r.caps[vital]);
  }
}
function income(r: Run, amount: number) {
  r.income += amount;
  const pay = Math.min(r.debt, amount);
  r.debt -= pay;
  r.cash += amount - pay;
}
function spendAp(r: Run, ap: number): number {
  const over = Math.max(0, ap - r.ap);
  r.ap = Math.max(0, r.ap - ap);
  if (over) {
    r.overtime += over;
    capLoss(r, RULES.overtimeCapLoss * over);
    r.vitals.stamina -= RULES.overtimeStamina * over;
    if (has(r, "B15")) r.reputation -= over;
  }
  return over;
}
function addHazards(r: Run, effects: Effects, card: Card, option: Option) {
  for (const [index, h] of (effects.hazards ?? []).entries()) {
    let multiplier = 1;
    if (h.type === "D")
      multiplier *= (has(r, "T06") ? 0.7 : 1) * (has(r, "B08") ? 0.9 : 1);
    if (h.type === "R")
      multiplier *=
        (has(r, "T10") ? 0.85 : 1) *
        (has(r, "T26") ? 0.6 : 1) *
        (has(r, "B20") ? 0.8 : 1);
    if (h.type === "F" && has(r, "T26")) multiplier *= 1.6;
    if (h.type === "C" && has(r, "B14")) multiplier *= 1.2;
    r.hazards.push({
      ...h,
      weight: Math.max(1, Math.round(h.weight * multiplier)),
      id: `${option.id}:h${index}`,
      day: r.day,
      scope: card.scope,
      choiceId: option.id,
      choice: option.label,
    });
  }
}
function billPatient(r: Run, uid: string) {
  const p = r.patients.find((x) => x.uid === uid)!;
  const newCharge = Math.max(0, personalLiability(r, p.spent, p.budget) - p.charged);
  if (newCharge) {
    r.cash -= newCharge;
    p.charged += newCharge;
    r.vitals.emotion -= Math.min(20, Math.floor(newCharge / 1000) * 2);
  }
}
function applyEffects(r: Run, e: Effects, card: Card, option: Option) {
  for (const vital of ["stamina", "san", "emotion"] as Vital[]) {
    let amount = e[vital] ?? 0;
    if (
      amount > 0 &&
      vital !== "stamina" &&
      card.kind === "story" &&
      has(r, "T16")
    )
      amount = Math.floor(amount / 2);
    if (amount < 0 && vital === "emotion" && has(r, "B10"))
      amount = Math.floor(amount * 1.5);
    if (vital === "stamina" && card.kind === "night" && has(r, "T17"))
      amount = Math.ceil(amount * 0.7);
    r.vitals[vital] = clamp(r.vitals[vital] + amount, 0, r.caps[vital]);
    if (e.caps?.[vital]) {
      r.caps[vital] = Math.max(1, r.caps[vital] + e.caps[vital]!);
      r.vitals[vital] = Math.min(r.vitals[vital], r.caps[vital]);
    }
  }
  r.cash += e.cash ?? 0;
  r.debt = Math.max(0, r.debt + (e.debt ?? 0));
  r.privateDebt = Math.max(0, r.privateDebt + (e.privateDebt ?? 0));
  r.receivable = Math.max(0, r.receivable + (e.receivable ?? 0));
  if (e.income) income(r, e.income);
  r.reputation = clamp(r.reputation + (e.reputation ?? 0), 0, 100);
  r.depression = clamp(r.depression + (e.depression ?? 0), 0, 100);
  if (e.ap) {
    if (e.ap < 0) spendAp(r, -e.ap);
    else r.ap += e.ap;
  }
  for (const relation of Object.keys(r.relations) as (keyof Run["relations"])[])
    r.relations[relation] = clamp(
      r.relations[relation] + (e.relations?.[relation] ?? 0),
      0,
      5,
    );
  for (const key of e.flags ?? []) flag(r, key, option.id);
  for (const key of e.clear ?? []) delete r.facts[key];
  if (e.flags?.includes("li-half-repaid")) {
    const returned = Math.ceil(r.receivable / 2);
    r.receivable -= returned;
    r.cash += returned;
  }
  if (e.flags?.includes("family-boundary-talk"))
    r.debuffs = r.debuffs.filter((x) => x !== "B09");
  if (e.flags?.includes(`self-care:${r.day}`))
    r.debuffs = r.debuffs.filter((x) => !["B01", "B03", "B21"].includes(x));
  const p = r.patients.find((x) => x.uid === card.patientId);
  if (p) {
    p.spent = Math.max(
      0,
      p.spent + treatmentCost(r, option),
    );
    if (e.bill && e.bill < 0) {
      p.budget += -e.bill;
      const revisedCharge = personalLiability(r, p.spent, p.budget);
      const refund = Math.max(0, p.charged - revisedCharge);
      r.cash += refund;
      p.charged -= refund;
    }
    // Damage is an ordinal severity, not hit points. Two serious nonfatal
    // incidents do not imply a death that the story never established.
    if (e.damage) p.damage = Math.max(p.damage, Math.min(3, e.damage));
    if (e.mitigate) {
      p.mitigated += e.mitigate;
    }
    p.stability = clamp(p.stability + (e.stability ?? 0), 0, 3);
    p.patience = clamp(p.patience + (e.patience ?? 0), 0, 100);
    if (e.care) p.caredDay = r.day;
    if ((e.patience ?? 0) > 0) p.explainedDay = r.day;
    if (e.discharge) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      p.dischargedDay = r.day;
      p.planned = !!e.plannedDischarge;
      if (card.kind === 'clinical') flag(r, `clinical-departure:${p.uid}`, option.id);
    }
    if (p.damage >= 3) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
    }
    billPatient(r, p.uid);
  }
  addHazards(r, e, card, option);
}
function deltas(before: Run, after: Run): string[] {
  const parts: string[] = [];
  for (const key of Object.keys(VITAL_LABELS) as Vital[]) {
    const n = after.vitals[key] - before.vitals[key];
    if (n) parts.push(`${VITAL_LABELS[key]} ${n > 0 ? "+" : ""}${n}`);
    const cap = after.caps[key] - before.caps[key];
    if (cap) parts.push(`${VITAL_LABELS[key]}上限 ${cap > 0 ? "+" : ""}${cap}`);
  }
  if (after.cash !== before.cash)
    parts.push(
      `余额 ${after.cash - before.cash > 0 ? "+" : "−"}¥${Math.abs(after.cash - before.cash).toLocaleString("zh-CN")}`,
    );
  if (after.debt !== before.debt)
    parts.push(
      `借贷 ${after.debt - before.debt > 0 ? "+" : "−"}¥${Math.abs(after.debt - before.debt).toLocaleString("zh-CN")}`,
    );
  for (const k of Object.keys(RELATION_LABELS) as (keyof Run["relations"])[]) {
    const n = after.relations[k] - before.relations[k];
    if (n) parts.push(`${RELATION_LABELS[k]} ${n > 0 ? "+" : ""}${n}`);
  }
  if (after.ap !== before.ap) parts.push(`行动值 ${after.ap - before.ap}`);
  for (const p of after.patients) {
    const prior = before.patients.find(x => x.uid === p.uid);
    if (prior && p.spent > prior.spent) parts.push(`诊疗记账 +¥${(p.spent - prior.spent).toLocaleString("zh-CN")}`);
    if (prior && p.charged > prior.charged) parts.push(`超支自付 ¥${(p.charged - prior.charged).toLocaleString("zh-CN")}（已计入余额变动）`);
  }
  return parts;
}
function stop(r: Run, kind: Parameters<typeof earlyEnding>[1]) {
  r.ending = earlyEnding(r, kind);
  r.phase = "ending";
}
function interrupt(r: Run) {
  for (const vital of ["san", "stamina", "emotion"] as Vital[]) {
    if (r.vitals[vital] > 0) continue;
    if (has(r, "T23") && !r.facts["survival-used"]) {
      flag(r, "survival-used", "T23");
      r.caps[vital] = Math.max(1, r.caps[vital] - 30);
      r.vitals[vital] = Math.max(1, Math.floor(r.caps[vital] / 2));
      r.vitals.san = Math.max(1, r.vitals.san - 10);
      r.depression = Math.min(100, r.depression + 10);
      continue;
    }
    if (vital === "san") {
      stop(r, "san");
      return;
    }
    if (vital === "stamina") {
      r.exhausted++;
      if (r.exhausted >= 2) {
        stop(r, "stamina");
        return;
      }
      r.pendingResume = r.phase === "roll" ? "roll" : "feedback";
      r.phase = "collapse";
      return;
    }
    r.emotionalBreaks++;
    if (r.emotionalBreaks >= 2) {
      stop(r, "emotion");
      return;
    }
    r.vitals.emotion = Math.min(40, r.caps.emotion);
    r.reputation = Math.max(0, r.reputation - 15);
    r.skipNextDay = true;
    flag(r, "emotional-leave", "emotion-zero");
    if (r.feedback)
      r.feedback.text +=
        "你无法继续这次谈话。科室安排次日停止临床工作，由同事接班。";
  }
  if (r.debt > RULES.debtMax) {
    stop(r, "debt");
    return;
  }
  if (r.cash < 0) {
    r.pendingResume = r.phase === "roll" ? "roll" : "feedback";
    r.phase = "funding";
  }
}
function commitChoice(r: Run, option: Option, card: Card, before: Run) {
  r.committed.push(option.id);
  spendAp(r, option.ap);
  const minutes = actionMinutes(r, option, card);
  if (card.kind === "night") {
    r.nightMinutes -= minutes;
    if (has(r, "B06")) r.vitals.san -= 3;
    if (r.nightMinutes < 0) {
      r.vitals.stamina -= 5;
      r.vitals.san -= 3;
      flag(r, `night-overrun:${r.day}`, option.id);
    }
  }
  if (card.kind === "clinical" && has(r, "B02")) r.vitals.stamina--;
  let effects = option.effects,
    result = option.result,
    showRoll = !!option.check;
  if (option.check) {
    const modifier = skillModifier(r, option.check.skill);
    const first = die(r.seed, `check:${option.id}`);
    const second =
      option.check.skill === "comfort" && has(r, "B11")
        ? die(r.seed, `check:${option.id}:disadvantage`)
        : undefined;
    const face = second === undefined ? first : Math.min(first, second),
      dc = option.check.dc + (r.difficulty === "attending" ? 2 : 0);
    const success = face === 20 || (face !== 1 && face + modifier >= dc);
    r.roll = {
      id: option.id,
      kind: "choice",
      face,
      second,
      modifier,
      dc,
      success,
      label: card.title,
    };
    if (!success) {
      effects = {
        ...option.check.failure,
        cash: (option.effects.cash ?? 0) + (option.check.failure.cash ?? 0),
      };
      result = option.check.failureText;
    }
    if (face === 20) {
      r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 5);
      result += card.kind === 'clinical' || card.kind === 'night' ? '这次复核一次通过。' : '对方答应保留一个后续联络窗口。';
    }
    if (face === 1) {
      r.vitals.emotion -= 5;
      result += card.kind === 'clinical' || card.kind === 'night' ? '补核结束时，你已经错过了休息时间。' : '这次沟通中断。你需要带着未解决的事继续工作。';
    }
  }
  applyEffects(r, effects, card, option);
  if (
    card.kind === "clinical" &&
    has(r, "B23") &&
    random(r.seed, `late-note:${option.id}`) < 0.2
  )
    addHazards(
      r,
      {
        hazards: [
          {
            type: "D",
            weight: 10,
            reason: "病程记录延迟提交",
            norm: "病程记录须保留准确处置与补记时间",
            causal: false,
          },
        ],
      },
      card,
      { ...option, id: `${option.id}:late` },
    );
  if (card.last || card.kind === "night") {
    const p = r.patients.find((x) => x.uid === card.patientId)!;
    const risks = r.hazards
      .filter(
        (h) =>
          h.scope.kind === "patient" &&
          h.scope.id === p.uid &&
          h.type === "R" &&
          h.causal,
      )
      .reduce((n, h) => n + h.weight, 0);
    if (card.last && risks >= 15 && p.damage < 2 && p.caseId !== "C020") {
      const face = die(r.seed, `course:${p.uid}`),
        dc = clamp(4 + Math.floor(risks / 6) - p.mitigated * 3, 2, 19);
      const success = face === 20 || (face !== 1 && face >= dc);
      r.roll = {
        id: `course:${p.uid}`,
        kind: "choice",
        label: "交班之后 · 病情转归",
        face,
        dc,
        modifier: 0,
        success,
      };
      showRoll = true;
      if (!success) {
        p.damage = face === 1 && risks >= 60 ? 3 : 2;
        result +=
          p.damage === 3
            ? "交班后病情恶化，经抢救无效死亡。前面的处置记录进入调查。"
            : "交班后病情恶化，发生严重临床损害，二线接管救治。前面的处置记录进入复核。";
      } else
        result +=
          "截至本次交班，没有出现新的严重临床损害；已经留下的处置隐患仍在记录中。";
    }
    p.settled = true;
    if (p.damage === 0 && p.caseId !== "C020") {
      p.stability = Math.max(1, p.stability);
      r.vitals.san = Math.min(r.caps.san, r.vitals.san + 3);
      if (!has(r, "B12"))
        r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 5);
      if (card.kind === "clinical") income(r, RULES.goodCasePay);
    }
    if (p.damage === 3) {
      p.active = false;
      p.bed = 0;
      delete r.facts[`awaiting-bed:${p.uid}`];
      if ((before.patients.find(x => x.uid === p.uid)?.damage ?? 0) < 3)
        r.vitals.san -= has(r, "B12") ? 5 : 15;
    }
    if (!p.inpatient && !awaitingBed(r, p)) p.active = false;
  }
  flag(r, `seen:${card.id}`, option.id);
  r.journal.push({
    id: option.id,
    day: r.day,
    title: card.title,
    choice: option.label,
    result,
    scope: card.scope,
    flags: effects.flags ?? [],
  });
  r.feedback = {
    title: card.title,
    text: result,
    changes: deltas(before, r),
    next: card.kind === "rest" ? "check" : "play",
  };
  r.cursor++;
  // A departed patient has no remaining bedside visit in this ward. Preserve
  // the completed card and all clinical/audit records; remove only future rounds.
  r.queue = r.queue.filter((pending, index) => {
    if (index < r.cursor) return true;
    const patient = r.patients.find(p => p.uid === pending.patientId);
    if (patient?.damage === 3 && ['clinical', 'night', 'ward'].includes(pending.kind)) return false;
    return pending.kind !== 'ward' || !!patient?.active;
  });
  r.phase = showRoll ? "roll" : "feedback";
  interrupt(r);
}
function endDay(r: Run) {
  const pressure = RULES.pressure[r.day - 1];
  r.vitals.san -= pressure;
  r.vitals.emotion -= Math.ceil(pressure / 2);
  r.cash -= RULES.living;
  if (has(r, "T19")) {
    r.cash -= 60;
    r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 2);
  }
  if (has(r, "T10")) r.vitals.emotion -= 3;
  if (has(r, "B09")) r.vitals.emotion -= 5;
  if (r.vitals.emotion < 30) r.depression += 8;
  else if (r.vitals.emotion > 60) r.depression -= 2;
  if (has(r, "B12")) r.depression += 2;
  if (RULES.nightDays.includes(r.day as never)) r.depression += 3;
  r.depression = clamp(r.depression, 0, 100);
  if (r.depression >= 50 && !r.facts["depression-cap"]) {
    capLoss(r, 5);
    flag(r, "depression-cap", "day-end");
  }
  for (const p of r.patients.filter((x) => x.active && (x.inpatient || awaitingBed(r, x)))) {
    const overdue = r.day - p.admitted + 1 > p.expectedDays;
    p.spent += Math.round(
      (p.inpatient ? RULES.ward.dailyCost : RULES.ward.observationDailyCost) * (overdue ? RULES.ward.overdueMultiplier : 1),
    );
    p.patience = Math.max(
      0,
      p.patience -
        RULES.ward.patienceDaily -
        (overdue && p.explainedDay !== r.day ? RULES.ward.patienceOverdue : 0),
    );
    if (overdue && !r.facts[`budget-cut:${p.uid}`]) {
      p.budget = Math.round(p.budget * (1 - RULES.ward.extensionRate));
      flag(r, `budget-cut:${p.uid}`, "insurance-overstay");
    }
    if (
      p.patience <= RULES.ward.lowPatience &&
      !r.facts[`complaint:${p.uid}`]
    ) {
      flag(r, `complaint:${p.uid}`, "family-overstay");
      r.vitals.emotion -= 8;
      r.reputation -= 3;
      r.journal.push({
        id: `complaint:${p.uid}`,
        day: r.day,
        title: "住院期间的投诉",
        choice: "长期住院，家属提交费用与沟通记录",
        result:
          "家属保存了缴费单，向医务科要求说明住院依据。投诉本身不等于处置过错。",
        scope: { kind: "patient", id: p.uid },
        flags: [],
      });
    }
    billPatient(r, p.uid);
  }
  if (RULES.wageDays.includes(r.day as never)) income(r, RULES.wages);
  r.interest = Math.ceil(
    r.debt *
      (RULES.debtRate +
        (has(r, "T24") ? 0.01 : 0) +
        (has(r, "B17") ? 0.01 : 0)),
  );
  r.debt += r.interest;
  r.uncoveredDays = r.interest > r.income ? r.uncoveredDays + 1 : 0;
  if (r.uncoveredDays >= RULES.debtGrace) {
    stop(r, "interest");
    return;
  }
  const face = die(r.seed, `day:${r.day}`),
    modifier = skillModifier(r, "endure"),
    dc = RULES.dc[r.day - 1] + (r.difficulty === "attending" ? 2 : 0);
  const success = face === 20 || (face !== 1 && face + modifier >= dc);
  r.roll = {
    id: `day:${r.day}`,
    kind: "day",
    face,
    modifier,
    dc,
    success,
    label: "日终 · 扛住这一夜",
  };
  r.phase = "roll";
  interrupt(r);
}
function returns(r: Run) {
  for (const p of r.patients.filter(
    (x) =>
      !x.active && x.damage < 3 && !x.planned && x.dischargedDay !== undefined && !x.readmitted,
  )) {
    if (r.day <= p.dischargedDay!) continue;
    if (random(r.seed, `return:${p.uid}`) < RULES.ward.earlyReturnChance) {
      p.readmitted = true;
      p.active = true;
      p.bed = 0;
      p.inpatient = false;
      assignBed(r, p);
      p.settled = true;
      p.damage = Math.max(2, p.damage);
      p.stability = 0;
      p.patience = 5;
      flag(r, `readmitted:${p.uid}`, `early-discharge:${p.uid}`);
      r.journal.push({
        id: `return-outcome:${p.uid}`,
        day: r.day,
        title: "出院后病情恶化",
        choice: "家属携录音与出院小结回院",
        result:
          "患者出现严重临床损害。抢救、原有出院决定与损害之间的关系进入调查。",
        scope: { kind: "patient", id: p.uid },
        flags: [`readmitted:${p.uid}`],
      });
    } else flag(r, `return-not-observed:${p.uid}`, "followup");
    // A fixed per-patient result is resolved once, never retried each day.
    p.planned = true;
  }
}
function nextDay(r: Run) {
  r.day++;
  returns(r);
  if (r.day > RULES.days) {
    r.phase = "tribunal";
    return;
  }
  const lost = r.borrowed;
  r.borrowed = 0;
  r.overtime = 0;
  r.ap = Math.max(
    0,
    RULES.ap -
      lost -
      (has(r, "T04") ? 1 : 0) -
      (has(r, "B03") ? 1 : 0) -
      (r.depression >= 50 ? 1 : 0) -
      (RULES.nightDays.includes((r.day - 1) as never) && !has(r, "T17")
        ? 2
        : 0),
  );
  r.vitals.stamina = Math.max(
    1,
    Math.floor(r.caps.stamina * (has(r, "B01") ? 0.7 : 1)) -
      (RULES.nightDays.includes((r.day - 1) as never) ? 30 : 0),
  );
  r.vitals.stamina = Math.max(1, r.vitals.stamina);
  r.vitals.san = Math.min(
    r.caps.san,
    r.vitals.san + 5 + (r.relations.family >= 3 ? 2 : 0),
  );
  r.debuffs = r.debuffs.filter(
    (id) =>
      !(
        (id === "B01" && r.vitals.emotion >= 60) ||
        (["B05", "B06"].includes(id) && r.vitals.san >= 70) ||
        (id === "B07" && r.facts[`slept:${r.day - 1}`]) ||
        (id === "B13" && r.relations.chief >= 4) ||
        (id === "B14" && r.reputation >= 70) ||
        (id === "B15" && r.relations.nurse >= 4) ||
        (id === "B16" && r.relations.peer >= 3) ||
        (id === "B17" && r.debt === 0) ||
        (id === "B04" && r.coffee === 0)
      ),
  );
  r.coffee = 0;
  r.nap = false;
  r.income = 0;
  r.interest = 0;
  r.cursor = 0;
  if (r.skipNextDay) {
    r.skipNextDay = false;
    r.relations.peer = Math.max(0, r.relations.peer - 1);
    r.ap = 0;
    flag(r, `leave:${r.day}`, "emotional-leave");
    for (const p of r.patients.filter((p) => p.active)) p.caredDay = r.day;
    r.queue = [
      {
        id: `leave:${r.day}`,
        title: "今天由别人接班",
        kind: "rest",
        scope: { kind: "personal", id: "self" },
        text: "科室没有安排你上临床班。同事接管病人，你留在宿舍等待复评。",
        options: [
          {
            id: `leave:${r.day}:rest`,
            label: "接受休息与复评安排",
            ap: 0,
            minutes: 0,
            cost: 0,
            result: "你放下手机。病区的电话打给了另一位医生。",
            effects: { san: 15, emotion: 10 },
          },
        ],
      },
    ];
  } else r.queue = buildDay(r);
  r.phase = "play";
}
export function availableOptions(r: Run): Option[] {
  const card = currentCard(r);
  if (!card) return [];
  const patient = r.patients.find(p => p.uid === card.patientId);
  if (patient?.damage === 3 && ['clinical', 'night', 'ward'].includes(card.kind)) return [{
    id: `${card.id}:death-handoff`, label: '核实死亡记录并交接善后事项', ap: 0, cost: 0, minutes: 0,
    result: '核实已有死亡记录，停止床旁治疗安排，向下一班交接善后事项。', effects: {},
  }];
  return shuffled(
    card.options.map(o => {
      if (card.kind === 'clinical' && ['C006-s4-b', 'C008-s4-c', 'C013-s3-c', 'C014-s3-c', 'C016-s3-c'].some(id => o.id.endsWith(id)))
        o = { ...o, effects: { ...o.effects, discharge: true } };
      // Older local saves attached an information check to zero-action skips.
      // Normalize only an uncommitted option; past records and dice stay intact.
      if (card.kind === "clinical" && o.ap === 0 && o.check &&
          ["observe", "record"].includes(o.check.skill)) {
        const { check: _check, ...choice } = o;
        return choice;
      }
      return o;
    }).filter((o) =>
      conditionMet(r.facts, o.when, r.cash, r.relations),
    ),
    r.seed,
    `choices:${card.id}`,
  );
}
export function act(input: Run, action: Action): Run {
  if (input.phase === "ending") return input;
  if (action.type === "focus") {
    if (!availableEncounters(input).some(c => c.id === action.id)) return input;
    const index = input.queue.findIndex(c => c.id === action.id);
    if (index === input.cursor) return input;
    const next = structuredClone(input);
    const [card] = next.queue.splice(index, 1);
    next.queue.splice(next.cursor, 0, card);
    return next;
  }
  const r = structuredClone(input);
  if (action.type === "choose") {
    if (r.phase !== "play" || r.committed.includes(action.id)) return input;
    const card = currentCard(r),
      option = availableOptions(r).find((x) => x.id === action.id);
    if (!option || !card) return input;
    commitChoice(r, option, card, input);
  } else if (action.type === "continue") {
    if (r.phase !== "feedback") return input;
    if (r.feedback?.next === "check") endDay(r);
    else if (r.feedback?.next === "day") nextDay(r);
    else {
      r.phase = "play";
      if (r.cursor >= r.queue.length) endDay(r);
    }
  } else if (action.type === "ack-roll") {
    if (r.phase !== "roll" || !r.roll) return input;
    if (r.roll.kind === "tribunal") r.phase = "ending";
    else if (r.roll.kind === "choice") r.phase = "feedback";
    else {
      r.streak = r.roll.success ? r.streak + 1 : 0;
      if (r.streak >= 3)
        r.vitals.emotion = Math.min(r.caps.emotion, r.vitals.emotion + 5);
      if (r.roll.face === 20) {
        const removable = r.debuffs.filter(
          (id) => !DEBUFFS.find((d) => d.id === id)?.permanent,
        );
        const removed = shuffled(removable, r.seed, `cure:${r.day}`)[0];
        if (removed) r.debuffs = r.debuffs.filter((x) => x !== removed);
      }
      if (r.roll.success) {
        r.phase = "feedback";
        r.feedback = {
          title: "这一夜过去了",
          text:
            r.roll.face === 20
              ? "天亮之前，你睡了一段没有被电话打断的觉。一个可恢复的不适消退。"
              : "你合上登记本。明天仍然在排班表上。",
          changes: [],
          next: "day",
        };
      } else {
        r.phase = "debuff";
        r.debuffPicks = r.roll.face === 1 ? 2 : 1;
        r.offered = shuffled(
          DEBUFFS.filter(
            (d) => !r.debuffs.includes(d.id) || ["B18", "B19"].includes(d.id),
          ),
          r.seed,
          `debuff:${r.day}`,
        )
          .slice(0, 3)
          .map((d) => d.id);
        if (r.offered.length < r.debuffPicks) r.debuffPicks = r.offered.length;
      }
    }
  } else if (action.type === "debuff") {
    if (r.phase !== "debuff" || !r.offered.includes(action.id)) return input;
    r.offered = r.offered.filter((x) => x !== action.id);
    r.debuffPicks--;
    if (action.id === "B18") {
      r.cash += 2000;
      r.privateDebt += 2000;
      r.relations.family = Math.max(0, r.relations.family - 1);
    } else if (action.id === "B19") r.cash -= 500;
    else if (!r.debuffs.includes(action.id)) r.debuffs.push(action.id);
    r.journal.push({
      id: `debuff:${r.day}:${action.id}`,
      day: r.day,
      title: "夜里留下的东西",
      choice: DEBUFFS.find((x) => x.id === action.id)!.name,
      result: DEBUFFS.find((x) => x.id === action.id)!.text,
      scope: { kind: "personal", id: "self" },
      flags: [],
    });
    if (r.debuffPicks <= 0) {
      r.phase = "feedback";
      r.feedback = {
        title: "天亮了",
        text: "闹钟响了。你摸到床边的外套，翻出胸牌。",
        changes: [],
        next: "day",
      };
      interrupt(r);
    }
  } else if (
    action.type === "borrow" ||
    action.type === "coffee" ||
    action.type === "nap"
  ) {
    if (r.phase !== "play" || r.facts[`leave:${r.day}`]) return input;
    if (action.type === "borrow") {
      if (r.borrowed >= RULES.borrowMax || r.day >= 14) return input;
      r.borrowed++;
      r.ap++;
      capLoss(r, RULES.borrowCapLoss);
    }
    if (action.type === "coffee") {
      if (r.coffee >= 3) return input;
      r.cash -= RULES.coffeeCost;
      r.vitals.stamina = Math.min(
        r.caps.stamina,
        r.vitals.stamina + (has(r, "B04") ? 5 : [15, 8, 3][r.coffee]),
      );
      r.coffee++;
      if (r.coffee > 1) r.reputation = Math.max(0, r.reputation - 2);
      if (has(r, "B15")) r.reputation = Math.max(0, r.reputation - 1);
    }
    if (action.type === "nap") {
      if (r.nap || r.ap < (has(r, "T18") ? 2 : 1)) return input;
      r.nap = true;
      spendAp(r, has(r, "T18") ? 2 : 1);
      r.vitals.stamina = Math.min(
        r.caps.stamina,
        r.vitals.stamina + (has(r, "T18") ? 15 : 10),
      );
    }
    r.feedback = {
      title:
        action.type === "borrow"
          ? "明天少一格"
          : action.type === "coffee"
            ? "纸杯"
            : "二十分钟",
      text:
        action.type === "borrow"
          ? "今天多了一个行动，明天少一个。三项上限各扣 1。"
          : action.type === "coffee"
            ? "你把杯子放回护士站。"
            : "你把闹钟关掉，坐了一会。",
      changes: deltas(input, r),
      next: "play",
    };
    r.phase = "feedback";
    interrupt(r);
  } else if (action.type === "fund") {
    if (r.phase !== "funding") return input;
    if (action.method === "stop") {
      stop(r, "quit");
      return r;
    }
    if (action.method === "credit") {
      const needed = -r.cash;
      r.debt += needed;
      r.cash = 0;
      flag(r, "credit-used", `fund:${r.day}`);
    }
    if (action.method === "family") {
      if (r.facts["family-funding"]) return input;
      r.cash += RULES.familyFunding;
      r.relations.family = Math.max(0, r.relations.family - 2);
      r.vitals.emotion = Math.max(0, r.vitals.emotion - 10);
      flag(r, "family-funding", `fund:${r.day}`);
    }
    if (action.method === "asset") {
      if (r.facts["asset-sold"]) return input;
      r.cash += RULES.assetSale;
      flag(r, "asset-sold", `fund:${r.day}`);
      r.vitals.emotion = Math.max(0, r.vitals.emotion - 5);
    }
    r.phase = r.pendingResume ?? "feedback";
    interrupt(r);
  } else if (action.type === "collapse") {
    if (r.phase !== "collapse") return input;
    r.caps.stamina = Math.max(1, r.caps.stamina - 20);
    r.vitals.stamina = Math.max(1, Math.floor(r.caps.stamina / 2));
    if (action.method === "help")
      r.relations.peer = Math.max(0, r.relations.peer - 1);
    if (action.method === "report")
      r.reputation = Math.max(0, r.reputation - 15);
    if (action.method === "clinic") {
      r.cash -= 600;
      r.debuffs = r.debuffs.filter((x) => x !== "B03");
    }
    r.phase = r.pendingResume ?? "feedback";
    interrupt(r);
  } else if (action.type === "testify") {
    if (r.phase !== "tribunal") return input;
    r.tribunalResponse = action.response;
    r.ending = tribunalEnding(r, action.response);
    r.phase = r.roll?.kind === "tribunal" ? "roll" : "ending";
  }
  for (const key of Object.keys(r.vitals) as Vital[])
    r.vitals[key] = clamp(Math.round(r.vitals[key]), 0, r.caps[key]);
  r.reputation = clamp(r.reputation, 0, 100);
  return r;
}
export function reward(meta: Meta, r: Run): Meta {
  if (!r.ending || meta.rewarded.includes(r.id)) return meta;
  const next = structuredClone(meta),
    cases = [
      ...new Set(r.patients.filter((p) => p.settled).map((p) => p.caseId)),
    ];
  const scenes = [
    ...new Set(r.journal.filter((x) => x.id.includes("-")).map((x) => x.title)),
  ];
  next.xp +=
    (r.day >= 15 ? 3 : 0) +
    (!meta.endings.includes(r.ending.id) ? 2 : 0) +
    Math.min(
      5,
      Math.floor(scenes.filter((x) => !meta.scenes.includes(x)).length / 2),
    ) +
    Math.min(3, cases.filter((x) => !meta.cases.includes(x)).length);
  next.runs++;
  next.rewarded.push(r.id);
  next.endings = [...new Set([...next.endings, r.ending.id])];
  next.cases = [...new Set([...next.cases, ...cases])];
  next.scenes = [...new Set([...next.scenes, ...scenes])];
  return next;
}
export function upgrade(
  meta: Meta,
  kind: "skill" | "cap" | "cash",
  key?: string,
): Meta {
  const m = structuredClone(meta);
  if (
    kind === "skill" &&
    key &&
    key in m.skills &&
    m.skills[key as Skill] < RULES.meta.skillMax &&
    m.xp >= RULES.meta.skillCost
  ) {
    m.skills[key as Skill]++;
    m.xp -= RULES.meta.skillCost;
  } else if (
    kind === "cap" &&
    key &&
    key in m.caps &&
    m.caps[key as Vital] < RULES.meta.capMax &&
    m.xp >= RULES.meta.capCost
  ) {
    m.caps[key as Vital]++;
    m.xp -= RULES.meta.capCost;
  } else if (
    kind === "cash" &&
    m.cashRank < RULES.meta.cashMax &&
    m.xp >= RULES.meta.cashCost
  ) {
    m.cashRank++;
    m.xp -= RULES.meta.cashCost;
  }
  return m;
}
export function publicState(r: Run) {
  return {
    name: r.name,
    day: r.day,
    phase: r.phase,
    vitals: r.vitals,
    caps: r.caps,
    ap: r.ap,
    cash: r.cash,
    debt: r.debt,
    privateDebt: r.privateDebt,
    borrowed: r.borrowed,
    relations: r.relations,
    debuffs: r.debuffs,
    card:
      r.phase === "play"
        ? {
            title: currentCard(r)?.title,
            text: currentCard(r)?.text,
            options: availableOptions(r).map((x) => ({
              id: x.id,
              label: x.label,
              ap: x.ap,
              minutes: x.minutes,
              cost: x.cost,
              cash: x.effects.cash ?? 0,
              check: x.check
                ? { skill: x.check.skill, dc: x.check.dc }
                : undefined,
            })),
          }
        : undefined,
    ...(r.phase === "tribunal" || r.phase === "ending"
      ? { audit: auditScore(r), hazards: r.hazards, ending: r.ending }
      : {}),
    feedback: r.phase === "feedback" ? r.feedback : undefined,
  };
}
