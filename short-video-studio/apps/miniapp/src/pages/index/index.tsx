import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { generateAssistant, getAssistantConfig } from '@/services/assistant';
import { AssistantInput, AssistantResult, AssistantType } from '@/types/assistant';
import styles from './index.module.scss';

const toolOptions: Array<{ type: AssistantType; index: string; title: string; caption: string; price: string }> = [
  { type: 'product', index: '01', title: '商品内容包', caption: '标题 · 口播 · 分镜', price: '¥9.90' },
  { type: 'article', index: '02', title: '公众号文章', caption: '标题 · 大纲 · 开头', price: '¥9.90' },
  { type: 'social', index: '03', title: '朋友圈与社群', caption: '文案 · 公告 · 跟进', price: '¥4.90' }
];

const initialValues: Record<string, string> = {
  productName: '',
  audience: '',
  sellingPoints: '',
  platform: '抖音',
  tone: '真实种草',
  topic: '',
  reader: '',
  angle: '',
  scene: '',
  offer: '',
  voice: ''
};

const fields: Record<AssistantType, Array<{ key: keyof AssistantInput; label: string; placeholder: string; multiline?: boolean }>> = {
  product: [
    { key: 'productName', label: '商品或服务名称', placeholder: '例如：轻薄防晒外套' },
    { key: 'audience', label: '目标客户', placeholder: '例如：通勤、怕晒又不想闷热的女生' },
    { key: 'sellingPoints', label: '核心卖点', placeholder: '材质、功能、体验、价格优势，至少 8 个字', multiline: true }
  ],
  article: [
    { key: 'topic', label: '文章主题', placeholder: '例如：新手如何挑选防晒衣' },
    { key: 'reader', label: '目标读者', placeholder: '例如：第一次购买的上班族' },
    { key: 'angle', label: '文章角度', placeholder: '例如：从真实通勤场景出发，讲清楚选择方法', multiline: true }
  ],
  social: [
    { key: 'scene', label: '使用场景', placeholder: '例如：新品上架、老客回访、社群活动' },
    { key: 'offer', label: '活动或服务', placeholder: '例如：本周新客体验价 49 元' },
    { key: 'voice', label: '表达语气', placeholder: '例如：自然、真诚、有行动引导' }
  ]
};

const IndexPage: React.FC = () => {
  const [type, setType] = useState<AssistantType>('product');
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<Record<AssistantType, string>>({
    product: '9.90',
    article: '9.90',
    social: '4.90'
  });
  const definition = useMemo(() => toolOptions.find((item) => item.type === type) || toolOptions[0], [type]);

  useEffect(() => {
    getAssistantConfig()
      .then((config) => setPrices(config.prices))
      .catch((error) => console.error('[HomePage] config load failed', error));
  }, []);

  const updateValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const switchTool = (nextType: AssistantType) => {
    setType(nextType);
    setResult(null);
  };

  const submit = async () => {
    const payload = { type, ...values } as AssistantInput;
    const missing = fields[type].find((field) => String(payload[field.key] || '').trim().length < 2);
    if (missing) {
      Taro.showToast({ title: `请填写${missing.label}`, icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const response = await generateAssistant(payload);
      setResult(response.result);
      Taro.setStorageSync('zhizhu:last-result', response.result);
      const records = (Taro.getStorageSync('zhizhu:records') || []) as AssistantResult[];
      Taro.setStorageSync('zhizhu:records', [{ ...response.result, createdAt: new Date().toISOString() }, ...records].slice(0, 20));
      Taro.showToast({ title: '预览已生成', icon: 'success' });
    } catch (error) {
      console.error('[HomePage] generate failed', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '生成失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <View className={styles.brandLine}>
          <View className={styles.logoMark}><View /><View /><View /></View>
          <Text className={styles.kicker}>CONTENT ASSISTANT · 01</Text>
        </View>
        <Text className={styles.title}>把想法变成{'\n'}<Text className={styles.titleAccent}>能直接发布的内容。</Text></Text>
        <Text className={styles.subtitle}>给小商家和内容创作者的轻量内容工作台，先预览，再决定是否解锁。</Text>
      </View>

      <View className={styles.toolList}>
        {toolOptions.map((item) => (
          <View
            key={item.type}
            className={`${styles.toolItem} ${type === item.type ? styles.toolItemActive : ''}`}
            onClick={() => switchTool(item.type)}
          >
            <Text className={styles.toolIndex}>{item.index}</Text>
            <View className={styles.toolCopy}>
              <Text className={styles.toolTitle}>{item.title}</Text>
              <Text className={styles.toolCaption}>{item.caption}</Text>
            </View>
            <Text className={styles.toolPrice}>¥{prices[item.type]}</Text>
          </View>
        ))}
      </View>

      <View className={styles.sectionLabel}><Text>STEP 01 · 输入信息</Text><Text>免费预览</Text></View>
      <View className={styles.formCard}>
        <Text className={styles.formTitle}>{type === 'product' ? '先说清楚你卖什么' : type === 'article' ? '先确定这篇文章写给谁' : '把这次活动说清楚'}</Text>
        {fields[type].map((field) => (
          <View className={styles.field} key={field.key}>
            <Text className={styles.fieldLabel}>{field.label}</Text>
            {field.multiline ? (
              <Textarea className={styles.textarea} value={values[field.key] || ''} maxlength={500} placeholder={field.placeholder} onInput={(event) => updateValue(field.key, event.detail.value)} />
            ) : (
              <Input className={styles.input} value={values[field.key] || ''} maxlength={240} placeholder={field.placeholder} onInput={(event) => updateValue(field.key, event.detail.value)} />
            )}
          </View>
        ))}
        {type === 'product' && (
          <View className={styles.optionRow}>
            <View className={styles.option}>
              <Text className={styles.fieldLabel}>发布平台</Text>
              <Input className={styles.input} value={values.platform} onInput={(event) => updateValue('platform', event.detail.value)} />
            </View>
            <View className={styles.option}>
              <Text className={styles.fieldLabel}>表达风格</Text>
              <Input className={styles.input} value={values.tone} onInput={(event) => updateValue('tone', event.detail.value)} />
            </View>
          </View>
        )}
        <Button className={styles.primaryButton} loading={loading} disabled={loading} onClick={submit}>
          <Text>{loading ? '正在生成…' : '生成免费预览'}</Text><Text>↗</Text>
        </Button>
        <Text className={styles.privacy}>输入只用于本次生成 · 不需要注册</Text>
      </View>

      <View className={styles.sectionLabel}><Text>STEP 02 · 结果预览</Text><Text>{result ? '已生成' : '等待输入'}</Text></View>
      <View className={styles.resultCard}>
        {result ? (
          <View>
            <View className={styles.resultHeader}>
              <Text className={styles.resultTitle}>{result.title}</Text>
              <Text className={styles.resultBadge}>服务已生成</Text>
            </View>
            <Text className={styles.resultSummary}>{result.summary}</Text>
            {result.items.map((item, index) => (
              <View className={styles.previewItem} key={item}><Text className={styles.itemNumber}>0{index + 1}</Text><Text className={styles.itemText}>{item}</Text></View>
            ))}
            <View className={styles.unlockRow}>
              <View><Text className={styles.unlockLabel}>完整内容包</Text><Text className={styles.unlockPrice}>¥{result.price}</Text></View>
              <Button className={styles.lockButton} onClick={() => Taro.showToast({ title: '微信虚拟支付接入中', icon: 'none' })}>支付解锁</Button>
            </View>
          </View>
        ) : (
          <View className={styles.emptyState}>
            <View className={styles.emptyIcon}>✦</View>
            <Text className={styles.emptyTitle}>你的内容会出现在这里</Text>
            <Text className={styles.emptyText}>选择工具，填入你的真实业务信息。</Text>
            <Text className={styles.emptyFlow}>输入信息  →  生成预览  →  解锁内容</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default IndexPage;
