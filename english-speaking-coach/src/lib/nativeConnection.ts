import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export interface NativeConnection {
  baseUrl: string;
  accessCode: string;
}

const connectionKey = "easysay-native-connection-v1";
const defaultBaseUrl =
  import.meta.env.VITE_NATIVE_API_URL ?? "http://192.168.1.7:8785";

let cachedConnection: NativeConnection | undefined;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getDefaultNativeBaseUrl(): string {
  return defaultBaseUrl;
}

export function normalizeNativeBaseUrl(value: string): string {
  const input = value.trim().replace(/\/+$/, "");
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new Error("电脑地址必须使用 HTTP 或 HTTPS");
  }
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("电脑地址必须使用 HTTP 或 HTTPS");
  }
  return parsed.origin;
}

export async function loadNativeConnection(): Promise<
  NativeConnection | undefined
> {
  if (!isNativeApp()) return undefined;
  if (cachedConnection) return cachedConnection;

  const { value } = await Preferences.get({ key: connectionKey });
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as NativeConnection;
    // #region debug-point A:saved-address
    fetch("http://172.20.10.3:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-hotspot-connection",runId:"post-fix",hypothesisId:"A",location:"nativeConnection.ts:loadNativeConnection",msg:"[DEBUG] Loaded saved native connection",data:{baseUrl:parsed.baseUrl,hasCode:Boolean(parsed.accessCode)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (!parsed.baseUrl || !/^\d{6}$/.test(parsed.accessCode)) return undefined;
    cachedConnection = parsed;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function saveNativeConnection(
  connection: NativeConnection
): Promise<void> {
  const normalized = {
    baseUrl: normalizeNativeBaseUrl(connection.baseUrl),
    accessCode: connection.accessCode.trim()
  };
  if (!/^\d{6}$/.test(normalized.accessCode)) {
    throw new Error("连接码必须是 6 位数字");
  }
  await Preferences.set({
    key: connectionKey,
    value: JSON.stringify(normalized)
  });
  cachedConnection = normalized;
}

export async function clearNativeConnection(): Promise<void> {
  cachedConnection = undefined;
  await Preferences.remove({ key: connectionKey });
}

export async function resolveApiRequest(
  path: string,
  headers: HeadersInit = {}
): Promise<{ url: string; headers: Headers }> {
  const nextHeaders = new Headers(headers);
  if (!isNativeApp()) return { url: path, headers: nextHeaders };

  const connection = await loadNativeConnection();
  if (!connection) throw new Error("请先连接运行 EasySay 的电脑");
  nextHeaders.set("X-EasySay-Access-Code", connection.accessCode);
  return {
    url: `${connection.baseUrl}${path}`,
    headers: nextHeaders
  };
}

export async function testNativeConnection(
  connection: NativeConnection
): Promise<void> {
  const baseUrl = normalizeNativeBaseUrl(connection.baseUrl);
  // #region debug-point B,C,D,E:request-start
  fetch("http://172.20.10.3:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-hotspot-connection",runId:"post-fix",hypothesisId:"B,C,D,E",location:"nativeConnection.ts:testNativeConnection",msg:"[DEBUG] Starting Mac health request",data:{baseUrl,target:`${baseUrl}/api/health`,online:navigator.onLine},ts:Date.now()})}).catch(()=>{});
  // #endregion
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { "X-EasySay-Access-Code": connection.accessCode.trim() },
      signal: controller.signal
    });
    // #region debug-point D,E:response
    fetch("http://172.20.10.3:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-hotspot-connection",runId:"post-fix",hypothesisId:"D,E",location:"nativeConnection.ts:testNativeConnection",msg:"[DEBUG] Mac health response received",data:{baseUrl,status:response.status,ok:response.ok,type:response.type},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (response.status === 401) throw new Error("连接码不正确");
    if (!response.ok) throw new Error(`电脑服务返回 ${response.status}`);
    const body = (await response.json()) as { ok?: boolean };
    if (!body.ok) throw new Error("电脑服务状态异常");
  } catch (error) {
    // #region debug-point B,C,D:request-error
    fetch("http://172.20.10.3:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-hotspot-connection",runId:"post-fix",hypothesisId:"B,C,D",location:"nativeConnection.ts:testNativeConnection",msg:"[DEBUG] Mac health request failed",data:{baseUrl,name:error instanceof Error?error.name:typeof error,message:error instanceof Error?error.message:String(error),online:navigator.onLine},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("连接超时，请确认手机和电脑在同一 Wi-Fi");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
