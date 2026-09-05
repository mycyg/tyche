# 声音与角色配音

## 发布端

Tyche 是 GitHub Pages 静态游戏。音频在制作机离线生成、审听、转码后随静态文件发布；玩家端不下载模型、不访问本地推理接口、不持有 API 密钥。

游戏内已包含可开关的原创合成按键、纸页和掷骰提示音，初始静音。当前资源中没有生成对白或生成背景音乐；语音不作为操作或内容可理解性的必要条件。

## 可复用的 NovelCast 能力

已核对 [NovelCast 源码](https://github.com/mycyg/NovelCast)：TTS Provider 使用 `/v1/audio/speech`，支持固定角色、情绪指令、VoiceDesign、CustomVoice 和参考音频模式；另有对白/BGM/SFX 分轨、ducking、ASR 质检和 48kHz 母版导出。接口与台本组织可用于本作的离线资产制作，不把整个桌面工程搬进网页。

| 环节 | 模型与使用方式 |
| --- | --- |
| 角色初次选角 | Qwen3-TTS VoiceDesign，以原创角色描述设计声线 |
| 固定声线批量对白 | Qwen3-TTS Base，使用已批准的原创参考音频和对应文字 |
| 低成本验证 | Qwen3-TTS CustomVoice，使用模型许可允许的预置声音 |
| 背景音乐 | 可选 MiniMax-Music3，输出无歌词的短段并检查是否混入人声 |
| 对白质检 | ASR 回听，加人工核对专名、金额、否定词与数字 |

Qwen 官方 [VoiceDesign 模型页](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) 和 [CustomVoice 模型页](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) 标注 Apache-2.0，并提供自然语言声音控制。MiniMax-Music3 使用其自己的 [上游模型与许可](https://huggingface.co/MiniMaxAI/MiniMax-Music3)，不能因为游戏 MIT 开源就把音乐模型权重改标 MIT。

这套接口适配已经确认；不等于本游戏的配音成品已生成或经过听审。

## 原创角色声线表

| 声线 ID | 角色 | 音色与表演 |
| --- | --- | --- |
| tang | 唐济，科主任 | 中年男声，低中音，短句，语速稳定，不喊口号 |
| jiang | 姜蓉，护士长 | 成熟女声，中低音，干脆，疲倦时尾音缩短 |
| li | 李恂，住院医 | 青年男声，略沙哑，解释时停顿，求助时压低声音 |
| zhou | 周乔，科研同事 | 青年女声，清晰平直，数字读准，紧张时不提高音量 |
| ye | 叶茗，医药代表 | 成熟女声，中音，礼貌克制，条件句之间留空隙 |
| father | 父亲 | 年长男声，略慢，呼吸自然，不刻意营造病态 |

不用真人医生、演员或已有动漫角色的声音作克隆参考。角色音色由自有生成参考音频固定，不以每段不同提示词重新选角。

## 台词与音频合同

每句 cue 使用 `sceneId.choiceId.speaker.take` 标识。清单字段：`sceneId`、`speakerId`、`text`、`emotion`、`referenceVoice`、`audioPath`、`durationMs`、`model`、`license`、`reviewed`。条件分支分别生成，只播放本局到达的那一句；不可在失败分支播放成功的语音。

优先配制标题进入、六位角色首次对话、夜间急诊开场、鉴定庭提问与结局收口。完整对白属于同一资产合同的扩展，不改变状态机或骰子。

字幕与 UI 正文是唯一语义来源；声音按句触发、可跳过、可静音。第一次播放必须来自玩家手势。手机后台暂停，恢复页面不重播已经确认的选择。处理台词前缓存该句，不预载整部音频。

建议对白以单声道 AAC/Opus 发布，保留 WAV 母版在非公开制作目录。音效、环境、音乐、对白分轨；对白出现时降低其他轨道，不用峰值音量制造压迫感。许可与来源清单同成品一起归档，密钥、模型目录和机器路径不进入仓库。
