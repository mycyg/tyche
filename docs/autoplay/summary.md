# 自动通关记录

由 `npm run test:autoplay` 跑完，再用 `npx tsx scripts/autoplay-report.ts` 汇总。驱动器只通过真实界面操作：读屏、点按钮、再读屏，不调用引擎。每个目录下有 `journal.json`（逐步记录）与截图。

## 多局汇总

| 种子 | 策略 | 视口 | 结束日 | 结局 | 卡死点 | 步数 | 用时（分钟） | pageerror | 控制台错误 | 末屏 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| autoplay-alpha | careful | 1440x900 | 9 | X25 解除劳动合同 | 无 | 323 | 4.06 | 0 | 0 | [final-X25.jpg](autoplay-alpha-careful-autoplay-desktop/final-X25.jpg) |
| autoplay-alpha | careful | 844x390 | 9 | X25 解除劳动合同 | 无 | 322 | 3.83 | 0 | 0 | [final-X25.jpg](autoplay-alpha-careful-autoplay-landscape/final-X25.jpg) |
| autoplay-alpha | careful | 390x844 | 9 | X25 解除劳动合同 | 无 | 322 | 3.84 | 0 | 0 | [final-X25.jpg](autoplay-alpha-careful-autoplay-portrait/final-X25.jpg) |
| autoplay-alpha | random | 1440x900 | 9 | X25 解除劳动合同 | 无 | 446 | 4.2 | 0 | 0 | [final-X25.jpg](autoplay-alpha-random-autoplay-desktop/final-X25.jpg) |
| autoplay-alpha | reckless | 1440x900 | 10 | X25 解除劳动合同 | 无 | 583 | 5.56 | 0 | 0 | [final-X25.jpg](autoplay-alpha-reckless-autoplay-desktop/final-X25.jpg) |
| autoplay-beta | careful | 1440x900 | 8 | X25 解除劳动合同 | 无 | 511 | 5.61 | 0 | 0 | [final-X25.jpg](autoplay-beta-careful-autoplay-desktop/final-X25.jpg) |
| autoplay-beta | random | 1440x900 | 3 | X17 值班室 | 无 | 311 | 3.73 | 0 | 0 | [final-X17.jpg](autoplay-beta-random-autoplay-desktop/final-X17.jpg) |
| autoplay-beta | reckless | 1440x900 | 9 | X25 解除劳动合同 | 无 | 587 | 6.94 | 0 | 0 | [final-X25.jpg](autoplay-beta-reckless-autoplay-desktop/final-X25.jpg) |

## 每局细节

### autoplay-alpha · careful · autoplay-desktop

- 目录：`autoplay-alpha-careful-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：57 次
- 前往待办失败：第 1 天「接诊」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-01-map.jpg)、[nav-day-01-step-28.jpg](autoplay-alpha-careful-autoplay-desktop/nav-day-01-step-28.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-09-funding.jpg)、[ending-X25.jpg](autoplay-alpha-careful-autoplay-desktop/ending-X25.jpg)、[final-X25.jpg](autoplay-alpha-careful-autoplay-desktop/final-X25.jpg)

### autoplay-alpha · careful · autoplay-landscape

- 目录：`autoplay-alpha-careful-autoplay-landscape`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：57 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-09-funding.jpg)、[ending-X25.jpg](autoplay-alpha-careful-autoplay-landscape/ending-X25.jpg)、[final-X25.jpg](autoplay-alpha-careful-autoplay-landscape/final-X25.jpg)

### autoplay-alpha · careful · autoplay-portrait

- 目录：`autoplay-alpha-careful-autoplay-portrait`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：57 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-09-funding.jpg)、[ending-X25.jpg](autoplay-alpha-careful-autoplay-portrait/ending-X25.jpg)、[final-X25.jpg](autoplay-alpha-careful-autoplay-portrait/final-X25.jpg)

### autoplay-alpha · random · autoplay-desktop

- 目录：`autoplay-alpha-random-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：84 次
- 前往待办失败：第 1 天「接诊」（人物没有移动）；第 6 天「短信」（人物没有移动）；第 8 天「隔壁组」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-alpha-random-autoplay-desktop/day-01-map.jpg)、[nav-day-01-step-31.jpg](autoplay-alpha-random-autoplay-desktop/nav-day-01-step-31.jpg)、[day-01-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-random-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-random-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-random-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-random-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-random-autoplay-desktop/day-06-map.jpg)、[nav-day-06-step-295.jpg](autoplay-alpha-random-autoplay-desktop/nav-day-06-step-295.jpg)、[day-06-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-random-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-random-autoplay-desktop/day-08-map.jpg)、[nav-day-08-step-407.jpg](autoplay-alpha-random-autoplay-desktop/nav-day-08-step-407.jpg)、[day-08-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-random-autoplay-desktop/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-09-funding.jpg)、[ending-X25.jpg](autoplay-alpha-random-autoplay-desktop/ending-X25.jpg)、[final-X25.jpg](autoplay-alpha-random-autoplay-desktop/final-X25.jpg)

### autoplay-alpha · reckless · autoplay-desktop

- 目录：`autoplay-alpha-reckless-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：10；提交的选择：122 次
- 前往待办失败：第 1 天「接诊」（人物没有移动）；第 8 天「隔壁组」（人物没有移动）；第 10 天「问诊」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-01-map.jpg)、[nav-day-01-step-31.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-01-step-31.jpg)、[day-01-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-map.jpg)、[nav-day-08-step-308.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-08-step-308.jpg)、[day-08-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-funding.jpg)、[day-09-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-debuff.jpg)、[day-10-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-10-map.jpg)、[nav-day-10-step-455.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-10-step-455.jpg)、[ending-X25.jpg](autoplay-alpha-reckless-autoplay-desktop/ending-X25.jpg)、[final-X25.jpg](autoplay-alpha-reckless-autoplay-desktop/final-X25.jpg)

### autoplay-beta · careful · autoplay-desktop

- 目录：`autoplay-beta-careful-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：8；提交的选择：107 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-beta-careful-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-careful-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-careful-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-beta-careful-autoplay-desktop/day-04-map.jpg)、[day-04-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-04-funding.jpg)、[day-04-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-beta-careful-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-05-funding.jpg)、[day-06-map.jpg](autoplay-beta-careful-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-06-funding.jpg)、[day-07-map.jpg](autoplay-beta-careful-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-07-funding.jpg)、[day-08-map.jpg](autoplay-beta-careful-autoplay-desktop/day-08-map.jpg)、[ending-X25.jpg](autoplay-beta-careful-autoplay-desktop/ending-X25.jpg)、[final-X25.jpg](autoplay-beta-careful-autoplay-desktop/final-X25.jpg)

### autoplay-beta · random · autoplay-desktop

- 目录：`autoplay-beta-random-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：3；提交的选择：72 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-beta-random-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-random-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-random-autoplay-desktop/day-02-map.jpg)、[day-02-funding.jpg](autoplay-beta-random-autoplay-desktop/day-02-funding.jpg)、[day-02-debuff.jpg](autoplay-beta-random-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-random-autoplay-desktop/day-03-map.jpg)、[ending-X17.jpg](autoplay-beta-random-autoplay-desktop/ending-X17.jpg)、[final-X17.jpg](autoplay-beta-random-autoplay-desktop/final-X17.jpg)

### autoplay-beta · reckless · autoplay-desktop

- 目录：`autoplay-beta-reckless-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：9；提交的选择：126 次
- 前往待办失败：第 4 天「接诊」（人物没有移动）；第 5 天「示教室」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-04-map.jpg)、[nav-day-04-step-311.jpg](autoplay-beta-reckless-autoplay-desktop/nav-day-04-step-311.jpg)、[day-04-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-05-map.jpg)、[nav-day-05-step-420.jpg](autoplay-beta-reckless-autoplay-desktop/nav-day-05-step-420.jpg)、[day-06-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-06-funding.jpg)、[day-07-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-07-funding.jpg)、[day-08-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-map.jpg)、[day-08-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-09-map.jpg)、[ending-X25.jpg](autoplay-beta-reckless-autoplay-desktop/ending-X25.jpg)、[final-X25.jpg](autoplay-beta-reckless-autoplay-desktop/final-X25.jpg)

