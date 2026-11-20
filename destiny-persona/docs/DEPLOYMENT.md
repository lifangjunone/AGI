# 命运分身今日时运部署说明

## 计划入口

- 公网路径：`https://lifeyoume.icu/destiny-persona/`
- Tencent 运行端口：`127.0.0.1:45560`
- Aliyun 本地监听：`127.0.0.1:45560`，由 Tencent 反向 SSH 隧道提供

## 运行方式

- 部署根目录：`/data/app/destiny-persona`
- 当前版本链接：`/data/app/destiny-persona/current`
- 服务：`destiny-persona.service`
- 隧道：`destiny-persona-aliyun-tunnel.service`
- 环境文件：`/etc/destiny-persona/app.env`

每个 release 创建独立 `.venv` 并安装 `pyproject.toml` 固定的支付宝官方 SDK，
systemd 使用 `/data/app/destiny-persona/current/.venv/bin/python` 启动。服务承载
静态页面、今日卡 API 和 Billing API；不依赖数据库，通过 JSON 文件保存匿名
访客免费/付费额度、订单和脱敏记录，不保存完整昵称、生日或原始测算输入。

生产支付宝配置只写入 root-only 的 `/etc/destiny-persona/app.env`。禁止上传
`.alipay-sandbox.json`，禁止在生产设置 `ALIPAY_USE_SANDBOX=1`。生产产品未开通
或配置不完整时，套餐仍可展示，但付款按钮必须保持禁用。

## 共享 Nginx 规则

只允许在 `/data/app/lifeyoume-platform/deploy/nginx-platform.conf` 中追加或更新 `BEGIN/END destiny-persona` scoped location。修改前必须备份最新共享配置并盘点已有路由；修改后必须执行 `nginx -t`，并使用 `nginx -s reload`，不得重启或重建共享代理容器。
