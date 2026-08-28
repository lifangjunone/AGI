# EasySay

## What This Is

EasySay 是一款面向中国成年人的移动端英语口语学习 PWA。它根据用户水平、目标和可用时间制定 24 周计划，并通过“输入、模仿、脱稿输出、反馈、重说、间隔复测”形成每日训练闭环。

第一版服务单个用户，可安装到 iPhone 或 Android 桌面。学习档案、任务进度和录音保存在本地，Ark 模型通过 Node 服务端代理生成计划、角色扮演与反馈。

## Core Value

用户每天打开应用后，能立即完成一组真正需要开口、获得反馈并重说的个性化任务。

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] 用户能完成口语基线测评并建立个人学习档案
- [ ] 应用能生成并展示 24 周个性化口语学习计划
- [ ] 用户能执行输入、跟读、录音、反馈和重练任务
- [ ] 用户能与 AI 完成结构化英语角色扮演
- [ ] 应用能按间隔复习规则安排表达块复现
- [ ] 用户能查看每日连续学习、周进度和阶段能力变化
- [ ] 应用可安装到手机桌面并在弱网时打开基础界面

### Out of Scope

- 多用户账号与云同步 - 第一版优先验证个人学习闭环
- 原生应用商店打包 - 第一版使用可安装 PWA
- 实时真人语伴匹配 - 依赖社区与风控能力，后续版本考虑

## Context

- 目标学习者通常存在输入强、输出弱、害怕犯错、缺少真实反馈等问题。
- 训练方案以 CEFR 可执行任务为目标，不以消除中国口音为目标。
- 发音反馈优先关注可理解度、单词重音、尾音和句子节奏。
- 用户已提供 Ark base URL、视觉 endpoint/model 和深思模型名称。

## Constraints

- **Delivery**: 移动优先 PWA - 同时支持桌面调试和手机安装
- **Privacy**: Ark API key 只能存在服务端环境变量中
- **Speech**: Apple Silicon 使用本地 Qwen3 MLX 模型，浏览器识别和系统朗读作为降级
- **Persistence**: 第一版使用 IndexedDB/localStorage，不依赖数据库
- **Language**: 界面与教练反馈以中文为主，训练内容使用英语

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + TypeScript PWA | 快速交付移动端安装体验与浏览器语音能力 | - Pending |
| Node/Express Ark proxy | 防止前端泄露 API key，并集中模型适配 | - Pending |
| Vertical MVP | 每个阶段交付可操作用户流程 | - Pending |
| Local-first data | 单用户首版无需账号和数据库 | - Pending |
| Local MLX speech service | 模型和录音不离开本机，同时利用 Apple Silicon 统一内存 | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Move validated requirements to Validated with a phase reference.
2. Move invalidated requirements to Out of Scope with a reason.
3. Add newly discovered requirements to Active.
4. Record decisions and update the product description if needed.

**After each milestone:**
1. Review all requirements and scope boundaries.
2. Confirm the core value remains the correct priority.
3. Update context with user feedback and observed metrics.

---
*Last updated: 2026-08-13 after initialization*
