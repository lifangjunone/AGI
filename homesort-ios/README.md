# HomeSort

HomeSort 将“用户寻找 App”改为“系统预测并呈现下一步 App”。

- Android：原生默认 Launcher，接管 Home 键和系统桌面入口。
- iOS：SwiftUI 主应用与 WidgetKit 预测入口，遵守 iOS 系统边界。

根目录的 React/Capacitor 工程仅保留为早期交互原型，不代表当前产品实现。

## Android Launcher

工程路径：`android-launcher/`

### 已实现

- 注册 `HOME`、`DEFAULT` 和 `LAUNCHER` Intent，可设为系统默认桌面
- 解锁返回桌面或按 Home 键时直接进入 HomeSort
- 从 `PackageManager` 读取设备上真实可启动应用
- 上滑进入应用抽屉，支持搜索、启动和长按管理
- 支持固定预测入口、从 HomeSort 隐藏应用和恢复隐藏应用
- 可选授权 `UsageStats`，学习系统真实前台使用事件
- 无授权时只学习从 HomeSort 发起的真实启动
- 基于频次、时间、星期、近期性和固定顺序进行本地预测
- 首页显示本地时钟、日期、当前位置与 Open-Meteo 实时天气
- 用户授权通知使用权后，在预测入口图标显示各 App 的活动通知数量
- DataStore 本地持久化，支持删除预测记忆
- 返回键锁定在 Launcher 根界面
- 单元测试、Lint、模拟器安装和默认 HOME 验证

### 构建

要求：JDK 17、Android SDK 35。

```bash
cd android-launcher
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Debug APK：

```text
android-launcher/app/build/outputs/apk/debug/app-debug.apk
```

安装到设备：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

首次启动后点击“设为默认”，由 Android 系统确认 HomeSort 为默认桌面。使用情况访问同样必须由用户在系统设置中授权。

### Android 边界

默认 Launcher 能替换桌面、Home 键入口和应用抽屉，但普通消费者应用不能禁止：

- 通知栏和快速设置
- 最近任务界面
- 系统设置和关机界面
- 用户更换默认 Launcher

如需企业专机级锁定，必须增加 Android Enterprise Device Owner、Lock Task 和受管设备部署。这与可自由安装的消费者版本是不同产品形态。

## iOS 预测入口

工程路径：`native/`

### 已实现

- SwiftUI 原生引导、固定智能首页、记忆和设置
- 首页不滚动，固定呈现时钟天气、1 个主预测、3 个次预测和底部搜索
- 搜索在独立全屏层展示全部支持入口，不受预测位数量限制
- 首页显示本地时钟、日期、当前位置与 Open-Meteo 实时天气
- 入口管理收纳在设置层，支持搜索名称、类别和常用别名
- WidgetKit 锁屏圆形、锁屏矩形以及桌面小/中/大组件
- 基于偏好顺序、频次、小时、星期和近期性的本地预测
- 只记录用户从 HomeSort 发起的真实启动
- App Group 共享主应用和 Widget 数据
- StoreKit 2 年度订阅购买与权益读取
- 本地记忆删除、产品重置和云同步开关
- 阿里云同步客户端数据契约
- 单元测试和 UI 测试

### 构建

要求：Xcode 16、iOS 18 SDK、XcodeGen。

```bash
cd native
xcodegen generate
xcodebuild test \
  -project HomeSort.xcodeproj \
  -scheme HomeSort \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

真机签名标识：

- App：`com.huimiying.homesort`
- Widget：`com.huimiying.homesort.widget`
- App Group：`group.com.huimiying.homesort`

### iOS 边界

iOS 公开 API 不允许第三方应用覆盖 SpringBoard、解锁后强制启动、读取完整系统使用历史、枚举全部已安装 App，或读取微信、飞书等其他 App 的未读消息数量。HomeSort 通过锁屏和桌面 Widget 将预测入口前移；目标 App 未安装或没有可用 URL Scheme 时会明确提示。

## 位置与天气

Android 和 iOS 仅在用户授权后获取当前坐标，并通过系统地理编码显示城市或区域。坐标直接发送到 [Open-Meteo](https://open-meteo.com/) 获取当前温度和天气代码，HomeSort 不存储位置历史。定位被拒绝、网络离线或服务超时时，界面会显示对应状态并允许重试。

## 付费与云同步

iOS 年度订阅产品 ID：

```text
com.huimiying.homesort.pro.yearly
```

`native/StoreKit.storekit` 用于本地购买测试。正式收费仍需在 App Store Connect 创建订阅并配置审核资料。

`AliyunSyncClient` 已定义以下客户端契约：

```http
POST {endpoint}/v1/launcher/sync
Authorization: Bearer {token}
Content-Type: application/json
```

仓库尚未包含已部署的阿里云服务、登录鉴权、密钥管理或多端冲突合并。当前 Android 和 iOS 数据均以本机存储为准。

## Web 原型

```bash
npm install
npm run dev
```
