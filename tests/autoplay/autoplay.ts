/**
 * Autoplay driver: plays Tyche in a real browser through the real interface.
 *
 * The driver never calls into the game engine. It reads the screen, clicks a
 * button, reads the screen again. Every surface is recognised by structure
 * (class names that carry a role), by aria-label or by the words printed on a
 * button, so new copy or new cases do not break the run.
 */
import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  makePolicy,
  type Decision,
  type OptionView,
  type PolicyName,
  type ScreenView,
} from "./policies";

export type Phase =
  | "title"
  | "setup"
  | "confirm"
  | "roll"
  | "debuff"
  | "funding"
  | "collapse"
  | "recovery"
  | "panel"
  | "tribunal"
  | "ending"
  | "encounter"
  | "talk"
  | "bedside"
  | "quests"
  | "menu"
  | "map"
  | "loading"
  | "unknown";

export interface Snapshot {
  phase: Phase;
  title: string;
  /** Digest of the visible surface; two equal digests mean nothing moved. */
  digest: string;
  options: OptionView[];
  actions: { index: number; label: string; text: string }[];
  view: ScreenView;
  ending?: { id: string; title: string };
}

export interface JournalEntry {
  step: number;
  /** Seconds since the run started. */
  t: number;
  day: number;
  phase: Phase;
  title: string;
  action: string;
  ap: number;
  cash: number;
  vitals: Record<string, number>;
}

export interface RunReport {
  seed: string;
  policy: PolicyName;
  label: string;
  viewport: string;
  talents: string[];
  finished: boolean;
  stuck: null | { step: number; phase: Phase; title: string; digest: string };
  endDay: number;
  ending: { id: string; title: string } | null;
  steps: number;
  minutes: number;
  pageErrors: string[];
  consoleErrors: string[];
  /** A task the driver opened that did not lead to any surface. */
  navigationFailures: { day: number; task: string; moved: boolean }[];
  shots: string[];
  journal: JournalEntry[];
  /** Set when a stopWhen predicate ended the loop early. */
  stoppedAt?: Snapshot;
}

export interface RunOptions {
  seed: string;
  policy: PolicyName;
  /** How many talents to take at setup. Three is the base rotation allowance. */
  talents?: number;
  maxMinutes?: number;
  /** Directory for journal.json and the screenshots of this run. */
  outDir: string;
  label?: string;
  /** Steps with an unchanged screen before the run is called stuck. */
  stallLimit?: number;
  /** Stop before acting on the first screen that satisfies this. */
  stopWhen?: (s: Snapshot) => boolean;
  /** Write journal.json when the run finishes. */
  writeJournal?: boolean;
  /**
   * Play with the reduced-motion setting the game already supports. The dice
   * settle in 40 ms instead of 1550 ms and the ward stops animating, which
   * keeps a fourteen-day rotation inside the time budget. Walking speed,
   * choices and checks are unaffected.
   */
  reduceMotion?: boolean;
}

/* ------------------------------------------------------------------ probe */

/**
 * Runs inside the page. Clears its own marks, works out which surface is on
 * top, stamps every button it reports and returns a serialisable snapshot.
 */
function probeScreen(): Snapshot {
  const text = (el: Element | null | undefined): string =>
    ((el as HTMLElement | null)?.innerText ?? "").replace(/\s+\n/g, "\n").trim();
  const number = (raw: string): number => {
    const m = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  };
  for (const el of document.querySelectorAll("[data-autoplay]"))
    el.removeAttribute("data-autoplay");
  const heading = (el: Element): string => {
    const strong = el.querySelector("b, h3");
    const first = text(strong);
    if (first && !/^\d+$/.test(first)) return first;
    const lines = text(el)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^\d+$/.test(line) && !/^[▸▤×]$/.test(line));
    return lines[0] ?? text(el);
  };
  const stamp = (
    nodes: Element[],
    prefix: string,
  ): { index: number; label: string; text: string; disabled: boolean }[] =>
    nodes.map((el, index) => {
      el.setAttribute("data-autoplay", `${prefix}${index}`);
      return {
        index,
        label: heading(el),
        text: text(el),
        disabled: (el as HTMLButtonElement).disabled === true,
      };
    });
  const meters = [...document.querySelectorAll(".rpg-vitals [role=meter]")];
  const view: ScreenView = {
    day: number(text(document.querySelector(".rpg-location span"))),
    ap: number(text(document.querySelector(".rpg-ap b"))),
    cash: number(text(document.querySelector(".rpg-wallet strong"))),
    vitals: meters.map((m) => ({
      label: m.getAttribute("aria-label") ?? "",
      now: Number(m.getAttribute("aria-valuenow") ?? 0),
      max: Number(m.getAttribute("aria-valuemax") ?? 1),
    })),
  };
  const build = (
    phase: Phase,
    title: string,
    surface: Element | null,
    optionNodes: Element[],
    actionNodes: Element[] = [],
  ): Snapshot => {
    const options = stamp(optionNodes, "opt-");
    const actions = stamp(actionNodes, "act-").map(({ disabled, ...rest }) => ({
      ...rest,
    }));
    const body = text(surface).slice(0, 600);
    return {
      phase,
      title,
      digest: `${phase}|${title}|${view.day}|${view.ap}|${body}`,
      options,
      actions,
      view,
    };
  };
  // Preact runs the effect that calls showModal() a frame after the element is
  // in the tree, so a dialog without `open` is still the surface on top.
  const dialog =
    document.querySelector("dialog[open]") ?? document.querySelector("dialog");
  if (dialog) {
    const title = dialog.getAttribute("aria-label") ?? "";
    const buttons = [...dialog.querySelectorAll("button")].filter(
      (b) => !b.disabled && !!text(b),
    );
    if (dialog.querySelector(".roll-content"))
      return build("roll", title, dialog, [], buttons);
    if (dialog.querySelector(".confirm-choice"))
      return build("confirm", title, dialog, [], buttons);
    if (dialog.querySelector(".debuff-choices"))
      return build(
        "debuff",
        title,
        dialog,
        [...dialog.querySelectorAll(".debuff-card")],
      );
    if (dialog.querySelector(".choices")) {
      const choices = [...dialog.querySelectorAll(".choices .choice")];
      // The funding prompt is the only one offering to stop the rotation.
      const phase = dialog.querySelector(".choices .choice.danger")
        ? "funding"
        : "collapse";
      return build(phase, title, dialog, choices);
    }
    if (dialog.querySelector(".modal-actions"))
      return build("recovery", title, dialog, [], buttons);
    return build("panel", title, dialog, [], buttons);
  }
  const ending = document.querySelector(".ending-page");
  if (ending) {
    const eyebrow = text(ending.querySelector(".ending-intro .eyebrow"));
    const snapshot = build("ending", text(ending.querySelector("h1")), ending, []);
    snapshot.ending = {
      // Endings are numbered END-28 since the forty story endings landed; the
      // older X25 form is still matched so an older build reads the same.
      id: (eyebrow.match(/END-\d+|[A-Z]\d+/) ?? [""])[0],
      title: text(ending.querySelector("h1")),
    };
    return snapshot;
  }
  const tribunal = document.querySelector(".tribunal-page");
  if (tribunal)
    return build("tribunal", text(tribunal.querySelector("h1")), tribunal, [
      ...tribunal.querySelectorAll(".last-question .choice"),
    ]);
  const talk = document.querySelector(".rpg-dialogue");
  if (talk) {
    const title = talk.getAttribute("aria-label") ?? "";
    const choices = [...talk.querySelectorAll(".dialogue-options button")];
    const forward = [
      ...talk.querySelectorAll(".dialogue-next, .dialogue-record"),
    ].filter((b) => !(b as HTMLButtonElement).disabled);
    if (choices.length || talk.querySelector(".graph-continue"))
      return build(
        "encounter",
        title,
        talk,
        choices,
        [...talk.querySelectorAll(".graph-continue")],
      );
    return build("talk", title, talk, [], forward);
  }
  const bedside = document.querySelector(".bedside-view");
  if (bedside)
    return build("bedside", bedside.getAttribute("aria-label") ?? "", bedside, [], [
      ...bedside.querySelectorAll(".bedside-back"),
    ]);
  const menu = document.querySelector(".rpg-map-menu");
  if (menu) {
    const title = menu.getAttribute("aria-label") ?? "";
    return build(
      title.includes("当班待办") ? "quests" : "menu",
      title,
      menu,
      [...menu.querySelectorAll(".rpg-menu-row")],
      [...menu.querySelectorAll(".rpg-menu-heading button")],
    );
  }
  const stage = document.querySelector(".world-stage");
  if (stage)
    return build(
      document.querySelector(".world-loading") ? "loading" : "map",
      text(document.querySelector(".rpg-location b")),
      document.querySelector(".rpg-location"),
      [],
    );
  const setup = document.querySelector(".setup-page");
  if (setup) return build("setup", "轮转登记", null, []);
  const title = document.querySelector(".rpg-title");
  if (title)
    return build("title", "TYCHE", null, [], [
      ...title.querySelectorAll(".rpg-title-menu button"),
    ]);
  return build("unknown", document.title, document.body, []);
}

/* ----------------------------------------------------------------- driver */

const wait = (page: Page, ms: number) => page.waitForTimeout(ms);
const mark = (index: number, prefix: string) =>
  `[data-autoplay="${prefix}${index}"]`;

async function read(page: Page): Promise<Snapshot> {
  return page.evaluate(probeScreen);
}
async function click(page: Page, selector: string): Promise<boolean> {
  const target = page.locator(selector).first();
  try {
    await target.click({ timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}
/** The save as the game wrote it, or null when nothing is stored yet. */
export async function readSave(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("tyche.save.1");
      if (!raw) return null;
      const envelope = JSON.parse(raw) as { payload?: string };
      return envelope.payload ? JSON.parse(envelope.payload) : envelope;
    } catch {
      return null;
    }
  });
}
function endingFromSave(save: unknown): { id: string; title: string } | null {
  const run = (save as { run?: { ending?: { id?: string; title?: string } } })
    ?.run;
  const ending = run?.ending;
  return ending?.id ? { id: ending.id, title: ending.title ?? "" } : null;
}

/** Start a fresh rotation from the title screen and take the talents. */
async function startRun(
  page: Page,
  seed: string,
  talents: number,
): Promise<string[]> {
  await page.goto("./");
  await page.getByRole("button", { name: "新的轮转", exact: true }).click();
  await page.getByLabel("轮转码", { exact: true }).fill(seed);
  const picked: string[] = [];
  for (let i = 0; i < talents; i++) {
    const card = page
      .locator(".talent-card")
      .filter({ has: page.locator("button.talent-select:enabled") })
      .filter({ hasNot: page.locator('button[aria-pressed="true"]') })
      .first();
    picked.push((await card.locator("h3").innerText()).trim());
    await card.locator("button.talent-select").click();
  }
  await page.getByRole("button", { name: "接过胸牌 →", exact: true }).click();
  await page.waitForSelector(".world-stage, .rpg-dialogue", { timeout: 60_000 });
  return picked;
}

export async function playRun(
  page: Page,
  options: RunOptions,
): Promise<RunReport> {
  const {
    seed,
    policy: policyName,
    talents = 3,
    maxMinutes = 25,
    outDir,
    label = `${seed}-${policyName}`,
    stallLimit = 14,
    stopWhen,
    writeJournal = true,
    reduceMotion = true,
  } = options;
  mkdirSync(outDir, { recursive: true });
  const policy = makePolicy(policyName, seed);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const size = page.viewportSize();
  const report: RunReport = {
    seed,
    policy: policyName,
    label,
    viewport: size ? `${size.width}x${size.height}` : "default",
    talents: [],
    finished: false,
    stuck: null,
    endDay: 0,
    ending: null,
    steps: 0,
    minutes: 0,
    pageErrors,
    consoleErrors,
    navigationFailures: [],
    shots: [],
    journal: [],
  };
  const started = Date.now();
  const deadline = started + maxMinutes * 60_000;
  const shots = new Set<string>();
  async function shoot(name: string) {
    const safe = name.replace(/[^\w.-]+/g, "-");
    if (shots.has(safe)) return;
    shots.add(safe);
    const fileName = `${safe}.jpg`;
    const file = resolve(outDir, fileName);
    mkdirSync(dirname(file), { recursive: true });
    try {
      // Ten runs of a fourteen-day rotation are checked in together, so the
      // quality is set where the ward and the HUD stay readable and the whole
      // set still fits in a repository.
      await page.screenshot({ path: file, type: "jpeg", quality: 55 });
      // Recorded as a bare file name: a checked-in journal must not carry the
      // absolute path of whichever machine produced it.
      report.shots.push(fileName);
    } catch {
      /* a closed page cannot be photographed */
    }
  }
  if (reduceMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  report.talents = await startRun(page, seed, talents);

  let step = 0;
  let stall = 0;
  let previous = "";
  let questOffset = 0;
  let recoveryWanted = false;
  let coffeeDay = 0;
  const decide = (kind: Decision, snapshot: Snapshot): OptionView =>
    snapshot.options.find(
      (o) => o.index === policy.pick(kind, snapshot.options, snapshot.view),
    ) ?? snapshot.options[0];
  const flush = () => {
    if (writeJournal)
      writeFileSync(
        resolve(outDir, "journal.json"),
        JSON.stringify(report, null, 2),
      );
  };
  const note = (snapshot: Snapshot, action: string) => {
    report.journal.push({
      step,
      t: Number(((Date.now() - started) / 1000).toFixed(1)),
      day: snapshot.view.day,
      phase: snapshot.phase,
      title: snapshot.title,
      action,
      ap: snapshot.view.ap,
      cash: snapshot.view.cash,
      vitals: Object.fromEntries(
        snapshot.view.vitals.map((v) => [v.label, v.now]),
      ),
    });
    // Flushed as the run goes, so a killed run still leaves a readable journal.
    if (report.journal.length % 25 === 0) flush();
  };

  while (Date.now() < deadline) {
    step += 1;
    report.steps = step;
    const s = await read(page);
    if (s.view.day > report.endDay) {
      report.endDay = s.view.day;
      await shoot(`day-${String(s.view.day).padStart(2, "0")}-map`);
    }
    if (stopWhen?.(s)) {
      report.stoppedAt = s;
      break;
    }
    if (s.digest === previous) stall += 1;
    else stall = 0;
    previous = s.digest;
    if (stall >= stallLimit) {
      report.stuck = {
        step,
        phase: s.phase,
        title: s.title,
        digest: s.digest,
      };
      await shoot(`stuck-step-${step}`);
      writeFileSync(
        resolve(outDir, "stuck.json"),
        JSON.stringify(
          {
            snapshot: s,
            dom: await page
              .locator("body")
              .innerHTML()
              .then((html) => html.slice(0, 20_000))
              .catch(() => ""),
            save: await readSave(page),
          },
          null,
          2,
        ),
      );
      break;
    }

    if (s.phase === "ending") {
      report.finished = true;
      report.ending =
        s.ending && s.ending.id
          ? s.ending
          : endingFromSave(await readSave(page));
      note(s, `结局 ${report.ending?.id ?? ""}`);
      await shoot(`ending-${report.ending?.id ?? "unknown"}`);
      break;
    }
    if (s.phase === "loading") {
      await wait(page, 400);
      continue;
    }
    if (s.phase === "roll") {
      const accept = s.actions.find((a) =>
        /接受结果|继续与第二拨家属沟通/.test(a.text),
      );
      const cast = s.actions.find((a) => /掷.*骰/.test(a.text));
      const reveal = s.actions.find((a) => /直接看点数/.test(a.text));
      const chosen = accept ?? cast ?? reveal;
      if (!chosen) {
        await wait(page, 400);
        continue;
      }
      note(s, chosen.label);
      await click(page, mark(chosen.index, "act-"));
      if (chosen === cast) await wait(page, 900);
      continue;
    }
    if (s.phase === "confirm") {
      const commit = s.actions.find((a) => /就这样做/.test(a.text));
      note(s, "确认");
      if (commit) await click(page, mark(commit.index, "act-"));
      else await click(page, "dialog .modal-actions .primary");
      continue;
    }
    if (s.phase === "recovery") {
      const yes = s.actions.find((a) => /^确认/.test(a.text));
      const no = s.actions.find((a) => /先不使用/.test(a.text));
      const chosen = recoveryWanted && yes ? yes : (no ?? yes);
      recoveryWanted = false;
      if (chosen) {
        note(s, chosen.label);
        await click(page, mark(chosen.index, "act-"));
      } else await page.keyboard.press("Escape");
      continue;
    }
    if (s.phase === "panel") {
      await page.keyboard.press("Escape");
      await wait(page, 200);
      continue;
    }
    if (
      s.phase === "debuff" ||
      s.phase === "funding" ||
      s.phase === "collapse" ||
      s.phase === "tribunal"
    ) {
      if (!s.options.length) {
        await wait(page, 300);
        continue;
      }
      await shoot(`day-${String(s.view.day).padStart(2, "0")}-${s.phase}`);
      const chosen = decide(s.phase, s);
      note(s, chosen.label);
      await click(page, mark(chosen.index, "opt-"));
      continue;
    }
    if (s.phase === "encounter") {
      if (!s.options.length) {
        const forward = s.actions[0];
        if (forward) {
          note(s, forward.label);
          await click(page, mark(forward.index, "act-"));
        } else await wait(page, 300);
        continue;
      }
      const chosen = decide("option", s);
      note(s, chosen.label);
      await click(page, mark(chosen.index, "opt-"));
      continue;
    }
    if (s.phase === "talk") {
      const forward = s.actions.find((a) => !/病历夹/.test(a.text));
      if (forward) {
        note(s, forward.label);
        await click(page, mark(forward.index, "act-"));
      } else await page.keyboard.press("Escape");
      continue;
    }
    if (s.phase === "bedside") {
      note(s, "返回病区");
      const back = s.actions[0];
      if (back) await click(page, mark(back.index, "act-"));
      else await click(page, ".bedside-back");
      continue;
    }
    if (s.phase === "menu") {
      if (!s.options.length) {
        await page.keyboard.press("Escape");
        continue;
      }
      const chosen = decide("quest", s);
      note(s, chosen.label);
      await click(page, mark(chosen.index, "opt-"));
      await settle(page);
      continue;
    }
    if (s.phase === "quests") {
      if (!s.options.length) {
        await page.keyboard.press("Escape");
        await wait(page, 400);
        continue;
      }
      const order = s.options
        .slice(questOffset % s.options.length)
        .concat(s.options.slice(0, questOffset % s.options.length));
      const chosen =
        order.find(
          (o) => o.index === policy.pick("quest", order, s.view),
        ) ?? order[0];
      note(s, `前往 ${chosen.label}`);
      await click(page, mark(chosen.index, "opt-"));
      const walk = await settle(page);
      if (!walk.arrived) {
        report.navigationFailures.push({
          day: s.view.day,
          task: chosen.label,
          moved: walk.moved,
        });
        await shoot(`nav-day-${String(s.view.day).padStart(2, "0")}-step-${step}`);
        questOffset += 1;
      } else questOffset = 0;
      continue;
    }
    if (s.phase === "map") {
      if (
        policy.wantsCoffee(s.view) &&
        coffeeDay !== s.view.day &&
        s.view.day > 0
      ) {
        coffeeDay = s.view.day;
        recoveryWanted = true;
        note(s, "前往咖啡台");
        await click(page, 'button[aria-label="打开病区地图"]');
        const ok = await click(
          page,
          '.hospital-overview .rpg-menu-row:has-text("咖啡")',
        );
        if (ok) await settle(page);
        else recoveryWanted = false;
        continue;
      }
      note(s, "打开当班待办");
      if (!(await click(page, ".rpg-quest-button button"))) await wait(page, 500);
      continue;
    }
    if (s.phase === "title") {
      // A finished or abandoned run left the board; nothing more to play.
      const save = await readSave(page);
      report.ending = endingFromSave(save);
      report.finished = !!report.ending;
      note(s, "回到标题");
      break;
    }
    await wait(page, 400);
  }
  report.minutes = Number(((Date.now() - started) / 60_000).toFixed(2));
  if (!report.finished && !report.stuck && Date.now() >= deadline)
    report.stuck = {
      step,
      phase: "unknown",
      title: "超出时间预算",
      digest: previous,
    };
  const save = await readSave(page);
  if (!report.ending) report.ending = endingFromSave(save);
  const savedDay = (save as { run?: { day?: number } })?.run?.day;
  if (typeof savedDay === "number") report.endDay = savedDay;
  await shoot(`final-${report.ending?.id ?? "unfinished"}`);
  flush();
  return report;
}

/**
 * The doctor's position as the game itself stores it. `run.world` is part of
 * the save format and is rewritten every time a walk ends, so comparing it
 * across a click tells a route that was never walked from one that was walked
 * and opened nothing.
 */
async function worldPosition(page: Page): Promise<string> {
  const save = (await readSave(page)) as {
    run?: { world?: { x: number; y: number } };
  } | null;
  const world = save?.run?.world;
  return world ? `${Math.round(world.x)},${Math.round(world.y)}` : "";
}

const ARRIVED =
  ".rpg-dialogue, .bedside-view, .rpg-map-menu, dialog, .tribunal-page, .ending-page";

/** What became of one walk. `moved` reads the position the game saved. */
export interface Settled {
  arrived: boolean;
  /** The saved position changed, so the doctor did walk somewhere. */
  moved: boolean;
}

/**
 * Waits for the walk to end. Any surface other than the bare map means the
 * doctor arrived somewhere; a map still open at the route deadline means
 * arrival was not observed. On that outcome the saved position says whether the doctor
 * walked at all, which separates a route the game refused to start from a
 * walk that ended without opening anything.
 */
async function settle(page: Page, timeout = 45_000): Promise<Settled> {
  const before = await worldPosition(page);
  const done = async (arrived: boolean): Promise<Settled> => ({
    arrived,
    moved: arrived || (await worldPosition(page)) !== before,
  });
  // The list closes itself on the click; wait for that before watching for a
  // new surface, or the list that is on its way out counts as an arrival.
  await page
    .waitForSelector(".rpg-map-menu", { state: "detached", timeout: 5_000 })
    .catch(() => {});
  const deadline = Date.now() + timeout;
  await wait(page, 500);
  while (Date.now() < deadline) {
    if (await page.locator(ARRIVED).count()) return done(true);
    // A clamped camera can produce identical samples while the doctor is
    // still crossing the room. Only the destination surface or the actual
    // route timeout establishes arrival/failure; sampled floor pixels do not.
    await wait(page, 260);
  }
  return done((await page.locator(ARRIVED).count()) > 0);
}
