import { AssistantInput, AssistantResponse } from '@/types/assistant';

export default function generateAssistant(input?: AssistantInput): AssistantResponse {
  const type = input?.type || 'product';
  const topic = input?.topic || '你的主题';
  const product = input?.productName || '你的商品';
  const label = type === 'article' ? '公众号文章助手' : type === 'social' ? '朋友圈与社群助手' : '商品内容包';
  const price = type === 'social' ? '4.90' : '9.90';

  return {
    result: {
      type,
      title: type === 'article' ? `${topic}公众号文章包` : type === 'social' ? '朋友圈与社群内容包' : `${product}商品内容包`,
      summary: '这是预览结果，正式小程序会通过共享服务根据你的真实信息生成内容。',
      items: ['先把核心信息讲清楚', '用一个真实场景展开', '最后给出明确行动建议'],
      deliverables: type === 'article'
        ? ['5 个文章标题', '1 个文章大纲', '开头与结尾', '配图提示词']
        : type === 'social'
          ? ['3 条朋友圈文案', '3 条社群公告', '5 条私聊回复', '1 个跟进节奏']
          : ['10 个短视频标题', '3 条口播脚本', '3 套分镜', '7 天发布计划'],
      price
    },
    payment: {
      status: 'not-integrated',
      amount: price,
      product: label
    }
  };
}
