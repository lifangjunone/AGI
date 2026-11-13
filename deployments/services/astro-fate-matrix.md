# Astro Fate Matrix 星命矩阵部署

最后核验：2026-11-11（Asia/Shanghai）

## 公网入口

- 产品：`https://lifeyoume.icu/astro-fate/`
- 健康检查：`https://lifeyoume.icu/astro-fate/api/health`
- 星点网统计：`https://lifeyoume.icu/astro-fate/api/starmap`
- 管理页：`https://lifeyoume.icu/astro-fate/admin.html`，经平台管理员鉴权保护。
- 地点识别：`https://lifeyoume.icu/astro-fate/api/geocode?q=甘肃%20陇南`
- 分析接口：`POST https://lifeyoume.icu/astro-fate/api/analyze`

产品作为 LifeYouMe 路径型子产品接入共享入口；前端资源和 API 使用相对路径，
避免污染平台根路径。

## 腾讯云

- 部署根目录：`/data/app/astro-fate-matrix`
- 当前链接：`/data/app/astro-fate-matrix/current`
- 镜像：`astro-fate-matrix:current`
- 容器：`astro-fate-matrix`
- 服务：`astro-fate-matrix.service`
- 隧道：`astro-fate-aliyun-tunnel.service`
- 监听：`127.0.0.1:45330`
- 当前增强版 release：`20261111T175808REALMAP`
- 测算记录数据：`/data/app/astro-fate-matrix/data/analytics.json`
- 受限环境文件：`/etc/astro-fate-matrix/app.env`，root-only

容器使用 host 网络只监听本机端口，root 文件系统只读，`tmpfs /tmp`，
`no-new-privileges`，`cap-drop ALL`。

## 星点网、免费次数和管理统计

- 公开页新增“星点网”区块，以星点图和省份排行展示公开热度。
- 公开页星点网前端使用真实测算记录叠加“星命热度指数”做营销氛围展示，
  以本地 SVG 的真实中国国界轮廓承载发光省份星点，默认折叠：热门地区显示前 5 个、
  最近点亮显示前 3 条，用户点击“查看更多”后展开。
- 公开 API `/astro-fate/api/starmap` 只返回累计次数、省份聚合和脱敏昵称；不返回完整生日、
  出生时间、经纬度或关系期待。
- 服务端会保存测算记录，包含用户填写的生日、出生时间、出生地、经纬度、性别/身份、
  关系期待、星座/生肖/桃花方向摘要、MaaS 使用状态和访客哈希。
- 管理页 `/astro-fate/admin.html` 和 `/astro-fate/api/admin/stats` 必须通过平台管理员鉴权；
  Nginx 只向后端转发 `X-LifeYouMe-Admin-User` 管理员头。
- 游客按 `astro_fate_vid` Cookie 计算免费额度，默认 3 次；第 4 次返回
  `402 free_quota_exhausted`，前端引导到 LifeYouMe 注册和 Billing。
- 收费接入沿用 LifeYouMe 现有注册/开通入口，不在该产品内新建独立支付系统。

## 专业术数引擎

- 已将自有仓库 `FANzR-arch/Numerologist_skills` 源码随产品发布到
  `vendor/Numerologist_skills`，作为服务端内部能力使用，不暴露给浏览器。
- Node 后端通过 `src/numerologist-engine.mjs` 调用仓库内 Python CLI：
  - 紫微斗数：`ziwei-doushu/scripts/ziwei_cli.py`
  - 奇门遁甲：`qimen-dunjia/scripts/qimen_cli.py`
- 容器镜像内安装 `python3`、`py3-pip`、`lunar_python>=1.4.8,<2` 和
  `tzdata>=2024.1`；构建使用腾讯云 Alpine/PyPI 镜像源。
- `/api/analyze` 返回新增 `professional` 字段：
  - `professional.ziwei`：紫微命盘摘要、命宫/身宫、五行局、关键宫位；
  - `professional.qimen`：奇门局、驿马/值使方位、省份建议；
  - `professional.synthesis`：星座、轻量八字、紫微、奇门的“四维合参”摘要。
- MaaS prompt 会接收专业引擎结构化结果，只负责解释与合参，不负责硬排盘。
- 若 Python 依赖或用户性别信息不足，接口会降级返回基础报告，并在
  `professional.errors` / `reason` 中记录原因，不中断主测算。

## MaaS 接入

- MaaS 应用：`astro-fate`
- 授权逻辑模型：`lym-chat-quality`
- 服务端配置：`MAAS_BASE_URL=http://127.0.0.1:43280/v1`
- Key 存放：`/etc/astro-fate-matrix/app.env`，不进入仓库、不输出到日志或部署记录。

上线时先备份 MaaS state，再在 MaaS 停止期间写入应用授权和应用服务 Key，随后
启动原 `lifeyoume-maas-maas-1` 容器加载最新 state。已验证星命服务环境 Key 可
在 MaaS state 中认证为 `astro-fate`，且公网 `/astro-fate/api/analyze` 返回
`source=maas`、`modelId=lym-chat-quality`。

MaaS state 备份：

- `/data/app/lifeyoume-maas/backups/maas-data-astro-fate-authorize-20261111T113541.json`

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块：`# BEGIN/END astro-fate`
- 阿里云监听：`127.0.0.1:45330`，由腾讯云反向 SSH 隧道提供。
- 发布前备份：
  `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-astro-fate-20261111T113632`
- 管理统计增强备份：
  - `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-astro-fate-admin-20261111T115004`
  - `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-astro-fate-admin-fix-20261111T115057`
  - `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-astro-fate-admin-check-20261111T115108`

共享配置发布前 SHA-256：
`132d7737865403dc3a5913129aba202c083ddb3e4f60a3d77feedfc968fa1f0c`

发布后 SHA-256：
`c7c1bae25ca853c62fc1ca367905a1aeccd944a9c4dc122903c030f49c9c3252`

管理统计增强发布后 SHA-256：
`a16148df7925075021056bc00e2b24433dc2a46c686027fb67026fe2a8a2eae6`

发布前后 inode 均为 `1358688`。修改前盘点已有路由，修改后确认无既有路由
消失；使用现网容器执行 `nginx -t` 成功，只执行 `nginx -s reload`，未重启或
重建共享 `opportunity_factory_proxy` 容器。

## 验证

- 本地测试：`npm run check`，12 项测试通过。
- 本地临时 Python venv 端到端验证：紫微和奇门 CLI 均可用，返回
  `professional.available=true`、`label=四维合参`。
- 腾讯云：
  - `astro-fate-matrix.service` active。
  - `astro-fate-aliyun-tunnel.service` active。
  - `GET http://127.0.0.1:45330/api/health` 返回 `maasConfigured=true`。
  - `POST http://127.0.0.1:45330/api/analyze` 返回 `source=maas`、
    `professional.available=true`、`ziwei.available=true`、`qimen.available=true`、
    `label=四维合参`。
  - `GET http://127.0.0.1:45330/api/starmap` 返回公开星点统计。
  - 同一访客 Cookie 前 3 次 `POST /api/analyze` 成功，第 4 次返回
    `402 free_quota_exhausted`。
  - `GET /api/admin/stats` 匿名返回 401；带平台管理员头可读取统计。
- 阿里云/公网：
  - `GET https://lifeyoume.icu/astro-fate/` 返回 200。
  - `GET https://lifeyoume.icu/astro-fate/api/health` 返回 200。
  - `GET https://lifeyoume.icu/astro-fate/api/starmap` 返回 200。
  - `GET https://lifeyoume.icu/astro-fate/api/geocode?q=甘肃%20陇南`
    返回首选 `陇南`，经纬度 `33.4007,104.9218`。
  - `POST https://lifeyoume.icu/astro-fate/api/analyze` 返回 `source=maas`、
    `model.used=true`、`modelId=lym-chat-quality`、`professional.available=true`、
    `ziwei.available=true`、`qimen.available=true`、`label=四维合参`。
  - 同一公网访客 Cookie 前 3 次测算成功，第 4 次返回 `free_quota_exhausted`。
  - 匿名访问 `https://lifeyoume.icu/astro-fate/admin.html` 和
    `https://lifeyoume.icu/astro-fate/api/admin/stats` 返回 302，跳转平台管理入口。
  - 首屏标题视觉优化已上线：桌面首屏改为两层精致标题、渐变强调和星轨背景；
    390px 移动端标题不再横向溢出，移动导航保留“星点网 / 开始测算”两个主要入口。
  - 首页 UI release `20261111T162442UI` 已上线：首屏文案为“你的缘分 / 藏在那个方向？”；
    右侧星盘将四维合参节点（八字、紫微、星座、奇门）融合进 12 星座转盘；星点网前端
    展示营销热度指数、多省份发光星点、LIVE 氛围和可折叠排行/最近点亮列表。
  - 首页星点网地图 release `20261111T172037MAP` 已上线：原椭圆星点场改为抽象
    中国地图剪影，海南/台湾岛屿点缀和省份星点叠加，营造“全国缘分正在被点亮”的
    地图点亮效果；公网资源已确认包含 `map-china-shape`、`map-island` 和折叠列表逻辑。
  - 真实地图轮廓修正 release `20261111T175808REALMAP` 已上线：弃用手绘 CSS 多边形，
    使用本地 `china-map.svg` 的真实中国国界路径（含海南、台湾），星点按地理位置重新
    映射；390px 移动端隐藏重叠的地图内省名、保留 44px 触控热点与榜单文字，避免东部
    省份密集区变成文字云。腾讯本机与公网 SVG 均返回 200，MaaS 配置正常。
  - 结果区视觉重构已上线：新增“重新生成”按钮；测算结果按命盘总览、星座画像、
    八字匹配、姻缘桃花、桃花方向、行动建议分卡片展示；MaaS/本地长文解读改为
    可展开的“深度补充”，避免默认显示大段文字。
  - 专业合参展示已上线：结果页新增“专业合参”导航与卡片，展示紫微命盘摘要、
    关系宫位、奇门桃花方位、省份建议和四维合参要点。
- 代表性既有入口：
  - AI Team `/ai-team/` 返回 307（认证跳转类响应）。
  - FlowFrame `/flowframe/` 返回 200。
  - Image `/image/` 返回 200。
  - Resume `/resume/` 返回 302（认证跳转类响应）。
  - Vault `/vault/` 返回 200。
  - Trends `/trends/` 返回 200。
  - MeYou `/health` 返回 200。
  - Audit 根入口返回 200，`/admin/` 返回 303；`/health` 非该产品健康入口。
  - MaaS `/health/ready` 返回 200。

## 回滚

1. 将共享 Nginx 中 `# BEGIN/END astro-fate` 块删除，或将备份内容复制回原文件
   （保持 inode，不替换文件）。
2. 执行 `docker exec opportunity_factory_proxy nginx -t`。
3. 只执行 `nginx -s reload`。
4. 停止并禁用 `astro-fate-aliyun-tunnel.service` 和 `astro-fate-matrix.service`。
5. 如需撤销模型授权，在 MaaS 中撤销 `astro-fate production` 应用 Key；不要删除
   其他应用或模型。
