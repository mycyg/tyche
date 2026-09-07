/**
 * Collects every autoplay journal under docs/autoplay and writes summary.md.
 *
 * Run after `npm run test:autoplay`:
 *   npx tsx scripts/autoplay-report.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

interface JournalEntry {
  step: number;
  day: number;
  phase: string;
  title: string;
  action: string;
}
interface RunReport {
  seed: string;
  policy: string;
  label: string;
  viewport: string;
  talents: string[];
  finished: boolean;
  stuck: null | { step: number; phase: string; title: string };
  endDay: number;
  ending: { id: string; title: string } | null;
  steps: number;
  minutes: number;
  pageErrors: string[];
  consoleErrors: string[];
  navigationFailures: { day: number; task: string; moved?: boolean }[];
  shots: string[];
  journal: JournalEntry[];
}

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "docs/autoplay");

function journals(): { dir: string; report: RunReport }[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(out);
  } catch {
    return [];
  }
  const found: { dir: string; report: RunReport }[] = [];
  for (const name of entries) {
    const dir = resolve(out, name);
    if (!statSync(dir).isDirectory()) continue;
    const file = resolve(dir, "journal.json");
    try {
      found.push({ dir, report: JSON.parse(readFileSync(file, "utf8")) });
    } catch {
      /* a directory without a finished journal */
    }
  }
  return found.sort((a, b) => a.report.label.localeCompare(b.report.label));
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
/** Journals record bare file names, so a link is the run directory plus one. */
const link = (dir: string, file: string) =>
  `[${file.split("/").pop()}](${relative(out, dir)}/${file.split("/").pop()})`;

function lastShot(report: RunReport, dir: string): string {
  const final = report.shots.find((s) => s.includes("final-"));
  const shot = final ?? report.shots.at(-1);
  return shot ? link(dir, shot) : "无";
}

const runs = journals();
const lines: string[] = [];
lines.push("# 自动通关记录");
lines.push("");
lines.push(
  "由 `npm run test:autoplay` 跑完，再用 `npx tsx scripts/autoplay-report.ts` 汇总。驱动器只通过真实界面操作：读屏、点按钮、再读屏，不调用引擎。每个目录下有 `journal.json`（逐步记录）与截图。",
);
lines.push("");
lines.push("## 多局汇总");
lines.push("");
lines.push(
  "| 种子 | 策略 | 视口 | 结束日 | 结局 | 卡死点 | 步数 | 用时（分钟） | pageerror | 控制台错误 | 末屏 |",
);
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const { dir, report } of runs)
  lines.push(
    `| ${cell(report.seed)} | ${report.policy} | ${report.viewport} | ${report.endDay} | ${
      report.ending ? cell(`${report.ending.id} ${report.ending.title}`) : "未到达结局"
    } | ${
      report.stuck
        ? cell(`第 ${report.stuck.step} 步 · ${report.stuck.phase} · ${report.stuck.title}`)
        : "无"
    } | ${report.steps} | ${report.minutes} | ${report.pageErrors.length} | ${
      report.consoleErrors.length
    } | ${lastShot(report, dir)} |`,
  );
lines.push("");
lines.push("## 每局细节");
lines.push("");
for (const { dir, report } of runs) {
  const days = new Set(report.journal.map((j) => j.day).filter((d) => d > 0));
  lines.push(`### ${cell(report.label)}`);
  lines.push("");
  lines.push(`- 目录：\`${relative(out, dir)}\``);
  lines.push(`- 天赋：${report.talents.map(cell).join("、") || "未记录"}`);
  lines.push(
    `- 走到的最大天数：${Math.max(0, ...days)}；提交的选择：${report.journal.filter((j) => j.phase === "encounter").length} 次`,
  );
  lines.push(
    `- 前往待办失败：${
      report.navigationFailures.length
        ? report.navigationFailures
            .map(
              (f) =>
                `第 ${f.day} 天「${cell(f.task)}」（${f.moved === undefined ? "位置未记录" : f.moved ? "人物走动过，但没有任何界面打开" : "人物没有移动"}）`,
            )
            .join("；")
        : "无"
    }`,
  );
  if (report.pageErrors.length)
    lines.push(`- 页面脚本异常：${report.pageErrors.map(cell).join("；")}`);
  if (report.consoleErrors.length)
    lines.push(
      `- 控制台错误（前 5 条）：${report.consoleErrors.slice(0, 5).map(cell).join("；")}`,
    );
  lines.push(
    `- 截图：${report.shots.map((s) => link(dir, s)).join("、") || "无"}`,
  );
  lines.push("");
}
writeFileSync(resolve(out, "summary.md"), `${lines.join("\n")}\n`);
console.log(`autoplay summary: ${runs.length} runs → docs/autoplay/summary.md`);
