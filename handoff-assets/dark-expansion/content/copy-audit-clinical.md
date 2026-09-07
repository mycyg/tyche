# 完整病例文案审读

## 覆盖范围

已逐例审读 C001—C020 的全部 134 个节点、567 个选项（其中 9 个为系统选项），包括默认文本、条件文本、行动回报、检定成功与失败回报、检查报告全文与速读、病例结局及其变体、鉴定材料和场景文本。另已审读 `src/clinical-a.json` 的 10 例旧病例、40 个步骤、120 个选项，以及两个 patient-presence 文件中的全部 20 人在场文案。

| 病例 | 节点 | 选项（含系统） | 改动的图数据字符串字段 |
| --- | ---: | ---: | ---: |
| C001 | 7 | 31 | 23 |
| C002 | 6 | 25 | 18 |
| C003 | 6 | 33 | 24 |
| C004 | 6 | 26 | 21 |
| C005 | 9 | 31 | 24 |
| C006 | 6 | 28 | 26 |
| C007 | 6 | 26 | 24 |
| C008 | 6 | 27 | 30 |
| C009 | 8 | 35 | 22 |
| C010 | 6 | 24 | 25 |
| C011 | 7 | 30 | 17 |
| C012 | 7 | 27 | 34 |
| C013 | 7 | 28 | 22 |
| C014 | 7 | 26 | 26 |
| C015 | 6 | 24 | 25 |
| C016 | 6 | 22 | 22 |
| C017 | 7 | 29 | 27 |
| C018 | 7 | 30 | 31 |
| C019 | 7 | 29 | 21 |
| C020 | 7 | 36 | 32 |
| 合计 | 134 | 567 | 494 |

## 文件覆盖与实际改动

统计基线为接手本次审读时的文件快照，而非 Git HEAD；工作区原有改动不计入本表。

| 文件 | 审读结果 |
| --- | --- |
| `src/content/clinical/graphs.json` | 494 个字符串字段改动 |
| `src/content/clinical/player-copy.ts` | 14 行字符串文案改动 |
| `src/content/clinical/check-copy.ts` | 4 行字符串文案改动 |
| `src/content/clinical/normalize.ts` | 1 行字符串文案改动 |
| `src/content/clinical/observations.ts` | 1 行字符串文案改动 |
| `src/content/clinical/clues.ts` | 已审读，无改动 |
| `src/content/clinical/consultation-time.ts` | 已审读，无改动 |
| `src/content/clinical/identity.ts` | 已审读，无改动 |
| `src/content/clinical/index.ts` | 已审读，无改动 |
| `src/content/clinical/mechanics.ts` | 已审读，无改动 |
| `src/content/clinical/parser.ts` | 已审读，无改动 |
| `src/content/clinical/patient-identities.ts` | 已审读，无改动 |
| `src/content/clinical/report-reading.ts` | 已审读，无改动 |
| `src/content/clinical/runtime.ts` | 已审读，无改动 |
| `src/content/clinical/types.ts` | 已审读，无改动 |
| `src/clinical-a.json` | 6 个字符串字段改动 |
| `src/patient-presence-a.json` | 5 个字符串字段改动 |
| `src/patient-presence-b.json` | 14 个字符串字段改动 |

合计修改 8 个内容文件：519 个 JSON 字符串字段，以及 20 行 TypeScript 字符串文案。统计不含本报告。患者、事件、新增 END 目录及所有测试文件均未改动。

## 文案处理

行动回报补明执行人和动作对象，区分医生安排、患者接受处置及患者或家属签字。检定回报改为能直接读懂的句子；患者和家属的对白保留身份、态度和已知信息。病历、检查报告与医嘱保留必要的专业表达。

C020 尸检节点不再显示“接收签字后的回报”“该步骤只确认”“拒签时不得出现此选项”等编写规则；实际签字选项及其执行规则保留。C010 结局不再显示“全局抢救状态”“本局”等引擎措辞。检定回报中的“情绪 −5”“情绪 −1”改为人物感受，数值效果仍保留在原效果字段中。

## 投影链与保护字段

`src/content/clinical/index.ts` 直接加载 `graphs.json`。`src/game/clinical.ts` 再调用病例节点和玩家文本投影；`src/game/catalog.ts` 使用图数据的 presentation 覆盖旧病例展示字段，并使用权威身份和预算。患者在场文案由 presence 文件提供。

已同步本次涉及的 `player-copy.ts`、`normalize.ts`、`observations.ts` 和 `check-copy.ts` 中对应字符串。没有运行病例导入脚本。

已逐层对比 JSON 基线：对象键、类型、数组长度和全部非字符串值保持一致；`source`（包括 raw）、`rules`、`effects`、`failure`、`requires`、`when`、`condition`、`transitions`、`mechanics`、`mechanicsVariants`、`normalizationNotes`、`flagConsumers`、`checkWhen`、`retry`、`enterEffects`、`exitEffects` 均保持一致。病例 ID、节点 ID、选项 ID、条件和选项数量未改。

数字串核对仅发现三处玩家回报中的情绪数值移除，以及一处 SpO2 与“10 分钟”的语序调整；药物剂量、医学测量值、金额和时点未删改。所有 TypeScript 文件经语法树字符串遮罩比对，字符串字面量以外的源文本保持一致。

## 条件匹配与再生成风险

- 原始 raw 中仍有中文触发语、规则缩写和机制措辞。这些属于受保护的解析依据，不能作为普通文案继续替换。
- `scripts/import-clinical.ts` 会从原始病例 Markdown 重新解析，再经过 normalize、mechanics、check-copy、clues 和 player-copy 写出图数据。部分行动回报和检定措辞直接保存在当前 `graphs.json`，并非全部回写至导入源。再次导入可能覆盖这些文案；导入前须把展示措辞迁入相应投影层，或审查生成差异。当前运行时直接读取图数据，不受此再生成风险影响。
- 旧 `clinical-a.json` 与完整图数据中个别人物记录存在原有差异；本次未获授权改变患者身份或临床事实，保持原值。当前目录投影使用权威身份及图数据展示字段覆盖旧展示数据，不应将旧 JSON 单独当作完整病例事实来源。
- 条件、正则表达式和 raw 未改，局部测试覆盖的真实路径、隐藏变体、未执行检查不泄露结果、检定失败及病例退出均通过；未对范围外所有消费方进行全量构建或端到端界面测试。

## 验证

- `npm test -- src/content/clinical`：5 个测试文件、146 个测试通过。
- `npm run typecheck`：通过。
- JSON 结构及受保护字段对比：通过。
- TypeScript 非字符串源文本对比：通过。
- 测试断言未修改。
