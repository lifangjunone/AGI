# HiAgent 承接 AgentSphere 1.x：验证检查点

## 最终交付（优先于下方所有早期状态）

- 方案已创建并完成回查：https://bytedance.larkoffice.com/docx/Qp0pdj6oIoxl5qxw6Joc6wDZnfg
- 文档包含 P20/P21/P23 的15项能力映射、7张表、16个连续编号操作步骤、17张真实截图和1张目标架构画板。
- 本地草稿 draft.xml，创建结果 create-result.json，最终远端正文与资源 final-document.json，最终 revision=11。
- 创建时 ol 的 seq 属性被服务端忽略，已在同一文档将六组列表局部替换为“步骤1”至“步骤16”段落；六次修改均成功、无警告。最终回查确认16步连续、17张图片、1画板及五次测试数值和边界说明均保留。
- 架构画板 Ak3MwlrihhfATZb8BrLcV9hYnCb 已导出 architecture-preview.jpg 并视觉核验。最终截图 hia-43/44/45 为发布后意图、代码、End 配置；hia-46/47/48/49 捕获真实聊天结果。早期 hia-29/30/31/32/33 未显示聊天面板，没有用于最终文档的结果证据。
- 结论：意图路由＋固定SOP诊断回复可承接；独立Agent／Skill、多Agent规划、FAQ／知识ACL、记忆隔离、安全、跨平台Hub、统一治理及性能仍需逐项验收。样例不创建工单、不改账号、不授予权限。
- 全程未 bringToFront、激活窗口或切换 macOS 桌面。未做生产迁移、AS路由修改或对外渠道部署。

## 最新已核验结果（16:03 后，优先于下方早期状态）

- 实际已完成 IT 最小闭环：Start → 意图识别01 → 代码01 → End，4 个节点、7 条连接。意图为账号访问、VPN网络、权限申请、多诉求澄清及默认其他意图，五个出口连接同一确定性 SOP 代码节点。
- 意图模型 DeepSeek-V4-flash，`query=Start/query`；代码 `input=意图识别01/classificationName`；End `output=代码01/key0`。
- 使用真实 UI 调用模型及整条 Chatflow，五条测试通过。实际逐次输入、输出与耗时已存 `actual-run-evidence.txt`，其中保留第一次配置错误的失败结果。
- 一次账号测试失败原因已证实为选错 `Start/chat_histories/query`，导致错误路由到多诉求澄清。修正顶层 `Start/query` 后同输入成功。必须在教程明确区分两种 query。
- 正确五次端到端界面耗时：账号 1.47036s、VPN 1.9124857s、权限 1.6719241s、多诉求 1.811333s、未知 2.1799264s。这是单次 UI 显示值，非压测/P99。
- 确定性代码只返回诊断/申请说明和人工兜底，不创建工单、不改账号、不授予权限。它不是独立数字员工或业务执行 API，不能拿它证明 P21 SubAgent 真实调用已经完成。
- 内部配置版本 `v0.1.0` 已发布。页面显示“智能体配置已发布成功！”；刷新后 4 节点/7 连接仍保留、保存时间变为 2026-11-12 16:03:01；发布历史显示 `v0.1.0`、运行中、2026-11-12 16:03:02，共1个版本。尚未对外渠道发布。
- 当前浏览器已刷新，历史面板关闭，意图编辑面板打开，显示已持久化 `Start/query`。
- 先前保存时间不动的问题暂未归因；发布后持久化已验证。React error188 出现在编辑时，不能认为必然造成保存失败。

### 稳定自动化方式与易错点

- 不激活窗口、不切换 macOS 桌面。独立 CDP 仍为 http://127.0.0.1:51196。
- 已通过 CDP `Emulation.setFocusEmulationEnabled` 给页面虚拟焦点（不激活系统窗口），已通过 Browser.setWindowBounds 只调整独立窗口尺寸1600×1000，Playwright viewport1600×910。
- helper 的 screenshot 已改为 fromSurface:true，真实截图可用。旧 fromSurface:false 截图可能落后 UI 状态，发布/结果截图尽量用 hia-28 以后与真实内容核对。
- 页面 React 状态变更往往需下一次工具调用才显示。点击返回不表示表单已经切换，要等待实际文字或检查当前面板。
- 变量选择器二级菜单刚出现会在坐标(0,0)，先读取选项/下一工具调用，待其布局稳定后点击 `.arco-select-option`。不直接 `.getByText(...).last()` 即点，曾点错或未应用。
- 关闭编辑面板使用 `.h-workflow-node-edit-panel .hiagent-icon-closure`；Escape 在 CodeMirror 内不能关闭面板。
- 连线先关闭编辑面板并点击 `.hiagent-icon-mermaid-full` 适配画布，再拖 source→target。
- 测试聊天 `.preview-wrapper [contenteditable=true]` fill+Enter；等待结果用 `state:attached`，消息可能被虚拟列表隐藏。多条相同回复时必须确认本轮结果，不能被旧消息误判。
- 记录时间和结果后再发送下一条，避免运行中发送失败。节点独立测试入口 `.react-flow__node-Intent .hiagent-icon-code-testing`；调试面板 `.h-workflow-node-debug-panel textarea`，运行按钮。
- 内部发布界面是自定义浮层而非 role=dialog；`发布配置`→版本号及说明→`确定`→成功提示。首次输入0.1.0是否提交未证实；第二次v0.1.0成功，教程使用已证实v0.1.0。

### 新增截图建议

- 配置：hia-08-four-intents、hia-19-sop-code、hia-26-end-bound、hia-28-correct-start-query。
- 真实结果：hia-29-account-pass、hia-30-vpn-pass、hia-31-permission-pass、hia-32-multi-intent-result（不要用早期hia-32-multi-intent-pass，拍摄时尚未完成）、hia-33-fallback-pass。
- 发布及持久化：hia-37-internal-version-submit、hia-38-configuration-published、hia-40-reloaded-persisted-flow、hia-42-loaded-history。
- 可以新拍持久化后的节点配置，保证至少12张有指导意义的截图，并视觉核对图文。
- 方案文档仍未创建，需要完成完整 XML、目标架构白板、parse→create→fetch 回查。没有生成 draft.xml。

状态：用户已完成人工登录。正在配置 HiAgent 场景。方案与复现文档尚未交付，不得标记为搭建完成、测试通过或发布。

## 当前执行方式与新增证据

用户要求把验证 Chrome 放在另一个 macOS 桌面，避免影响其工作。已删除 hia-browser.cjs 中的 p.bringToFront()；后续不得自动激活窗口、切换桌面或调用 CLI open、headed 等会抬升窗口的操作。

独立 browser session：as-hia-proof。实际 CDP endpoint 为 http://127.0.0.1:51196，非用户原 Chrome、非 TRAE Electron。可通过 hia-browser.cjs 的 run({p,shot}) 使用 Playwright 操作真实 UI，不使用业务 API或框架内部状态。

已确认一个空 about:blank iframe 并不是编排器本身；编排节点实际在主文档 .react-flow__node 中。此前“编排器在 iframe”判断已纠正。TRAE 外部快照读不到节点是工具覆盖问题。

CLI screenshot 和 Playwright 默认 screenshot 持续超时；已改用 CDP Page.captureScreenshot，fromSurface:false、captureBeyondViewport:false，成功保存真实界面截图。不要继续重复默认截图方法。

不要交叉使用 CLI snapshot/actions 与 Playwright 操作；曾观察到切回 CLI 后未保存的节点消失，原因未证实。当前只用 helper 进行 UI 操作。

最新 UI 状态（用户中断后复核）：仅 Start、End 两个节点，edges=0。此前 Start→意图识别01、账号访问名称和描述、Start/query 绑定曾在截图中可见，但没有持久化，不能称配置完成。消失原因尚未证实，不应归因于用户或系统能力缺失。顶部最后保存时间始终15:29:41，优先定位保存路径；可能需要在同一次浏览器连接中完成配置并触发显式保存，避免重复做不能持久化的编辑。

实际节点菜单存在：大模型、智能体、代码、选择器、意图识别、变量聚合、循环、变量赋值、批处理、知识库检索、知识库写入、问答库、术语库、长期记忆、数据库、图谱库、工作流、插件、HTTP请求、文本处理、消息、信息收集、等待等。术语库、FAQ、长期记忆不能直接判为缺失，应检查具体语义、隔离和迁移能力。

意图节点默认模型显示 DeepSeek-V4-flash，默认 timeout360秒、retry0。此为配置证据，未运行模型。

helper 已创建在当前目录。通过 node heredoc require(helper) 执行 run(async({p,shot})=>{...})。getByText、locator、mouse drag 均为真实 UI 操作。默认 selector timeout 建议8秒，避免多次盲等。

最新操作目标：定位意图匹配标题右侧实际加号，添加 VPN网络、权限申请、多诉求澄清，再添加执行分支。hiagent-icon-plus 和 addBtn 类命中隐藏元素、rect=0；应读取 getByText('意图匹配',{exact:true}).last() 的三层祖先 outerHTML，定位实际可见控制，而不是继续点击隐藏元素。

新的真实截图：hia-02-node-palette.png、hia-03-intent-settings.png、hia-04-intent-added.png、hia-05-start-reference.png、hia-06-query-bound.png。截图2在当时已添加意图但没有菜单，命名不能作为内容证据，应视觉复核后标注。

## 已确认的范围与初步评估

2026-11-12，核对《AgentSphere产品通案（0415）.pdf》第三节 PDF P20、P21、P23，以及实际 AgentSphere 管理控制台和 HiAgent 创建界面。

建议将 HiAgent 作为意图路由和确定性 SOP 执行底座。不能仅凭当前 UI 入口将其认定为 AgentSphere 完整替代品。意图识别与流程节点已经有前序验证记录，本轮还需在新建资产上复现。

1. P20 场景、意图、命中策略：可设计成每个业务场景一个总控 Chatflow，意图节点分支连接专业执行流程；AS 的场景对象、意图注册和发布策略需要盘点与重建。不能把一个分类输出当成完整业务执行。
2. P21 单数字员工路由：需验证下游智能体或流程真实调用、入参映射、返回汇总和异常兜底；当前 HIA 有 Agent、工作流和 A2A 入口。
3. P21 自然语言多数字员工编排：当前 HIA 创建界面有自主型及对话、长时程模式。尚未验证其计划、SubAgent 调用、运行轨迹和终止语义，不得宣称缺失，也不得宣称等价。
4. P21 Workflow 多数字员工执行链：作为首批迁移重点，用显式拓扑、节点输入输出、失败分支表达 SOP；LLM 节点串联不等同于独立数字员工调用。
5. P23 完整总控链路：术语与改写、FAQ 快路径、多意图计划、ReAct、长期记忆、知识权限、安全拦截、跨平台 Hub、统一门户及治理分别验收。HIA 现有“记忆”“安全”等入口只证明有配置入口，不能证明 AS 的语义、隔离、覆盖范围和运营治理可直接承接。P99<1s 需要先定义测量范围并压测，不能沿用 PDF 宣传指标。

## 实际系统证据

AgentSphere：

- https://superapp.volcenginepaas.com/product/admin/scene
- 实际显示版本：1.2.0-hotfeature261030。
- 场景列表：test01、财富助手、测试。
- 财富助手有 13 个意图。ETF基金分析的详情明确为“命中后执行：调用扩展能力执行；扩展能力单元 datayes-financial-v3；技能”。这是配置证据，未执行金融技能。
- 侧栏存在策略中心、意图调试、知识、技能、MCP、记忆、安全、灰度、指标、日志、Trace、审批、组织、SSO、身份映射和操作审计等入口。尚未验证入口背后的全量能力。

HiAgent：

- 当前个人空间 personal-d9bmuon7l14h8csmbipg。
- 已创建：AS迁移验证-IT服务总控-20261112。
- 资产链接：https://hia.volcenginepaas.com/product/llm/personal/personal-d9bmuon7l14h8csmbipg/application/dbqmlp6i7bcaolvh67pg/arrange?tabKey=arrange
- 类型：工作流型 → 对话流型。
- 说明：验证IT意图路由、受控诊断SOP及人工兜底。测试环境，不创建真实工单。
- 截图可见 Start 默认 query、files、chat_history 输入与 End.output 未配置警告；能力栏可见对话历史保留 3 轮、会话隔离超时未设置。
- 尚未添加业务节点、连接 Start/End、运行模型或发布。

## 当前阻塞与恢复

TRAE 外部 Chrome 工具的快照不包含编排 iframe 控件，iframe 没有独立 src；实际截图显示画布已经加载。问题是工具无法读取，不是页面加载失败。

Chrome DevTools MCP 的 list_pages 返回空文本，未建立可用页面连接。

agent-browser 自动连接指向 TRAE Electron 9222，不是用户 Chrome；未修改该 Electron 页面。用户 Chrome 没有发现可用 CDP listener。

现已使用独立 headed 会话 as-hia-proof 打开 https://hia.volcenginepaas.com，账号和密码已填入，等待人工输入验证码并点击登录。不要把验证码或密码写入方案。

CLI 运行方式：npx --yes agent-browser --session as-hia-proof snapshot -i。该技能支持 iframe 自动内联，可直接使用新快照中的引用操作。

## 证据资源

- 源 PDF：../doc-fetch-resources/agentsphere-0415-source.pdf。
- 需求提取：../doc-fetch-resources/agentsphere-requirements-pages.txt。
- 源 P20、P21、P23 图片在 ../doc-fetch-resources/agentsphere-source-p20.png、agentsphere-source-p21.png、agentsphere-source-p23.png。
- 实际截图目录：/Users/bytedance/.trae-cn/trae-browser-screenshots/6aed7a59d50cceaf5f63cb58/。
- AS 场景列表：shot-20261112-072848-172017000.jpg。
- AS 财富助手意图：shot-20261112-072853-363636000.jpg。
- AS 意图详情：shot-20261112-072858-358507000.jpg。
- HIA 创建入口：shot-20261112-072903-201708000.jpg。
- HIA 工作流型创建配置：shot-20261112-072934-364048000.jpg。
- HIA 新建资产与初始画布：shot-20261112-072955-478407000.jpg。

## 下一阶段

1. 人工验证码完成后，读当前 URL 和新快照，确认已登录；进入已创建资产，不重复创建。
2. 搭建 IT 路由样例：账户访问、VPN网络、软件权限、未知兜底。正常请求只输出诊断或申请说明，不能生成假的工单编号或宣称已修改账户。
3. 真实调用并验证模型、意图分支与 SOP；另验证多诉求澄清、未知输入和节点异常。记录预期与实际结果，每个关键步骤保留真实截图。
4. 区分“原生可承接”“需重建或外接”“未验证”“目前不能等价承接”，按 P20/P21/P23 逐项建立证据矩阵；以确切语义差异支持不能等价的结论。
5. 在当前草稿工作区创建完整 design_rfc XML 和目标架构画板。至少 12 张有复现作用的真实截图，未通过测试不能称已发布。按 lark-doc 流程 parse、create、fetch 校验后交付实际文档链接。

预计剩余：登录恢复后 30–50 分钟，取决于节点配置和运行验证的实际结果。
