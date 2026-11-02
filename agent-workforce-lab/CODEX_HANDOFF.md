# Agent Workforce Lab 进度与任务交接

更新时间：2026-11-02

## 1. 当前目标

停止继续维护旧的 FastAPI/React Demo，基于成熟开源项目 MyContext 产品化：

> 将真实员工的工作聊天、文档和工作记录持续转化为有来源证据的工作知识、工作方法与能力边界，再通过真实工作结果验证，逐步扩大数字分身的辅助与执行权限。

当前第一条真实业务案例是 **Oncall 压测问题处理**。

产品首页首先回答三个问题：

1. 它最近学到了什么；
2. 它现在能帮什么；
3. 它哪里还不会。

硬约束：

- 这是产品，不是 Demo。
- 不允许用固定样例或采集数量冒充“已经学会”。
- 所有能力结论必须来自真实结论、证据、工作套路或真实运行状态。
- 优先复用开源能力，不重新实现采集、记忆、检索与工作知识提炼底座。
- 只修改 `/Users/bytedance/Desktop/agi/agent-workforce-lab`。

## 2. 已完成的开源底座

目录：

```text
open-source/mycontext
open-source/digital-twin-skill
```

固定版本见：

```text
open-source/sources.lock.json
```

已核实并运行 MyContext：

- 飞书只读连接器；
- 飞书聊天与文档增量采集；
- SQLite 本地存储；
- 全文、语义与图谱检索；
- 工作层蒸馏；
- 工作套路 Playbook；
- Electron 桌面应用。

启动命令：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab
./scripts/run-context-foundation.sh
```

项目专用 Node 22：

```text
/Users/bytedance/Desktop/projects/.tools/homebrew/opt/node@22/bin
```

当前开发进程可能仍在运行。MyContext 窗口停留在“创建 MyContext 账号”页。
不要代替用户创建账号或设置口令。

## 3. 已完成的本轮产品化修改

修改位置：

```text
open-source/mycontext
```

### 3.1 产品导航改名

中文：

- 仪表盘 → 成长首页
- 数字分身 → 工作现场
- 搜索 → 问工作记忆

英文：

- Dashboard → Growth
- Digital twin → Workroom
- Search → Ask work memory

涉及文件：

```text
packages/i18n/src/locales/zh/common.json
packages/i18n/src/locales/en/common.json
```

### 3.2 首页主线重构

成长首页顶部已从“六个裸统计数字”改为三张真实状态卡：

1. 学习输入：最近形成了什么工作结论；
2. 当前能力：当前能否基于工作记忆回答、能否生成消息草稿；
3. 能力缺口：数据源、身份、模型、工作结论、Playbook 和工作现场的真实阻塞。

两项主动作已经接通：

- “问我的工作记忆”进入搜索模块；
- “打开工作现场”进入工作现场模块。

原有关系图、事实列表和来源追踪保留在页面下方，作为能力依据。

没有写入固定业务样例，也没有把消息数表述为掌握技能。

涉及文件：

```text
apps/desktop/src/renderer/features/dashboard/dashboard-module.tsx
apps/desktop/src/renderer/features/dashboard/greeting-row.tsx
apps/desktop/src/renderer/features/shell/app-shell.tsx
```

### 3.3 新增正式的工作分身摘要接口

没有解析 `work.md`。新增只读领域接口：

```text
mycontext:distill/work-twin-summary
```

返回真实结构：

- 工作结论总数；
- 今日更新结论数；
- 独立证据数；
- 各类 facet 的数量和更新时间；
- 工作层产物是否存在；
- 工作层是否开启；
- Playbook 状态；
- Playbook 名称、触发条件和步骤数；
- Playbook 候选、合格和采样覆盖率。

特别区分：

- `available`：当前进程已有真实 Playbook；
- `none`：尚未归纳出 Playbook；
- `not_loaded`：磁盘可能已有工作产物，但本次进程尚未重建 Playbook 索引。

这样应用重启后不会把“内存尚未加载”误报成“这个人没有工作套路”。

接口涉及：

```text
packages/ipc-contract/src/contract.ts
packages/ipc-contract/src/api.ts
packages/ipc-contract/src/index.ts
apps/desktop/src/main/services/distill.service.ts
apps/desktop/src/main/ipc/register.ts
apps/desktop/src/preload/index.ts
apps/desktop/src/renderer/lib/queries.ts
apps/desktop/src/renderer/features/dashboard/use-dashboard-scope.ts
```

## 4. 当前修改文件

MyContext 嵌套仓库目前有以下未提交修改：

```text
apps/desktop/src/main/ipc/register.ts
apps/desktop/src/main/services/distill.service.ts
apps/desktop/src/preload/index.ts
apps/desktop/src/renderer/features/dashboard/dashboard-module.tsx
apps/desktop/src/renderer/features/dashboard/greeting-row.tsx
apps/desktop/src/renderer/features/dashboard/use-dashboard-scope.ts
apps/desktop/src/renderer/features/shell/app-shell.tsx
apps/desktop/src/renderer/lib/queries.ts
packages/i18n/src/locales/en/common.json
packages/i18n/src/locales/zh/common.json
packages/ipc-contract/src/api.ts
packages/ipc-contract/src/contract.ts
packages/ipc-contract/src/index.ts
```

不要丢弃这些修改，不要 reset 嵌套仓库。

## 5. 验证结果

已通过：

```text
全仓应用 typecheck
本次修改文件 ESLint
本次修改文件 Prettier
git diff --check
```

执行过的主检查：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab/open-source/mycontext

PATH=/Users/bytedance/Desktop/projects/.tools/homebrew/opt/node@22/bin:$PATH \
corepack pnpm@10.13.1 typecheck
```

`typecheck:tests` 未通过，但失败来自仓库已有的大量测试夹具漂移，例如：

- `KlServerServiceOptions.channelId` 缺失；
- 旧测试未等待异步 graph facts；
- 旧渠道能力夹具缺字段；
- 旧 Persona/Distill 测试类型未同步；
- 旧测试的 `workspaceRoot`、`signal`、`figureSeed` 等签名过期。

这批错误分散在大量未修改测试中，不是本次工作分身摘要接口引入的单一错误。
不要为了本任务顺手重写全部历史测试；应补本次接口的定向测试。

`check:typography` 因前面的 `typecheck:tests` 失败而没有继续执行，需要单独重跑。

## 6. 视觉验证状态

Electron 开发应用已启动，热更新正常。

但当前窗口停在：

```text
创建 MyContext 账号
```

遵守安全边界，没有替用户创建账号或设置密码，因此尚未完成登录后成长首页截图验收。

下一位工具/会话拿到用户已经创建的本地账号后，应立即进行：

1. 登录；
2. 检查成长首页三张主卡；
3. 检查“问我的工作记忆”跳转；
4. 检查“打开工作现场”跳转；
5. 检查 1440×900、1024×768 和窄窗口布局；
6. 确认下方旧关系图内容不会抢夺首页主线。

## 7. 下一步任务优先级

### P0：补定向测试

为 `DistillService.workTwinSummary()` 增加测试，至少覆盖：

1. 无数据库时返回诚实空状态；
2. facet 结论数正确；
3. evidence 去重正确；
4. 今日更新数正确；
5. Playbook `available`；
6. 有磁盘产物但内存未加载时为 `not_loaded`；
7. 损坏的历史 `evidenceJson` 不导致首页崩溃。

优先放在：

```text
tests/unit/desktop/
```

可参考：

```text
tests/unit/desktop/distill-forge.test.ts
```

### P0：登录后实机视觉与交互验收

不要只看 DOM 或 typecheck。必须在真实 Electron 窗口检查：

- 信息密度；
- 卡片高度；
- 是否仍有大字和异常空白；
- 按钮是否真正切换模块；
- 无数据、未配置模型、未确认身份、有真实结论四种状态。

### P0：接入真实 Oncall 压测案例

真实流程号：

```text
594805895684
```

已有历史资料：

```text
docs/research/oncall-case-overview.md
docs/14-productization-status.md
```

旧系统曾真实采集：

```text
806 条消息
788 条可学习
18 条跳过
```

正确做法：

1. 使用 MyContext 飞书连接器授权；
2. 选择对应 Oncall 群与飞书问题文档作为学习范围；
3. 真实采集；
4. 形成工作结论；
5. 归纳 Oncall 压测处理 Playbook；
6. 在成长首页展示真实结论、证据和缺口；
7. 用一个真实问题验证检索回答与来源引用；
8. 暂时不做高成本压测沙箱或服务镜像复制。

### P1：产品级能力成长

完成真实案例后，再建设：

- 工作结论审阅和证据回跳；
- 工作套路详情页；
- 真实任务结果验证；
- “观察 → 建议 → 草稿 → 有条件执行”的逐级放权；
- 业务结果失败后的经验回流；
- 能力印记和等级，但等级必须由证据与结果驱动，不能游戏化造假。

## 8. 已有关键文档

本地：

```text
docs/research/16-open-source-first-product-pivot.md
docs/research/oncall-case-overview.md
docs/14-productization-status.md
open-source/README.md
```

飞书：

- 产品转向：用开源工作上下文底座构建会工作的数字分身
  https://bytedance.larkoffice.com/docx/Pedsda9sGoHVYDxJqLGc7cL7nZe

父目录：

```text
https://bytedance.larkoffice.com/wiki/NzOxwpVVliE3MRkPShEcZknwnVQ
```

## 9. 开源许可证边界

- MyContext：Elastic License 2.0。可内部使用和修改，但不能直接把其主要功能作为第三方托管服务出售。
- digital-twin-skill：未发现许可证文件，只能做机制参考，不能复制其代码进入产品。

产品化前必须继续保留许可证审查，不要默认所有 GitHub 项目都能商用整合。

## 10. 推荐继续命令

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab/open-source/mycontext

git status --short
git diff --check

PATH=/Users/bytedance/Desktop/projects/.tools/homebrew/opt/node@22/bin:$PATH \
corepack pnpm@10.13.1 typecheck

PATH=/Users/bytedance/Desktop/projects/.tools/homebrew/opt/node@22/bin:$PATH \
corepack pnpm@10.13.1 check:typography
```

启动桌面应用：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab
./scripts/run-context-foundation.sh
```

## 11. 不要做的事

- 不要回到旧 FastAPI/React Demo 上继续修 UI。
- 不要把固定 Oncall 数据写死成“学习成功”。
- 不要解析 `work.md` 作为 UI 数据源。
- 不要用消息数、文档数或 token 数直接映射能力等级。
- 不要替用户创建本地账号或设置口令。
- 不要修改 `/Users/bytedance/Desktop/agi` 下的其他项目。
- 不要清理或覆盖 MyContext 当前未提交修改。
