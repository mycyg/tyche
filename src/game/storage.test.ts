import { describe, expect, it } from "vitest";
import { act, availableOptions, startRun } from "./engine";
import { createPatient } from "./cards";
import { CASES } from "./catalog";
import { decode, emptySave, encode, load, SAVE_KEY, BACKUP_KEY, type Save } from "./storage";
import { runSimulation } from "../../scripts/simulate";

const fresh = (): Save => ({ ...emptySave(), run: startRun("storage-shapes", "程医生", ["T06", "T16", "T11"]) });
// Corrupt the payload before recomputing its checksum, so these tests exercise shape validation.
function corrupt(path: string, value: unknown): string {
  const save = fresh();
  const keys = path.split(".");
  let target: Record<string, unknown> = save as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys[keys.length - 1]] = value;
  return encode(save);
}

describe("import integrity", () => {
  it.each([
    ["run.patients.0.name", null], ["run.patients.0.bed", "5"], ["run.patients.0.bed", -1],
    ["run.patients.0.active", undefined], ["run.patients.0.inpatient", 1], ["run.patients.0.settled", "false"],
    ["run.patients.0.planned", null], ["run.patients.0.mitigated", undefined], ["run.patients.0.caredDay", "1"],
    ["run.patients.0.explainedDay", null], ["run.patients.0.readmitted", 1], ["run.patients.0.dischargedDay", "2"],
    ["run.patients.0.caseId", "missing"], ["run.patients.0.spent", Infinity],
    ["run.relations.chief", 6], ["run.relations.nurse", -1], ["run.relations.peer", "3"],
    ["run.nap", undefined], ["run.skipNextDay", "false"], ["run.difficulty", "unknown"],
    ["run.pendingResume", "ending"], ["run.day", 1.5], ["run.cursor", 0.5],
    ["run.talents", ["missing"]], ["run.debuffs", ["missing"]], ["run.offered", ["missing"]],
    ["run.facts", { known: {} }], ["run.facts", { known: { day: 1, sequence: "0", source: "chart" } }],
    ["run.queue.0.scope", { kind: "unknown", id: "x" }], ["run.queue.0.kind", "unknown"],
    ["run.queue.0.caseId", "missing"], ["run.queue.0.patientId", "missing"],
    ["run.queue.0.options.0.effects", { stamina: "5" }],
    ["run.queue.0.options.0.effects", { caps: { san: "5" } }],
    ["run.queue.0.options.0.effects", { relations: { missing: 2 } }],
    ["run.queue.0.options.0.effects", { hazards: [{ type: "R", weight: 1, causal: "false", norm: "n", reason: "r" }] }],
    ["run.queue.0.options.0.effects", { flags: [3] }],
    ["run.queue.0.options.0.effects", { discharge: "false" }],
    ["run.queue.0.options.0.when", { relation: ["missing", 2] }],
    ["run.queue.0.options.0.when", { all: "known" }],
    ["run.queue.0.options.0.check", { skill: "missing", dc: 10, failure: {}, failureText: "失败" }],
    ["run.queue.0.options.0.check", { skill: "observe", dc: 10, failure: { cash: "5" }, failureText: "失败" }],
    ["run.queue.0.options.0.check", { skill: "observe", dc: 10, failure: {} }],
    ["run.feedback", { title: "结果", text: "记录", changes: [], next: "unknown" }],
    ["run.journal", [{ id: "x", title: "t", choice: "c", result: "r", day: 1, flags: [], scope: {} }]],
    ["run.hazards", [{ type: "R", weight: 1, reason: "r", norm: "n", causal: true, day: 1, scope: { kind: "personal", id: "self" } }]],
    ["guide", { version: 1, enabled: true, seen: ["unknown"] }],
    ["guide", { version: 2, enabled: true, seen: [] }],
  ])("rejects malformed %s (%j)", (path, value) => {
    expect(() => decode(corrupt(path, value))).toThrow();
  });

  it.each([
    { x: "100", y: 100, facing: 0, day: 1 }, { x: 1600, y: 100, facing: 0, day: 1 },
    { x: 100, y: -1, facing: 0, day: 1 }, { x: 100, y: 100, facing: 4, day: 1 },
    { x: 100, y: 100, facing: 1.5, day: 1 }, { x: 100, y: 100, facing: 1, day: null },
  ])("rejects malformed world position %j", world => expect(() => decode(corrupt("run.world", world))).toThrow());

  it.each([{ face: 0 }, { face: 21 }, { face: 2.5 }, { modifier: null }, { success: "true" }, { label: null }, { second: 21 }, { kind: "unknown" }])("rejects malformed roll %j", change => {
    const roll = { id: "roll", kind: "choice", face: 12, modifier: 2, dc: 10, success: true, label: "观察", ...change };
    expect(() => decode(corrupt("run.roll", roll))).toThrow();
  });

  it("falls back to a verified backup after a shape-corrupt primary save", () => {
    const healthy = fresh();
    const entries = new Map([[SAVE_KEY, corrupt("run.patients.0.name", null)], [BACKUP_KEY, encode(healthy)]]);
    const recovered = load({ getItem: key => entries.get(key) ?? null });
    expect(recovered.save).toEqual(healthy);
    expect(recovered.warning).toContain("恢复");
  });
});

describe("healthy save compatibility", () => {
  it("accepts the prior save format without guide or world and preserves old beds", () => {
    const save = fresh();
    delete save.guide; delete save.run!.world;
    save.run!.patients[0].bed = 17;
    expect(decode(encode(save))).toEqual(save);
  });
  it("preserves valid guide, world and the non-inpatient C020 case", () => {
    const save = fresh();
    save.guide = { version: 1, enabled: false, seen: ["welcome-seen", "bed-near"] };
    save.run!.world = { x: 720, y: 246, facing: 3, day: 1 };
    const p = createPatient(save.run!, "C020", "records");
    save.run!.patients.push(p);
    expect(p.inpatient).toBe(false);
    expect(decode(encode(save))).toEqual(save);
  });
  it("accepts all catalog checks and effects in a valid patient's queue", () => {
    const save = fresh();
    save.run!.queue = CASES.flatMap(c => c.steps.map(step => ({ ...step, kind: "clinical" as const, scope: { kind: "personal" as const, id: "catalog" }, caseId: c.id })));
    expect(decode(encode(save))).toEqual(save);
  });
  it("preserves an actual chosen result and its next action", () => {
    const save = fresh();
    save.run = act(save.run!, { type: "choose", id: availableOptions(save.run!)[0].id });
    const restored = decode(encode(save));
    expect(restored).toEqual(save);
    const action = save.run.phase === "roll" ? { type: "ack-roll" as const } : { type: "continue" as const };
    expect(act(restored.run!, action)).toEqual(act(save.run, action));
  });
  it("accepts real complete runs including generated stories, facts, hazards and endings", () => {
    for (const policy of ["random", "careful", "reckless"] as const) {
      const save = { ...emptySave(), run: runSimulation(`storage-${policy}`, policy).r };
      expect(decode(encode(save))).toEqual(save);
    }
  });
});
