# 在手机上使用 EasySay

EasySay 的 ASR/TTS 模型继续运行在 Mac 上。手机只负责录音、显示课程和播放电脑
返回的语音，不需要下载约 5.2 GB 的模型，也不需要 VPN 或公网隧道。

## 连接方式

```text
手机 Safari / Chrome
      |
      | 同一 Wi-Fi 内的受信任 HTTPS
      v
Mac 上的 EasySay :8787
      |
      +-- Qwen3-ASR
      +-- Qwen3-TTS
```

EasySay 会生成一个只属于本机的证书机构和 HTTPS 证书。手机安装并信任根证书后，
浏览器才会把局域网页面视为安全上下文并允许麦克风。公网、Cloudflare、Tailscale
和路由器端口均不参与。

## 启动

先确保手机和 Mac 连接同一个 Wi-Fi，并停止正在运行的 `npm run dev`：

```bash
npm run mobile:start
```

终端会显示：

```text
手机设置页: http://192.168.x.x:8786
EasySay 地址: https://192.168.x.x:8787
EasySay 手机访问码: 123456
```

## iPhone / iPad 首次设置

1. 用 Safari 打开终端显示的“手机设置页”。
2. 点击“下载 EasySay 证书”，允许下载描述文件。
3. 打开“设置 → 通用 → VPN 与设备管理 → 已下载的描述文件”。
4. 安装 `EasySay Local CA`。
5. 打开“设置 → 通用 → 关于本机 → 证书信任设置”。
6. 开启 `EasySay Local CA` 的完全信任。
7. 回到设置页，点击“打开 EasySay”。
8. 输入终端显示的 6 位访问码，并允许麦克风。

## Android 首次设置

不同品牌菜单名称不同：

1. 用 Chrome 打开“手机设置页”并下载证书。
2. 在系统设置中搜索“安装 CA 证书”或“从存储安装证书”。
3. 选择下载的 `easysay-local-ca.crt`。
4. 回到设置页，打开 EasySay，输入访问码并允许麦克风。

部分企业策略或 Android 浏览器不接受用户 CA。遇到这种情况，需要使用非受管控
手机或申请管理员放行。

## 安装到桌面

完成证书信任和访问码登录后：

- iPhone：Safari“共享 → 添加到主屏幕”。
- Android：Chrome 菜单“安装应用”或“添加到主屏幕”。

局域网 IP 变化后，重新运行 `npm run mobile:start` 会生成覆盖新 IP 的服务证书。
根 CA 不变，手机通常无需重新安装根证书。使用新的终端地址访问即可。

课程进度和录音保存在手机浏览器/PWA 中。清除站点数据或卸载 PWA 会清除学习记录；
当前版本尚未提供跨设备同步。

## 诊断

保持手机模式运行，在另一个终端执行：

```bash
npm run mobile:doctor
```

它会检查 Wi-Fi 地址、证书、手机设置页、HTTPS 登录页和 ASR/TTS 服务。

## 停止

按 `Ctrl+C` 会同时停止手机设置页、EasySay 和模型服务。启动命令使用
`caffeinate` 防止 Mac 自动睡眠；合上笔记本盖仍可能使服务停止。

## 删除手机证书

不再使用时可以删除：

- iPhone：“设置 → 通用 → VPN 与设备管理 → EasySay Local CA → 移除描述文件”。
- Android：在“受信任的凭据/用户凭据”中删除 EasySay Local CA。

## 安全边界

- 仅同一局域网设备可以访问，不使用公网入口。
- Python 模型服务仍只绑定 `127.0.0.1:8790`。
- Web 入口需要随机 6 位访问码。
- 登录 Cookie 使用 `HttpOnly`、`Secure` 和 `SameSite=Strict`。
- 登录接口限制为 15 分钟最多 8 次。
- CA 私钥和服务器私钥只保存在 Git 忽略的 `.cert/` 中。
- 访问码只存在当前进程环境中，不写入 Git 或配置文件。
