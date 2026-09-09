import React, { useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import Taro from '@tarojs/taro';
import { AssistantRecord } from '@/types/assistant';
import styles from './index.module.scss';

const RecordsPage: React.FC = () => {
  const [records, setRecords] = useState<AssistantRecord[]>([]);

  useDidShow(() => {
    const saved = (Taro.getStorageSync('zhizhu:records') || []) as AssistantRecord[];
    setRecords(saved);
  });

  return (
    <View className={styles.page}>
      <View className={styles.heading}>
        <Text className={styles.kicker}>HISTORY / 记录</Text>
        <Text className={styles.title}>最近生成</Text>
        <Text className={styles.subtitle}>在这里继续查看你生成过的内容方向。</Text>
      </View>
      {records.length ? records.map((record) => (
        <View className={styles.recordCard} key={`${record.createdAt}-${record.title}`}>
          <View className={styles.recordTop}>
            <Text className={styles.recordType}>{record.type === 'product' ? '商品内容包' : record.type === 'article' ? '公众号文章' : '朋友圈与社群'}</Text>
            <Text className={styles.recordDate}>{record.createdAt.slice(0, 10)}</Text>
          </View>
          <Text className={styles.recordTitle}>{record.title}</Text>
          <Text className={styles.recordSummary}>{record.summary}</Text>
          <View className={styles.tagRow}>
            {record.deliverables.slice(0, 3).map((item) => <Text className={styles.tag} key={item}>{item}</Text>)}
          </View>
        </View>
      )) : (
        <View className={styles.empty}>
          <Text className={styles.emptyMark}>○</Text>
          <Text className={styles.emptyTitle}>还没有生成记录</Text>
          <Text className={styles.emptyText}>回到工作台，先生成一份免费预览。</Text>
        </View>
      )}
    </View>
  );
};

export default RecordsPage;
