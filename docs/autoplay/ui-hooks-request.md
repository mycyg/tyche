# 自动通关驱动器对界面的钩子请求

驱动器（`tests/autoplay/`）只通过真实界面操作：读屏、点按钮、再读屏。当前它靠三样东西认路——带角色含义的 class（`.roll-content`、`.debuff-choices`、`.dialogue-option`）、`aria-label`，以及按钮上的文字。下面每一条都写明现在的替代做法和它会在什么时候失效，供界面负责人取舍。不改 `src/**` 也能跑，只是每次改文案都有可能悄悄改变驱动器的行为。

| 序号 | 请求的钩子 | 位置 | 现在的替代做法 | 失效场景 |
| --- | --- | --- | --- | --- |
| 1 | `data-phase="play\|feedback\|roll\|debuff\|funding\|collapse\|tribunal\|ending"` | `.app-shell` 或 `WorldStage` 根节点 | 按优先级依次探测 `.roll-content`、`.confirm-choice`、`.debuff-choices`、`.choices`、`.modal-actions`、`.tribunal-page`、`.ending-page`、`.rpg-dialogue`、`.bedside-view`、`.rpg-map-menu`、`.world-stage` | 任何一处 class 更名或新增一个也带 `.choices` 的弹窗，阶段判定就会错位 |
| 2 | `data-modal="confirm\|roll\|debuff\|funding\|collapse\|recovery\|panel"` | `Modal` 组件（现在只接收 `title`） | 资金缺口与体力归零两个弹窗只靠「是否存在 `.choice.danger`」区分 | 体力归零弹窗一旦加一个 danger 选项，就会被当成资金缺口处理 |
| 3 | `data-option-id={o.id}` | `.dialogue-option`、确认弹窗的「就这样做」、`.debuff-card`、`.choices .choice`、鉴定庭三项 | 驱动器在读屏时给按钮打自己的 `data-autoplay="opt-N"` 再按序号点 | 读屏与点击之间发生一次 Preact 重绘，序号与按钮就可能对不上；日志里也无法把选择还原成引擎里的 option id |
| 4 | `data-card-id`、`data-card-kind` | `.rpg-dialogue` 根节点与 `.rpg-menu-row` | 待办行与打开的卡片只能用标题文字对应 | 前往待办失败时说不清失败的是哪张卡；同名标题无法区分 |
| 5 | `data-ending-id`、`data-ending-category`、`data-story-id` | `.ending-page` 与 `.ending-page.ending-page-story` 两种结局页 | 用正则从 `.ending-intro .eyebrow` 的 `X31 / 类别 · …` 里取编号 | 眉题格式一变就取不到结局编号，只能回落到读 `localStorage` 的存档；`?preview-ending=END-07` 这条开发路由的眉题是 `END-07 / 结局预览`，正则取不到，定向回归只能靠 URL 自己记着是哪一个 |
| 6 | `data-roll-state="idle\|rolling\|settled"`、`data-roll-face` | `.roll-content` | 靠按钮文字「掷二十面骰／直接看点数／接受结果 →／继续与第二拨家属沟通 →／使用 1 次重掷」判断 | 文案一改，「接受结果」可能匹配到「使用 1 次重掷」，等于替玩家花掉一次重掷 |
| 7 | 骰子上的可点区域与主按钮的可访问名区分开（`data-action="throw-dice"` 对 `data-action="commit-roll"`） | `Dice` 的 `.tyche-dice__surface` 与 `.primary.full` | 骰面按钮的 `aria-label` 是「投掷二十面骰，拖动松手，或按回车键」，与主按钮「掷二十面骰」在非精确匹配下同时命中 | 已实际踩到：`getByRole('button',{name:'掷二十面骰'})` 触发 strict mode 冲突，只能改成精确匹配 |
| 8 | `data-walking="true\|false"` 或 `data-destination` | `.world-stage` | 点完待办行后等 `.rpg-dialogue / .bedside-view / .rpg-map-menu / dialog[open]` 出现，超时 45 秒才判定失败 | 路线不可达与「还在走」无法区分，每次失败都要白等 45 秒；也无法确认是寻路问题还是交互距离问题 |
| 9 | `aria-label="当班待办"` | `.rpg-quest-button` 里的按钮 | 只能用 class 定位；HUD 上其他按钮（角色状态、暂停与设置、打开病区地图）都已有 `aria-label` | class 更名后待办入口就找不到了 |
| 10 | `data-day`、`data-ap`、`data-borrowed`、`data-cash`、`data-debt` | `.rpg-location`、`.rpg-ap`、`.rpg-wallet` | 从「第 01 天」「行动 5」「余额 ¥ 0」的文字里取第一个数字 | 数字格式或单位一改，日志里的天数与行动值就会记错。现在只能取到余额：负债与预支点数分别写在 `.rpg-wallet small`、`.rpg-ap small` 的第二段文字里，同一节点取第一个数字的做法拿不到，而多局跑下来欠债正是最主要的结束原因 |

## 补充说明

- `?preview-ending=END-07` 已经在 `main`（`21fab2a`，`src/ui/App.tsx`）实现，可以用来给 40 个故事结局做截图回归。它渲染的是 `.ending-page.ending-page-story`，眉题里的编号是 `END-07` 而不是 `X31`，与正式结局页取编号的方式不同（见第 5 条）。驱动器的整局自动通关没有走这条路。
- `document.modelContext`（`src/ui/WebMCP.ts` 的 `read_tyche_turn` 等）在 Chromium 与 WebKit 里都不存在，驱动器没有走这条路，全部靠 DOM。
- 上面第 3 条如果实现，驱动器可以去掉自己写 `data-autoplay` 属性的做法，界面就不会被测试改动。
- `src/**` 现在只有 `data-motion` 与 `data-perception` 两个 `data-*`，上表十条都还没有对应实现。
