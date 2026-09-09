# 隐匣 Personal Privacy Vault

本地优先的个人隐私档案系统。适合保存身份资料、账号凭据、财务信息、医疗健康、家庭档案和私密笔记。

## 隐私边界

- 不提供账号体系，不连接业务服务器，不包含分析或追踪代码。
- 主密码不保存；使用 PBKDF2-SHA-256（310,000 次迭代）派生 AES-256-GCM 密钥。
- 标题、分类、字段和备注作为一个整体加密后写入浏览器 IndexedDB。
- 解锁密钥只存在于当前页面内存，关闭页面或点击锁定后丢弃。
- 5 分钟无操作自动锁定。
- 锁定页或解锁后的工具栏均可验证当前密码并轮换主密码，系统会使用新随机盐重新加密全部档案。
- 导出的 `.pvault` 文件仍是密文，但应按敏感文件妥善保管。
- 锁定页可在二次确认后清除本设备保险库；该操作不可撤销。

主密码无法找回。忘记主密码时，数据和备份均无法恢复。

## 使用

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:4333`。

## 生产部署

公网入口：

```text
https://lifeyoume.icu/vault/
```

生产静态文件位于服务器 `ssh aliyun` 的 `/data/app/personal-privacy-vault/current`。该路径指向带时间戳的只读发布目录，并挂载至现有 Nginx 容器 `/var/www/vault`。Nginx 路由模板见 [`deploy/nginx-vault-location.conf`](deploy/nginx-vault-location.conf)。

生产入口启用 HTTPS、HSTS、严格 CSP、禁止嵌入、`no-referrer` 及敏感硬件权限禁用策略。应用不向服务器上传保险库内容；每位用户的数据仍只保存在其浏览器 IndexedDB 中。

## 验证

```bash
npm test
npm run build
```

密码学测试覆盖密文无明文泄漏、正确密码解密、错误密码拒绝和更新后随机 IV。

## 数据迁移

在顶部工具栏选择“导出加密备份”，会生成 `.pvault` 文件。在新浏览器中选择“从加密备份恢复”，然后输入创建备份时的主密码。

恢复操作会替换当前浏览器中的保险库。导入前应先导出现有保险库。
