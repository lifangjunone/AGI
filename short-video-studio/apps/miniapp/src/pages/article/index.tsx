import React, { useState } from 'react';
import { Button, Text, Textarea, Input, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

const API_BASE = 'https://www.lifeyoume.icu/video';

const ArticlePage: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [reader, setReader] = useState('');
  const [angle, setAngle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    summary: string;
    items: string[];
    price: string;
  } | null>(null);

  const generate = async () => {
    if (!topic.trim() || !reader.trim() || angle.trim().length < 8) {
      Taro.showToast({ title: '请完整填写文章信息', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const response = await Taro.request<{ result: typeof result }>({
        url: `${API_BASE}/api/assistant/generate`,
        method: 'POST',
        data: { type: 'article', topic, reader, angle },
        header: { 'content-type': 'application/json' }
      });
      if (response.statusCode !== 201 || !response.data.result) {
        throw new Error('文章预览生成失败');
      }
      setResult(response.data.result);
      Taro.showToast({ title: '预览已生成', icon: 'success' });
    } catch (error) {
      console.error('[ArticlePage] generate failed', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '生成失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.heading}>
        <Text className={styles.eyebrow}>CONTENT / ARTICLE</Text>
        <Text className={styles.title}>先把这篇文章说清楚。</Text>
        <Text className={styles.subtitle}>填写主题、读者和角度，生成一版公众号文章预览。</Text>
      </View>
      <View className={styles.formCard}>
        <Text className={styles.label}>文章主题</Text>
        <Input className={styles.input} value={topic} maxlength={120} placeholder="例如：小商家如何用一张照片写出朋友圈" onInput={(event) => setTopic(event.detail.value)} />
        <Text className={styles.label}>目标读者</Text>
        <Input className={styles.input} value={reader} maxlength={120} placeholder="例如：不会写文案的个体商家" onInput={(event) => setReader(event.detail.value)} />
        <Text className={styles.label}>文章角度</Text>
        <Textarea className={styles.textarea} value={angle} maxlength={500} placeholder="例如：从真实场景出发，写得自然，不像广告" onInput={(event) => setAngle(event.detail.value)} />
        <Button className={styles.button} loading={loading} disabled={loading} onClick={generate}>生成文章预览</Button>
      </View>
      {result ? (
        <View className={styles.resultCard}>
          <Text className={styles.resultLabel}>READY TO USE</Text>
          <Text className={styles.resultTitle}>{result.title}</Text>
          <Text className={styles.summary}>{result.summary}</Text>
          {result.items.map((item, index) => <View className={styles.item} key={item}><Text className={styles.number}>0{index + 1}</Text><Text className={styles.itemText}>{item}</Text></View>)}
          <View className={styles.priceRow}><Text>完整文章包</Text><Text className={styles.price}>¥{result.price}</Text></View>
          <Text className={styles.note}>当前小程序首版先开放文章预览，完整内容包支付随后接入。</Text>
        </View>
      ) : null}
    </View>
  );
};

export default ArticlePage;
