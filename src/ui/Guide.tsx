import { TERM_GUIDE } from "./copy";
import "./guide.css";

export const GUIDE_VERSION = 1 as const;
export const GUIDE_STORAGE_KEY = "tyche.guide.1";
export const GUIDE_EVENTS = [
  "welcome-seen", "bed-near", "chart-open", "choice-committed",
  "choice-roll-seen", "choice-without-check", "handoff-completed",
] as const;
export type GuideEvent = typeof GUIDE_EVENTS[number];
export interface GuideState {
  version: typeof GUIDE_VERSION;
  enabled: boolean;
  seen: GuideEvent[];
}
export type GuideAction =
  | { type: "observe"; event: GuideEvent }
  | { type: "skip" }
  | { type: "restart" };

export function initialGuideState(): GuideState {
  return { version: GUIDE_VERSION, enabled: true, seen: [] };
}

/** The host supplies confirmed UI/engine events. This reducer never touches a Run. */
export function reduceGuide(state: GuideState, action: GuideAction): GuideState {
  if (action.type === "restart") return initialGuideState();
  if (action.type === "skip") return state.enabled ? { ...state, enabled: false } : state;
  if (!state.enabled || !GUIDE_EVENTS.includes(action.event) || state.seen.includes(action.event)) return state;
  return { ...state, seen: [...state.seen, action.event] };
}

/** Unknown versions, corrupt input and unexpected event names restart the guide safely. */
export function parseGuide(value: unknown): GuideState {
  try {
    const raw: unknown = typeof value === "string" && value.length <= 4096 ? JSON.parse(value) : value;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return initialGuideState();
    const data = raw as Record<string, unknown>;
    if (data.version !== GUIDE_VERSION || typeof data.enabled !== "boolean" ||
      !Array.isArray(data.seen) || data.seen.length > GUIDE_EVENTS.length ||
      !data.seen.every(event => typeof event === "string" && GUIDE_EVENTS.includes(event as GuideEvent))) return initialGuideState();
    return { version: GUIDE_VERSION, enabled: data.enabled, seen: [...new Set(data.seen as GuideEvent[])] };
  } catch {
    return initialGuideState();
  }
}

export function encodeGuide(state: GuideState): string {
  return JSON.stringify(parseGuide(state));
}

export const GUIDE_STEPS = [
  { event: "bed-near", title: "走近病床", hint: "点带「！」的病床前往，或用方向键、左下摇杆移动。" },
  { event: "chart-open", title: "打开病历", hint: "床旁点「病历夹」，核对入院登记和已经留下的检查记录。" },
  { event: "choice-committed", title: "选择处置", hint: "先看行动消耗、诊疗记账和个人自付，再确认你的选择。" },
  { event: "choice-roll-seen", title: "查看掷骰", hint: "有检定才掷骰：骰点加能力达到门槛即通过，1 必败、20 必成。" },
  { event: "handoff-completed", title: "完成交班", hint: "当班事务处理完，前往「交班」完成本日安排，再看日终变化。" },
] as const satisfies readonly { event: GuideEvent; title: string; hint: string }[];

export function guideProgress(state: GuideState) {
  const steps = GUIDE_STEPS.map(step => {
    const skipped = step.event === "choice-roll-seen" && !state.seen.includes("choice-roll-seen") && state.seen.includes("choice-without-check");
    return { ...step, skipped, done: skipped || state.seen.includes(step.event) };
  });
  return { steps, completed: steps.filter(step => step.done).length, total: steps.length, current: steps.find(step => !step.done) ?? null };
}

/** Place in a dedicated HUD row; this component does not overlay or freeze the map. */
export function GuideSteps({ state, onOpenManual, onSkip }: {
  state: GuideState;
  onOpenManual: () => void;
  onSkip: () => void;
}) {
  if (!state.enabled) return null;
  const progress = guideProgress(state);
  return <aside class="guide-strip" aria-label="上岗指引">
    <div class="guide-strip-copy" aria-live="polite" aria-atomic="true">
      <span class="guide-caption">上岗指引 · {progress.completed}/{progress.total}</span>
      <strong>{progress.current?.title ?? "第一次交班，辛苦了。"}</strong>
      <p>{progress.current?.hint ?? "之后按自己的节奏值班。需要时，随时翻开值班手册。"}</p>
    </div>
    <ol class="guide-milestones" aria-label="上岗进度">{progress.steps.map((step, i) =>
      <li key={step.event} class={step.done ? "is-done" : ""} aria-current={progress.current?.event === step.event ? "step" : undefined} title={`${step.title}：${step.skipped ? "本次无需掷骰" : step.done ? "已完成" : "待完成"}`}>
        <span aria-hidden="true">{step.skipped ? "—" : step.done ? "✓" : i + 1}</span>
        <span class="guide-sr-only">{step.title}，{step.skipped ? "本次无需掷骰" : step.done ? "已完成" : "待完成"}</span>
      </li>)}</ol>
    <div class="guide-strip-actions"><button onClick={onOpenManual}>手册</button><button onClick={onSkip}>{progress.current ? "跳过" : "收起"}</button></div>
  </aside>;
}

/** Content only: the host's existing Modal owns focus, Escape and map suspension. */
export function GuideManual({ mode = "manual", onClose, onStart, onSkip }: {
  mode?: "welcome" | "manual";
  onClose: () => void;
  onStart?: () => void;
  onSkip?: () => void;
}) {
  return <div class="guide-manual">
    <p class="guide-nurse">护士站 · 上岗交接</p>
    <p class="guide-intro">{mode === "welcome" ? "「程医生，先接一位患者。我带你认一下病床和病历，处置还是由你决定。」" : "「遇到拿不准的字眼，就翻翻这本手册。先弄清要花什么，再决定怎么做。」"}</p>
    <ol class="guide-route">{GUIDE_STEPS.map(step => <li key={step.event}><strong>{step.title}</strong><p>{step.hint}</p></li>)}</ol>
    <p class="guide-note">没有检定的选择直接出结果，不需要掷骰。点开病历不会替你确认处置。</p>
    <details class="guide-terms" open={mode === "manual"}>
      <summary>值班手册 · 常用词</summary>
      <dl>{TERM_GUIDE.map(item => <div key={item.term}><dt>{item.term}</dt><dd>{item.meaning}</dd></div>)}</dl>
    </details>
    <div class="guide-manual-actions">
      <button onClick={mode === "welcome" ? onStart ?? onClose : onClose}>{mode === "welcome" ? "开始上岗" : "回到病区"}</button>
      {mode === "welcome" && onSkip && <button onClick={onSkip}>跳过指引</button>}
    </div>
  </div>;
}
