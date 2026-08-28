import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const host = "0.0.0.0";
const port = Number(process.env.MOBILE_BOOTSTRAP_PORT ?? 8786);
const lanIp = process.env.EASYSAY_LAN_IP ?? "127.0.0.1";
const certificatePath =
  process.env.EASYSAY_CA_CERT_PATH ??
  path.resolve(".cert/easysay-local-ca.crt");
const appUrl = `https://${lanIp}:8787`;

const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EasySay 手机连接</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 24px; color: #18342f; background: #f5f2e9;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      main { width: min(100%, 620px); margin: 24px auto; }
      h1 { margin: 10px 0; font-size: 30px; letter-spacing: 0; }
      h2 { margin-top: 28px; font-size: 18px; }
      p, li { color: #596964; line-height: 1.65; }
      .brand { color: #b26b2f; font-size: 12px; font-weight: 800; }
      .button {
        min-height: 50px; margin: 10px 0; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        color: white; background: #183f37; font-weight: 800;
        text-decoration: none;
      }
      .button.secondary { color: #183f37; background: #e4b84f; }
      code { overflow-wrap: anywhere; }
      .note {
        margin-top: 24px; padding: 14px; border-left: 3px solid #b26b2f;
        background: #fff9e8;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="brand">EASYSAY · LOCAL NETWORK</span>
      <h1>连接手机英语教练</h1>
      <p>手机和 Mac 必须连接同一个 Wi-Fi。证书只用于识别这台 Mac，不会上传录音。</p>

      <h2>iPhone / iPad</h2>
      <ol>
        <li>点击“下载 EasySay 证书”。</li>
        <li>打开“设置 → 通用 → VPN 与设备管理 → 已下载的描述文件”，安装证书。</li>
        <li>打开“设置 → 通用 → 关于本机 → 证书信任设置”，开启 EasySay Local CA。</li>
        <li>回到此页，点击“打开 EasySay”。</li>
      </ol>

      <h2>Android</h2>
      <ol>
        <li>下载证书。</li>
        <li>在系统设置中搜索“安装 CA 证书”，从存储安装。</li>
        <li>回到此页，点击“打开 EasySay”。</li>
      </ol>

      <a class="button secondary" href="/easysay-local-ca.crt">
        下载 EasySay 证书
      </a>
      <a class="button" href="${appUrl}">打开 EasySay</a>

      <div class="note">
        如果企业策略禁止安装本地证书，这台受管控手机无法使用麦克风访问局域网网页，
        需要换非受管控手机或申请飞连管理员放行。
      </div>
      <p><small>EasySay 地址：<code>${appUrl}</code></small></p>
    </main>
  </body>
</html>`;

http
  .createServer((request, response) => {
    if (request.url === "/easysay-local-ca.crt") {
      response.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="easysay-local-ca.crt"',
        "Cache-Control": "no-store"
      });
      fs.createReadStream(certificatePath).pipe(response);
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(page);
  })
  .listen(port, host, () => {
    console.log(`EasySay phone setup: http://${lanIp}:${port}`);
  });
