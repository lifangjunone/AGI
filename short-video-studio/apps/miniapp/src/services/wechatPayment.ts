import Taro from '@tarojs/taro';
import { AssistantInput, AssistantType } from '@/types/assistant';

const API_BASE = 'https://www.lifeyoume.icu/video';

interface PaymentData {
  signData: string;
  paySig: string;
  signature: string;
  mode: 'short_series_goods';
}

interface PaymentOrderResponse {
  orderId: string;
  payData: PaymentData;
}

interface PaymentOrderStatus {
  orderId: string;
  status: 'PENDING' | 'DELIVERED';
}

interface VirtualPaymentApi {
  requestVirtualPayment?: (options: {
    signData: string;
    paySig: string;
    signature: string;
    mode: 'short_series_goods';
    success?: () => void;
    fail?: (error: { errMsg?: string }) => void;
  }) => void;
}

export async function unlockWithWechatPayment(
  type: AssistantType,
  input: AssistantInput
): Promise<PaymentOrderStatus> {
  if (process.env.TARO_ENV !== 'weapp') {
    throw new Error('微信支付仅支持微信小程序');
  }

  const system = Taro.getSystemInfoSync();
  if (system.platform === 'ios') {
    const version = String(system.version || '').split('.').map(Number);
    const required = [8, 0, 68];
    const supported = version[0] > required[0]
      || (version[0] === required[0] && (
        version[1] > required[1]
        || (version[1] === required[1] && version[2] >= required[2])
      ));
    if (!supported) {
      throw new Error('请将微信更新至 8.0.68 或更高版本后再支付');
    }
  }

  const login = await Taro.login();
  const orderResponse = await Taro.request<PaymentOrderResponse>({
    url: `${API_BASE}/api/wechat-pay/order`,
    method: 'POST',
    data: { code: login.code, type, input },
    header: { 'content-type': 'application/json' }
  });
  if (orderResponse.statusCode < 200 || orderResponse.statusCode >= 300) {
    const message = (orderResponse.data as unknown as { error?: string }).error;
    throw new Error(message || '微信支付暂未开通');
  }

  const paymentApi = Taro as unknown as VirtualPaymentApi;
  if (typeof paymentApi.requestVirtualPayment !== 'function') {
    throw new Error('当前微信版本不支持虚拟支付，请更新微信后重试');
  }

  await new Promise<void>((resolve, reject) => {
    paymentApi.requestVirtualPayment?.({
      ...orderResponse.data.payData,
      success: () => resolve(),
      fail: (error) => reject(new Error(error.errMsg || '微信支付未完成'))
    });
  });

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const statusResponse = await Taro.request<PaymentOrderStatus>({
      url: `${API_BASE}/api/wechat-pay/orders/${encodeURIComponent(orderResponse.data.orderId)}`,
      method: 'GET',
      header: { 'cache-control': 'no-cache' }
    });
    if (statusResponse.statusCode === 200 && statusResponse.data.status === 'DELIVERED') {
      return statusResponse.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('支付已返回，但发货通知仍在路上，请稍后到“我的-支付与订单”查看');
}
