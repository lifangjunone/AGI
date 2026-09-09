# Hover Translator

## 统一身份

Electron 客户端使用 LifeYouMe 设备授权，浏览器完成认证后应用获取产品作用域
令牌；翻译记录仍按本地优先原则保存，不接触统一账号密码。接入契约见
[`lifeyoume-platform/docs/SSO.md`](../lifeyoume-platform/docs/SSO.md)。

macOS system-wide English-to-Chinese translator built with Electron, Swift, and
Apple Vision OCR.

## Features

- Hover over an English word for translation, phonetics, part of speech,
  example usage, and root notes.
- Starts as a 76 x 84 pixel desktop pet that stays above other windows without
  covering the desktop; drag its top handle to move it.
- Drag across an English sentence to translate the selected region.
- Double-click an English word to translate it immediately.
- Click the pet to toggle the translation desk. Right-click it to pause capture,
  hide the pet, or quit.
- Hide to the menu bar, minimize, pause capture, and restore with
  `Command+Shift+T`.
- Local result cache and a small offline fallback dictionary.

## Run

Requires macOS 13+, Node.js 18+, Xcode Command Line Tools, and screen recording
permission.

```bash
npm install
npm run dev
```

On first launch, open **System Settings > Privacy & Security > Screen
Recording**, enable Electron or Hover Translator, then restart the app.

## Build

```bash
npm run dist
```

Translation uses MyMemory, Datamuse, and Tatoeba. No API key is stored. The app
reports a connection error instead of presenting invented results when both
online translation and the offline fallback are unavailable.
