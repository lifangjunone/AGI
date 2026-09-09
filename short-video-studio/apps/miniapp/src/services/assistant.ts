import Taro from '@tarojs/taro';
import generateAssistantMock from '@/data/generateAssistant';
import { AssistantInput, AssistantResponse } from '@/types/assistant';

const API_BASE = 'https://lifeyoume.icu/video';

export async function generateAssistant(input: AssistantInput): Promise<AssistantResponse> {
  if (process.env.TARO_ENV !== 'weapp') {
    console.info('[Assistant] H5 preview uses local mock');
    return generateAssistantMock(input);
  }

  try {
    console.info('[Assistant] generating preview', { type: input.type });
    const response = await Taro.request<AssistantResponse>({
      url: `${API_BASE}/api/assistant/generate`,
      method: 'POST',
      data: input,
      header: { 'content-type': 'application/json' }
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error('[Assistant] request failed', response.statusCode, response.data);
      throw new Error((response.data as { error?: string }).error || '生成失败，请稍后重试');
    }
    return response.data;
  } catch (error) {
    console.error('[Assistant] request error', error);
    throw error;
  }
}
