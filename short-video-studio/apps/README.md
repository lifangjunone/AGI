# Platform Entrypoints

FRAME/60 / 智助乖乖 keeps one generation engine and one UI codebase, with four platform-specific entry modes:

| Directory | Runtime | Command | Entry |
| --- | --- | --- | --- |
| `web/` | Local browser server | `npm run web` | `/web/` |
| `mobile/` | Mobile PWA and LAN server | `npm run mobile` | `/mobile/` |
| `desktop/` | Electron desktop window | `npm run desktop` | `/desktop/` |
| `miniapp/` | Taro WeChat mini-program | Taro preview/build | Native WeChat pages |

All three modes share the same generation engine and data schema. Web and Mobile use the project `data/` workspace; the packaged Desktop edition uses its writable Application Support directory. Model credentials remain in the Node.js process and are never bundled into browser assets.

The LAN HTTP address is intended for physical-device testing. PWA installation and offline shell behavior require an HTTPS deployment (or browser-localhost exceptions). The packaged desktop edition stores credentials and generated work under `~/Library/Application Support/FRAME 60/`.

The `miniapp/` project contains the native 智助乖乖 workbench, records, and profile tabs. It reuses the shared HTTPS assistant API and must be configured with the real WeChat AppID before release.
