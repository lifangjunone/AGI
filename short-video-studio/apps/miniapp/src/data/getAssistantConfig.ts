import { AssistantConfig } from '@/types/assistant';

export default function getAssistantConfig(): AssistantConfig {
  return {
    brand: '智助乖乖',
    prices: { product: '9.90', article: '9.90', social: '4.90' },
    channels: {
      web: 'https://lifeyoume.icu/video/zhizhu/',
      miniapp: 'zhizhu://pages/index/index',
      officialAccount: {
        home: 'https://lifeyoume.icu/video/zhizhu/?from=official-account',
        product: 'https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=product',
        article: 'https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=article',
        social: 'https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=social'
      }
    }
  };
}
