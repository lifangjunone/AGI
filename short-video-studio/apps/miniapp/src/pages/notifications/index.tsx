import React, { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { subscribeGenerationNotification } from '@/services/notifications';
import styles from './index.module.scss';

const NotificationsPage: React.FC = () => {
  const [jobId, setJobId] = useState('');
  const [loading, setLoading] = useState(false);

  useLoad((options) => {
    setJobId(options?.jobId || '');
  });

  const subscribe = async () => {
    if (!jobId) {
      Taro.showToast({ title: '缺少任务编号', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const result = await subscribeGenerationNotification(jobId);
      Taro.showToast({
        title: result === 'subscribed' ? '通知已开启' : result === 'rejected' ? '你未同意通知' : '通知尚未配置',
        icon: result === 'subscribed' ? 'success' : 'none'
      });
    } catch (error) {
      console.error('[NotificationsPage] subscribe failed', error);
      Taro.showToast({ title: error instanceof Error ? error.message : '订阅失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <Text className={styles.eyebrow}>VIDEO NOTIFICATION</Text>
        <Text className={styles.title}>视频生成完成后通知我</Text>
        <Text className={styles.text}>允许一次订阅后，视频在后台生成完成时，小程序会通过服务通知提醒你，不需要一直停留在页面。</Text>
        <Button className={styles.button} loading={loading} disabled={loading} onClick={subscribe}>
          开启完成通知
        </Button>
      </View>
    </View>
  );
};

export default NotificationsPage;
