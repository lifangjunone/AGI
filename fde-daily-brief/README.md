# FDE Daily Brief

每天采集 FDE、AI 交付和产品工程相关公开热点，生成一篇可粘贴到公众号或内部知识库的结构化简报。

## 当前能力

- 从配置源采集公开技术与交付信号。
- 使用火山方舟生成面向 FDE 场景的日报正文。
- 支持立即运行、定时任务和本地服务三种模式。
- 配置通过环境变量提供，密钥不进入仓库。

## 运行

要求 Node.js 20+。

```bash
npm install
npm run run-now
```

启动定时采集：

```bash
npm start
```

启动本地服务：

```bash
npm run serve
```

## 配置

复制 `.env.example` 后按需配置模型、采集源和输出策略：

```bash
cp .env.example .env
```

`.env` 属于本地密钥和运行配置，不应提交。
