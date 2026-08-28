# Delivery Control Center

产品类型：本地 AI 研发交付控制中心
原产品名：OneOPC
运行形态：Electron macOS 桌面应用
上游项目：[`technology-intelligence/`](../technology-intelligence/)

Delivery Control Center 是一个本地优先的桌面交付控制中心，目标是：

```text
输入文字描述或需求文档 -> 全自动研发与验证 -> 输出本地可用系统
```

## 当前 MVP

应用内部的 `OneOPC` App ID、本机数据目录和历史交付记录暂时保留，确保现有用户数据和交付协议可以平滑迁移。

- Electron macOS 桌面应用
- 统一需求入口：支持直接文字描述或原生需求文档选择
- 文字需求自动生成项目名，并归档为 Markdown 原件
- 原始输入物理归档与 SHA-256 校验
- Delivery Run 本地持久化
- 启动时自动识别 Work/Code 工具并选择默认工具链
- 支持 Trae Work、WorkBuddy、TraeBuddy、Trae Code、Codex、Cursor、Claude Code 和 GitHub Copilot
- 领导视角与开发者视角
- 首页交付脉搏：直接呈现需关注任务、正在执行、等待接管和最近交付，并可定位对应监管卡片
- 阶段导航、真实事件流、原始事件数据和证据面板
- 最新系统交付收据：展示部署地址、版本、交付时间和验收依据，可直接打开本地系统
- 需求与员工草稿使用本机双副本 SHA-256 完整性保护；损坏副本最多隔离 7 天、保留 4 份，清空全部草稿后立即销毁

未接入的 AI、测试和部署执行器明确显示为“未配置”，不会生成模拟进度。

## 本地运行

```bash
npm install
npm start
```

## 验证与打包

```bash
npm run check
npm run pack
```

打包结果：

```text
dist/mac-arm64/OneOPC.app
```

## 数据目录

开发模式：

```text
OneOPC/
├── inputs/requirements/<run-id>/
├── work/runs/<run-id>/run.json
└── settings/
    ├── input-drafts.json
    └── input-drafts.backup.json
```

打包应用：

```text
~/Library/Application Support/OneOPC/
├── inputs/requirements/<run-id>/
├── work/runs/<run-id>/run.json
└── settings/
    ├── input-drafts.json
    └── input-drafts.backup.json
```

设置目录中的崩溃临时文件超过 24 小时自动清理。草稿损坏隔离文件只按严格文件名白名单处理，不会扫描或删除客户创建的其他文件。
