import type { Locale } from "./i18n";
import { useAppStore } from "./store";

export const apiErrorCopy: Record<string, [string, string]> = {
  maas_not_configured: ["MaaS 服务端配置不完整，请检查应用服务 Key、模型 ID 和超时后重试", "MaaS server configuration is incomplete. Check the service Key, model ID and timeout, then retry."],
  model_managed_by_maas: ["模型已交由 MaaS 管理，请前往 MaaS 修改配置", "This model is managed by MaaS. Update its configuration in MaaS."],
  service_unavailable: ["服务暂时不可用，请稍后重试", "Service temporarily unavailable. Please try again later."],
  authentication_required: ["登录状态已失效，请重新登录", "Your session expired. Please sign in again."],
  invalid_dating_profile: ["请补全城市范围，并至少选择一项价值观", "Complete the city range and select at least one value."],
  invalid_community: ["请检查社群名称、地址和介绍是否填写完整", "Check the community name, address and description."],
  invalid_organization: ["请检查企业名称、地址和业务介绍是否填写完整", "Check the organization name, address and description."],
  handle_already_exists: ["这个公开地址已经被使用，请换一个", "This public address is already taken. Choose another."],
  community_invite_required: ["这是私密社群，需要通过邀请加入", "This private community requires an invitation."],
  plan_limit_reached: ["当前套餐的持续寻找名额已用完，请先暂停一个现有任务", "Your search quota is full. Pause an existing mission first."],
  invalid_plaza_runtime: ["请检查自治设置：冷却时间至少 5 秒，每日上限为 1–50 次", "Check autonomy settings: cooldown is at least 5 seconds and the daily limit is 1–50."],
  rate_limit_exceeded: ["操作太频繁，请稍后再试", "Too many requests. Please try again later."],
  invalid_email: ["请输入有效的邮箱地址", "Enter a valid email address."],
  weak_password: ["密码至少需要 8 位", "Password must contain at least 8 characters."],
  invalid_name: ["名字需要 2–40 个字符", "Name must contain 2–40 characters."],
  email_already_exists: ["这个邮箱已经注册，请直接登录", "This email is already registered. Sign in instead."],
  invalid_credentials: ["邮箱或密码不正确", "Incorrect email or password."],
  contact_blocked: ["双方已阻止联系，无法发送消息", "Contact is blocked. Messages cannot be sent."],
  draft_not_found: ["草稿不存在或已处理，请刷新会话", "Draft unavailable or already processed. Refresh the conversation."],
  invalid_draft_content: ["回复不能为空，且最多 4,000 字符", "Reply cannot be empty and must not exceed 4,000 characters."],
  model_not_configured: ["模型未启用或未配置，请联系管理员", "Model disabled or not configured. Contact an administrator."],
  invalid_admin_credentials: ["管理员邮箱或密码不正确", "Incorrect administrator email or password."],
  admin_not_configured: ["服务器尚未配置管理员账号", "Administrator access is not configured on this server."],
  admin_authentication_required: ["管理员会话已失效，请重新登录", "Your administrator session expired. Please sign in again."],
  platform_admin_required: ["请先登录 LifeYouMe 平台管理后台，再进入 MeYou 控制台", "Sign in to LifeYouMe administration before opening MeYou."],
  invalid_model_configuration: ["请检查模型地址、Model ID 和参数范围", "Check the endpoint, Model ID and parameter ranges."],
  api_key_required: ["首次保存或测试时必须填写 API Key", "Enter an API Key before the first save or connection test."],
  model_provider_error: ["模型服务返回异常，请检查密钥、Model ID 和权限", "Model service returned an error. Check the key, Model ID and permissions."],
  model_timeout: ["模型连接超时，请检查地址或适当增加超时时间", "Model request timed out. Check the endpoint or increase the timeout."],
  model_connection_failed: ["无法连接模型服务，请检查地址、网络和密钥", "Cannot connect to the model service. Check the endpoint, network and key."],
  invalid_model_status: ["模型开关状态无效", "Invalid model service status."],
  model_configuration_required: ["请先保存模型连接配置，再开启服务", "Save the model connection configuration before enabling the service."],
  secret_reveal_origin_denied: ["请从 MeYou 管理页面发起查看操作", "View the saved key from the MeYou administration page."],
  secret_reveal_confirmation_required: ["请先确认查看敏感密钥", "Confirm before viewing the sensitive key."],
  api_key_not_configured: ["当前没有已保存的密钥", "No API Key has been saved."],
  network_unavailable: ["网络连接失败，请检查连接后重试", "Connection failed. Check your network and retry."],
  request_incomplete: ["请求未完成，请检查填写内容", "Request could not complete. Check your input and retry."],
  invalid_memory_query: ["记忆列表参数无效，请刷新后重试", "Invalid memory list request. Refresh and try again."],
  invalid_memory_cursor: ["记忆列表已变化，请刷新后重试", "The memory list changed. Refresh and try again."],
  invalid_memory_update: ["请选择有效的记忆权限或启停状态", "Choose a valid memory permission or active state."],
  invalid_memory_id: ["记忆标识无效，请刷新后重试", "Invalid memory identifier. Refresh and try again."],
  memory_not_found: ["这条记忆不存在或已被删除", "This memory is unavailable or already deleted."]
};

export function apiErrorMessage(locale: Locale, code: unknown, status: number) {
  if (typeof code === "string" && /^model_provider_error:\d{3}$/.test(code)) {
    const providerStatus = code.split(":")[1];
    return locale === "en"
      ? `Model service returned HTTP ${providerStatus}. Check the key, Model ID and permissions.`
      : `模型服务返回 HTTP ${providerStatus}，请检查密钥、Model ID 和权限`;
  }
  const copy = typeof code === "string" ? apiErrorCopy[code] : undefined;
  return (copy ?? apiErrorCopy[status >= 500 ? "service_unavailable" : "request_incomplete"]!)[locale === "en" ? 1 : 0];
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init, headers });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error(apiErrorMessage(useAppStore.getState().locale, "network_unavailable", 0));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(useAppStore.getState().locale, body.error, response.status));
  return body as T;
}
