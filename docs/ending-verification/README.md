# 结局页与场景 BGM 验证

## 截图

用 `?preview-ending=END-xx` 预览路由逐页渲染，`vite preview --port 5194` 提供构建产物，Chromium 分别在 1440×900（desktop）、390×844（portrait）、844×390（landscape）三种视口截图，`fullPage: true`。

40 个主结局里抽取 6 个，覆盖不同结局类别：

| 文件前缀 | 结局 | 类别 |
| --- | --- | --- |
| `01-crime-imprisonment` | END-01《罪与罚》 | 刑事实刑 |
| `09-assault-death` | END-09《一桩事先张扬的凶杀案》 | 伤医身亡 |
| `15-suicide-aftermath` | END-15《局外人》 | 自杀身后 |
| `20-family-bereavement` | END-20《长日将尽》 | 家庭破裂／丧亲 |
| `28-livelihood-courier` | END-28《骆驼祥子》 | 临床外谋生 |
| `40-true-ending` | END-40《平凡的世界》 | 唯一真结局 |

每个前缀各有 `-desktop.png`、`-portrait.png`、`-landscape.png` 三张。`support-card-*.png` 三张单独截取 END-15 页面里的「写给你」致玩家卡（`.ending-support` 元素本身，非整页），确认「先休息一下」「返回标题」「查看支持信息」三个按钮都在。END-40 的三张整页截图里没有这张卡，符合「唯一真结局不显示致玩家页」的要求。

verification 时机的构建不含真实配音（本地工作树没有 `public/audio/voice/` 录音库，语音改为空索引），画面、排版和图片加载与正式构建一致；`console`/`pageerror` 均为空。

## 场景 BGM 触发状态

选曲逻辑是纯函数 `musicSceneFor`（`src/ui/music-scene.ts`），单元测试见同目录 `music-scene.test.ts`。按判断顺序：

| 优先级 | 条件 | 曲目 |
| --- | --- | --- |
| 1 | 不在对局中（标题、设置） | `title` |
| 2 | `phase === 'ending'` | `ending-calm`（旧 X33/X34/X36 或 `storyId === 'END-40'`）／否则 `ending-dark` |
| 3 | `phase === 'tribunal'` | `inquiry` |
| 4 | 精神值 < 30 | `fracture` |
| 5 | 剩余队列已全部转入夜班／日终 | `night` |
| 6 | 当前卡为 `kind:'audit'`、`chain` 为 `'BTF-003'`／`'dispute'`，或 `sourceFollowup.kind==='dispute'` | `complaint-pressure`（家属录音、投诉升级、飞检约谈） |
| 7 | 当前卡 `actor` 为 `father`／`mother`，或 `scope.kind==='personal'` 且 `chain==='FAMILY-FUNDING-CONTACT'`／`scope.id` 含 `family` | `family-call`（家庭来电、筹款） |
| 8 | 当前卡 `actor==='research'`、`scope.kind==='project'` 或 `chain==='BTF-004'` | `research-afterhours`（科研室、科研事件） |
| 9 | 第 9 天及以后，且以上均不成立 | `pressure` |
| 10 | 以上均不成立（默认白天） | `ward-rounds`（原来的 `day` 曲目由此接替） |

第 4、5 项（精神危机、夜班）优先于新增的三条场景曲，与接手前既有的判断顺序一致，避免夜班或精神归零时被家庭来电打断氛围。`ward-rounds`／`family-call`／`research-afterhours`／`complaint-pressure` 四首优先加载 `.ogg`（`audio.ts` 用 `canPlayType` 探测，不支持时退回 `.mp3`），并按 `public/audio/music/manifest.json` 里的 `loopStart`／`loopEndSamples`／`sampleRate` 用 `timeupdate` 精确跳回循环起点，不依赖 `<audio loop>` 对文件尾静音的处理。

本目录截图不含音频；BGM 的加载与文件名可在 `dist/audio/music/` 或运行 `tests/e2e/first-shift.spec.ts` 时截获的 `played` 列表核对。
