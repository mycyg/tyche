/**
 * Choice policies for the autoplay driver.
 *
 * A policy only ever sees what a player can see: the text printed on a button
 * and the numbers printed in the status bar. Nothing here imports the engine,
 * reads a save file or knows a card identifier.
 */

/** One clickable choice, as it appears on screen. */
export interface OptionView {
  /** Position among the visible choices, starting at zero. */
  index: number;
  /** The heading line of the button. */
  label: string;
  /** The whole button text, including cost and check lines. */
  text: string;
  disabled: boolean;
}

/** The status bar, read straight from the HUD. */
export interface ScreenView {
  day: number;
  ap: number;
  cash: number;
  vitals: { label: string; now: number; max: number }[];
}

export type Decision =
  | "option"
  | "quest"
  | "debuff"
  | "funding"
  | "collapse"
  | "tribunal";

export interface Policy {
  name: PolicyName;
  /** Index of the option to click. */
  pick(kind: Decision, options: OptionView[], view: ScreenView): number;
  /** Whether to walk to the coffee counter before opening the next task. */
  wantsCoffee(view: ScreenView): boolean;
}

export type PolicyName = "careful" | "reckless" | "random";
export const POLICY_NAMES: PolicyName[] = ["careful", "reckless", "random"];

/** Deterministic 32-bit hash, so a policy seed always produces the same run. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Words the careful policy looks for: watching, re-checking, consulting, writing it down. */
const CAREFUL_WORDS = ["监测", "复核", "会诊", "记录"];
/** Words the careful policy backs away from: leaving early, declining, skipping. */
const CAREFUL_AVOID = ["出院", "拒绝", "不处理", "先不", "跳过", "推迟"];
/** A funding or collapse choice that stops the rotation on the spot. */
const TERMINAL = ["终止轮转", "不再垫付"];

function stamina(view: ScreenView): number {
  const bar = view.vitals[0];
  return bar && bar.max > 0 ? bar.now / bar.max : 1;
}
/** Action points the button says it will spend, or zero when it says none. */
function apCost(option: OptionView): number {
  if (option.text.includes("不消耗行动")) return 0;
  const m = option.text.match(/消耗\s*(\d+)\s*点行动值/);
  return m ? Number(m[1]) : 0;
}
/** Money the button says comes out of the doctor's own balance. */
function personalCost(option: OptionView): number {
  const m = option.text.match(/(?:自付|个人余额\s*−)\s*¥?([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}
function usable(options: OptionView[]): OptionView[] {
  const live = options.filter((o) => !o.disabled);
  return live.length ? live : options;
}
/** Keep a run alive: a stopping choice is used only when nothing else is offered. */
function survivable(options: OptionView[]): OptionView[] {
  const rest = options.filter((o) => !TERMINAL.some((w) => o.text.includes(w)));
  return rest.length ? rest : options;
}
function best(
  options: OptionView[],
  score: (o: OptionView) => number,
): number {
  let choice = options[0];
  let top = -Infinity;
  for (const o of options) {
    const value = score(o);
    if (value > top) {
      top = value;
      choice = o;
    }
  }
  return choice.index;
}

export function makePolicy(name: PolicyName, seed: string): Policy {
  const random = mulberry32(hash(`${seed}:${name}`));
  if (name === "random")
    return {
      name,
      wantsCoffee: () => false,
      pick(kind, options) {
        const pool = survivable(usable(options));
        if (!pool.length) return 0;
        return pool[Math.floor(random() * pool.length)].index;
      },
    };
  if (name === "reckless")
    return {
      name,
      wantsCoffee: () => false,
      pick(kind, options) {
        const pool = survivable(usable(options));
        if (!pool.length) return 0;
        if (kind === "quest") return pool[0].index;
        // Spend no action points and no money; the consequences are the point.
        return best(pool, (o) => -apCost(o) * 10 - personalCost(o) / 500);
      },
    };
  return {
    name,
    // Below a third of the stamina bar the careful doctor buys a coffee first.
    wantsCoffee: (view) => stamina(view) < 0.35 && view.cash > 0,
    pick(kind, options, view) {
      const pool = survivable(usable(options));
      if (!pool.length) return 0;
      if (kind === "quest") return pool[0].index;
      if (kind === "tribunal") return pool[0].index;
      return best(pool, (o) => {
        let value = 0;
        for (const word of CAREFUL_WORDS) if (o.text.includes(word)) value += 6;
        for (const word of CAREFUL_AVOID) if (o.text.includes(word)) value -= 4;
        // Do not go into overdraft while a cheaper option is on the table.
        if (apCost(o) > view.ap) value -= 5;
        value -= personalCost(o) / 2000;
        return value;
      });
    },
  };
}
