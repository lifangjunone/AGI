<!-- generated-by: gsd-doc-writer -->
# MetaHuman Asset Rebuild Guide

本文说明 English Immersion Studio 的 MetaHuman 资产边界、备份策略和重建流程。目标是在不向公开 GitHub 仓库分发 Epic 源格式许可内容的前提下，保留角色身份并恢复可运行的 Unreal 资产。

## 结论

- 不要把 `Content/Characters/MetaHumans/` 或 `Content/MetaHumans/` 中的 MetaHuman `.uasset` 提交到当前公开 GitHub 仓库。
- Git LFS 只能解决 GitHub 的文件大小限制，不能改变资产许可证或公开分发权限。
- 不要删除四个本地可编辑源角色。将它们保存在受访问控制的私有对象存储、私有制品库或私有 Git LFS 仓库中。
- 公共仓库保留 Unreal 工程代码、生成脚本、非敏感角色参数、校验和及本重建说明。

Epic Content License Agreement 对源格式许可内容的共享范围有限制。发布或迁移资产前，应以当前英文正式协议为准：

<https://www.unrealengine.com/en-US/eula/content>

## 资产边界

### 可编辑源角色

以下文件位于 `services/metahuman-renderer/Content/Characters/MetaHumans/`，供 MetaHuman Character Editor、发型更新和运行时组装流程使用：

| 角色 | 文件大小 | SHA-256 |
| --- | ---: | --- |
| Sophia | 134,691,789 B | `e25e88b14ae1b786f6724b9d3434a2e584f1ab41cb8da4e52bc3f0ad06e1ca27` |
| SophiaAoi | 149,053,187 B | `9c59bfd25ad902703b6f3563224cf7b1d114d9fb2cbfde73961adab980152545` |
| SophiaTuya | 145,971,046 B | `021ce9f362777e47c1eccc3a0ffe6dffcbd7e180339ea1d530653b637050795b` |
| Vivian | 139,153,119 B | `53d63969267260dc8132f100afb64d358c9855f39ea14bc05c0bf95cad51796d` |

这些文件不是 Electron 运行时直接加载的角色入口，但以下编辑和构建脚本依赖它们：

- `services/metahuman-renderer/Scripts/update_character_hair.py`
- `services/metahuman-renderer/Scripts/build_sophia.py`

### 运行时组装资产

应用和场景脚本加载 `services/metahuman-renderer/Content/MetaHumans/` 下的优化运行时蓝图：

| 角色 | Unreal 入口 |
| --- | --- |
| Sophia / Amara | `/Game/MetaHumans/Sophia/BP_Sophia` |
| SophiaTuya | `/Game/MetaHumans/SophiaTuya/BP_SophiaTuya` |
| Vivian | `/Game/MetaHumans/Vivian/BP_Vivian` |

`Content/MetaHumans/Common/` 还包含共享材质、Rig、动画和面部依赖。仅保留 `BP_*.uasset` 不能构成完整运行时角色。

### 可公开版本化内容

下列内容应保留在公共代码仓库：

- `services/metahuman-renderer/EnglishImmersionRenderer.uproject`
- `services/metahuman-renderer/Config/`
- `services/metahuman-renderer/Source/`
- `services/metahuman-renderer/Scripts/`
- `services/metahuman-renderer/Content/Python/`
- 非敏感角色配方、资产清单、校验和及验收文档

## 重建前提

1. 安装项目声明的 Unreal Engine `5.7.x`。
2. 通过 Epic Games Launcher 安装 MetaHuman Creator Core Data 和 Starter Content。
3. 在工程中启用 `MetaHumanCharacter`、`RigLogic`、`ControlRig`、`HairStrands`、`PixelStreaming2`、`LiveLink`、`AppleARKitFaceSupport` 和 `Audio2Lipsync`。
4. 首次下载纹理或自动绑定时完成 Epic 设备授权。
5. 从私有备份恢复可编辑源角色，或者确认对应角色的完整生成配方已经版本化。

## 私有备份

在修改或重建角色前，对源角色生成校验清单：

```bash
cd english-immersion-studio
find services/metahuman-renderer/Content/Characters/MetaHumans \
  -type f -name '*.uasset' -print0 \
  | xargs -0 shasum -a 256 \
  > metahuman-source-assets.sha256
```

将源角色和校验清单上传到受访问控制的私有存储。不要把归档文件、下载链接、访问令牌或签名 URL 写入仓库。

恢复后验证：

```bash
cd english-immersion-studio
shasum -a 256 -c metahuman-source-assets.sha256
```

## 重建流程

以下命令从 `services/metahuman-renderer/` 目录执行。macOS 示例使用项目现有的 Unreal 镜像方式，以避免 Desktop Folder TCC 提示。

### 1. 准备工程镜像

```bash
export EIS_UNREAL_ENGINE_ROOT="/Users/Shared/Epic Games/UE_5.7"
export EIS_UNREAL_MIRROR="/Users/Shared/EnglishImmersionRenderer"
export EIS_UNREAL_EDITOR="$EIS_UNREAL_ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor"

rsync -a --delete \
  --exclude Binaries \
  --exclude Intermediate \
  --exclude Saved \
  ./ "$EIS_UNREAL_MIRROR/"
```

### 2. 创建或恢复可编辑角色

`Scripts/setup_sophia.py` 支持以下参数：

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `EISCharacterName` | `SophiaAoi` | `/Game/Characters/MetaHumans/` 下的源角色名称 |
| `EISPreset` | `Aoi` | Epic Core Data 中的成人女性预设 |
| `EISHair` | `Hair_L_Straight` | MetaHuman wardrobe 发型 |

示例：

```bash
"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/setup_sophia.py" \
  -EISCharacterName=SophiaAoi \
  -EISPreset=Aoi \
  -EISHair=Hair_L_Straight \
  -log
```

当前仓库没有完整记录 Sophia、SophiaTuya 和 Vivian 各自的全部源预设及人工编辑参数。在这些配方补齐并通过视觉比对前，应从私有备份恢复对应源 `.uasset`，不能假设重新运行默认命令会得到相同身份。

### 3. 更新已有角色发型

```bash
"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/update_character_hair.py" \
  -EISCharacterName=Sophia \
  -EISHair=Hair_L_StraightBangs \
  -log
```

该步骤要求对应可编辑源角色已经存在。

### 4. 组装优化运行时角色

从私有备份恢复三个源角色后，依次构建场景所需的全部运行时入口：

```bash
for character in SophiaTuya Sophia Vivian; do
  "$EIS_UNREAL_EDITOR" \
    "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
    "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/build_sophia.py" \
    "-EISCharacterName=$character" \
    -log || exit 1
done
```

构建脚本会请求纹理源和完整 joints-and-blend-shapes 自动绑定，然后输出到 `/Game/MetaHumans/`。只有在源角色已经包含有效纹理和绑定时，才可使用 `-EISSkipTextures` 或 `-EISSkipAutoRig`。

### 5. 重建并验证场景

直接调用 `UnrealEditor` 可让 shell 等待当前步骤结束。确认场景生成进程已经退出后，再执行验证命令，禁止让两个 Editor 实例同时写入同一工程。

```bash
"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/setup_interview_scene.py" \
  -log

"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/verify_interview_scene.py" \
  -log
```

`setup_interview_scene.py` 默认要求 SophiaTuya、Sophia 和 Vivian 三个优化蓝图。验证脚本检查角色标签、三种发型标签、双摄像机和灯光。

## 验收要求

重建成功不能只以 Unreal 脚本退出码判断。每个角色都必须完成：

1. 源角色和运行时蓝图存在性检查。
2. 第一人称与第三人称真实渲染检查。
3. 发型、服装、面部材质和身份标签检查。
4. Electron 中角色切换与肖像一一对应检查。
5. LiveLink 或 Audio2Lipsync 面部驱动检查。
6. 与 `docs/evidence/2026-09-03/` 中已验收截图进行视觉比对。

任何身份、发型或材质不一致都视为重建失败，不得用近似预设替代。

## 当前缺口

- Sophia、SophiaTuya 和 Vivian 的完整 `EISPreset`、体型、妆容及人工编辑参数尚未形成独立角色配方清单。
- `Content/MetaHumans/` 的共享依赖约 `924 MB`，不能只备份三个 `BP_*.uasset`。
- 公共仓库的自动同步任务按单文件大小过滤，不能代替 MetaHuman 许可资产目录级排除。
- 在私有备份和角色配方均验证前，不得清理本地四个源 `.uasset`。
