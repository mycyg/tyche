# 美术资源

暗青、紫黑与琥珀色的 2D 像素医院，俯视角色精灵与二次元对话画像分层呈现。所有人物、肖像和场景均为原创生成资源，不使用真实患者照片或其他游戏素材。文字、数值和交互按钮不烘焙进图片。

| 发布资源 | 内容 |
| --- | --- |
| `ward-map.webp` | 房间、走廊与家具源图；按相同像素比例裁切、平移组成 1536×512 医院 |
| `hero-walk.webp` | 主角四朝向、四帧精灵 |
| `npc-idle.webp` | 六位角色各四帧待机动作，统一脚底锚点 |
| `npc-sprites.webp` | 六位角色静态精灵图集 |
| `bed-patients.webp` | 二十种卧床患者，5×4 透明地图图集 |
| `bedside-patients.webp` | 同一批患者的床旁近景图集 |
| `patient-portraits.webp` | 二十种患者对话画像，顺序对应 C001—C020 |
| `bedside.webp` | 病床、监护仪、床头夹与医嘱物件近景 |
| `characters-a.webp`、`characters-b.webp` | 唐济、姜蓉、李恂、周乔、叶茗与父亲的对话画像 |
| `hospital.webp` | 夜间走廊与鉴定室环境图 |

以上资源均位于 `public/art/`，随静态构建交付。相同病例模板可以接收不同姓名的患者，记录与后果始终按独立患者标识保存。

## 生成与处理

图像采用内置 `image_gen` 生成。完整提示词、排列顺序与发布文件校验值见 [JRPG 美术清单](jrpg-art-prompts.json)；环境与六位对话角色的提示词见 [角色美术清单](art-prompts.json)。没有使用 CLI 图像模型调用或在线运行时生成。

卧床患者的透明通道由经授权的本地连通区域抠图产生，保留衣物、皮肤与被子；其他透明图集保留生成的 alpha。地图与近景分别打包，避免放大小精灵。人物按脚底深度与家具遮挡面排序；实际住院者显示在对应床位。待机动作不消耗游戏随机数，减少动态效果设置可以停用。

机械转换工具使用 `sharp`，输入路径由命令行提供：`scripts/prepare-art.mjs`、`scripts/prepare-jrpg-art.mjs`、`scripts/prepare-bedside-art.mjs`。卧床抠图工具为 `scripts/extract-bed-patients.mjs`。日常运行和构建不需要生成模型、图像处理依赖或 API 密钥。

源码、原创文字与这些生成资源按仓库 MIT 许可开放；依赖的许可见 [第三方说明](../THIRD_PARTY_NOTICES.md)。
