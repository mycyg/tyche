# 天赋运行入口与内容覆盖

审计范围为设计 01、02 的 30 项天赋，以及 20 个完整临床图谱和 208 条病例预设。下表记录实际消费者；按钮存在不等于所有自然触发路径均已完成真人试玩。

| 天赋 | 实际入口 | 内容边界与核验 |
|---|---|---|
| T01 不对劲 | `engine.touchPatient → abilities.firstContact`，`traits.checkContext → talentCheck` | 完整图谱与隐藏预设均触发首次提示；优势按患者消耗，提示不公开检验结果。 |
| T02 老病历 | 晨间 `abilityOptions` 的 `chart-review` | 图谱隐藏史与 `PRESET_CHART_CLUES`；无可用历史线索时不编造结果。已有预设逐条测试。 |
| T03 鼻子 | `firstContact → unrevealedGraphScent / unrevealedPresetScent` | 预设 C-001 酒气、C-142 酮味，情绪各减 2 且按患者只扣一次；C-068 入场已知酒味不再揭示，C-179 不凭气味猜毒物。已知事实、旧日志和读档均去重。 |
| T04 复盘 | `traits → archiveCheckMatched → talentCheck`；`talentBaseAp`；`engine.startRun / touchArchive / reward` | 源陷阱编号归一化；已有识别检定按显式 `archive-links.ts` 映射，+3 取代 +2。确定处置不造骰。庭审已读风险归档、新局继承、当前患者一次可读提示均有主引擎调用。 |
| T05 慢半拍 | `abilityOptions / resolveAbility(full-review)` | 两套病例入口均可重看已取得资料；208 条预设首节点逐条测试，不读未做检查。 |
| T06 三联记录 | `optionCosts → talentCosts`；`applyEffects → talentHazards` | 两套病例共用时间与新增文书风险结算；继续控制按钮不当作新的医疗操作。 |
| T07 签字栏 | `availableOptions` 的签字自动检定；`talentCosts / talentHazards` | 实际签字流程至少 1 AP；未签字风险按明确 `unsignedConsent` 处理，拒检仍需独立决定。 |
| T08 会诊单 | `costContext.consultWaitMinutes → talentCosts`；会诊说服与 `talentAfterAction` | 图谱逐项等待元数据、208 条预设额外会诊真实减 3 分钟；CTA、胸片、同步抢救、电话和转运不减时。费用与 AP 不打折；非临床支付说明与普通同事协助不计正式会诊。 |
| T09 时间戳 | `talentNightStart / talentDelayedRecord / drawTalentDebuffs` | 真实夜班扣体力；排除自动迟记及 B23。家属声称迟记不等于医方已迟记，投诉材料仍须核对。 |
| T10 抄规范 | `abilityOptions(norm-quote)`；`talentHazards / talentDayEnd` | 图谱与全部 208 预设均有实际引用入口，C/F/D-only 的 16 例引用既有本院制度；不伪称外部指南原文。主治难度按来源限制提示。 |
| T11 好说话 | `talentCheck(comfort) / talentStart` | 患者解释、拒检、家属与事件安抚；开局声望代价。 |
| T12 热手 | `mechanics.full-exam → talentCosts / talentAfterAction → patientComplaintReliefFlag` | 20 图谱规范查体；预设 C-128 完整伤口查体与 C-158 全身皮肤查体真实生效。基础 3 体力，T12 为 4；信任 +3，当前患者投诉倾向 −1。简单观察不计完整查体。 |
| T13 录音无感 | `talentEffects`；`sourceDisputeCards → talentDisputeSettlement` | 医闹数值减伤、声望收益折减；与 T11 的二幕和解存在真实选项。 |
| T14 主任的人 | `talentCheck` 的 chief；`authoredTalentWeight` | 会诊、科室与事件的明确说话对象；主任担责及同事负面事件按源 ID 加权。 |
| T15 会翻译 | `checkContext.actor → talentCheck` | 预设与图谱均保留家属/本人对象；只影响对应问诊与安抚。 |
| T16 长跑 | `talentStart / talentEffects` | 开局永久上限 +20；随机事件收益折半，正常诊疗与工资不作为随机奖励。 |
| T17 夜行 | `talentStaminaCap / talentBaseAp / talentCosts / talentEffects` | 实际夜班与次日预测共用规则，白天上限降低不写成永久扣减。 |
| T18 二十分钟 | `act(nap) → talentNap` | 真实午睡按钮：2 AP、15 体力、每天一次。 |
| T19 胃口 | `prepareTalentEvent(E-068)`；`talentDayEnd` | 食堂事件正向处理及每日收支；胃痛时暂停，日常餐饮之外事件不凭名称改写。 |
| T20 铁胃 | `act(coffee) → talentCoffee`；D8 `talentDayStart` | 三杯及声望变化按真实按钮；D8 胃痛不可解除，次日预测纳入。 |
| T21 好运 | `authoredTalentWeight / firstTalentContact / talentCheck(day-end)` | 事件正向源 ID 加权，与 T01 触发概率反协同或无 T01 日终代价。 |
| T22 再来一次 | `act(reroll) → useTalentReroll / talentRollOutcome` | 尚未结算骰子可重掷；天然 1、2 均失败，每日与每局成长令牌分开记录。 |
| T23 活下来 | `engine.interrupt → talentSurvival` | 三种归零共用一次生存机会；即时后续代价仍执行。 |
| T24 应急金 | `talentStart / talentInterestRate` | 开局资金及日终实际信用债利息。 |
| T25 亲戚 | 家庭事件 `abilityOptions(relative-loan)`；`talentPressureDecay` | 真实私人借款选项和每日现金压力变化，非凭空增加普通收入。 |
| T26 多开一项 | `talentHazards / talentCosts` | 所有患者路径的新增 R/F 及费用；与 T28 强制审查标记由事件导演消费。 |
| T27 上级医院 | 两套病例 `abilityOptions(transfer) → resolveAbility` | 先询问、后执行真实接收；拒绝继续原卡，转出保留已发生责任、费用与损伤。 |
| T28 灰色 | `prepareTalentEvent / afterAuthoredChoice / ending-adapter` | 药代收益精神豁免、压力与统方概率；对应上交选项筛除，未扩及其他精神损失。 |
| T29 美化 | `prepareTalentEvent / paperTalentCommitted` | 真实论文提交、同行知情、按项目固定撤稿概率；主任实际知情后取消同项目庇护。 |
| T30 报平安 | `abilityOptions(conceal)`；`patient-director / sourceDisputeCards` | 当前患者一次升级压制、C15 与同患者死亡追加责任；不抹除原临床损害。 |

## 时间回归证据

`consultation-time.test.ts` 检验图谱全部正式会诊的显式等待字段、C001/C012 原文等待及忙碌变体、CTA/胸片/电话不减时、实际会诊说服、全部 208 条预设会诊、实际 `choose` 后夜班预算与临床累计分钟一致。C001 的合法 120 分钟路径为喂养排便问询、完整查体、超声、禁食准备、会诊、术前准备、完整病历；原结局阈值未改动。

`abilities.test.ts` 覆盖全部预设的首节点重看与规范入口、可用历史线索、T03 已知去重及 206 条无额外气味负例、C128/C158 完整查体的实际扣费与患者变化。`trap-archive.test.ts` 检验旧实例 ID、同病例不同线索、其他病例、无骰处置及提示去重契约。

## 档案接线与持久化

`archiveNotices(run, card)` 返回 `{ flag, trapId, text }[]`，本身不改变存档。`engine.touchArchive` 在卡片实际展示时记录提示与返回的患者范围 flag；重复打开不再提示。提示引用已学过的源动作，不提前公开当前患者隐藏事实。

庭审完成并读过判定后，`reward` 用 `collectTrapArchive` 按真实隐患所属患者与源选项保存稳定键，不限于造成严重损害的种子。`startRun` 合并这份清单与既有 `seedHistory`，仅保留真实病例所属陷阱。存档验证源选项归属；Meta 只收规范键，旧 Run 兼容带实例前缀的真实源键。纯函数、存档和源映射已有回归；完整自然多周目仍需人工验证。

未发现其余天赋整体缺少运行入口；这不代表所有天赋组合、自然事件抽取与多周目结局已经人工穷尽验证。
