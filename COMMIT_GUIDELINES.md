# Commit Guidelines

本文件定义本仓库提交代码、提交文档和推送到 GitHub 前后的最低要求。所有子项目都适用；子项目 README 可以补充更严格的运行和验证命令。

## 基本原则

- 每次提交必须是一个清晰的产品或工程意图，不把互不相关的修改强行塞进同一个提交。
- 不覆盖、回滚或整理他人正在进行的改动；发现无关改动时保持原样。
- 提交前必须确认工作区中哪些文件属于本次变更，哪些是已有未提交改动。
- 自动提交只代表阶段性代码快照，不代表功能已经通过验收。

## 文档同步

- 修改功能、产品入口、部署方式、运行方式或项目边界时，必须同步更新根 `README.md`。
- 修改某个子项目时，必须同步检查并更新该子项目的 `README.md`。
- 新增子项目时，必须同时补齐根 `README.md` 项目目录、快速开始、功能说明和子项目 `README.md`。
- 每次功能、修复、部署或文档变更都必须写入根 `CHANGELOG.md`。
- `CHANGELOG.md` 使用以下分类：
  - `feat`：新增功能、产品、入口、能力。
  - `fix`：问题修复、回归修复、部署修复。
  - `docs`：README、设计文档、提交规范、运行说明。
  - `test`：测试补充、测试修复、验证脚本。
  - `chore`：依赖、脚本、配置和非用户可见维护。

## 提交信息

提交信息采用简短 Conventional Commit 风格：

```text
feat: add product workspace project
fix: repair payment callback parsing
docs: add commit guidelines
test: cover platform policy update
chore: update local sync ignore rules
```

要求：

- 使用英文动词短句，首行不超过 72 个字符。
- 类型必须准确，不用 `feat` 包装纯文档或纯配置变更。
- 如果一次提交覆盖多个产品，提交信息必须描述共同意图，而不是列文件名。

## 禁止提交

以下内容不得进入 Git：

- `node_modules/`、`dist/`、`build/`、`target/`、`.venv/`、`.pytest_cache/`、`.next/`、`.vite/` 等依赖、构建和缓存目录。
- `.env`、`.env.local`、私钥、证书、Token、真实 AppSecret、真实支付密钥、生产管理员密码。
- 运行时数据库、会话数据库、支付流水本地库，例如 `*.db`、`*.db-shm`、`*.db-wal`。
- 本地模型权重、MetaHuman 源角色和受许可约束的源资产。
- 超过 GitHub 普通仓库限制的大文件；单文件接近 95 MB 时必须先评估是否应改用外部存储或 Git LFS。

允许提交：

- `.env.example`、`.env.sample` 等不含真实密钥的配置模板。
- 产品 README、测试证据、体积合理且用于验收说明的截图或短视频。
- 可复现构建所需的 lockfile，例如 `package-lock.json`。

## 提交前检查

提交前至少执行：

```bash
git status --short --branch
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

风险扫描建议执行：

```bash
git diff --cached --name-only | xargs rg -n --no-heading \
  '(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|ghp_[A-Za-z0-9_]{20,})' -- 2>/dev/null
```

暂存后检查：

```bash
git diff --cached --stat
git diff --cached --name-only
git diff --cached --check
```

## 测试与验证

- 修改代码时，优先运行对应子项目 README 或 `package.json` / `pyproject.toml` 中声明的测试。
- 修改共享平台、认证、支付、Nginx、部署脚本或跨产品路由时，必须运行相关平台测试和代表性路由探测。
- 如果测试失败但仍需提交，最终说明必须写清失败命令、失败数量、失败原因判断和后续处理边界。
- 不允许把未运行的测试写成已通过。

## 共享 Nginx 安全

`/data/app/lifeyoume-platform/deploy/nginx-platform.conf` 是多产品共享配置，提交或部署相关修改时必须遵守根目录 `AGENTS.md`：

- 只能追加或更新本产品明确作用域内的 `location` 块。
- 不得从单个产品安装脚本复制、覆盖或重生成整份共享 Nginx 配置。
- 修改前备份并盘点已有路由；修改后确认无关路由仍存在。
- 必须执行 `nginx -t` 后再 `nginx -s reload`。
- 不为单个产品部署重启或重建共享代理容器。

## 推送与远端校验

推送前确认当前分支和远端：

```bash
git branch --show-current
git remote -v
```

推送后必须取回远端并比对提交和 tree：

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse FETCH_HEAD
git rev-parse HEAD^{tree}
git rev-parse FETCH_HEAD^{tree}
git diff --stat HEAD FETCH_HEAD
```

如果本地和远程 commit id、tree id 均一致，则 GitHub 上的已跟踪文件内容完整一致；不存在“commit id 一样但部分已跟踪文件没推上去”的正常状态。

## 提交后说明

完成提交后，给出以下信息：

- commit id 和提交信息。
- 是否已推送到远端。
- 本地 HEAD、远端 HEAD、tree 是否一致。
- 运行过哪些测试，哪些通过，哪些失败。
- 明确列出未提交但被忽略的运行时数据或构建产物。
