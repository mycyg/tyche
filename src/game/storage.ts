import { hash } from "./random";
import { newMeta } from "./engine";
import { CASES, DEBUFFS, TALENTS } from "./catalog";
import type { Meta, Run } from "./types";
import type { GuideState } from "../ui/Guide";
export interface Settings {
  sound: boolean;
  motion: boolean;
  largeText: boolean;
}
export interface Save {
  schema: 1;
  run: Run | null;
  meta: Meta;
  settings: Settings;
  guide?: GuideState;
}
export const SAVE_KEY = "tyche.save.1";
export const BACKUP_KEY = "tyche.backup.1";
const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const finiteRecord = (x: unknown, keys: string[]) =>
  isRecord(x) &&
  keys.every((k) => typeof x[k] === "number" && Number.isFinite(x[k]));
const strings = (x: unknown): x is string[] =>
  Array.isArray(x) &&
  x.length <= 20000 &&
  x.every((v) => typeof v === "string");
const skills = ["observe", "clinical", "record", "persuade", "comfort", "endure"];
const relations = ["chief", "peer", "nurse", "family"];
const vitals = ["stamina", "san", "emotion"];
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const integer = (x: unknown): x is number => finite(x) && Number.isInteger(x);
const textFields = (x: Record<string, unknown>, keys: string[]) => keys.every(k => typeof x[k] === "string");
const boolFields = (x: Record<string, unknown>, keys: string[]) => keys.every(k => typeof x[k] === "boolean");
const optional = (x: Record<string, unknown>, key: string, valid: (value: unknown) => boolean) => x[key] === undefined || valid(x[key]);
const isText = (x: unknown) => typeof x === "string";
const isBool = (x: unknown) => typeof x === "boolean";
const member = (values: readonly string[]) => (x: unknown) => typeof x === "string" && values.includes(x);
const caseId = member(CASES.map(c => c.id));
const scope = (x: unknown) => isRecord(x) && member(["patient", "project", "personal"])(x.kind) && typeof x.id === "string";
const partialNumbers = (x: unknown, keys: string[]) => isRecord(x) && Object.entries(x).every(([key, value]) => keys.includes(key) && finite(value));
const hazardInput = (x: unknown) => isRecord(x) && member(["R", "C", "D", "F"])(x.type) && finite(x.weight) &&
  textFields(x, ["reason", "norm"]) && typeof x.causal === "boolean";
function effects(x: unknown): boolean {
  if (!isRecord(x)) return false;
  const numbers = ["stamina", "san", "emotion", "reputation", "damage", "mitigate", "cash", "debt", "privateDebt", "receivable", "income", "depression", "ap", "stability", "patience", "bill"];
  return numbers.every(k => optional(x, k, finite)) && ["flags", "clear"].every(k => optional(x, k, strings)) &&
    ["discharge", "plannedDischarge", "care"].every(k => optional(x, k, isBool)) &&
    optional(x, "relations", value => partialNumbers(value, relations)) && optional(x, "caps", value => partialNumbers(value, vitals)) &&
    optional(x, "hazards", value => Array.isArray(value) && value.every(hazardInput));
}
function condition(x: unknown): boolean {
  return isRecord(x) && ["all", "any", "none"].every(k => optional(x, k, strings)) && optional(x, "cash", finite) &&
    optional(x, "relation", value => Array.isArray(value) && value.length === 2 && member(relations)(value[0]) && finite(value[1]));
}
function check(x: unknown): boolean {
  return isRecord(x) && member(skills)(x.skill) && finite(x.dc) && effects(x.failure) && typeof x.failureText === "string" &&
    ["purpose", "failureHint"].every(k => optional(x, k, isText));
}
function option(x: unknown): boolean {
  return isRecord(x) && textFields(x, ["id", "label", "result"]) && finiteRecord(x, ["ap", "cost", "minutes"]) && effects(x.effects) &&
    ["next", "hint"].every(k => optional(x, k, isText)) && optional(x, "check", check) && optional(x, "when", condition);
}
function patient(x: unknown): boolean {
  return isRecord(x) && textFields(x, ["uid", "name"]) && caseId(x.caseId) &&
    finiteRecord(x, ["admitted", "expectedDays", "budget", "initialBudget", "spent", "charged", "stability", "patience", "damage", "mitigated", "caredDay", "explainedDay"]) &&
    integer(x.bed) && x.bed >= 0 && boolFields(x, ["active", "inpatient", "planned", "settled"]) &&
    optional(x, "dischargedDay", finite) && optional(x, "readmitted", isBool);
}
function roll(x: unknown): boolean {
  const face = (n: unknown) => integer(n) && n >= 1 && n <= 20;
  return isRecord(x) && textFields(x, ["id", "label"]) && member(["day", "choice", "tribunal"])(x.kind) &&
    face(x.face) && finiteRecord(x, ["modifier", "dc"]) && isBool(x.success) && optional(x, "second", face);
}
function guide(x: unknown): boolean {
  return isRecord(x) && x.version === 1 && isBool(x.enabled) && strings(x.seen) && x.seen.length <= 7 &&
    x.seen.every(member(["welcome-seen", "bed-near", "chart-open", "choice-committed", "choice-roll-seen", "choice-without-check", "handoff-completed"]));
}
function isRun(x: unknown): x is Run {
  if (
    !isRecord(x) ||
    x.schema !== 1 ||
    typeof x.id !== "string" ||
    typeof x.seed !== "string" ||
    typeof x.name !== "string" ||
    !member(["rotation", "attending"])(x.difficulty) ||
    !boolFields(x, ["nap", "skipNextDay"]) ||
    !optional(x, "tribunalResponse", isText) ||
    !optional(x, "pendingResume", member(["feedback", "roll"]))
  )
    return false;
  const relationValues = x.relations;
  if (!isRecord(relationValues) || !relations.every(key => {
    const value = relationValues[key];
    return finite(value) && value >= 0 && value <= 5;
  })) return false;
  if (!optional(x, "world", value => isRecord(value) && finiteRecord(value, ["x", "y"]) &&
    (value.x as number) >= 0 && (value.x as number) <= 1536 && (value.y as number) >= 0 && (value.y as number) <= 512 &&
    integer(value.facing) && value.facing >= 0 && value.facing <= 3 && integer(value.day) && value.day >= 1 && value.day <= 15)) return false;
  if (
    ![
      "play",
      "feedback",
      "roll",
      "debuff",
      "funding",
      "collapse",
      "tribunal",
      "ending",
    ].includes(String(x.phase))
  )
    return false;
  if (
    !finiteRecord(x, [
      "day",
      "ap",
      "borrowed",
      "overtime",
      "cash",
      "debt",
      "privateDebt",
      "receivable",
      "income",
      "interest",
      "uncoveredDays",
      "reputation",
      "depression",
      "coffee",
      "exhausted",
      "emotionalBreaks",
      "nightMinutes",
      "nightBudget",
      "cursor",
      "debuffPicks",
      "streak",
    ])
  )
    return false;
  if (
    !finiteRecord(x.vitals, ["stamina", "san", "emotion"]) ||
    !finiteRecord(x.caps, ["stamina", "san", "emotion"]) ||
    !finiteRecord(x.relations, ["chief", "peer", "nurse", "family"]) ||
    !finiteRecord(x.skills, [
      "observe",
      "clinical",
      "record",
      "persuade",
      "comfort",
      "endure",
    ])
  )
    return false;
  if (
    ![x.talents, x.debuffs, x.offered, x.committed].every(strings) ||
    !isRecord(x.facts) ||
    !Object.values(x.facts).every(f => isRecord(f) && finiteRecord(f, ["day", "sequence"]) && typeof f.source === "string") ||
    !(x.talents as string[]).every(member(TALENTS.map(t => t.id))) ||
    ![...(x.debuffs as string[]), ...(x.offered as string[])].every(member(DEBUFFS.map(d => d.id)))
  )
    return false;
  if (
    !Array.isArray(x.queue) ||
    x.queue.length > 200 ||
    !x.queue.every(
      (c) =>
        isRecord(c) &&
        typeof c.id === "string" &&
        typeof c.title === "string" &&
        typeof c.text === "string" &&
        scope(c.scope) &&
        member(["clinical", "ward", "story", "quick", "night", "rest", "audit"])(c.kind) &&
        ["actor", "patientId", "chain"].every(k => optional(c, k, isText)) &&
        optional(c, "caseId", caseId) && optional(c, "last", isBool) &&
        Array.isArray(c.options) &&
        c.options.length > 0 &&
        c.options.every(option),
    )
  )
    return false;
  if (
    !Array.isArray(x.patients) ||
    !x.patients.every(patient)
  )
    return false;
  const patientIds = new Set((x.patients as Record<string, unknown>[]).map(p => p.uid));
  if (patientIds.size !== x.patients.length || !(x.queue as Record<string, unknown>[]).every(c => c.patientId === undefined || patientIds.has(c.patientId))) return false;
  if (
    !Array.isArray(x.journal) ||
    !Array.isArray(x.hazards) ||
    !x.journal.every(
      (j) =>
        isRecord(j) &&
        typeof j.id === "string" &&
        typeof j.title === "string" &&
        typeof j.choice === "string" &&
        typeof j.result === "string" &&
        strings(j.flags) &&
        finite(j.day) && scope(j.scope),
    ) ||
    !x.hazards.every(
      (h) =>
        isRecord(h) &&
        hazardInput(h) && textFields(h, ["id", "choiceId", "choice"]) &&
        scope(h.scope) &&
        finiteRecord(h, ["day", "weight"]),
    )
  )
    return false;
  if (
    x.feedback !== undefined &&
    (!isRecord(x.feedback) ||
      typeof x.feedback.text !== "string" ||
      typeof x.feedback.title !== "string" ||
      !member(["play", "check", "day", "ending"])(x.feedback.next) || !strings(x.feedback.changes))
  )
    return false;
  if (
    x.roll !== undefined &&
    !roll(x.roll)
  )
    return false;
  if (
    x.ending !== undefined &&
    (!isRecord(x.ending) ||
      typeof x.ending.id !== "string" ||
      typeof x.ending.title !== "string" ||
      typeof x.ending.decision !== "string" ||
      typeof x.ending.epilogue !== "string" ||
      typeof x.ending.category !== "string" || typeof x.ending.court !== "boolean" || !strings(x.ending.annexes))
  )
    return false;
  if (
    (x.phase === "roll" && !x.roll) ||
    (x.phase === "ending" && !x.ending) ||
    (x.phase === "feedback" && !x.feedback)
  )
    return false;
  return (
    integer(x.day) && integer(x.cursor) && (x.day as number) >= 1 &&
    (x.day as number) <= 15 &&
    (x.cursor as number) >= 0 &&
    (x.cursor as number) <= x.queue.length
  );
}
export function emptySave(): Save {
  return {
    schema: 1,
    run: null,
    meta: newMeta(),
    settings: { sound: false, motion: true, largeText: false },
  };
}
export function encode(save: Save): string {
  const payload = JSON.stringify(save);
  return JSON.stringify({ tyche: 1, checksum: hash(payload), payload });
}
export function decode(text: string): Save {
  if (text.length > 3_000_000) throw new Error("存档超过大小限制。");
  const envelope = JSON.parse(text);
  if (
    !isRecord(envelope) ||
    envelope.tyche !== 1 ||
    typeof envelope.payload !== "string" ||
    hash(envelope.payload) !== envelope.checksum
  )
    throw new Error("存档校验失败，文件可能不完整。");
  const s = JSON.parse(envelope.payload);
  if (
    !isRecord(s) ||
    s.schema !== 1 ||
    (s.run !== null && !isRun(s.run)) ||
    !isRecord(s.meta) ||
    s.meta.schema !== 1 ||
    !finiteRecord(s.meta, ["xp", "runs", "cashRank"]) ||
    !finiteRecord(s.meta.skills, [
      "observe",
      "clinical",
      "record",
      "persuade",
      "comfort",
      "endure",
    ]) ||
    !finiteRecord(s.meta.caps, ["stamina", "san", "emotion"]) ||
    ![s.meta.endings, s.meta.cases, s.meta.scenes, s.meta.rewarded].every(
      strings,
    ) ||
    !isRecord(s.settings) ||
    !optional(s, "guide", guide) ||
    !["sound", "motion", "largeText"].every(
      (k) => typeof (s.settings as Record<string, unknown>)[k] === "boolean",
    )
  )
    throw new Error("存档格式不受支持。");
  return s as unknown as Save;
}
export function load(storage: Pick<Storage, "getItem"> | undefined): {
  save: Save;
  warning: string;
} {
  if (!storage)
    return {
      save: emptySave(),
      warning: "浏览器存储不可用。请导出存档保留进度。",
    };
  try {
    const text = storage.getItem(SAVE_KEY);
    if (text) return { save: decode(text), warning: "" };
  } catch {
    /* recover from one verified prior save */
  }
  try {
    const backup = storage.getItem(BACKUP_KEY);
    if (backup)
      return { save: decode(backup), warning: "已从上一份存档恢复。" };
  } catch {
    /* preserve damaged data until explicit player action */
  }
  return { save: emptySave(), warning: "" };
}
export function persist(
  save: Save,
  storage: Pick<Storage, "getItem" | "setItem">,
): string {
  try {
    const previous = storage.getItem(SAVE_KEY);
    if (previous) {
      try {
        decode(previous);
        storage.setItem(BACKUP_KEY, previous);
      } catch {
        /* do not replace a healthy backup with corrupt data */
      }
    }
    storage.setItem(SAVE_KEY, encode(save));
    return "";
  } catch {
    return "进度未写入浏览器。游戏仍可继续，请导出存档。";
  }
}
