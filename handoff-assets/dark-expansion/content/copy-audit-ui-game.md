# UI、场景与运行时中文文案审计

## 范围与计数

扫描了 `src/ui/`、`src/world/`、`src/game/`、`src/shared/` 和 `src/content/talents/` 的 96 个非测试文件。可执行源码共有 1,868 行含中文，逐行检查了这些行中的展示文字和中文判定条件。下表的“覆盖”以含中文源行计数；同一源行可能包含多个文本项，也可能只有枚举或解析规则，不能把该数解释为对白条数。无中文文件通过全文字符扫描确认，覆盖记为 0。

22 个文件有文案变更。原有脏工作区保持原状；此次只用补丁替换可分离的字符串或 JSX 文本，没有改动事件 ID、条件、分支、数值表达式、枚举、数组数量或函数签名。`INTEGRATION.md` 的 64 行中文属于开发资料，不计入玩家文案覆盖。

## 事实与说话人约束

- 玩家“你”指住院医师。李恂、叶茗、周乔、唐济、姜蓉和家人分别保留原有身份；叙述与对白中的第一人称依原说话人解释。
- 借款本金、还款期限、实际到账、退款、延期同意分别保留。提出申请不写成获准，待办不写成已完成，关系好不写成对方已经签字或作证。
- 临床结果保留原有病情、损伤和因果强度；没有追加患者损害、在场证人、原始报告或已兑现的承诺。
- 行动值、体力、精神、情绪、夜班分钟、诊疗记账、预算和个人余额分别说明。补齐费用由谁支付、退款到哪里，以及数值单位。
- 旧结局判定和编号映射未动。新结局目录的文案与迁移由主任务处理。

## 逐文件覆盖

| 文件 | 覆盖：含中文源行 | 处理 |
| --- | ---: | --- |
| `src/ui/App.tsx` | 258 | 改标题介绍、天赋选择上限说明、上班规则与单位、透支和持续状态提示、自付评估按钮。 |
| `src/ui/ArchiveLibrary.tsx` | 11 | 改收藏介绍与空状态，明确可查资料及收录时点。 |
| `src/ui/CheckBreakdown.tsx` | 3 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/Dice.tsx` | 2 | 落骰提示改为点数已确定。 |
| `src/ui/Guide.tsx` | 34 | 改掷骰规则和行动、体力、自付、收入说明，补齐主体。 |
| `src/ui/RecordBook.tsx` | 43 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/Schedule.tsx` | 33 | 补夜诊精神消耗和行动、上限变化单位。 |
| `src/ui/WebMCP.ts` | 0 | 无中文展示文本，未改。 |
| `src/ui/archive-data.ts` | 12 | 未收录条目改为尚未取得记录。 |
| `src/ui/archive-library.css` | 0 | 无中文展示文本，未改。 |
| `src/ui/audio-mix.ts` | 0 | 无中文展示文本，未改。 |
| `src/ui/audio.ts` | 1 | 中文解析、身份或枚举受保护，未改。 |
| `src/ui/clinical-help.ts` | 4 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/clinical-voice.ts` | 2 | 中文解析、身份或枚举受保护，未改。 |
| `src/ui/copy.ts` | 33 | 改预支、透支、抑郁与病组预算解释，保留资源和数值。 |
| `src/ui/dialogue-voice.ts` | 10 | 中文解析、身份或枚举受保护，未改。 |
| `src/ui/dice.css` | 0 | 无中文展示文本，未改。 |
| `src/ui/feedback-source.ts` | 0 | 无中文展示文本，未改。 |
| `src/ui/guide.css` | 0 | 无中文展示文本，未改。 |
| `src/ui/handbook.ts` | 120 | 补预支/透支单位，改精神值、独立接诊次数和预算说明。 |
| `src/ui/patient-display.ts` | 9 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/payment-copy.ts` | 5 | 明确退款退回玩家个人余额。 |
| `src/ui/readability.css` | 0 | 无中文展示文本，未改。 |
| `src/ui/record-book.css` | 0 | 无中文展示文本，未改。 |
| `src/ui/record-notes.ts` | 2 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/scheduled-work.ts` | 4 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/ui/talent-copy.ts` | 12 | 补行动值和情绪变化的单位。 |
| `src/ui/voice-plan.ts` | 0 | 无中文展示文本，未改。 |
| `src/ui/voice-text.ts` | 36 | 中文解析、身份或枚举受保护，未改。 |
| `src/world/Bedside.tsx` | 10 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/world/WorldStage.tsx` | 43 | 改主任、护士长、同事与科研同事常驻对白；钱包增加余额标签。 |
| `src/world/bedside.css` | 0 | 无中文展示文本，未改。 |
| `src/world/camera.ts` | 0 | 无中文展示文本，未改。 |
| `src/world/idle.ts` | 1 | 中文解析、身份或枚举受保护，未改。 |
| `src/world/layout.ts` | 6 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/world/navigation.ts` | 1 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/world/observe-layout.ts` | 0 | 无中文展示文本，未改。 |
| `src/world/occupants.ts` | 1 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/world/patients.ts` | 7 | 中文解析、身份或枚举受保护，未改。 |
| `src/world/placards.ts` | 2 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/world/refreshments.ts` | 4 | 咖啡说明写明由玩家付款和恢复量；午睡次数写成自然提示。 |
| `src/world/scene.ts` | 0 | 无中文展示文本，未改。 |
| `src/world/world-stage.css` | 0 | 无中文展示文本，未改。 |
| `src/game/abilities.ts` | 27 | 家庭沟通目的、自身胃镜结果及迟记完成结果补齐主体。 |
| `src/game/audit-score.ts` | 2 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/budget-account.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/budget-liability.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/cards.ts` | 137 | 改查房、出院、转接、费用审核、回院调查、交班与休息结果；补检定失败代价单位。 |
| `src/game/care-completion.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/catalog.ts` | 1 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/clinical-admission.ts` | 2 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/clinical-disposition.ts` | 50 | 离院去向短标签保留；内部审计依据不在玩家 UI 展示，未改。 |
| `src/game/clinical-handoff.ts` | 1 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/clinical-location-repair.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/clinical.ts` | 2 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/costs.ts` | 17 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/critical-outcome.ts` | 4 | 抗压失败说明补主体和精神点数单位。 |
| `src/game/deferred-work.ts` | 9 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/director.ts` | 252 | 改还款/退款/改期、BTF-001 N02、BTF-002 N02/N06/N08、科内教学 N05、答辩失败、合并待办及失效事项提示；改联络核查、输液泵、收款冲减、处方签字和账单结果。 |
| `src/game/discharge-readiness.ts` | 5 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/discharge-responsibility.ts` | 2 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/display-number.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/duty-state.ts` | 3 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/encounters.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/endings.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/engine.ts` | 85 | 改交班后病情恶化结果、死亡交接、日终及预支反馈。 |
| `src/game/extra-shift.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/hazard-relief.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/income-coverage.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/interruption.ts` | 4 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/night-costs.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/night-overflow.ts` | 4 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/patient-checks.ts` | 6 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/patient-director.ts` | 49 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/peer-referrals.ts` | 12 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/perception.ts` | 5 | 改紧张状态下的看钟与核对待办描写。 |
| `src/game/performance.ts` | 5 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/preset-baseline-repair.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/presets.ts` | 28 | 复诊执行情况核对结果补齐玩家和患者指向。 |
| `src/game/random.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/representative-benefit.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/rules.ts` | 22 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/run-random.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/schedule-preview.ts` | 0 | 无中文展示文本，未改。 |
| `src/game/shift.ts` | 10 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/storage.ts` | 14 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/stories.ts` | 308 | 全审 35 个故事及选项结果；替换 51 处正文所在源行，补借款、签字、交接、科研、调查与家庭对白的主体、宾语和因果。 |
| `src/game/talents.ts` | 22 | 已审读；短标签、明确的说明或受保护机制文字保留。 |
| `src/game/traits.ts` | 1 | 中文解析、身份或枚举受保护，未改。 |
| `src/game/trap-archive.ts` | 1 | 明确玩家已有复盘经历及本次检定加成。 |
| `src/game/types.ts` | 0 | 无中文展示文本，未改。 |
| `src/shared/audio-assets.ts` | 0 | 无中文展示文本，未改。 |
| `src/shared/engine-globals.d.ts` | 0 | 无中文展示文本，未改。 |
| `src/shared/guide-state.ts` | 0 | 无中文展示文本，未改。 |
| `src/content/talents/INTEGRATION.md` | 64 | 开发资料，排除玩家展示文案编辑。 |
| `src/content/talents/index.ts` | 69 | 改签字、转诊责任、归零保护、胃镜和家庭沟通说明；保留天赋定义与全部标识。 |

## 动态覆盖

`src/game/director.ts` 的 `makeButterflyCard` 会覆盖事件库文本，因此单独审读并修改：本金还清、无钱退款、重新约定还款日、答辩说明失败、BTF-001 N02 的患者交接、BTF-002 N02 的家庭付款缺口、N06 的两类债务、N08 的核查或联络邀请。科内教学 N01 的事实明确，保留；N05 重新写明待核资料与作者分工。合并卡 XJ-01 的时间冲突、分开办理及终止合作结果也单独检查，XJ-02/XJ-03 保留可核实的原始事实。

`src/game/stories.ts` 全审 35 个故事、所有选项正文与风险说明，修改 51 处正文所在源行。借款与表格交换的对白保留原有已知范围，没有把模糊的“之前的事”改成双方确实发生过的新资助。

## 机制保护记录

以下中文承担解析或判定用途，不能直接当对白自由替换：

1. `src/game/director.ts` 的中文 qualifier、activeFacts、夜班/查房等阶段名，以及对吸氧、用药、在场身份、质控、投诉和交接的正则检查。
2. `src/game/audit-score.ts` 使用“隐瞒、篡改、覆盖原、销毁、统方、回扣、不实、虚构、利益交换”等词识别责任；这些判断串及相关风险理由未改。
3. `src/game/patient-director.ts` 按检查名称、拒绝词、问诊标签、出院评估和 VIP 选项文本识别行为；本轮未改这些标签或正则。
4. `src/game/presets.ts` 的医保/欠费、职业和患者身份标签，以及 `src/world/patients.ts` 的性别/孕晚期筛选，全部保留。
5. `src/game/talents.ts` 对“报平安：隐瞒患者坏消息”的精确匹配，以及 `src/content/talents/index.ts` 的术语转换函数、类别名和专名，全部保留。
6. `src/content/events/historical-context.ts` 从既往记录查找“双肺呼吸音清”、交班本和 6.1/16.1 血糖转录；`recording-origins.ts` 从动作标签识别书写；`followups.ts` 从结果识别报警/举报/投诉。本范围未改这些受匹配片段。
7. `src/ui/dialogue-voice.ts` 的角色表、引语归属正则与 `voice-text.ts` 的朗读转换规则属于机制，未改。
8. `src/ui/copy.ts` 用“未通过”前缀分辨失败成本，前缀保留。
9. `src/game/clinical-disposition.ts` 的 `basis` 审计说明未被玩家 UI 引用；其中的代码化说明保留，不混入交付文案。

后续若需要改动上述判定词，必须先将机制识别与展示文字分离，再做文案替换。本轮没有实施这种机制改造。

## 验证与剩余风险

- `npm run typecheck` 通过。
- 一次轻量测试运行了 8 个文件、122 条测试：121 条通过，1 条失败。失败是 `src/game/director.test.ts:272` 断言答辩结果含“补充材料要求”，当时改写未保留该连续词组；已把结果写为“会后，你收到评委的补充材料要求，还得根据实际资料答复”。没有改测试、删断言或改判定。修正后未重复运行该测试，主任务需在最终验证中确认。
- `git diff --check -- src/ui src/world src/game src/shared src/content/talents` 通过。
- 本轮没有运行本地模型、配音、生图或渲染发布。文案尚须主任务复核后再统一生成语音。
- 天赋中的“「不在场」结局”仍是旧运行时专名，保留待主任务决定迁移；没有按旧编号猜测新目录映射。
- 此次改写会改变对白和旁白的语音哈希。现有音频应由主任务在文本审阅后重新收集与校验，不能按既有音频是否存在认定完成。

