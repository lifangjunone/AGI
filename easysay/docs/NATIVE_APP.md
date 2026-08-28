# EasySay 原生手机 App

EasySay 使用 Capacitor 维护 iOS 和 Android 原生工程。App 的课程、录音与进度保存在
手机中；Qwen3 ASR/TTS 仍运行在同一 Wi-Fi 的 Mac 上。

## 仓库结构

```text
ios/                         iOS Xcode 工程
android/                     Android Gradle 工程
capacitor.config.ts          原生容器配置
src/components/NativeConnectionGate.tsx
src/lib/nativeConnection.ts  App 与 Mac 的连接配置
```

App ID：`com.easysay.speaking`

## 启动 Mac 模型服务

```bash
npm run native:start
```

终端会显示：

```text
原生 App 电脑地址: http://192.168.x.x:8785
原生 App 连接码: 123456
```

连接码保存在 Git 忽略的 `.local/native-access-code`，重启服务后保持不变。手机和 Mac
必须连接同一个 Wi-Fi。

## App 首次连接

1. 打开 EasySay App。
2. 电脑地址默认预填为 `http://192.168.1.7:8785`，网络变化后可直接修改。
3. 输入 Mac 终端显示的 6 位连接码。
4. 点击“连接并开始学习”。

地址和连接码保存在 App 的原生偏好存储。App 后续启动会自动检查连接。进入底部
“模型”页可点击“更换连接的电脑”。

## iOS

要求：

- Xcode
- Apple ID
- iPhone 开启“开发者模式”

同步并打开：

```bash
npm run native:ios
```

在 Xcode 中：

1. 选择 `App` Target。
2. 在 Signing & Capabilities 选择你的 Apple Development Team。
3. 连接 iPhone 并将运行目标切换为该 iPhone。
4. 点击 Run 安装。

免费 Apple ID 签名通常需要定期重新安装；正式长期安装需要 Apple Developer
Program 或 TestFlight。

完成 Xcode 登录和 iPhone 信任后，也可以使用一键检查与安装：

```bash
npm run ios:doctor
npm run ios:install
```

iOS 工程已声明麦克风与本地网络用途，并允许连接局域网 HTTP 服务。

## Android

要求：

- Android Studio
- JDK 21
- Android SDK 36

同步并打开：

```bash
npm run native:android
```

连接已开启 USB 调试的 Android 手机，在 Android Studio 点击 Run。调试 APK 通常在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Android 工程已声明 `RECORD_AUDIO`、`INTERNET` 和网络状态权限，并仅通过 App 内连接码
访问 EasySay 服务。

## 更新原生工程

修改 React 代码后执行：

```bash
npm run native:sync
```

该命令重新构建 Web 资源并同步 Capacitor 插件，不会覆盖手工维护的
`Info.plist`、`AndroidManifest.xml`、原生图标和网络安全配置。

## 安全边界

- 模型服务只监听 `127.0.0.1:8790`。
- App 网关监听局域网 `8785`，所有 API 必须携带 6 位连接码。
- 未授权请求返回 401；API 受全局限流保护。
- 电脑连接信息仅保存在手机原生偏好存储。
- 不经过公网隧道，不受 Tailscale/Cloudflare 软件禁用影响。
