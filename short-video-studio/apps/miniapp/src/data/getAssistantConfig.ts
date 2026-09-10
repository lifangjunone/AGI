import { AssistantConfig } from '@/types/assistant';

export default function getAssistantConfig(): AssistantConfig {
  return {
    brand: '智助乖乖',
    prices: { product: '0.10', article: '0.10', social: '0.10' },
    channels: {
      web: 'https://www.lifeyoume.icu/video/zhizhu/',
      miniapp: 'zhizhu://pages/index/index',
      officialAccount: {
        home: 'https://www.lifeyoume.icu/video/zhizhu/?from=official-account',
        product: 'https://www.lifeyoume.icu/video/zhizhu/?from=official-account&tool=product',
        article: 'https://www.lifeyoume.icu/video/zhizhu/?from=official-account&tool=article',
        social: 'https://www.lifeyoume.icu/video/zhizhu/?from=official-account&tool=social'
      }
    }
  };
}
