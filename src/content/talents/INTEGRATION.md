# 天赋与状态运行合同

定义来源：`02_天赋与debuff.md`，基础数值以 `01_核心机制与数值.md` 为准，支线消费以 `03_主线与支线.md` 为准。`index.ts` 提供全部 30 项天赋、24 项状态、稀有度、抽选权重、效果、代价与解除条件。此文件是开发合同，不进入玩家文案或配音。

## 持久化与结算边界

在 Run 中保存 `talentMemory: TalentMemory`。对 hook 传入 `{talents, debuffs, day, memory: run.talentMemory}`，保存返回的 `memory`。Hook 不直接更改 Run；`effects`、`addDebuffs`、`removeDebuffs`、`pressureDelta` 由主引擎结算。`apCost` / `cashCost` 是显示用的正数镜像，**不能在 effects 之外再次扣款**。`extraMinutes` 则需进入实际时间支出。

临床患者、科研项目使用实际实例 ID，而不是病例模板 ID / 支线族 ID。`patientTrust`、`complaintDelta`、`notPresentDelta` 只能应用到当前操作对应的患者。

## 引擎接入点

| 边界 | Hook | 处理 |
|---|---|---|
| 开局 | `talentStart` | T11 / T14 / T16 / T24 开局资源；T26+T28 强制约谈事实。主任关系不额外增加。 |
| 每日起床 | `talentDayStart`, `talentBaseAp`, `talentStaminaCap`, `talentWakingStamina` | 重置每日令牌；第八天永久胃痛；临时状态到期。T17 白天上限与夜班次日起床值分开计算。 |
| 入夜 | `talentNightStart`, `talentStaminaCap` | T09 每夜支付 3 体力；T17 恢复夜间上限，但不得把当前体力无偿补满。 |
| 日终 | `talentDayEnd`, `talentInterestRate`, `talentPressureDecay` | 每日费用/心情/抑郁与连续解除计数；日终 summary 使用当天真实心情、理智、完整睡眠与咖啡次数。 |
| 资源/关系变化后 | `talentAutomaticRecovery` | B06/B13/B14/B15/B16/B17 达门槛即解除。连续两天/三天状态只在日终计数。 |
| 事件抽选前 | `talentEventWeight`, `talentFoodPositive` | 事件上下文必须标注正面、食物、主任担责、同事负面、主任点名、代班/聚餐，不根据 UI 字符串猜测。 |
| 检定展示前 | `talentCheck` | 加值、难度增减、优势/劣势抵消；显式区分 `history` 与 `observe`，并传 actor。 |
| 检定最终提交 | `commitTalentCheck` | 消费该患者一次直觉优势；预览、重掷都不重复消费。 |
| 选项费用预览与实际支出 | `talentCosts` | 必须从未经天赋修饰的基础成本调用一次。传实际 night、clinical、operation、quality；不能拿“没有风险”代替“正确处置”。 |
| 新隐患创建 | `talentHazards` | D/R/F/C 分项倍率。只处理新条目，不重算历史。只有遗漏签字造成的 C 条目传 `unsignedConsent`。 |
| 正负效果入账 | `talentEffects` | 区分随机奖励、纠纷、科室通报、正确处置、自己的患者死亡、代表利益、夜班。成本体力若已用 talentCosts，不再作为 effects 二次修饰。 |
| 首次接触患者 | `firstTalentContact`, `talentSmell` | 从病历已有的未揭示事实传入 clue/scent；T01 UI 显示返回 `hint`，不是直接公开底牌 `clue.text`。记录首次接触，即使没触发也不能反复试。 |
| 晨间病历按钮 | `talentChartReview` | 输入尚未发现的真实病历线索；消耗 2 AP，展示新线索并写入事实/报告。 |
| 首节点报告重看 | `talentFullReview` | 实际有已取得报告才可使用；整轮五次、逐患者一次，+10 分钟/-3 体力。 |
| 对应规范提示 | `talentNormQuote` | 输入这个病例对应的规范段落，不自动处置或清风险。 |
| 已执行动作 | `talentAfterAction` | 规范查体信任/投诉、会诊 F+5、B21/B22 解除计数、B06 每起夜急诊额外损失。action.id 必须是已提交的唯一实例 ID。 |
| 咖啡/午睡/加班 | `talentCoffee`, `talentNap`, `talentOvertime` | 保留原咖啡费用每杯 15 元；第二/第三杯声誉 -2，加 B15 -1，T20 豁免咖啡声誉损失。 |
| 任一核心状态归零 | `talentSurvival` | 先恢复这一个值，再支付理智 -10/抑郁 +10；消耗一次保护之后重新检查归零，不递归救活。 |
| 状态抽选与获取 | `drawTalentDebuffs`, `talentGainDebuff`, `talentRemovableDebuffs` | 加权不放回抽三项；自然大失败选两项；B18/B19即时交换不加入状态栏；自然20只能移除可解除状态。 |
| 具体解除事件 | `talentRecover` | 心理咨询、休假、胃镜、家庭说清楚、退群、纠纷结束；家庭沟通需主引擎先完成安慰 DC14。 |
| 写病程 | `talentDelayedRecord`, `talentDueRecords`, `talentCompleteDelayedRecord` | 只在真实病程记录的提交点掷20%迟记；保留患者与记录 ID；T09免疫。次日显示待补记录，补写不删除旧风险。 |
| DIP 个人扣款 | `talentShowBudget`, `talentBudgetCharge` | B24只放大个人超预算扣款，不把医疗费用再乘一遍。 |
| 转诊 | `talentTransfer`, `talentTransferFirst` | T27增加建议；家属安慰检定和接收交接独立完成。仅接受且实际转出后声誉 -5/计数+1。历史事实、损伤、风险与账单保留。 |
| 支线关键分流 | `talentDisputeSettlement`, `talentForcedAudit`, `talentNotPresentThreshold` | 第二幕和解、必定约谈、不在场门槛4。 |
| 亲戚借款 | `talentRelativeLoan` | 同一个实际家庭事件只能借一次；记录私人借款与家人关系代价。 |
| 代表收益/统方/上交 | `talentRepresentative`, `talentEffects` | T28缓解压力倍率、统方概率倍率、不允许上交、接受利益免SAN。其他SAN损失不豁免。 |
| 科研步骤 | `talentResearch`, `talentChiefLearns` | T29项目自动完成，无体力/现金支出；本项目明确美化、同事知情与40%撤稿概率。只有主任真的知道这一个已美化项目时失去T14说服加值。 |
| 隐瞒/后续患者死亡 | `talentConceal`, `talentConcealDeath` | 先记实际患者 C15，压住本次升级；同患者后续死亡，追加已记录隐瞒风险的同等权重条目，不改写历史或影响另一患者。追加条目不再次套新风险倍率。 |

## 必须移除的旧重复实现

以函数与逻辑定位，行号会随主线程改动：

- `engine.startRun`：原 T16 上限、T17 永久上限减少、T14 主任3/同事1、T04 AP、T24现金、T11声誉分支。使用开局 hook 后全部移除；T17只影响实时日夜上限。
- `engine.spendAp`：原 B15 每透支行动力扣声誉，应以一次实际加班记录结算，不按每点 AP 重复计。
- `engine.addHazards`：T06/B08/T10/T26/B20/B14原倍率，替换为一次 `talentHazards`；补 T06+T09 和 B20 的 F 倍率。
- `engine.applyEffects`：原 T16 见到正数就减半、B10所有心情伤害增幅、T17夜班体力分支，改按显式来源。不要将固定奖励认作随机奖励。
- `engine.choose`：原所有临床选择 B02 体力-1、仅B11劣势、所有临床选择B23概率迟记，移除。只在查体/真实病程/目标明确的检定调用。
- `engine.resolveZero`：原T23 flag救活代码用 `talentSurvival`替换，或保留flag兼容迁移但不能两次保护。
- `engine.dailyWard/endDay`：原B12处置心情、患者死亡SAN、T19/T10/B09/B12每日分支，若hook已执行就移除重复。
- `engine.beginDay`：原T04/B03/T17 AP分支、B01睡眠上限、夜班后起始值以及B01/B05/B07/B04单日解除过滤，改纯hooks。
- `engine.debuff`：原B18额外创建有息/私人债务的实现移除（原设计此项是一次交换），状态获取用hook；未清单状态不允许入栏。
- `engine.coffee/nap/collapse`：咖啡体力声誉、午睡费用与恢复、任意清B03旧代码应与hook合并，不能清除T20永久胃痛。
- `costs.skillModifier`：移除T04/T11/T14/B02加值；删B07/B16错误日终惩罚；基础疲劳、情绪、SAN、关系加值保持，传入 `talentCheck`叠加且统一抵消优势劣势。T14仅对主任，B07无T01时仅观察。
- `costs.optionCost/optionMinutes`：原T26/B20费用、T06/B08/B22时间逻辑改一次 `talentCosts`。B22不能凭有没有R风险判断选项正确性。

## T22 待结算重掷事务

1. 选择带检定的选项时，生成持久化 `pendingCheck`：唯一操作 ID、card/option ID、患者/项目 scope、最初随机序号、baseCosts、天赋修正后成本、checkContext、加值/DC、第一/第二骰（优势或劣势）、所选骰面。尚不扣 AP、时间、现金，不写风险/事实，不推进病例图。
2. 展示「接受结果」和有令牌时的「重掷」。`useTalentReroll(context, true)`只扣每日令牌；以新的确定性序号重新生成完整骰组。优势/劣势仍适用；必须采用新结果，不能二选一。T22骰面1和2均大失败，自然20仍大成功。
3. 接受结果时检查唯一操作未提交，再 `commitTalentCheck`消费一次该患者直觉，费用一次性支付，按最终检定结果执行动作和病例图。正确治疗本身不受额外骰子否决。
4. 存档包含 pendingCheck 与 TalentMemory，重新加载不得重新随机、补令牌、重扣款或重复动作。已结算结果不能倒退重掷。
5. 日终检定使用同一待结算模式；最终大失败抽三选二，自然20移除一项可解除状态。若另外购买整轮一枚令牌，单独记录消费，不能每天刷新。

## 明确的源文解释边界

- T07「每次签字流程1AP」按至少1AP理解，不把本来1AP的签字变成2AP；如一步包含其他额外操作，保留更高基础费用。
- T25家人关系-1在实际向亲戚借款时支付，避免未求助就扣关系。10,000元借款保留私人借款记录，防止当作工资；不擅自设额外有息利率。
- T28源文“现金压力效果翻倍生效于收益”未提供收入计算公式；01只有接受利益的理智代价减免，且T28本来免理智。hooks将明确存在的代表收益压力缓解（例如-15）翻倍；不凭空把所有代表现金翻倍。原文中的歧义保留在此，不进入玩家技术文案。
- T27源文“该病例隐患归零”被较新的责任合同约束为完成转诊后停止新增本院后续处置风险；旧因果事实与损伤不可删除。
- T30翻倍限定本患者因隐瞒新增的告知风险；不是将全局所有患者的C历史重写两倍。
- T20与B04冲突时，咖啡耐受的“全部+5”优先于原三杯基准；T20仍免咖啡声誉损失。第八天胃痛是独立确定事件。

## 验证

`npx vitest run src/game/talents.test.ts` 覆盖全部定义、精确成本、来源隔离、作用对象、每日/每轮令牌、连续解除计数、状态权重、临床事实与科研项目隔离。纯hook测试不代替主引擎调用点与真实UI存档重掷验证。
