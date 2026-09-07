# 同种子复演的随机键审计

## 结论

随机原语 `random(seed, key)` 与 `die(seed, key)` 本身确定。运行编号包含开局时间，直接拿运行编号组成随机键会使同一种子、相同选择得到不同的事件骰子和后续概率结果。运行编号继续承担存档、责任范围与幂等提交的身份职责；运行时随机输入由 `run-random.ts` 单独稳定化。

`runRandom / runDie / runShuffled` 明确接收运行实例，将键中完整匹配的本局 `r.id` 替换为固定领域标记；不猜测时间格式、不修改实际实体或选项 ID、不改变独立临床图谱的底层随机原语。引擎、事件导演、患者交互、预设抽取、接诊卡片和报告呈现分别使用该入口。完整图谱构造的复合种子同样先稳定化患者键。已展示的待确认骰子保持原值，读档不重新掷骰。

## 问题路径的可重复证据

在独立 Node 进程中，固定种子 `seed-repeat-audit`，只改变 `Date.now()`；分别调用真实 `startRun`、`eventToCard(E-013)` 与 `rollPatientCheck`。同一位 `D1-C007-focus` 患者、同一第 2 天 E-013-b 选项、同一能力修正 0 与来源难度，得到：

| 开局时间毫秒 | 运行编号后缀 | E-013-b 骰点 | 固定键 `day:2` 骰点 |
|---|---|---:|---:|
| 1800000000000 | mywpiww0 | 9 | 13 |
| 1800000001000 | mywpixns | 1 | 13 |

这是直接使用选项实例 ID 作为随机键时的程序级复现，不是自然事件抽取或人工完整周目证据。两个事件选项 ID 分别包含上述运行编号，传入的随机键是 `check:<选项实例 ID>`。`run-random.test.ts` 使用相同两组运行身份验证当前真实事件检定、多人骰与重掷结果一致，同时保留不同的实际事务 ID。

## 时间进入随机键的路径

| 入口 | 实际消费者 | 影响 |
|---|---|---|
| `engine.startRun`：`id = seed + Date.now().toString(36)` | `director.chooseBinding / bindClinicalEvent` 把 `r.id` 放入 `binding.instanceId`；`catalog.eventToCard` 再放入选项 ID | `engine.choose` 的概率骰，以及 `patient-checks.rollPatientCheck` 的普通、优势、多人骰和重掷均变化。 |
| `recordEventChoice`：`card.id + choiceId + deferred.id + repetition` | `ledger.settleEventLedger` 用完整延迟效果 ID 抽概率，导演传入 `random(r.seed,key)` | 同一来源承诺的延期概率与失败替代效果不稳定。 |
| `director` 的 `<r.id>:research-project` | `paperTalentCommitted` 的 `talent-retraction:<projectId>` | T29 同一论文撤稿概率受开局时间影响。 |
| `trolley.makeTrolleyCard` 的 `<r.id>:<题号>` | 选项社交骰；导演的 `<tokenId>:delay` | 同一电车题的检定与后续到期日变化；题目初次抽取键本身稳定。 |
| `director.afterAuthoredChoice` 的 `drug-next:<option.id>` | 药代阶段间隔 | 同种子同选项的下一阶段到达日变化。 |
| `director.participantFor / addedClinicPatient` 的 `<r.id>:event-patient:E-005` | 按患者 UID 的直觉、录音、投诉、自费拒检、拒评后病程与民事损失；事件患者排序 | 普通接诊患者 UID 不含时间，E-005 新增患者则将时间继续传播到后续临床过程。 |
| `engine` 的 `late-note:<option.id>`、`choice-order:<scene>:<option.id>` | 迟记概率与选项顺序 | 事件实例选项不稳定；完整图谱优先使用稳定 `clinicalChoice`，一般临床患者与预设多数不受此项影响。 |
| `director` 的 `clinical-event:<option.id>` | 临床节点间事件抽取 | 普通稳定患者选项可复演；来源为带时间 UID 的新增患者则继承问题。 |

`patient-director` 的精神障碍史安抚失败离院键还直接包括 `option.id`；即使患者 UID 稳定，时间型事件选项也可能使此项变化。

## 当前稳定的键

日终 `day:<day>`、基础患者 `D<day>-<caseId>-<suffix>`、演员初始状态 `actor:*`、普通事件槽 `authored:<day>:<phase>:draw`、电车题抽取 `trolley:<day>:<phase>`、法院的 `court:case / review / corruption / acquittal` 等固定领域键不直接引用开局时间。它们仍可能因前述随机差异造成世界状态分叉，不能据此宣称整个周目可复演。

## 修复边界与验收

稳定化只移除完整本局身份带来的时间差异，保留来源事件或病例编号、日程阶段、接诊序号、来源选项 ID、尝试序号、参与方序号。不同的这些后缀仍是不同随机键；不能删除整个选项或患者键，也不能全局改写任意存档字符串。

首次掷骰与重掷使用同一领域并追加 revision；多人检定追加参与方后缀。延迟事件和项目也经相同的显式运行入口，不限于可见 d20。

现有回归覆盖精确身份替换边界、真实 E-013 骰子、多人/优势/重掷、实体抽取、临床变体、不同领域键分离与存档待确认骰子。自然周目验收仍需固定种子与选择轨迹、改变开局时间，对照事件排序、延迟效果、T29 撤稿、电车回响、药代间隔和 E-005 患者全过程；该报告不将函数测试等同于人工多周目。
