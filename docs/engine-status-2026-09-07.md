# 引擎缺陷核实与处理 · 2026-09-07

分支 `wt/engine`。对照《审查报告_2026-09-06_附件/01_引擎与经济.md》E-01～E-30 逐条核实。证据来自工作树上重跑的探针（`probe1.ts`／`probe2.ts` 的场景在 `src/game/engine-rules.test.ts` 里重写为经 `act()` 的测试）与 `npm run simulate`。「已修（检查点）」指 df614ef 检查点已含修复，本轮只补测试；「本轮修」指本分支的改动。

| 编号 | 状态 | 证据 | 处理 |
|---|---|---|---|
| E-01 | 已修（检查点） | 结算阶段 SAN 归零、队列下一张为夜班卡：三个种子 × a/c 两项均得 X21，不再抛错；`interruptionPhase` 以实际发生时段判定 | 测试 `SAN at zero on the last daytime card of a night day` |
| E-02 | 已修（检查点） | 情绪第二次归零直接 `stop(emotion)` → X25，`emotionalBreaks=2` | 测试 `the second emotional collapse ends the run` |
| E-03 | 本轮修 | 全仓库无 `phase='collapse'` 写入；发布版 2cf7d1b 曾可进入该阶段，旧档可能停在该面板 | 引擎拒绝 `collapse` 动作；`storage.decode` 把旧档的 `collapse` 迁回记录的恢复阶段（`migrateLegacyCollapse`），白名单不再接受该阶段；删除 `App.tsx` 的三按钮面板与 `simulate.ts` 分支。类型联合里的两个成员保留并标注 legacy，因 `src/content/events/route-audit.ts:25` 仍引用（见跨文件需求） |
| E-04 | 本轮修 | 信用缺口已加现金压力 +20（检查点）；资产变卖仍固定 ¥3,500；无灰色收入 | `assetSaleOffer`：事件写入 `asset-offer:<id>:<金额>` 后按事件金额变卖，卖出写 `asset-sold:<id>`，无事件时沿用规则里的闲置设备一次；新增 `fund.method='gray'`，只在 `gray-income-offer:<金额>` 存在时可选，接受后写 `gray-income-accepted`、`kickback-received` |
| E-05 | 已修（检查点，非本人文件） | `MAIN_ENDINGS` 按 `priority` 排序；X24（87）与 X28（84）同时成立时取 X24 | 测试 `keeps documented priority when several endings apply` |
| E-06 | 已修（检查点） | `RULES.sanRescueChances=1`；E-200-b 通过一次后再次归零直接结束，跨存档保留；T23 自动保护同样占用这次机会 | 测试 `first SAN collapse offers one dice rescue…`、`the survival talent spends the same single rescue chance` |
| E-07 | 已修（检查点） | 急性事件挂起时 `focus`／`choose` 其他卡、咖啡、午睡、预支、离职均返回原对象 | 测试 `locks other scenes and personal actions while an acute event is open` |
| E-08 | 本轮修 | `RULES.pressure` 权威 01 无此项 | 见下节「数值平衡」：改为写进 01 §2.2 的「班务负荷」并下调 |
| E-09 | 已修（检查点） | 天然 1：按技能附隐患（问诊／察觉 R+5、安抚 C+10、文书 D+10、抗压 SAN −5）；天然 20：揭示一条本病例真实线索；日终天然 1 SAN −5 且抽 3 选 2 | 测试 `a natural one fails and leaves a hazard…`、`a failed check offers three states…` |
| E-10 | 已修（检查点） | AP=0 时患者卡出现「今天先不处理，留给明天」：R+10、D+10，次日回队；底牌患者 30% 成为种子 | 测试 `leaving work for tomorrow` |
| E-11 | 已修（检查点） | `checkContext` 对主任／护士长／同事／家人的社交检定按关系 ≥4／≤1 给优劣势 | 测试 `relationship four gives advantage…` |
| E-12 | 已修（检查点，非本人文件） | `director.ts` 有 `auditEventWeight` 与 `RULES.audit` 回响阈值 | 未再核 |
| E-13 | 已修（检查点） | 负绩效只减余额，不动负债 | 测试 `a negative performance reduces cash…` |
| E-14 | 本轮修 | 请假日仍会累计 `uncoveredDays` | 请假日不累计也不清零；测试 `applies three percent interest, ignores a day off…` |
| E-15 | 已修（检查点） | D7／D14 按已扣款累计：≥3,000 送达 E-159（情绪 −10、声望 −5），≥8,000 另送达 E-160 | 测试 `weekly settlement notices follow the charged total` |
| E-16 | 已修（检查点） | `engine.ts` 在 `unrest_2/3_success` 写入时调用 `talentRecover('dispute-ended')` | — |
| E-17 | 本轮修 | `talentShowBudget` 无消费者；`nightEmergency` 参数无人传；`newAfterTransfer` 无人传；`talentSkimChance` 已由 `perception.ts` 使用 | `publicState().budget` 在 B24 下给出当前患者花费／预算／差额；`addHazards` 传 `newAfterTransfer:true`；删除 `nightEmergency` 参数（B06 由 `nightClinicalCharge` 计） |
| E-18 | 未处理 | 文档计数矛盾在 README／architecture／completion（非本人文件） | 写进跨文件需求 |
| E-19 | 已修（检查点） | `resumePhase` 区分 `play`；`fund` 后删除 `pendingResume` | 测试 `living costs can open funding from the day-end roll…` |
| E-20 | 已修（检查点） | `startRun` 默认 `instanceId=${seed}:run:${meta.runs}`，`src/game` 无 `Date.now` | 测试 `the same seed replays the same daily action sequence…` |
| E-21 | 本轮修 | 存档接受 `collapse`；`Meta.trapArchive`、`Feedback.next:'ending'`、`RULES.goodCasePay` 无引用 | 全部删除；`capRank` 实际已被 `startRun` 使用，保留 |
| E-22 | 未处理 | X19 只在鉴定庭评估；沉默 SAN −5 已实现（检查点） | 局中解聘入口需要 `earlyEnding` 支持新的 kind（ending-adapter，非本人文件），写进跨文件需求 |
| E-23 | 本轮修（部分） | 主治难度只关闭 T10 | `abilities.ts`：主治难度关闭 T02 翻病历与 T03 气味提示，只保留 T01；踩坑档案提醒与 `failureHint` 在他人文件 |
| E-24 | 已修（检查点） | `startRun` 调用 `validateTalentSelection` | 测试 `startRun rejects unknown, duplicated and over-represented talents` |
| E-25 | 本轮修 | 经验为任意小数 | 经验取整到 0.5；`rewarded` 不截断（台账已否决截断） |
| E-26 | 已修（检查点） | 午睡限 `shiftPhase==='结算'` | 测试 `a nap is only possible after the clinic period…` |
| E-27 | 未处理 | `cards.ts` 兜底快诊绩效（非本人文件） | 写进跨文件需求 |
| E-28 | 已修（检查点） | `nextDay` 末尾与 `advanceShift` 每次结算后都调用 `interrupt` | 测试 `a settlement effect that empties a vital interrupts before the next period opens` |
| E-29 | 已修（检查点） | `RULES.nightIncident={stamina:8,san:5,hallucinationSan:3}` 由 `nightClinicalCharge` 每起急诊统一扣 | 测试 `charges the night baseline once per new emergency` |
| E-30 | 已修（检查点） | 结算阶段第二次体力归零、下一张为夜班卡 → X17 | 测试 `a second stamina collapse before the night shift is the daytime body ending` |

## A3-02／LOS

`createPatient` 用 `clinicalAdmissionDay`（C004 入院日 = 接诊日 − 4）并把预计住院天数顺延，床牌（`makeWardCard` 第 N 天）、日终计费与超期判断（`endDay` 的 `r.day-p.admitted+1`）用同一个 `admitted`。旧档由 `repairLegacyClinicalAdmission` 迁移。测试 `C004 keeps the stated fifth hospital day across the bed card, billing and overstay`。`director.ts:241`／`:798` 的「当日有他组转入」仍以 `p.admitted===r.day` 判断，对 C004 永远不成立（跨文件需求）。

## 数值平衡

见最终回复与 `docs/design/01_核心机制与数值.md` §12 调参表。
