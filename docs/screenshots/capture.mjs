// Temporary screenshot capture script for the README galleries.
// Usage: TYCHE_SHARP_HOME=<dir with `npm install sharp` run> node docs/screenshots/capture.mjs
// Requires the production build served at http://127.0.0.1:5197/tyche/
// (TYCHE_ALLOW_MISSING_VOICE=1 npm run build && npm run preview -- --port 5197 --strictPort).
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:5197/tyche/";
const SHARP_HOME = process.env.TYCHE_SHARP_HOME;
if (!SHARP_HOME) {
  console.error("Set TYCHE_SHARP_HOME to a directory where `npm install sharp` has been run (kept outside this repo).");
  process.exit(1);
}
const require = createRequire(path.join(SHARP_HOME, "noop.cjs"));
const sharp = require("sharp");

async function saveWebp(buffer, name, maxWidth) {
  const outPath = path.join(__dirname, `${name}.webp`);
  const qualities = [82, 75, 65, 55, 45];
  let final = null;
  for (const quality of qualities) {
    const out = await sharp(buffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    final = out;
    if (out.byteLength <= 300 * 1024) break;
  }
  await sharp(final).toFile(outPath);
  console.log(`${name}.webp  ${(final.byteLength / 1024).toFixed(0)} KB`);
}

async function shot(page, name, maxWidth) {
  const buffer = await page.screenshot({ type: "png" });
  await saveWebp(buffer, name, maxWidth);
}

async function pickThreeTalents(page) {
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: /^选入/ })
      .and(page.locator(":enabled"))
      .first()
      .click();
    await page.waitForTimeout(150);
  }
}

/** Runs the shared opener: title -> new rotation -> talent draw -> pick 3 -> badge -> skip guide -> settle on the ward map. */
async function introFlow(page, { titleShot, talentShot, mapShot, maxWidth }) {
  await page.goto(BASE);
  await page.getByRole("heading", { name: "TYCHE" }).waitFor();
  await page.waitForTimeout(400);
  if (titleShot) await shot(page, titleShot, maxWidth);

  await page.getByRole("button", { name: "新的轮转", exact: true }).click();
  await page.locator(".talent-grid").waitFor();
  await page.waitForTimeout(300);
  if (talentShot) await shot(page, talentShot, maxWidth);

  await pickThreeTalents(page);
  await page.getByRole("button", { name: "接过胸牌 →", exact: true }).click();
  await page
    .getByRole("button", { name: "我熟悉操作，跳过指引", exact: true })
    .click();
  await expectWorldReady(page);
  await page.waitForTimeout(6000);
  if (mapShot) await shot(page, mapShot, maxWidth);
}

async function expectWorldReady(page) {
  await page.getByRole("region", { name: "南屏医院", exact: true }).waitFor();
  await page.locator(".world-loading").waitFor({ state: "detached" }).catch(() => {});
}

/** Opens the first agenda item and waits for the bedside dialogue, clicking the
 * interact button as a fallback if arrival does not auto-open it. */
async function openBedside(page) {
  await page.getByRole("button", { name: /当班待办/ }).click();
  const agenda = page.getByRole("dialog", { name: "当班待办", exact: true });
  await agenda.waitFor();
  await agenda.locator(".rpg-menu-row").first().click();

  const dialogue = page.locator(".rpg-dialogue");
  try {
    await dialogue.waitFor({ timeout: 8000 });
  } catch {
    const interact = page.locator(".rpg-interact:not([disabled])");
    if (await interact.count()) await interact.click();
    await dialogue.waitFor({ timeout: 20000 });
  }
  await page.waitForTimeout(500);
}

/** Looks for a dialogue option carrying a "检定" (check) tag, following a
 * bounded number of narrative "continue" nodes first. Returns true if a dice
 * roll was captured. */
async function tryDiceCapture(page, name, maxWidth) {
  const checkOption = page.locator(".dialogue-option").filter({ has: page.locator(".check-tag") });
  const continueButton = page.locator(".graph-continue");
  let found = false;
  for (let i = 0; i < 6; i++) {
    if (await checkOption.count()) { found = true; break; }
    if (await continueButton.count()) {
      await continueButton.first().click();
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
  if (!found) {
    console.log(`${name}: skipped - no dialogue option with a 检定 tag was reachable from this patient's opening node.`);
    return false;
  }
  await checkOption.first().click();
  await page.getByRole("button", { name: "就这样做", exact: true }).click();
  await page.getByRole("button", { name: "掷二十面骰", exact: true }).click();
  await page.locator(".roll-result").waitFor({ timeout: 6000 });
  await page.waitForTimeout(300);
  await shot(page, name, maxWidth);
  await page.getByRole("button", { name: "接受结果 →", exact: true }).click();
  return true;
}

async function closeDialogueIfOpen(page) {
  // Right after a dice roll the dialogue is in its "feedback" state, which has
  // no close button by design (the result must be acknowledged first). Click
  // through its continue button until the regular "结束交谈" close button
  // (or nothing at all) is left.
  const closeButton = page.getByRole("button", { name: "结束交谈", exact: true });
  const continueButton = page.locator(".rpg-dialogue .dialogue-next");
  for (let i = 0; i < 5; i++) {
    if (!(await page.locator(".rpg-dialogue").count())) return;
    if (await closeButton.count()) {
      await closeButton.click();
      await page.waitForTimeout(300);
      return;
    }
    if (await continueButton.count()) {
      await continueButton.first().click();
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
  console.log("closeDialogueIfOpen: gave up with a dialogue still on screen.");
}

async function captureSchedule(page, name, maxWidth) {
  await page.getByRole("button", { name: "暂停与设置", exact: true }).click();
  await page.getByRole("button", { name: "查看排班表", exact: true }).click();
  await page.locator(".schedule-view, .rpg-schedule, dialog[open]").first().waitFor();
  await page.waitForTimeout(300);
  await shot(page, name, maxWidth);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
}

async function captureEnding(page, id, name, maxWidth) {
  await page.goto(`${BASE}?preview-ending=${id}`);
  await page.locator(".ending-page-story").waitFor();
  await page.waitForTimeout(600);
  await shot(page, name, maxWidth);
}

async function captureSupportCard(page, name, maxWidth) {
  const card = page.locator(".ending-support");
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, name, maxWidth);
}

async function main() {
  const browser = await chromium.launch();

  // --- Desktop 1440x900 ---
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await desktop.newPage();
  await introFlow(page, {
    titleShot: "01-title",
    talentShot: "02-talents",
    mapShot: "03-ward-map",
    maxWidth: 1440,
  });
  await openBedside(page);
  await shot(page, "04-bedside", 1440);
  await tryDiceCapture(page, "05-dice", 1440);
  await closeDialogueIfOpen(page);
  await captureSchedule(page, "06-schedule", 1440);
  await captureEnding(page, "END-12", "07-ending-end12", 1440);
  await captureSupportCard(page, "08-support-card", 1440);
  await captureEnding(page, "END-40", "09-ending-end40", 1440);
  await desktop.close();

  // --- Mobile portrait 390x844 ---
  const portrait = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const mobilePage = await portrait.newPage();
  await introFlow(mobilePage, {
    titleShot: "10-mobile-title",
    mapShot: "11-mobile-ward-map",
    maxWidth: 780,
  });
  await openBedside(mobilePage);
  await shot(mobilePage, "12-mobile-bedside", 780);
  await portrait.close();

  // --- Mobile landscape 844x390 ---
  const landscape = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const landscapePage = await landscape.newPage();
  await introFlow(landscapePage, { mapShot: "13-landscape-ward-map", maxWidth: 780 });
  await landscape.close();

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
