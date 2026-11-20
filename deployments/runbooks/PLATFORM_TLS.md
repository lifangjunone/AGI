# 平台共享 TLS 证书

最后核验：2026-11-16（Asia/Shanghai）

## 权威证书与安装位置

- Certbot lineage：`platform.lifeyoume.icu`
- Certbot 数据：`/data/app/opportunity-factory/letsencrypt`
- 来源：`live/platform.lifeyoume.icu/fullchain.pem`、`privkey.pem`
- Nginx 实际读取：`/data/app/english-learning/certs/platform.lifeyoume.icu.pem`、`.key`
- 容器内目录：`/etc/nginx/certs`
- 覆盖：主域名、www、ops、auth、billing、audit、easysay。

不要混淆另一个 `lifeyoume.icu` lineage。旧任务
`/etc/cron.d/opportunity-factory-cert` 只续签该双域名证书并复制到
`www.lifeyoume.icu.pem`，不能维护 Nginx 实际使用的平台证书。
旧任务保留未修改。

## 自动维护

- 脚本：`/usr/local/sbin/renew-lifeyoume-platform-cert`
- 服务：`lifeyoume-platform-cert-renew.service`
- Timer：`lifeyoume-platform-cert-renew.timer`
- 每天 06:00、18:00 检查，随机延迟最多 45 分钟，支持错过运行后补跑。
- 安装前检查有效期、全部 7 个主机名、证书与密钥匹配。
- 安装前备份当前证书，安装失败执行回滚；不变时不 reload。
- 执行 `nginx -t` 后仅 `nginx -s reload`，不得重启共享代理。
- 不修改共享 Nginx 配置，核验其 SHA-256。

手动运行：

```bash
ssh aliyun 'systemctl start lifeyoume-platform-cert-renew.service'
ssh aliyun 'systemctl show lifeyoume-platform-cert-renew.service --property=Result,ExecMainStatus'
```

oneshot 成功后显示 inactive/dead 是正常的，判断 `Result=success` 与
`ExecMainStatus=0`，不要用 `systemctl is-active` 判断执行成功。

## 2026-11-16 修复记录

旧证书于 2026-11-16 17:25（北京时间）过期。续签真实 platform lineage 后，
新证书有效至 **2027-02-14 19:18:46（北京时间）**。

备份：

- `/data/app/backups/platform-tls-20261116`
- `/data/app/backups/platform-tls-yN5iw79S`

共享 Nginx 配置哈希保持一致；未改路由、未重启代理。
公网检查未使用 `curl -k`：Destiny Persona、Astro Fate、Image、FlowFrame、
AI Team、Resume、Vault、Trends、Auth、Billing、Ops、Audit、MeYou、MaaS
正常（跟随既有登录跳转后 200），证书链校验通过。
