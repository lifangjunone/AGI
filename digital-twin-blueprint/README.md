# 数字分身产品与架构蓝图

这是一个面向“个人/专家/创始人数字分身”的产品设计与技术架构项目。它把前期调研结论整理成可评审、可迭代、可落地的文档与可视化架构图。

## 项目定位

帮助创始人、专家、销售、老师、IP 主理人创建一个“像本人、有记忆、能对话、可授权办事”的 AI 数字分身。

核心不是只做一个会动的脸，而是完整闭环：

```text
本人资料 → 人格建模 → 知识记忆 → 语音/形象克隆 → 实时对话 → 纠错训练 → 权限办事
```

## 目录结构

```text
digital-twin-blueprint/
├── README.md
├── index.html
├── docs/
│   ├── product-design.md
│   ├── technical-architecture.md
│   └── roadmap.md
└── assets/
    └── architecture.mmd
```

## 文件说明

- `index.html`：可直接打开的美观架构图与产品方案总览页。
- `docs/product-design.md`：产品定位、用户角色、核心流程、页面设计与 MVP 范围。
- `docs/technical-architecture.md`：总体技术架构、实时链路、数据与模型层设计。
- `docs/roadmap.md`：MVP、V1、V2、V3 路线图。
- `assets/architecture.mmd`：可复用的 Mermaid 总体架构图源码。

## 推荐打开方式

直接用浏览器打开：

```text
index.html
```

页面会从 CDN 加载 Mermaid，用于渲染架构图、链路图和路线图。

## 核心判断

业界的数字分身已经从“AI 换脸/口型同步”进化成“实时多模态 Agent”。脸和声音只是外壳，真正的壁垒是：

- 长期记忆
- 本人风格
- 工具权限
- 低延迟实时链路
- 安全授权
- 持续纠错闭环

第一版建议优先做好“文字 + 语音分身”，验证“像本人”和“有业务价值”，再接入实时视频 Avatar。
