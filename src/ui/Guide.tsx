import { TERM_GUIDE } from "./copy";
import { useState } from 'preact/hooks';
import { searchHandbook, contextualHelp, handbookTopicForHint } from './handbook';
import type { Run } from '../game/types';
import { narrate } from './audio';
import "./guide.css";

import {GUIDE_VERSION,GUIDE_EVENTS,type GuideEvent,type GuideState}from '../shared/guide-state';
export {GUIDE_VERSION,GUIDE_STORAGE_KEY,GUIDE_EVENTS,type GuideEvent,type GuideState}from '../shared/guide-state';
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
  { event: "bed-near", title: "查看待办，走近病床", hint: "先看「当班待办」，选择当前可接诊的患者，再走近对应病床。可点地面、按方向键或用左下摇杆移动。" },
  { event: "chart-open", title: "打开病历", hint: "床旁点「病历夹」，核对入院登记和已经留下的检查记录。" },
  { event: "schedule-open", title: "先看排班，再安排工作", hint: "打开排班表，确认今天是否有夜班、明天能用多少行动。预支会占用明天的额度，并降低本局状态上限。查看排班不花行动。" },
  { event: "choice-committed", title: "选择处置", hint: "先看行动、体力和耗时，再核对诊疗记账与个人自付。标注「另扣」的透支或夜班超时代价也要相加。" },
  { event: "choice-roll-seen", title: "查看掷骰", hint: "普通能力检定将骰点和能力加成相加。骰子掷出 1 必败、20 必成；有「再来一次」天赋时，2 也算大失败。标为「概率判定」的结果按界面门槛计算，不加能力。无法取得的病史需要另找来源。" },
  { event: "recovery-open", title: "弄清体力怎么恢复", hint: "咖啡和午睡能恢复当前体力，但不会补行动值或已经降低的上限。先查看体力说明；满体力时不必喝咖啡。" },
  { event: "handoff-completed", title: "完成当日值班", hint: "按「当班待办」处理当前阶段，空的阶段会自动跳过；有夜班则继续接诊。全部待办完成后，在值班室进行日终检定。" },
] as const satisfies readonly { event: GuideEvent; title: string; hint: string }[];

export function guideProgress(state: GuideState) {
  const steps = GUIDE_STEPS.map(step => {
    const skipped = step.event === "choice-roll-seen" && !state.seen.includes("choice-roll-seen") && state.seen.includes("choice-without-check");
    return { ...step, skipped, done: skipped || state.seen.includes(step.event) };
  });
  return { steps, completed: steps.filter(step => step.done).length, total: steps.length, current: steps.find(step => !step.done) ?? null };
}

/** Place in a dedicated HUD row; this component does not overlay or freeze the map. */
export function GuideSteps({ state, onOpenManual, onOpenSchedule, onOpenRecovery, onSkip }: {
  state: GuideState;
  onOpenManual: () => void;
  onOpenSchedule: () => void;
  onOpenRecovery: () => void;
  onSkip: () => void;
}) {
  if (!state.enabled) return null;
  const progress = guideProgress(state);
  return <aside class="guide-strip" aria-label="上岗指引">
    <div class="guide-strip-copy" aria-live="polite" aria-atomic="true">
      <span class="guide-caption">上岗指引 · {progress.completed}/{progress.total}</span>
      <strong>{progress.current?.title ?? "已完成首次值班指引"}</strong>
      <p>{progress.current?.hint ?? "之后按自己的节奏值班。需要时，随时翻开值班手册。"}</p>
    </div>
    <ol class="guide-milestones" aria-label="上岗进度">{progress.steps.map((step, i) =>
      <li key={step.event} class={step.done ? "is-done" : ""} aria-current={progress.current?.event === step.event ? "step" : undefined} title={`${step.title}：${step.skipped ? "本次无需掷骰" : step.done ? "已完成" : "待完成"}`}>
        <span aria-hidden="true">{step.skipped ? "—" : step.done ? "✓" : i + 1}</span>
        <span class="guide-sr-only">{step.title}，{step.skipped ? "本次无需掷骰" : step.done ? "已完成" : "待完成"}</span>
      </li>)}</ol>
    <div class="guide-strip-actions">{progress.current?.event==='schedule-open'?<button onClick={onOpenSchedule}>查看排班</button>:progress.current?.event==='recovery-open'?<button onClick={onOpenRecovery}>体力说明</button>:<button onClick={onOpenManual}>手册</button>}<button onClick={onSkip}>{progress.current ? "跳过" : "收起"}</button></div>
  </aside>;
}

/** Content only: the host's existing Modal owns focus, Escape and map suspension. */
export function GuideManual({ mode = "manual", initialQuery = '', onClose, onStart, onSkip }: {
  mode?: "welcome" | "manual";
  initialQuery?: string;
  onClose: () => void;
  onStart?: () => void;
  onSkip?: () => void;
}) {
  const [query,setQuery]=useState(initialQuery);
  const chapters=searchHandbook(query);
  return <div class="guide-manual">
    <p class="guide-nurse">值班手册</p>
    <p class="guide-intro">{mode === "welcome" ? "从当班待办中选择一位患者，打开病历，再确认处置。每项操作所需的行动、体力、耗时和费用列在选项旁。" : "按操作名称查找。排班与恢复看「排班」「体力」，检查收费看「费用」。"}</p>
    <details class="guide-first-shift" open={mode === 'welcome'}><summary>第一次值班怎么操作</summary><ol class="guide-route">{GUIDE_STEPS.map(step => <li key={step.event}><strong>{step.title}</strong><p>{step.hint}</p></li>)}</ol></details>
    <dl class="guide-resource-key">
      <div><dt>行动值</dt><dd>你在白班安排工作要花行动值。不足时继续处置，就会透支。</dd></div>
      <div><dt>体力</dt><dd>体力越低，你越疲劳。喝咖啡和午睡能恢复体力，但不补行动值。</dd></div>
      <div><dt>精神 / 情绪</dt><dd>两项分别记录；精神影响压力与感知，情绪影响安抚和日终状态。</dd></div>
      <div><dt>夜班分钟</dt><dd>夜班处置的时间额度；阅读病历不计时。</dd></div>
      <div><dt>个人自付</dt><dd>你实际从个人余额支付的钱，与患者的诊疗账单分开计算。</dd></div>
      <div><dt>工资 / 绩效</dt><dd>你收到工资和绩效后，先还信用债，剩下的钱进入个人余额。患者缴费不算你的收入。</dd></div>
    </dl>
    <p class="guide-note">没有检定的选择直接出结果，不需要掷骰。点开病历不会替你确认处置。</p>
    <label class="handbook-search">查找说明<input type="search" value={query} placeholder="排班、体力、费用、录音……" onInput={e=>setQuery(e.currentTarget.value)} /></label>
    <nav class="handbook-topics" aria-label="常用说明">{['排班','体力','精神','病历','费用','拒检','请假','悟性','录音','存档','声音'].map(topic=><button key={topic} aria-pressed={query===topic} onClick={()=>setQuery(topic)}>{topic}</button>)}{query&&<button onClick={()=>setQuery('')}>查看全部</button>}</nav>
    <p class="guide-note" role="status">{query.trim()?`找到 ${chapters.length} 节说明`:'按标题展开，也可以输入关键词查找。'}</p>
    <div class="handbook-chapters">{chapters.map(chapter=><details key={chapter.id} open={!!query.trim()}><summary>{chapter.title}</summary>{chapter.paragraphs.map((text,i)=><p key={i}>{text}</p>)}<button class="text-button" aria-label={`朗读${chapter.title}`} onClick={()=>void narrate(chapter.paragraphs.join('\n'))}>朗读本节</button></details>)}</div>
    {!chapters.length&&<p>没有找到这项说明。试试「行动」「住院」或「夜班」。</p>}
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

export function ContextGuide({r,open}: {r:Run;open:(topic:string)=>void}) {
  const [dismissed,setDismissed]=useState<string[]>([]);
  const tip=contextualHelp(r,dismissed);
  if(!tip) return null;
  return <aside class="context-guide" aria-label="当班提醒"><div><strong>{tip.title}</strong><p>{tip.text}</p></div><button onClick={()=>open(handbookTopicForHint(tip.id))}>查看说明</button><button aria-label="收起这条提醒" onClick={()=>setDismissed([...dismissed,tip.id])}>×</button></aside>;
}
