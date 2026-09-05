import { describe, expect, it } from "vitest";
import { encodeGuide, GUIDE_EVENTS, guideProgress, initialGuideState, parseGuide, reduceGuide, type GuideEvent } from "./Guide";

const observe = (events: GuideEvent[]) => events.reduce((state, event) => reduceGuide(state, { type: "observe", event }), initialGuideState());

describe("onboarding progress", () => {
  it("starts at the bed and does not advance when the welcome was merely read", () => {
    const state = observe(["welcome-seen"]);
    expect(guideProgress(state).completed).toBe(0);
    expect(guideProgress(state).current?.event).toBe("bed-near");
  });
  it("records actual actions without filling in unobserved earlier steps", () => {
    const state = observe(["chart-open", "choice-committed"]);
    expect(guideProgress(state).completed).toBe(2);
    expect(guideProgress(state).current?.event).toBe("bed-near");
  });
  it("lets a confirmed non-check choice bypass the dice objective", () => {
    const state = observe(["bed-near", "chart-open", "choice-committed", "choice-without-check"]);
    expect(guideProgress(state).steps[3]).toMatchObject({ done: true, skipped: true });
    expect(guideProgress(state).current?.event).toBe("handoff-completed");
    expect(guideProgress(reduceGuide(state, { type: "observe", event: "handoff-completed" })).current).toBeNull();
  });
  it("marks an observed check as completed, not skipped", () => {
    expect(guideProgress(observe(["choice-without-check", "choice-roll-seen"])).steps[3]).toMatchObject({ done: true, skipped: false });
  });
  it("is immutable and idempotent", () => {
    const initial = initialGuideState();
    const next = reduceGuide(initial, { type: "observe", event: "bed-near" });
    expect(initial.seen).toEqual([]);
    expect(reduceGuide(next, { type: "observe", event: "bed-near" })).toBe(next);
  });
  it("skip stops tracking and restart clears only tutorial progress", () => {
    const skipped = reduceGuide(observe(["bed-near"]), { type: "skip" });
    expect(reduceGuide(skipped, { type: "observe", event: "chart-open" })).toBe(skipped);
    expect(reduceGuide(skipped, { type: "restart" })).toEqual(initialGuideState());
  });
});

describe("onboarding persistence", () => {
  it("roundtrips complete and skipped state", () => {
    const complete = observe([...GUIDE_EVENTS]);
    expect(parseGuide(encodeGuide(complete))).toEqual(complete);
    const skipped = reduceGuide(complete, { type: "skip" });
    expect(parseGuide(encodeGuide(skipped))).toEqual(skipped);
  });
  it.each([undefined, null, "{", "x".repeat(4097), [], { version: 2, enabled: true, seen: [] }, { version: 1, enabled: "true", seen: [] }, { version: 1, enabled: true, seen: ["unknown"] }, { version: 1, enabled: true, seen: Array(30).fill("bed-near") }])("safely resets invalid input %j", input => {
    expect(parseGuide(input)).toEqual(initialGuideState());
  });
  it("copies validated data, deduplicates and drops unrelated properties", () => {
    const raw = { version: 1, enabled: true, seen: ["bed-near", "bed-near"], run: { day: 14 } };
    const parsed = parseGuide(raw);
    expect(parsed).toEqual({ version: 1, enabled: true, seen: ["bed-near"] });
    parsed.seen.push("chart-open");
    expect(raw.seen).toHaveLength(2);
  });
});
