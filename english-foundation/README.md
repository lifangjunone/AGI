# English Foundation

## 统一身份

Tauri 桌面端通过 LifeYouMe 设备授权连接统一账号，学习记录继续本地保存并以
稳定用户 ID 分区；产品不得收集或保存统一账号密码。接入契约见
[`lifeyoume-platform/docs/SSO.md`](../lifeyoume-platform/docs/SSO.md)。

产品类型：英语基础训练桌面应用
运行形态：Tauri 2、React、TypeScript、Rust
兼容性说明：macOS 构建产物当前仍使用 `Foundation.app`，后续可在签名和发布迁移时一并升级。

面向中国英语初学者的本地优先桌面学习软件，通过“词汇理解、句子拆解、语法辨析、错项复习”建立英语基础。

## 核心能力

- 今日学习路径：把词汇、句子和语法组织成约 18 分钟的每日闭环
- 词汇学习：音标、词性、中文释义、词族、记忆线索、系统朗读和语境例句
- 句子实验室：主谓宾与状语可视化拆解、语块排序、错误原因反馈
- 语法训练：核心规则、正误最小对比和即时选择题
- 本地复习：自主标记薄弱词，掌握后移出；XP、连续天数和完成度保存在本机
- 桌面体验：支持 980×640 至 1440×900 窗口，以及 `⌘⇧D` 标准/舒适密度切换

首版课程内置 5 个核心词、3 个实用句和 3 组基础语法。应用不需要账号、云端服务或 API 密钥。

## 开发运行

```bash
npm install
npm run dev
```

浏览器开发地址：

```text
http://localhost:1430
```

启动 Tauri 桌面窗口：

```bash
npm run tauri dev
```

## 验证与打包

```bash
npm test
npm run build
npm run build:app
```

macOS 应用构建产物位于：

```text
src-tauri/target/release/bundle/macos/Foundation.app
```

对外分发前仍需配置 Apple Developer 签名与 notarization。

## 数据与隐私

学习进度存储在 WebView 的本机 `localStorage` 中。当前版本没有外部接口，不上传学习记录；语音播放使用 macOS WebView 提供的系统语音合成能力。
