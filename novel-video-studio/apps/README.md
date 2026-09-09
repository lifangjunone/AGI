# 三端入口

三种产品形态共享同一个小说检索、制片流水线、方舟代理和数据结构。

| 形态 | 入口 | 命令 | 数据位置 |
| --- | --- | --- | --- |
| Web | `/web/` | `npm run web` | 项目 `data/` |
| 手机 App（PWA） | `/mobile/` | `npm run mobile` | 服务端 `data/` |
| 桌面 App（Electron） | `/desktop/` | `npm run desktop` | macOS Application Support |

移动端启动命令会输出局域网地址，可直接在手机浏览器打开并“添加到主屏幕”。正式部署需使用 HTTPS，Service Worker 和安装体验才能稳定工作。

桌面 App 启动独立的随机端口本地服务。模型密钥和生成数据均位于主进程/本地服务侧，不进入渲染层。
