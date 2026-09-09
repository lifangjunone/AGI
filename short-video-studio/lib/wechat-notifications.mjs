import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MINIAPP_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const MINIAPP_SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
const MINIAPP_SEND_URL = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send";
const OFFICIAL_AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize";
const OFFICIAL_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";
const OFFICIAL_SEND_URL = "https://api.weixin.qq.com/cgi-bin/message/template/send";

function parseJsonEnv(name, fallback) {
  try {
    return process.env[name] ? JSON.parse(process.env[name]) : fallback;
  } catch (error) {
    console.error(`[WechatNotifications] invalid ${name}`, error.message);
    return fallback;
  }
}

function replaceContext(value, context) {
  return String(value || "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] || ""));
}

function templateData(source, context) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      { value: replaceContext(value, context) }
    ])
  );
}

export function createWechatNotifications({ dataDirectory }) {
  const notificationDirectory = path.join(dataDirectory, "notifications");
  const subscriptionsPath = path.join(notificationDirectory, "subscriptions.json");
  const tokenPath = path.join(notificationDirectory, "access-tokens.json");
  const config = {
    miniappAppId: process.env.WECHAT_MINIAPP_APP_ID || "",
    miniappSecret: process.env.WECHAT_MINIAPP_APP_SECRET || "",
    miniappTemplateId: process.env.WECHAT_MINIAPP_TEMPLATE_ID || "",
    miniappTemplateData: parseJsonEnv("WECHAT_MINIAPP_TEMPLATE_DATA", {
      thing1: "视频生成完成",
      phrase2: "{{status}}",
      time3: "{{completedAt}}",
      thing4: "{{detail}}"
    }),
    officialAppId: process.env.WECHAT_OFFICIAL_APP_ID || "",
    officialSecret: process.env.WECHAT_OFFICIAL_APP_SECRET || "",
    officialTemplateId: process.env.WECHAT_OFFICIAL_TEMPLATE_ID || "",
    officialTemplateData: parseJsonEnv("WECHAT_OFFICIAL_TEMPLATE_DATA", {
      first: "视频已生成完成",
      keyword1: "{{detail}}",
      keyword2: "{{completedAt}}",
      remark: "点击查看视频"
    }),
    officialRedirectUri: process.env.WECHAT_OFFICIAL_REDIRECT_URI || ""
  };

  async function readJson(filePath, fallback) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }
  }

  async function writeJson(filePath, value) {
    await mkdir(notificationDirectory, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  }

  async function getAccessToken(channel, appId, secret) {
    if (!appId || !secret) throw new Error(`${channel} 微信凭证未配置`);
    const tokens = await readJson(tokenPath, {});
    const cached = tokens[channel];
    if (cached?.accessToken && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }
    const query = new URLSearchParams({
      grant_type: "client_credential",
      appid: appId,
      secret
    });
    const response = await fetch(`${MINIAPP_TOKEN_URL}?${query}`);
    const result = await response.json();
    if (!response.ok || result.errcode) {
      throw new Error(`${channel} access_token 获取失败：${result.errmsg || response.status}`);
    }
    await writeJson(tokenPath, {
      ...tokens,
      [channel]: {
        accessToken: result.access_token,
        expiresAt: Date.now() + Number(result.expires_in || 7200) * 1000
      }
    });
    return result.access_token;
  }

  async function readSubscriptions() {
    return readJson(subscriptionsPath, {});
  }

  async function writeSubscription(jobId, subscription) {
    const subscriptions = await readSubscriptions();
    subscriptions[jobId] = {
      ...(subscriptions[jobId] || {}),
      ...subscription,
      jobId,
      updatedAt: new Date().toISOString()
    };
    await writeJson(subscriptionsPath, subscriptions);
  }

  async function bindMiniappJob(jobId, code) {
    if (!config.miniappAppId || !config.miniappSecret || !config.miniappTemplateId) {
      throw new Error("小程序订阅消息尚未配置");
    }
    if (!code) throw new Error("缺少小程序登录 code");
    const query = new URLSearchParams({
      appid: config.miniappAppId,
      secret: config.miniappSecret,
      js_code: code,
      grant_type: "authorization_code"
    });
    const response = await fetch(`${MINIAPP_SESSION_URL}?${query}`);
    const result = await response.json();
    if (!response.ok || result.errcode || !result.openid) {
      throw new Error(`小程序登录失败：${result.errmsg || response.status}`);
    }
    await writeSubscription(jobId, {
      miniappOpenId: result.openid,
      miniappStatus: "subscribed"
    });
    return { channel: "miniapp", status: "subscribed" };
  }

  async function bindOfficialJob(jobId, openid) {
    if (!config.officialAppId || !config.officialSecret || !config.officialTemplateId) {
      throw new Error("公众号模板消息尚未配置");
    }
    if (!openid) throw new Error("缺少公众号 openid");
    await writeSubscription(jobId, {
      officialOpenId: openid,
      officialStatus: "subscribed"
    });
    return { channel: "official", status: "subscribed" };
  }

  async function bindOfficialCode(jobId, code) {
    if (!config.officialAppId || !config.officialSecret || !config.officialTemplateId) {
      throw new Error("公众号模板消息尚未配置");
    }
    if (!code) throw new Error("缺少公众号 OAuth code");
    const query = new URLSearchParams({
      appid: config.officialAppId,
      secret: config.officialSecret,
      code,
      grant_type: "authorization_code"
    });
    const response = await fetch(`${OFFICIAL_TOKEN_URL}?${query}`);
    const result = await response.json();
    if (!response.ok || result.errcode || !result.openid) {
      throw new Error(`公众号授权失败：${result.errmsg || response.status}`);
    }
    return bindOfficialJob(jobId, result.openid);
  }

  async function sendMessage(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.errcode) {
      throw new Error(result.errmsg || `微信消息发送失败 ${response.status}`);
    }
    return result;
  }

  async function notifyJobComplete(job) {
    const subscriptions = await readSubscriptions();
    const subscription = subscriptions[job.id];
    if (!subscription) return { sent: 0, skipped: true, reason: "未绑定通知订阅" };
    const context = {
      status: "已完成",
      completedAt: new Date(job.completedAt || Date.now()).toLocaleString("zh-CN"),
      detail: job.video?.prompt || job.detail || "视频已生成"
    };
    let sent = 0;
    const errors = [];
    if (subscription.miniappOpenId && config.miniappTemplateId) {
      try {
        const token = await getAccessToken("miniapp", config.miniappAppId, config.miniappSecret);
        await sendMessage(`${MINIAPP_SEND_URL}?access_token=${encodeURIComponent(token)}`, {
          touser: subscription.miniappOpenId,
          template_id: config.miniappTemplateId,
          page: `pages/records/index?jobId=${encodeURIComponent(job.id)}`,
          data: templateData(config.miniappTemplateData, context),
          miniprogram_state: process.env.NODE_ENV === "production" ? "formal" : "developer",
          lang: "zh_CN"
        });
        sent += 1;
      } catch (error) {
        errors.push(`miniapp: ${error.message}`);
        console.error("[WechatNotifications] miniapp send failed", error.message);
      }
    }
    if (subscription.officialOpenId && config.officialTemplateId) {
      try {
        const token = await getAccessToken("official", config.officialAppId, config.officialSecret);
        await sendMessage(`${OFFICIAL_SEND_URL}?access_token=${encodeURIComponent(token)}`, {
          touser: subscription.officialOpenId,
          template_id: config.officialTemplateId,
          url: `${process.env.FRAME60_PUBLIC_ORIGIN || "https://lifeyoume.icu/video"}/?job=${encodeURIComponent(job.id)}`,
          data: templateData(config.officialTemplateData, context)
        });
        sent += 1;
      } catch (error) {
        errors.push(`official: ${error.message}`);
        console.error("[WechatNotifications] official send failed", error.message);
      }
    }
    await writeSubscription(job.id, {
      lastSentAt: sent ? new Date().toISOString() : subscription.lastSentAt,
      lastSendError: errors.length ? errors.join("; ") : null
    });
    return { sent, errors };
  }

  function status() {
    return {
      miniapp: {
        enabled: Boolean(config.miniappAppId && config.miniappSecret && config.miniappTemplateId),
        templateId: config.miniappTemplateId || null
      },
      official: {
        enabled: Boolean(config.officialAppId && config.officialSecret && config.officialTemplateId),
        authorizeUrl: config.officialRedirectUri
          ? `${OFFICIAL_AUTHORIZE_URL}?appid=${encodeURIComponent(config.officialAppId)}&redirect_uri=${encodeURIComponent(config.officialRedirectUri)}&response_type=code&scope=snsapi_base&state=notify#wechat_redirect`
          : null
      }
    };
  }

  return {
    status,
    bindMiniappJob,
    bindOfficialJob,
    bindOfficialCode,
    notifyJobComplete
  };
}
