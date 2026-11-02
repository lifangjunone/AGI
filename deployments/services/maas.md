# LifeYouMe MaaS 部署

最后核验：2026-10-30（Asia/Shanghai）

## 公网入口

- 控制台：`https://maas.lifeyoume.icu/`
- OpenAI-compatible API：`https://maas.lifeyoume.icu/v1/`
- 存活检查：`https://maas.lifeyoume.icu/health/live`
- 就绪检查：`https://maas.lifeyoume.icu/health/ready`

阿里云 Nginx 负责独立 TLS、管理员访问校验和公网入口。控制台与管理 API
复用 LifeYouMe 管理员登录；`/v1/` 使用 MaaS 应用服务 Key。

## 腾讯云部署

- 部署根目录：`/data/app/lifeyoume-maas`
- 当前版本链接：`/data/app/lifeyoume-maas/current`
- 当前 release：`/data/app/lifeyoume-maas/releases/20261030120000`
- Compose：`deploy/compose.tencent.yml`
- 受限环境文件：`/etc/lifeyoume-maas/maas.env`，root-only
- 容器：`lifeyoume-maas-maas-1`
- TTS 容器：`lifeyoume-maas-tts-runtime-1`
- 数据：Docker Volume `lifeyoume-maas_maas-data`
- TTS 模型：`/data/app/lifeyoume-tts/models/sherpa-onnx-vits-zh-ll`
- 监听：`127.0.0.1:43280`
- 隧道：`lifeyoume-maas-aliyun-tunnel.service`

容器以 `node` 用户运行，根文件系统只读，配置 `unless-stopped` 和健康检查。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块标记：`BEGIN/END lifeyoume-maas`
- 证书：`/data/app/english-learning/certs/maas.lifeyoume.icu.*`
- ACME 状态：`/data/app/opportunity-factory/letsencrypt`
- 续期 timer：`lifeyoume-maas-cert-renew.timer`

产品路由是共享 Nginx 配置末尾的追加块。修改时仍须遵守
`deployments/runbooks/SHARED_NGINX.md`，禁止整体覆盖或重建共享代理容器。

## 当前能力状态

控制面、DeepSeek Chat 网关和中文 TTS 已上线：

- `/health/live` 返回 200。
- `/health/ready` 返回 200。
- `POST /v1/audio/speech` 经应用服务 Key 鉴权后返回真实 16kHz WAV。
- TTS 使用腾讯云 CPU sherpa-onnx VITS，5 个可选音色，Runtime 不开放宿主端口。
- Runtime 单并发、8 个等待位；队列满返回 429，文字接口保持可用。
- 普通私有对话缓存默认关闭，避免跨用户复用音频。
- Chat Provider 支持 Endpoint、Model ID、超时、Temperature 与加密 API Key 管理。
- API Key 默认脱敏展示；管理员可受控查看明文，30 秒自动隐藏并写审计。
- 模型行测试核验已保存配置的供应商目录；结果按 Deployment 保存，包含状态、
  延迟与时间。候选配置测试不覆盖已保存模型状态；目录核验不等于推理通过。
- 控制台可选择 5 个音色与语速，直接调用正式 TTS Runtime 生成 WAV 试听。
- 模型页为可扩展注册表，支持搜索、能力/Provider/状态筛选与每页 10 条分页。
- 每个模型支持查看、连接测试、受控查看 API Key、编辑、启停与级联删除。
- 新模型通过一个管理接口同时创建逻辑模型、Deployment、Provider 和加密凭据；
  托管 TTS 标记为只读，避免误停用或删除。
- 未携带有效应用服务 Key 的 `/v1/models` 返回 401。

腾讯实机基准：模型加载约 0.64–0.70 秒，短句生成约 0.49–0.66 秒，长句
RTF 约 0.29–0.40，Runtime 常驻约 194 MiB。12 路并发测试中 9 个排队完成、
3 个快速返回 429，压测期间 MaaS 健康检查保持 200。

2026-10-29 release `20261029225829` 验证：

- DeepSeek Provider 真实认证测试成功，响应 718 ms。
- 管理状态接口仅返回脱敏 Key；明文 reveal 与审计事件验证通过。
- 管理员 TTS 试听返回 57,388 字节 RIFF WAV。
- MaaS、TTS 两个容器 healthy；`/image/`、`/flowframe/`、AI Team、MeYou、
  Audit 回归均为 200。
- 控制台 JS/CSS 使用版本化 URL，并改为 `no-cache, must-revalidate`，避免发布后
  浏览器继续命中旧的一小时静态资源缓存。
- 使用 25 条本地模型验证 10 条分页、搜索、Provider 筛选和移动端卡片布局；
  新增、查看密钥、编辑、停用、删除完整浏览器链路通过。
- 生产临时模型完成新增、编辑、停用与删除并清理；最终仅保留 DeepSeek Chat
  和托管 TTS，Provider 连接测试响应 105 ms，TTS 试听返回 44,076 字节 WAV。
- 部署前备份：
  `/data/app/lifeyoume-maas/backups/maas-data-20261029225511.tar.gz`。

## 验证

2026-10-30 完整状态筛选 release `20261030120000`：

- 模型列表增加目录核验通过、待配置、目录未找到、无法核验和全部待核验筛选；
  未验证仅匹配未测试模型，全部待核验包含三个尚不能确认的核验状态。
- 行标签、筛选与URL恢复共用状态定义；提供启用不等于可调用的说明。
- 本地57项测试通过，100模型浏览器回归及七种状态准确匹配、搜索组合、
  刷新恢复、Back/Forward、键盘焦点和375px截图检查通过。
- 只更新app/model-status/navigation/index前端资源；线上后端src与旧release相同。
- MaaS/TTS healthy，TTS容器ID不变；两个模型、一个有效Key及授权摘要不变。
- 线上HTML版本和三个JS模块HTTP哈希与本地一致；公网健康及八产品入口200，
  共享Nginx哈希不变，未修改或reload。
- 未执行新推理验证、未新增供应商模型或切换MeYou。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030120000.tar.gz`；
  回滚镜像：`lifeyoume-maas-maas:rollback-20261030110000`。

2026-10-30 模型测试归属与准确性 release `20261030110000`：

- 修复同一 Provider 多 Deployment 时误测第一模型、结果影响其他模型的问题。
- 行测试只核验该行已保存配置；测试期间配置变化返回409，不写入迟到结果。
- 区分目录核验通过、目录未找到、无法核验及认证/连接失败；
  未在目录中出现不等于模型不存在，所有目录测试明确未验证实际推理。
- Provider Endpoint/Key 变更清除相关 Deployment 旧测试；模型 ID 变更清除当前结果。
- 本地56项自动测试及100模型浏览器回归通过（分页/筛选/行操作/批量/手机）。
- 线上 DeepSeek 当前 ID 目录核验200，`model_confirmed`，121ms，
  `inferenceVerified:false`；没有重新执行推理或MeYou影子测试。
- MaaS/TTS healthy，TTS容器ID不变；两个模型、一个有效Key、应用授权摘要不变。
- 公网健康及八个代表产品入口200；匿名模型接口401，新HTML版本核验通过。
- 共享Nginx哈希不变，未修改或reload；没有新增供应商凭据或切换MeYou。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030110000.tar.gz`；
  回滚镜像：`lifeyoume-maas-maas:rollback-20261030100000`。

2026-10-30 DeepSeek 上游模型 ID 修复（未更换镜像）：

- 真实 Chat/JSON 探测失败502，上游400：`deepseek-flash-1017`不再受支持，
  `/models`仅列`deepseek-flash`与`deepseek-v4-pro`；认证接口200并不证明推理可用。
- 同凭据临时测试`deepseek-flash`结构化JSON成功200/546ms后，通过模型管理
  PUT仅修正`lym-chat-quality`的上游ID，Key留空保留原值，保留启用状态。
- 修改后重新加载持久化配置，真实JSON调用200/633ms、ok=true；
  两个模型、一个有效Key、应用授权摘要不变。未重启或修改共享Nginx。
- 使用内存测试授权、未写业务用量；不等同公网应用Key鉴权/MeYou影子验证。
- 修复前备份：
  `/data/app/lifeyoume-maas/backups/maas-data-deepseek-id-fix-20261030.tar.gz`。
- 当前上游ID为`deepseek-flash`，不要恢复已失效的旧ID。

2026-10-30 图片理解 release `20261030100000`：

- multimodal 模型通过 Chat 接口支持文字＋1–4 图片，网关与工作台/示例
  协调上线；不支持音频/视频，不抓取或持久化图片内容。
- Chat 增加响应上限、异常 JSON/空 choices 校验和安全超时/取消处理。
- 本地50项测试通过，图片理解浏览器测试供应商链路上轮通过。
- MaaS/TTS healthy，TTS容器ID不变；两个原模型、一个有效Key及授权摘要不变。
- 公网健康及八产品入口200，共享Nginx哈希不变，未修改或reload。
- 生产无VLM模型，真实图片理解与原Chat真实推理尚未在本轮重新验证。
- 未切换MeYou、未新增供应商凭据。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030100000.tar.gz`；
  回滚镜像：`lifeyoume-maas-maas:rollback-20261030090000`。

2026-10-30 图像网关与工作台 release `20261030090000`：

- `/v1/images/generations`、工作台和接入示例协调上线；数量/尺寸/格式、
  base64预览下载、远程URL点击加载/失败重试、清空释放资源。
- 本地43项测试、统一浏览器回归（实际PNG解码、远程点击前零请求、
  404重试、Key清理和375px布局）通过；并非真实供应商生成验证。
- MaaS/TTS healthy，TTS容器ID不变，原两个模型/一个有效Key/授权摘要不变。
- 公网存活/就绪200、匿名图像POST401，八个代表产品入口200；
  共享Nginx哈希不变，未修改或reload。
- 生产暂无图像供应商模型；接口上线不代表存在可用的图像模型。
- 未切换MeYou、未新增供应商凭据，存储层未变。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030090000.tar.gz`；
  回滚镜像：`lifeyoume-maas-maas:rollback-20261030080000`。

2026-10-30 外部 TTS 接入 release `20261030080000`：

- 外部 speech 使用供应商加密 Key、显式 voice ID 与配置超时；托管语音仍用
  内部 Token。支持 WAV、500 字符、0.5–2 语速、16MiB 响应限制与错误脱敏。
- 工作台可选已启用语音模型，外部填写供应商音色，托管保留五个选项；
  切换模型取消请求并清理 Key/音频，接入示例同步上线。
- 本地38项测试、浏览器测试供应商 WAV/播放下载入口/模型切换清理通过。
- 生产容器内调用新 speechSynthesis→托管 Runtime，短句返回200、30,536字节
  RIFF/WAVE、voice-1；使用临时内存授权，不验证公网应用Key鉴权，不写业务用量。
- MaaS/TTS healthy，TTS容器ID不变；原两个模型、一个有效Key、授权摘要不变。
- 公网健康及八个代表产品入口200，共享Nginx SHA-256不变，未修改或reload。
- 仅更新MaaS gateway/app/guide/index，未切换MeYou或新增外部供应商凭据。
- 尚无线上外部TTS模型，真实供应商与听感仍未验证。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030080000.tar.gz`；
  回滚镜像：`lifeyoume-maas-maas:rollback-20261030072000`。

2026-10-30 Embeddings 网关与工作台 release `20261030072000`：

- `/v1/embeddings`、能力说明、接入示例与工作台协调上线；文本批量、
  float向量、可选dimensions、应用授权和Token记录。
- 输入/响应校验，8MiB响应限制，拒绝redirect，供应商错误正文不回传，
  不持久化输入或向量。工作台Key清空，摘要优先，原始JSON折叠。
- 本地33项自动测试及隔离网关浏览器回归通过；未验证真实向量供应商。
- 新release仅更新server/gateway和相关控制台资源，store SHA-256不变；
  未修改生产凭据、模型或应用权限。
- MaaS/TTS healthy、隧道active；TTS容器ID不变。
- 生产仍仅Chat与托管TTS两个模型、一个有效Key，授权摘要不变，
  尚无可调用的已配置Embeddings模型。不能把接口上线宣称为模型可用。
- 公网存活/就绪200；匿名Embeddings POST401；八个代表产品入口200。
- app.js/接入模块HTTP hash与本地一致，HTML版本202610300720。
- 共享Nginx哈希不变，未修改或reload，未切换MeYou。
- 备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030072000.tar.gz`。
- 回滚镜像：`lifeyoume-maas-maas:rollback-20261030061000`。

2026-10-30 模型列表交互修复 release `20261030061000`：

- 列表重绘保留筛选、分页和勾选控件焦点；分页边界转到可用反向按钮。
- 批量结果按失败数量显式设置反馈色，“失败 0 个”不再误显示红色。
- 桌面隐藏手机导航关闭按钮；HTML资源版本 `202610300610`。
- 上轮本地 100 模型统一浏览器回归通过，自动测试 27/27；
  此次只上传 app.js、styles.css、list-focus.js 和 index.html。
- 新 release 从线上旧 release 复制，后端 src 逐文件比对相同，
  仅重建 MaaS，未重建 TTS/MeYou/共享代理。
- MaaS/TTS healthy，隧道 active；HTTP资源SHA-256与本地一致。
- 两个原模型、一个有效服务 Key 和应用授权摘要不变。
- MaaS存活/就绪200；Image、FlowFrame、AI Team、Resume、Vault、Trends、
  MeYou、Audit入口回归200；匿名模型接口401。
- 共享Nginx SHA-256发布前后相同，未修改配置或reload。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030061000.tar.gz`。
- 回滚镜像：`lifeyoume-maas-maas:rollback-20261030051000`（由旧release重建）。
- 容器启动瞬间首个健康探测连接重置，随后复查正常；未切换MeYou，
  未重新执行真实供应商推理或生产登录后的浏览器验收。

2026-10-30 工作台结果呈现 release `20261030051000`：

- Chat 优先展示纯文本回答，原始 JSON 可展开；单独显示模型、延迟和请求 ID。
- 文本块、拒答、工具调用或无文本响应有明确展示，工具不自动执行，HTML 不执行。
- 支持复制回答和清空结果；清空进行中的请求会取消并隔离迟到响应，清理音频。
- 自动测试 25/25；浏览器验证回答/原始响应、复制拒绝、清空、取消旧请求，
  Chat/TTS 正式 Key 调用与手机布局回归通过。
- 生产 MaaS/TTS healthy，新资源验证通过，原两个模型/一个有效 Key 不变，
  公网健康及五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030051000.tar.gz`。
- 仅更新 MaaS，未修改共享 Nginx、生产授权或 TTS。

2026-10-30 Chat/TTS 正式调用工作台 release `20261030050000`：

- Playground 支持非流式 Chat 与托管中文 TTS，均使用应用服务 Key 和正式网关；
  TTS 可选音色/语速，生成后播放或下载 WAV，不自动播放。
- 发送后清空 Key，切换模式/重绘页面取消旧请求并释放音频 URL；
  旧响应不能更新新页面，提交期间防重复，无启用模型时禁用提交。
- 自动测试 24/24；本地正式 HTTP 网关验证 TTS 未授权 403 → 授权后 WAV、
  参数和应用计量、Chat 成功、Key 清空、音频释放、旧响应隔离与手机布局。
- 上游使用本地测试音频，不代表本轮重新执行生产 TTS 推理。
- 生产 MaaS/TTS healthy，新资源验证通过，两个原模型和一个有效 Key 不变，
  公网健康及五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030050000.tar.gz`。
- 仅更新 MaaS，未修改共享 Nginx、生产授权或 TTS。

2026-10-30 模型业务接入说明 release `20261030044000`：

- 模型详情区分供应商凭据和 MaaS 应用服务 Key，展示授权→创建 Key→调用步骤。
- Chat 和托管 TTS 提供当前 MaaS 地址、逻辑模型 ID 和可复制 cURL；
  Chat 明确非流式，TTS 明确 WAV/音色/队列 429。
- 尚未实现的能力仅展示注册边界，不生成虚假推理接口或示例。
- 自动测试 24/24；浏览器执行页面生成的 Chat cURL，经应用服务 Key 和
  网关转发本地 mock 成功；授权/撤销、复制失败、TTS WAV 示例、手机布局、
  未实现图像能力提示验证通过。
- 生产 MaaS/TTS healthy，新 HTML/接入模块验证通过，两个模型和一个有效 Key
  不变；公网健康和五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030044000.tar.gz`。
- 未修改共享 Nginx、线上路由、模型授权或 TTS。

2026-10-30 手机导航交互 release `20261030042000`：

- 收起手机导航时设置 inert，隐藏链接不进入键盘焦点顺序；桌面导航保持常驻。
- 手机导航打开后背景 inert、锁定页面滚动、显示遮罩/关闭按钮，提供
  Tab 循环、Escape 与点击遮罩关闭，退出后恢复触发按钮焦点。
- 切换新页面焦点转到内容，当前页退出恢复菜单按钮；尺寸切到桌面解除背景锁定。
- 自动测试 22/22；浏览器验证隐藏焦点、焦点范围、三种退出、页面切换、
  响应式重置、模型弹窗焦点和截图；历史检索/调用详情回归通过。
- 生产 MaaS/TTS healthy，新 HTML/导航模块验证通过，两个模型和一个有效 Key
  不变；MaaS 健康和五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030042000.tar.gz`。
- 仅更新 MaaS，未修改共享 Nginx、模型授权或 TTS。

2026-10-30 调用详情与手机记录卡片 release `20261030041000`：

- 调用行提供详情：请求/记录 ID、应用、模型、Deployment、能力、延迟、
  服务 Key 用途和输入输出单位；不展示凭据或消息正文。
- 支持复制请求 ID，复制拒绝提供手动路径；关联模型仍存在时可打开模型详情。
- 明确旧记录状态可能来自上游或默认转发状态，不一定是客户端 HTTP 状态，
  不根据单条历史记录臆测根因或费用。
- 手机调用/审计列表改为带字段标签的卡片，详情字段提高到 12/13px。
- 自动测试 22/22；真实 HTTP 405/305 记录回归、详情、模型跳转、复制失败、
  Escape、手机卡片与弹窗无横向溢出通过，截图检查通过。
- 生产 MaaS/TTS healthy，新资源核验通过，原两个模型/一个有效 Key 不变，
  MaaS 健康及五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030041000.tar.gz`。
- 仅更新 MaaS；未修改共享 Nginx 或 TTS。

2026-10-30 保留历史检索 release `20261030034500`：

- 新增管理员 GET `/api/admin/usage`、`/api/admin/audit`，服务端对全部保留记录
  搜索/筛选后分页；调用最多保留 5,000 条，审计最多 500 条，未增加保留上限。
- 前端不再仅检索 state 接口的 200/100 条窗口；支持查询加载、错误重试、
  输入防抖与同页旧响应隔离，跨页请求分别管理。
- 返回字段白名单排除凭据；生产无管理员鉴权返回 401，响应 no-store。
- 自动测试 22/22；真实本地 HTTP 405 调用/305 审计验证旧窗口之外的记录、
  联合筛选、分页、延迟响应隔离、失败重试及手机布局。
- 生产两个历史接口 200，当前 39 条调用/22 条审计；无管理员访问 401，
  新 HTML 核验通过，两个模型和一个有效 Key 保持不变。
- MaaS/TTS healthy，MaaS 公网健康和五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030034500.tar.gz`。
- 仅更新 MaaS，未修改共享 Nginx 或 TTS。

2026-10-30 记录列表与指标口径 release `20261030032000`：

- 调用记录支持请求 ID/模型/部署搜索、应用和成功/失败筛选；审计支持
  操作者/事件 ID 搜索和动作筛选。两页均支持 10/20/50 条分页、清空筛选和无结果提示。
- 明确调用窗口最多 200 条、审计窗口最多 100 条，筛选仅覆盖当前返回窗口；
  未宣称分页支持全部持久化历史。
- 总览请求数、成功率及 P95 标为窗口统计；应用页明确 RPM/预算尚未执行拦截。
- 自动测试 20/20；浏览器验证 105 调用/73 审计数据的分页、联合筛选、
  连续搜索、无结果恢复、375px/横屏/reduced-motion 和指标说明。
- Key 创建/保存/撤销回归通过；生产 MaaS/TTS healthy，新资源核验通过，
  两个原模型和一个有效 Key 不变，五个代表产品入口回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030032000.tar.gz`。
- 发布前 SSH 和公网探测出现短暂超时，原备份/上传随后完成；核验版本与备份后
  发布，仅重建 MaaS。没有修改共享 Nginx 或重启其他服务。

2026-10-30 服务 Key 使用体验 release `20261030025500`：

- 创建 Key 前填写用途名称，显示所属应用和继承权限；无权限应用有明确提醒。
- Key 列表显示用途、脱敏前缀、创建和最近使用时间，撤销确认包含对应名称。
- 密钥创建后显示应用/用途；关闭或 Escape 未确认保存时提示明文无法再次查看。
- 复制成功/失败在弹窗内反馈，提供手动复制路径；关闭清空明文和提示。
- 名称后端校验最多 80 字符和控制字符，拒绝非法输入不产生 Key 或审计变更。
- 自动测试 18/18；浏览器验证名称必填、失败重试、保存保护、复制拒绝、
  手机布局、元信息与撤销后 401。截图隐藏密钥明文。
- 回归本地 100 模型授权链路，未授权 403 → 授权后 mock 上游 200 → 撤销后 403。
- 生产 MaaS/TTS healthy，新资源核验通过；两个原模型、三个应用授权和一个
  有效服务 Key 保持不变，五个代表产品入口回归 200（AI Team 经原 SSO）。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030025500.tar.gz`。
- 未修改共享 Nginx、TTS 镜像或任何生产服务凭据。

2026-10-30 应用模型权限 release `20261030023200`：

- 应用页新增“管理模型权限”；支持名称/ID/能力搜索、只看已授权、
  每页 20 条和跨页保留选择，停用模型可保留授权但不能调用。
- 保存影响所有现有服务 Key；撤销及未保存关闭有确认，保存失败保留选择。
- 后端校验模型 ID、重复值及未知模型；乐观并发校验拒绝覆盖其他管理员的修改，
  变更记录 `application.models_updated`。
- 修复请求体消费后错误取消 Chat 转发的问题；Chat/TTS 以响应连接提前断开作为
  取消依据，不再传入请求体生命周期的 `request.signal`。
- 自动测试 17/17，包含隔离 HTTP 上游转发回归；浏览器在本地 100 模型库验证
  接入模型、创建 Key、未授权 403、授权后真实转发本地 mock 200、撤销后 403、
  冲突保护及 375px/横屏布局。该测试不等同于生产供应商调用测试。
- 生产 MaaS/TTS healthy，服务端新 HTML/JS/CSS 和授权路由核验通过；
  原 Chat/TTS 模型、三个应用权限和一个有效服务 Key 保持不变。
- 公网 MaaS 健康 200；控制台仍走 SSO。Image/FlowFrame/MeYou/Audit 直接 200，
  AI Team 经原 SSO 入口返回 200；未触碰共享 Nginx。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030023200.tar.gz`。

2026-10-30 筛选反馈与无障碍 release `20261030020630`：

- 筛选显示匹配数/总数，提供清空并恢复搜索焦点。
- 模型及应用密钥弹窗具备可访问名称；用量页明确未接入实际价格账单。
- 回归六页手机布局、加载恢复、历史导航、异步密钥隔离与键盘关闭通过。
- 自动测试 15/15，生产容器 healthy，新资源及五个产品回归通过。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030020630.tar.gz`。

2026-10-30 异步弹窗隔离 release `20261030015227`：

- 弹窗会话标识隔离旧请求：密钥、编辑保存和试听响应不能更新后来打开的弹窗。
- 关闭或切换模型时清除明文、倒计时及音频对象 URL。
- 详情连接测试完成后同步更新状态与最近测试结果。
- 浏览器延迟响应验证：关闭 A、打开 B 后，A 的密钥不出现在 B 中。
- 自动测试 15/15，语法检查通过；生产 healthy，五个产品回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030015227.tar.gz`。

2026-10-30 跨页面 UX release `20261030014015`：

- 初次加载失败提供重连；刷新失败保留旧数据并标记连接异常，刷新按钮防重复。
- 登录跳转或非 JSON 响应提供重新登录提示，不显示 JSON 解析错误。
- Playground 仅列启用 Chat 模型，调用时防重复提交并清空输入 Key。
- 应用 Key 撤销前确认影响；总览拓扑每列最多 6 项，提供完整列表入口。
- 浏览器验证加载恢复、延迟调用及六个页面 375px 手机布局通过。
- 自动测试 15/15，容器 healthy，新资源和五个产品回归通过。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030014015.tar.gz`。

2026-10-30 导航与反馈 release `20261030012511`：

- URL 片段保存页面、搜索、筛选、排序和分页；支持刷新恢复、直达与前进/后退。
- 导航同步当前页语义，手机点击当前页关闭侧栏；键盘跳转不重置页面。
- 成功/错误提示区分颜色和停留时间；应用密钥弹窗关闭后清除明文。
- 浏览器验证直达、刷新筛选/分页、前进/后退与跨页筛选保留通过。
- 自动测试 15/15，新资源验证、容器 healthy，五个代表性产品回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030012511.tar.gz`。

2026-10-30 批量管理 release `20261030010705`：

- 支持逐行多选、选择当前页、跨页保留选择与清空选择。
- 批量启用、停用、删除均有数量和影响确认；托管模型不参与批量变更。
- 顺序执行并显示进度；成功项取消选择，失败项保留并显示原因，方便重试。
- 本地 100 模型库验证跨页选择、取消不发送请求、20 项操作部分失败、
  失败项重试、批量删除与手机端布局通过；自动测试 13/13。
- 生产原 Chat/TTS 模型保持启用，容器 healthy，五个代表性产品回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030010705.tar.gz`。

2026-10-30 表单与健康状态 release `20261030004521`：

- 区分已停用、待配置、连接异常、未验证和认证通过，并提供异常/未验证筛选。
- 表单增加字段旁错误、ID 格式校验、中文保存错误和未保存关闭确认。
- Endpoint、凭据或上游模型变化后清除旧健康结果；后端保持停用模型状态。
- 浏览器验证未验证筛选、字段错误、取消与 Escape 关闭保护通过。
- 自动测试 13/13；新资源验证、容器 healthy 和五个产品回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030004521.tar.gz`。

2026-10-30 UI/UX 修复 release `20261030001133`：

- 修复启停按钮属性错误、弹窗操作重复绑定与失败时按钮恢复。
- 支持每页 10/20/50 条、按名称或最近更新排序和连续搜索。
- 密钥支持复制、立即隐藏、倒计时自动隐藏；关闭弹窗清除明文。
- 编辑停用模型保持原启用状态，表单使用原生字段校验。
- 本地 100 个模型浏览器验证通过；桌面、390px 手机及 reduced-motion 验证通过。
- 自动测试 12/12、语法检查通过；生产容器 healthy，五个代表性产品回归 200。
- 数据备份：`/data/app/lifeyoume-maas/backups/maas-data-20261030001133.tar.gz`。

```bash
ssh tencent 'sudo docker compose -p lifeyoume-maas -f /data/app/lifeyoume-maas/current/deploy/compose.tencent.yml ps'
ssh tencent 'systemctl is-active lifeyoume-maas-aliyun-tunnel.service'
ssh aliyun 'ss -lntp | grep "127.0.0.1:43280"'
curl -fsS https://maas.lifeyoume.icu/health/live
curl -i https://maas.lifeyoume.icu/health/ready
```
