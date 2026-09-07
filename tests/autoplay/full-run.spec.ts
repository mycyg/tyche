import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { playRun, readSave, type Snapshot } from "./autoplay";
import { POLICY_NAMES } from "./policies";

const OUT = resolve(import.meta.dirname, "../../docs/autoplay");
const SEEDS = ["autoplay-alpha", "autoplay-beta"];
/** The run that the regression assertion is written against. */
const REGRESSION = { seed: SEEDS[0], policy: "careful" as const };

const settledRoll = (s: Snapshot) =>
  s.phase === "roll" &&
  s.actions.some((a) => /接受结果|继续与第二拨家属沟通/.test(a.text));

for (const seed of SEEDS)
  for (const policy of POLICY_NAMES) {
    const regression = seed === REGRESSION.seed && policy === REGRESSION.policy;
    test(`full run · ${policy} · ${seed}${regression ? " · 回归：25 分钟内到达结局且无 pageerror" : ""}`, async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== "autoplay-desktop",
        "matrix runs are desktop only",
      );
      const report = await playRun(page, {
        seed,
        policy,
        maxMinutes: 25,
        outDir: resolve(OUT, `${seed}-${policy}-${info.project.name}`),
        label: `${seed} · ${policy} · ${info.project.name}`,
      });
      info.annotations.push({
        type: "result",
        description: `day ${report.endDay} · ${report.ending?.id ?? "无结局"} · ${report.steps} steps · ${report.minutes} min`,
      });
      expect(report.pageErrors, "页面脚本异常").toEqual([]);
      if (regression) {
        expect(report.stuck, "回归局卡死").toBeNull();
        expect(report.finished, "回归局未到达结局页").toBe(true);
        expect(report.ending?.id, "结局编号缺失").toBeTruthy();
      }
    });
  }

for (const project of ["autoplay-portrait", "autoplay-landscape"])
  test(`full run · careful · 触屏 ${project}`, async ({ page }, info) => {
    test.skip(info.project.name !== project, "one run per touch layout");
    const report = await playRun(page, {
      seed: SEEDS[0],
      policy: "careful",
      maxMinutes: 25,
      outDir: resolve(OUT, `${SEEDS[0]}-careful-${project}`),
      label: `${SEEDS[0]} · careful · ${project}`,
    });
    info.annotations.push({
      type: "result",
      description: `day ${report.endDay} · ${report.ending?.id ?? "无结局"} · ${report.steps} steps · ${report.minutes} min`,
    });
    expect(report.pageErrors, "页面脚本异常").toEqual([]);
  });

test("刷新后掷骰点数不变", async ({ page }, info) => {
  test.skip(info.project.name !== "autoplay-desktop", "desktop regression");
  const report = await playRun(page, {
    seed: "autoplay-roll",
    policy: "careful",
    maxMinutes: 10,
    writeJournal: false,
    outDir: resolve(OUT, "regression-roll-refresh"),
    stopWhen: settledRoll,
  });
  expect(report.stoppedAt, "本局没有走到任何一次掷骰").toBeTruthy();
  const face = await page.locator(".roll-result b").innerText();
  const label = await page.locator("dialog[open]").getAttribute("aria-label");

  await page.reload();
  await page.getByRole("button", { name: /继续轮转/ }).click();
  const roll = page.locator("dialog[open] .roll-content");
  await expect(roll).toBeVisible();
  expect(await page.locator("dialog[open]").getAttribute("aria-label")).toBe(
    label,
  );
  await roll.getByRole("button", { name: "掷二十面骰" }).click();
  await page.waitForTimeout(600);
  const reveal = roll.getByRole("button", { name: "直接看点数" });
  if (await reveal.count()) await reveal.click();
  await expect(page.locator(".roll-result b")).toHaveText(face, {
    timeout: 25_000,
  });
  expect(report.pageErrors).toEqual([]);
});

test("存档导出再导入能继续", async ({ page }, info) => {
  test.skip(info.project.name !== "autoplay-desktop", "desktop regression");
  let seen = 0;
  const report = await playRun(page, {
    seed: "autoplay-save",
    policy: "careful",
    maxMinutes: 10,
    writeJournal: false,
    outDir: resolve(OUT, "regression-save-roundtrip"),
    // Play a while, then stop on a quiet ward screen with nothing pending.
    stopWhen: (s) => (seen += 1) > 60 && s.phase === "map",
  });
  expect(report.stoppedAt, "没有走到可导出的病区画面").toBeTruthy();
  const before = (await readSave(page)) as {
    run: { day: number; cursor: number; phase: string; seed: string };
  };

  await page.getByRole("button", { name: "暂停与设置", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出全部进度", exact: true }).click(),
  ]);
  const file = await download.path();
  expect(file, "导出未产生文件").toBeTruthy();

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: /继续轮转/ })).toHaveCount(0);
  await page.getByRole("button", { name: "设置与存档", exact: true }).click();
  await page
    .locator('.import-label input[type="file"]')
    .setInputFiles(file as string);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await page.getByRole("button", { name: /继续轮转/ }).click();
  await expect(
    page.locator(".world-stage, .rpg-dialogue, dialog[open], .tribunal-page"),
  ).not.toHaveCount(0);
  const after = (await readSave(page)) as typeof before;
  expect(after.run.seed).toBe(before.run.seed);
  expect(after.run.day).toBe(before.run.day);
  expect(after.run.cursor).toBe(before.run.cursor);
  expect(after.run.phase).toBe(before.run.phase);
  expect(report.pageErrors).toEqual([]);
});
