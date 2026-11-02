# Agent Workforce Lab

> **2026-11-02 产品转向：**旧 FastAPI/React 界面不再作为产品主入口继续扩展。
> 当前产品以开源 [MyContext](https://github.com/openTrinity/mycontext) 作为本地工作
> 上下文底座，优先复用其飞书连接器、增量采集、SQLite、证据检索、蒸馏和桌面端。
> 本项目只在其上建设“工作案例重建、能力证据、逐级放权和任务协作”的差异化能力。
> 详细决策见
> [产品转向文档](docs/research/16-open-source-first-product-pivot.md) 和
> [开源底座说明](open-source/README.md)。

新的底座启动方式（要求 Node 22）：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab
./scripts/run-context-foundation.sh
```

下方内容记录旧系统及历史验证，仅作为案例和领域逻辑参考，不代表新的产品入口。

**把真实员工的经验，变成会工作的数字员工。**

产品目标不是聊天机器人或固定案例 Demo。当前重写版仍未完成产品主线，下面是建设目标，不是已实现能力清单：

```text
真实员工经验
→ 数字员工学习并主动澄清
→ 场景试岗与能力印记
→ 专门运营人员发布任务
→ 数字员工自评并独立接单
→ 执行中求助和动态邀请
→ 第三人加入自动成立任务组
→ 成果提交
→ 真人验收或退回
→ 交付证据回流能力档案
```

## 当前产品

员工端与运营端分开。目标中的三个核心动作分别是：

1. 培养数字员工：从已经发生的工作开始，只向真人询问缺失的边界；
2. 发布任务：数字员工基于已验证能力判断能否独立接单；
3. 查看进度与成果：观察独立执行、求助、成员加入、任务组成形和验收。

运行中的业务边界：

- 未通过试岗的能力不能用于独立接单；
- 执行中发现能力缺口，可以邀请其他数字员工；
- 第二人加入是协作，第三人加入自动建立关联原任务的任务组；
- 执行者不能自行验收成果；
- 退回后保留原任务继续修改；
- 重复验收不会重复累计能力证据；
- 所有业务对象按组织隔离并持久化到 SQLite。

## 本地启动

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab
python3 run.py
```

打开：

- 双入口选择：[http://127.0.0.1:43222/](http://127.0.0.1:43222/)
- 我的数字分身：[http://127.0.0.1:43222/me](http://127.0.0.1:43222/me)
- 数字员工运营台：[http://127.0.0.1:43222/ops](http://127.0.0.1:43222/ops)
- API：[http://127.0.0.1:43222/docs](http://127.0.0.1:43222/docs)

首次安装：

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock.txt
cd frontend
npm ci
npm run build
cd ..
python3 run.py
```

## 新系统边界

- 新后端入口：[backend/app.py](backend/app.py)，领域逻辑在
  [backend/studio.py](backend/studio.py)；
- 新前端入口：[frontend/src/Studio.tsx](frontend/src/Studio.tsx)；
- `run.py` 只加载新 `app:app`，不会加载旧业务路由；
- 旧文件暂时保留为历史研究材料，不进入新运行路径；
- 未删除旧数据库，v2 对象使用独立的 `v2_*` 类型保存。

技术栈为 React 19 + TypeScript + FastAPI + SQLite。当前学习理解与试岗使用透明的
确定性规则，不声称发生了模型微调，也不会在模型调用失败时伪造成功。

当前运行路径尚未接入持续飞书采集、Semantica 检索、真实模型学习／考试／执行、
独立评审或积分奖励。教学与成果仍需人工输入，不能称为已经降低真人工作量。
完整现状及历史记录适用范围见 [产品化状态](docs/14-productization-status.md)。

最新隔离 UI 设计在 `design/review/learning-workspace/`，尚未获用户选择，
不会自动替换正式界面。

## 验证

新领域测试：

```bash
cd backend
../.venv/bin/python -m pytest -q test_studio_v2.py
```

前端生产构建：

```bash
cd frontend
npm run build
```

真实浏览器验收：

```bash
PW_ARTIFACT_DIR=design/review/product-v2/round-2 \
TARGET_URL=http://127.0.0.1:43222 \
node /Users/bytedance/.codex/skills/playwright-skill/run.js tests/studio-v2.cjs
```

浏览器证据在：

```text
design/review/product-v2/round-1/
design/review/product-v2/round-2/
```

覆盖注册、组织初始化、学习提问、试岗、独立接单、执行中求助、两人协作、
第三人成组、成果验收、桌面端、375px 移动端、横向溢出和控制台错误。

## 下一阶段

当前版本已经把产品主线、前后端状态流和可操作界面放到同一套新系统中。后续产品化重点是：

- 把日常工作来源接入学习空间，减少真人主动录入；
- 将透明规则升级为可配置模型适配器，同时保留来源与边界证据；
- 增加任务运行时、真实工具调用与暂停恢复；
- 完善授权撤回、能力降级、审计和更细粒度角色权限；
- 继续以真实业务案例验证，不回到固定脚本 Demo。
