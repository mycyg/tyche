# 自动通关记录

由 `npm run test:autoplay` 跑完，再用 `npx tsx scripts/autoplay-report.ts` 汇总。驱动器只通过真实界面操作：读屏、点按钮、再读屏，不调用引擎。每个目录下有 `journal.json`（逐步记录）与截图。

## 多局汇总

| 种子 | 策略 | 视口 | 结束日 | 结局 | 卡死点 | 步数 | 用时（分钟） | pageerror | 控制台错误 | 末屏 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| autoplay-alpha | careful | 1440x900 | 9 | END-28 骆驼祥子 | 无 | 328 | 3.96 | 0 | 0 | [final-END-28.jpg](autoplay-alpha-careful-autoplay-desktop/final-END-28.jpg) |
| autoplay-alpha | careful | 844x390 | 9 | END-28 骆驼祥子 | 无 | 328 | 3.84 | 0 | 0 | [final-END-28.jpg](autoplay-alpha-careful-autoplay-landscape/final-END-28.jpg) |
| autoplay-alpha | careful | 390x844 | 9 | END-28 骆驼祥子 | 无 | 328 | 3.83 | 0 | 0 | [final-END-28.jpg](autoplay-alpha-careful-autoplay-portrait/final-END-28.jpg) |
| autoplay-alpha | random | 1440x900 | 8 | END-05 伪君子 | 无 | 412 | 3.59 | 0 | 0 | [final-END-05.jpg](autoplay-alpha-random-autoplay-desktop/final-END-05.jpg) |
| autoplay-alpha | reckless | 1440x900 | 11 | END-01 罪与罚 | 无 | 612 | 5.87 | 0 | 0 | [final-END-01.jpg](autoplay-alpha-reckless-autoplay-desktop/final-END-01.jpg) |
| autoplay-beta | careful | 1440x900 | 9 | END-28 骆驼祥子 | 无 | 562 | 6.43 | 0 | 0 | [final-END-28.jpg](autoplay-beta-careful-autoplay-desktop/final-END-28.jpg) |
| autoplay-beta | random | 1440x900 | 3 | END-01 罪与罚 | 无 | 361 | 4.54 | 0 | 0 | [final-END-01.jpg](autoplay-beta-random-autoplay-desktop/final-END-01.jpg) |
| autoplay-beta | reckless | 1440x900 | 9 | END-01 罪与罚 | 无 | 620 | 7.09 | 0 | 0 | [final-END-01.jpg](autoplay-beta-reckless-autoplay-desktop/final-END-01.jpg) |

## 每局细节

### autoplay-alpha · careful · autoplay-desktop

- 目录：`autoplay-alpha-careful-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：59 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-desktop/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-desktop/day-09-funding.jpg)、[ending-END-28.jpg](autoplay-alpha-careful-autoplay-desktop/ending-END-28.jpg)、[final-END-28.jpg](autoplay-alpha-careful-autoplay-desktop/final-END-28.jpg)

### autoplay-alpha · careful · autoplay-landscape

- 目录：`autoplay-alpha-careful-autoplay-landscape`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：59 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-landscape/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-landscape/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-landscape/day-09-funding.jpg)、[ending-END-28.jpg](autoplay-alpha-careful-autoplay-landscape/ending-END-28.jpg)、[final-END-28.jpg](autoplay-alpha-careful-autoplay-landscape/final-END-28.jpg)

### autoplay-alpha · careful · autoplay-portrait

- 目录：`autoplay-alpha-careful-autoplay-portrait`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：9；提交的选择：59 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-map.jpg)、[day-08-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-careful-autoplay-portrait/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-careful-autoplay-portrait/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-careful-autoplay-portrait/day-09-funding.jpg)、[ending-END-28.jpg](autoplay-alpha-careful-autoplay-portrait/ending-END-28.jpg)、[final-END-28.jpg](autoplay-alpha-careful-autoplay-portrait/final-END-28.jpg)

### autoplay-alpha · random · autoplay-desktop

- 目录：`autoplay-alpha-random-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：8；提交的选择：83 次
- 前往待办失败：第 1 天「接诊」（人物没有移动）；第 6 天「短信」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-alpha-random-autoplay-desktop/day-01-map.jpg)、[nav-day-01-step-31.jpg](autoplay-alpha-random-autoplay-desktop/nav-day-01-step-31.jpg)、[day-01-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-random-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-random-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-random-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-random-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-random-autoplay-desktop/day-06-map.jpg)、[nav-day-06-step-290.jpg](autoplay-alpha-random-autoplay-desktop/nav-day-06-step-290.jpg)、[day-06-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-random-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-random-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-random-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-random-autoplay-desktop/day-08-map.jpg)、[ending-END-05.jpg](autoplay-alpha-random-autoplay-desktop/ending-END-05.jpg)、[final-END-05.jpg](autoplay-alpha-random-autoplay-desktop/final-END-05.jpg)

### autoplay-alpha · reckless · autoplay-desktop

- 目录：`autoplay-alpha-reckless-autoplay-desktop`
- 天赋：美化、主任的人、抄规范
- 走到的最大天数：11；提交的选择：127 次
- 前往待办失败：第 1 天「接诊」（人物没有移动）；第 8 天「隔壁组」（人物没有移动）；第 10 天「问诊」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-01-map.jpg)、[nav-day-01-step-31.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-01-step-31.jpg)、[day-01-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-funding.jpg)、[day-05-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-05-debuff.jpg)、[day-06-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-funding.jpg)、[day-06-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-06-debuff.jpg)、[day-07-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-funding.jpg)、[day-07-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-07-debuff.jpg)、[day-08-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-map.jpg)、[nav-day-08-step-308.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-08-step-308.jpg)、[day-08-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-map.jpg)、[day-09-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-funding.jpg)、[day-09-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-09-debuff.jpg)、[day-10-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-10-map.jpg)、[nav-day-10-step-455.jpg](autoplay-alpha-reckless-autoplay-desktop/nav-day-10-step-455.jpg)、[day-10-funding.jpg](autoplay-alpha-reckless-autoplay-desktop/day-10-funding.jpg)、[day-10-debuff.jpg](autoplay-alpha-reckless-autoplay-desktop/day-10-debuff.jpg)、[day-11-map.jpg](autoplay-alpha-reckless-autoplay-desktop/day-11-map.jpg)、[ending-END-01.jpg](autoplay-alpha-reckless-autoplay-desktop/ending-END-01.jpg)、[final-END-01.jpg](autoplay-alpha-reckless-autoplay-desktop/final-END-01.jpg)

### autoplay-beta · careful · autoplay-desktop

- 目录：`autoplay-beta-careful-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：9；提交的选择：116 次
- 前往待办失败：第 9 天「约谈」（人物没有移动）
- 截图：[day-01-map.jpg](autoplay-beta-careful-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-careful-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-careful-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-beta-careful-autoplay-desktop/day-04-map.jpg)、[day-04-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-04-funding.jpg)、[day-04-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-beta-careful-autoplay-desktop/day-05-map.jpg)、[day-05-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-05-funding.jpg)、[day-06-map.jpg](autoplay-beta-careful-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-06-funding.jpg)、[day-07-map.jpg](autoplay-beta-careful-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-07-funding.jpg)、[day-08-map.jpg](autoplay-beta-careful-autoplay-desktop/day-08-map.jpg)、[day-08-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-beta-careful-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-beta-careful-autoplay-desktop/day-09-map.jpg)、[nav-day-09-step-546.jpg](autoplay-beta-careful-autoplay-desktop/nav-day-09-step-546.jpg)、[day-09-funding.jpg](autoplay-beta-careful-autoplay-desktop/day-09-funding.jpg)、[ending-END-28.jpg](autoplay-beta-careful-autoplay-desktop/ending-END-28.jpg)、[final-END-28.jpg](autoplay-beta-careful-autoplay-desktop/final-END-28.jpg)

### autoplay-beta · random · autoplay-desktop

- 目录：`autoplay-beta-random-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：3；提交的选择：85 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-beta-random-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-random-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-random-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-beta-random-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-random-autoplay-desktop/day-03-map.jpg)、[ending-END-01.jpg](autoplay-beta-random-autoplay-desktop/ending-END-01.jpg)、[final-END-01.jpg](autoplay-beta-random-autoplay-desktop/final-END-01.jpg)

### autoplay-beta · reckless · autoplay-desktop

- 目录：`autoplay-beta-reckless-autoplay-desktop`
- 天赋：老病历、二十分钟、主任的人
- 走到的最大天数：9；提交的选择：135 次
- 前往待办失败：无
- 截图：[day-01-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-01-map.jpg)、[day-01-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-01-debuff.jpg)、[day-02-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-02-map.jpg)、[day-02-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-02-debuff.jpg)、[day-03-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-03-map.jpg)、[day-03-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-03-debuff.jpg)、[day-04-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-04-map.jpg)、[day-04-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-04-debuff.jpg)、[day-05-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-05-map.jpg)、[day-06-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-06-map.jpg)、[day-06-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-06-funding.jpg)、[day-07-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-07-map.jpg)、[day-07-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-07-funding.jpg)、[day-08-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-map.jpg)、[day-08-funding.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-funding.jpg)、[day-08-debuff.jpg](autoplay-beta-reckless-autoplay-desktop/day-08-debuff.jpg)、[day-09-map.jpg](autoplay-beta-reckless-autoplay-desktop/day-09-map.jpg)、[ending-END-01.jpg](autoplay-beta-reckless-autoplay-desktop/ending-END-01.jpg)、[final-END-01.jpg](autoplay-beta-reckless-autoplay-desktop/final-END-01.jpg)

