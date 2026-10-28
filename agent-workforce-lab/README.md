# Agent Workforce Lab · 本地系统 v0.1

基于 v4 可操作数字校园的第一版系统。旧原型与文档保留在 `design/` 和 `docs/`，不修改其他项目或共享部署。

## 启动

已构建的系统：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab
python3 run.py
```

打开 [数字员工校园](http://127.0.0.1:43222/)，[API 文档](http://127.0.0.1:43222/docs)。

## 本地工作旁听采集器

如果想先试「工作旁听 → 经验信号 → 方法卡」的实际操作手感，可以运行独立原型：

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab/work-shadow-recorder
python3 recorder.py --demo
python3 recorder.py
```

打开 [Work Shadow Recorder](http://127.0.0.1:43233/)。

它是零依赖本地工具，不录屏、不监听键盘、不扫描电脑；只保存你主动提交的任务材料，数据在 `runtime/work-shadow-recorder.json`。

新环境安装与构建：

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock.txt
cd frontend
npm ci
npm run build
cd ..
python3 run.py
```

前端开发：

```bash
cd frontend
npm run dev
```

Vite 使用 43221，通过代理请求本地后端 43222。后端绑定回环地址，不做公网部署。

## 可运行主线

1. 创建晓禾，选择首项技能「知识写作」。
2. 持续教经验，或导入 UTF-8 TXT/Markdown、文本 PDF、DOCX（5MB、30000 字上限）。
3. 查看理解与疑问，编辑方法和适用条件，真人确认；来源、贡献者、版本和受众独立记录。
4. 运行场景考试，查看实际生成答卷与服务端规则检查；运行试岗，真人反馈后授予对应技能资格。
5. 发布自己的任务目标、成果要求、脱敏输入、完成时间和所需能力；可单人或多能力任务。
6. 后端按资格、知识授权和当前负载认领。第二人是双人协作，第三位执行成员加入建立关联原任务的任务组。
7. 自动推进或逐步观察，支持暂停恢复；关闭浏览器不会停止后端运行。
8. 打开各成员不同的职责成果，检查引用；退回保留旧版本，修订产生新版本，重新独立评审、真人验收。
9. 验收与积分账本在一个事务内完成，总计 100 不可兑现积分，重复验收不重复奖励。
10. 经验作为待确认候选回到教学室，不自动成为事实或资格。

按钮「加入两位演示同事」创建知远、青岚脱敏夹具，带演示资格，明确不是由当前真人教学所得；不能用于真实模型模式。也可以自己创建、教学和考核其他员工。

## 技术

- React 19 + TypeScript + Vite，组件化校园、教学、任务与成果面板。
- Python 3.11 + FastAPI，单进程有界运行引擎。
- SQLite 保存员工、来源与授权、考核、资格、任务、成员、成果版本、评审、奖励与事件。
- **实际 Semantica 0.7.0**：`ContextGraph.add_node/add_edge/to_dict/from_dict`，授权子图映射到 `ContextRetriever.retrieve(mode="local")` 的真实实体关系契约。
- 无 embedding、无自动模型下载；中文字符/关键词匹配与一跳关系上下文，不宣称向量语义检索。
- 图在请求时从 SQLite 有效授权知识重建，不把 SDK 图内存当唯一持久化。

## 演示与真实模型

默认演示模式无需任何密钥，使用确定性教学反馈、答卷和任务模板，真实落库与状态门禁；**这不是模型真的学习**。

可选：将 `backend/.env.example` 的内容复制到项目内 `backend/.env`，填写自己的服务端配置：

```dotenv
AWL_MODEL_KEY=...
AWL_MODEL_NAME=...
AWL_MODEL_BASE_URL=https://your-compatible-provider/v1
```

重新启动后选择「真实模型」。适配 OpenAI-compatible Chat Completions JSON 输出；供应商须支持 `response_format=json_object`。调用用于教学理解、考试答卷、试岗和职责成果；凭据不发送到前端。

模型超时、格式错误或无有效引用会记录失败，不静默转成演示成功。接单与组队仍是服务端确定性资格/负载规则，不声称完全自由的模型自治。真实模型资格与演示资格分开。

本次未使用用户密钥做真实供应商调用；失败与迟到返回路径使用测试模拟验证。

## 数据与安全边界

- 数据：`runtime/workforce.sqlite3`，重启保留；SQLite schema 当前为记录存储、事件表、命令幂等表和独立奖励账本。
- 页面草稿保存在该站点 localStorage，业务状态以服务端为准。
- 文件只做受控解析，不保留原始二进制、不跟随资料链接、不自动扫描目录。
- 授权撤回停止后续检索，资格失效，在途任务阻塞，历史成果标记受影响；已导出的内容或外部模型已处理数据无法自动收回。
- **本地单工作空间，无生产身份认证。**教学者、评审者与验收者路径为本地使用约定，不代表多用户安全隔离。勿放真实敏感员工资料。
- 不开放 Shell、自动邮件/外发、真实资金、AS 或共享 Nginx 部署。
- 独立评审是服务端结构/引用/目标规则检查，不等于真实业务质量认证；最终必须真人验收。

## 测试

```bash
cd backend
../.venv/bin/python -m pytest test_system.py -q
```

启动系统后，使用本机已有 Playwright skill：

```bash
node /Users/bytedance/.codex/skills/playwright-skill/run.js /Users/bytedance/Desktop/agi/agent-workforce-lab/tests/browser.cjs
```

测试数据库与浏览器证据都在项目 `runtime/` 内。浏览器测试会新增脱敏员工与任务，不清空用户已有数据。

## 后续优化

首版先验证闭环。后续适合优化教学/成长面板密度、更自由的技能与计划提案、真实模型评分、任务输入授权细粒度、用户认证、审计查看和回收任务负载。
