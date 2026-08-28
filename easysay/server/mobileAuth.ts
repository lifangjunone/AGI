import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";

const cookieName = "easysay_mobile_access";
const sessionValue = "mobile-session-v1";

function accessCode(): string | undefined {
  return process.env.EASYSAY_ACCESS_CODE?.trim() || undefined;
}

function sessionToken(code: string): string {
  return crypto.createHmac("sha256", code).update(sessionValue).digest("hex");
}

function parseCookies(request: Request): Record<string, string> {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [
          decodeURIComponent(part.slice(0, separator)),
          decodeURIComponent(part.slice(separator + 1))
        ];
      })
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function loginPage(message?: string): string {
  const notice = message
    ? `<p class="error" role="alert">${message}</p>`
    : `<p>输入电脑终端显示的 6 位访问码。</p>`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f5f2e9" />
    <title>连接 EasySay</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100dvh; display: grid; place-items: center;
        padding: 24px; color: #18342f; background: #f5f2e9;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      main { width: min(100%, 380px); }
      .brand { color: #b26b2f; font-size: 12px; font-weight: 800; }
      h1 { margin: 12px 0 8px; font-size: 30px; letter-spacing: 0; }
      p { margin: 0 0 24px; color: #64716e; line-height: 1.6; }
      .error { color: #a33a32; }
      label { display: grid; gap: 8px; font-size: 13px; font-weight: 800; }
      input {
        width: 100%; height: 58px; border: 1px solid #c8ceca;
        border-radius: 8px; padding: 0 16px; color: #18342f;
        background: white; font: 700 26px/1 system-ui; text-align: center;
        letter-spacing: 8px;
      }
      button {
        width: 100%; height: 52px; margin-top: 14px; border: 0;
        border-radius: 8px; color: white; background: #183f37;
        font-size: 15px; font-weight: 800;
      }
      small { display: block; margin-top: 18px; color: #7a8582; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <span class="brand">EASYSAY · PRIVATE ACCESS</span>
      <h1>连接你的英语教练</h1>
      ${notice}
      <form method="post" action="/mobile-login">
        <label>
          访问码
          <input
            name="code"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            autocomplete="one-time-code"
            required
            autofocus
          />
        </label>
        <button type="submit">进入 EasySay</button>
      </form>
      <small>访问码仅显示在运行 EasySay 的电脑终端中。不要转发给其他人。</small>
    </main>
  </body>
</html>`;
}

export function requireMobileAccess(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const code = accessCode();
  if (!code || request.path === "/mobile-login") {
    next();
    return;
  }

  const token = parseCookies(request)[cookieName] ?? "";
  const headerCode = request.get("X-EasySay-Access-Code")?.trim() ?? "";
  if (
    safeEqual(token, sessionToken(code)) ||
    (headerCode.length > 0 && safeEqual(headerCode, code))
  ) {
    next();
    return;
  }

  if (request.path.startsWith("/api/")) {
    response.status(401).json({ message: "请先输入手机访问码" });
    return;
  }

  response
    .status(401)
    .setHeader("Cache-Control", "no-store")
    .type("html")
    .send(loginPage());
}

export const mobileAuthRouter: Router = Router();

mobileAuthRouter.get("/mobile-login", (_request, response) => {
  response
    .setHeader("Cache-Control", "no-store")
    .type("html")
    .send(loginPage());
});

mobileAuthRouter.post(
  "/mobile-login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }),
  (request, response) => {
    const expected = accessCode();
    const received =
      typeof request.body?.code === "string" ? request.body.code.trim() : "";

    if (!expected || !safeEqual(received, expected)) {
      response
        .status(401)
        .setHeader("Cache-Control", "no-store")
        .type("html")
        .send(loginPage("访问码不正确，请查看电脑终端后重试。"));
      return;
    }

    response.cookie(cookieName, sessionToken(expected), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/"
    });
    response.redirect(303, "/");
  }
);
