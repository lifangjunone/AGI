import Taro from '@tarojs/taro';

const API_BASE = 'https://lifeyoume.icu/video';

export interface NotificationConfig {
  miniapp: { enabled: boolean; templateId: string | null };
  official: { enabled: boolean; authorizeUrl: string | null };
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  if (process.env.TARO_ENV !== 'weapp') {
    return { miniapp: { enabled: false, templateId: null }, official: { enabled: false, authorizeUrl: null } };
  }
  const response = await Taro.request<NotificationConfig>({
    url: `${API_BASE}/api/notifications/config`,
    method: 'GET'
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('通知配置读取失败');
  }
  return response.data;
}

export async function subscribeGenerationNotification(jobId: string): Promise<'subscribed' | 'not-configured' | 'rejected'> {
  if (process.env.TARO_ENV !== 'weapp') return 'not-configured';
  const config = await getNotificationConfig();
  if (!config.miniapp.enabled || !config.miniapp.templateId) return 'not-configured';
  const result = await Taro.requestSubscribeMessage({ tmplIds: [config.miniapp.templateId] });
  if (result[config.miniapp.templateId] !== 'accept') return 'rejected';
  const login = await Taro.login();
  const response = await Taro.request({
    url: `${API_BASE}/api/notifications/miniapp/subscribe`,
    method: 'POST',
    data: { jobId, code: login.code },
    header: { 'content-type': 'application/json' }
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('通知订阅绑定失败');
  }
  return 'subscribed';
}
