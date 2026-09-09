# Platform Entrypoints

FRAME/60 keeps one generation engine and one UI codebase, with three platform-specific launch modes:

| Directory | Runtime | Command | Entry |
| --- | --- | --- | --- |
| `web/` | Local browser server | `npm run web` | `/web/` |
| `mobile/` | Mobile PWA and LAN server | `npm run mobile` | `/mobile/` |
| `desktop/` | Electron desktop window | `npm run desktop` | `/desktop/` |

All three modes share the same generation engine and data schema. Web and Mobile use the project `data/` workspace; the packaged Desktop edition uses its writable Application Support directory. Model credentials remain in the Node.js process and are never bundled into browser assets.

The LAN HTTP address is intended for physical-device testing. PWA installation and offline shell behavior require an HTTPS deployment (or browser-localhost exceptions). The packaged desktop edition stores credentials and generated work under `~/Library/Application Support/FRAME 60/`.
