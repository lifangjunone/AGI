const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "src/index.html"), "utf8");

test("BrowserWindow 显式启用完整 Renderer 隔离", () => {
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /webSecurity: true/);
  assert.match(main, /allowRunningInsecureContent: false/);
  assert.match(main, /webviewTag: false/);
});

test("主进程拒绝页面导航、重定向、新窗口和 webview", () => {
  const boundary = main.slice(
    main.indexOf("function attachWebContentBoundary"),
    main.indexOf("async function createWindow")
  );
  assert.match(boundary, /webContents\.on\("will-navigate"/);
  assert.match(boundary, /webContents\.on\("will-redirect"/);
  assert.match(boundary, /webContents\.on\("will-attach-webview"/);
  assert.equal((boundary.match(/event\.preventDefault\(\)/g) || []).length, 3);
  assert.match(
    boundary,
    /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/
  );
  assert.match(main, /attachWebContentBoundary\(window\)/);
});

test("Session 默认拒绝页面权限、设备权限、屏幕捕获和下载", () => {
  const security = main.slice(
    main.indexOf("function configureSessionSecurity"),
    main.indexOf("function attachWebContentBoundary")
  );
  assert.match(security, /session\.defaultSession/);
  assert.match(security, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(security, /setPermissionRequestHandler/);
  assert.match(security, /callback\(false\)/);
  assert.match(security, /setDevicePermissionHandler\(\(\) => false\)/);
  assert.match(security, /setDisplayMediaRequestHandler/);
  assert.match(security, /callback\(\{\}\)/);
  assert.match(security, /appSession\.on\("will-download"/);
  assert.match(main, /configureSessionSecurity\(\)/);
});

test("CSP 禁止网络连接、嵌入内容、媒体、Worker 和表单外发", () => {
  const policy = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/
  )?.[1];
  assert.ok(policy);
  for (const directive of [
    "default-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ]) {
    assert.match(policy, new RegExp(directive.replaceAll("'", "\\'")));
  }
});

test("允许的外部内容只能经 URL 白名单交给系统浏览器", () => {
  assert.match(
    main,
    /Only local HTTP output URLs are allowed[\s\S]*shell\.openExternal\(url\)/
  );
  assert.match(
    main,
    /Only verified GitHub or Hugging Face URLs are allowed[\s\S]*shell\.openExternal\(url\)/
  );
});
