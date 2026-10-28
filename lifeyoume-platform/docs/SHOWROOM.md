# 产品展厅重构

目录与详情采用浅色、深绿品牌、真实产品预览与场景化表达。保留此前任务完成的
首页与管理后台设计。新布局仅加载在 `showroom-page`，不替换其样式。

## 本地预览

```bash
AUTH_DB=/tmp/lifeyoume-showroom-preview.sqlite PORT=8890 \
  SERVICE_ROLE=portal python3 platform/app.py
```

访问 `http://127.0.0.1:8890/products`。本地私有健康检查未启动时，相应产品显示
暂时离线；这不表示线上离线。不要为了展示效果伪造健康状态。

## 内容与接口

- 注册表仍为 Schema v2；新增可选 `scenario`、`highlights`（title/description）、
  `steps`、`limitations`、`preview`、`preview_alt`。旧数据以简介与能力回退。
- 六个重点产品固定策展；完整目录继续沿用后台推广、热度、同热度轮换规则。
- 搜索涵盖能力、人群、场景与产品线。分类与范围切换进入历史，搜索采用
  replaceState；详情链接携带仅限同源 `/products` 的 return 参数。
- `/products/<id>/open` 只跳转注册表 HTTPS 入口，验证可见性和启用状态，
  记录一次点击；详情访问不计试用点击，历史数据保持原样。
- 试用跳转不代替各产品自己的 SSO/登录策略，目标服务继续执行访问检查。
- 无 JS 可阅读全部产品并打开体验入口；筛选与返回状态恢复属于 JS 增强。

## 素材与真实边界

- MeYou、智助乖乖、隐匣：公开页面截图，没有登录私人账号或读取私人档案。
- ResumeForge、旅拍管家：仓库现有 dist 的实际界面，使用全新浏览器上下文；
  页面上的预置简历和照片为产品自带展示内容，不是用户资料。
- FlowFrame：复用前一任务采集的 `products/flowframe.webp`。
- 其他已有照片保留并标记为产品配图；缺图以代码原生类别图形与能力展示回退。
- 明示 FlowFrame 导出队列待接入、ResumeForge 不编造经历且不调用模型 API、
  旅拍当前为本地原型、隐匣主密码无法找回，以及 MeYou Beta 不接真实支付。

## 清单核对

线上 public API 有 `model-radar`，本地原来没有：补回其公开元数据，不猜测
私有健康 URL。本地 `decision-studio` 未见于线上 public API，保留不删除。
正式发布前必须读取最新远端注册表，按 ID 合并上述可选展示字段，不能将
本地整份注册表覆盖远端；启用/登录策略与运行时数据库不在发布范围内。

## 验证

- 平台与新增展厅测试：28 项通过（包括停用、内部、无入口、未知产品、
  非法路径、固定注册入口和点击计数）。
- 浏览器筛选、刷新恢复、历史后退、详情返回、空结果重置连续三轮通过。
- 375 / 768 / 1024 / 1440px 目录与详情资源加载、无横向溢出通过；
  减少动态效果、键盘跳过导航、无 JS 阅读与体验链接通过。
- 新版证据 `/tmp/lym-showroom-evidence/`；测试脚本
  `/tmp/playwright-test-lym-showroom.js`。旧版证据延用 DESIGN-A.md 中路径。
- 本次另采集线上改版前截图 `catalog-before.png`；新版首屏
  `catalog-desktop.png` 与 `detail-desktop.png`。正文对比度 6.05:1，
  主按钮文字 7.17:1；新目录可点击区域均不小于 44px，横屏无溢出。
- 自检而非独立视觉评审；无滚动劫持、自动轮播或复杂动画，只有短按钮反馈。
- 原 AuthStore 在 Python 3.14 测试中有 SQLite 连接 ResourceWarning，
  测试结果通过；此次未修改身份数据库实现。

## 后续发布（本次未执行）

新增 `platform/showroom.py` 是必要运行文件，必须随 `app.py` 发布。
仅同步相关 Python 文件、portal.js、showroom.css 与六个预览素材，并按最新
远端清单合并展示字段；备份与并发校验后仅重启 portal 服务。
不能运行旧 `push-server.sh` / `install-server.sh` 做此次单产品发布：
它们会替换资源目录并重启全部平台角色，且不包含新模块。

无需修改共享 Nginx，不重建或重启共享代理容器。发布后检查门户以及
`/image/`、`/flowframe/`、`/video/` 等代表性入口。任何非目标产品回归均算发布失败。
