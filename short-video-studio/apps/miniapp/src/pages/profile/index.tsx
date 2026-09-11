import React from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { unlockWithWechatPayment } from '@/services/wechatPayment';
import styles from './index.module.scss';

const ProfilePage: React.FC = () => {
  const records = (Taro.getStorageSync('zhizhu:records') || []) as unknown[];
  const [paying, setPaying] = React.useState(false);

  const unlockProductPack = async () => {
    if (paying) return;
    setPaying(true);
    try {
      await unlockWithWechatPayment('product', {
        type: 'product',
        productName: '智助乖乖商品短视频内容包',
        audience: '希望快速发布内容的小商家',
        sellingPoints: '生成商品短视频标题、口播、分镜和七天发布计划',
        platform: '抖音',
        tone: '真实种草'
      });
      Taro.showToast({ title: '支付成功，内容已解锁', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '微信支付未完成',
        icon: 'none'
      });
    } finally {
      setPaying(false);
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.profileCard}>
        <View className={styles.avatar}>智</View>
        <View>
          <Text className={styles.name}>智助乖乖用户</Text>
          <Text className={styles.caption}>把日常经营变成可发布内容</Text>
        </View>
      </View>
      <View className={styles.stats}>
        <View><Text className={styles.statNumber}>{records.length}</Text><Text className={styles.statLabel}>生成记录</Text></View>
        <View><Text className={styles.statNumber}>3</Text><Text className={styles.statLabel}>内容工具</Text></View>
        <View><Text className={styles.statNumber}>0</Text><Text className={styles.statLabel}>已解锁</Text></View>
      </View>
      <View className={styles.menu}>
        <View className={styles.menuItem} onClick={unlockProductPack}><Text>{paying ? '正在打开微信支付…' : '支付与订单'}</Text><Text className={styles.arrow}>›</Text></View>
        <View className={styles.menuItem} onClick={() => Taro.navigateTo({ url: '/pages/article/index' })}><Text>公众号文章助手</Text><Text className={styles.arrow}>›</Text></View>
        <View className={styles.menuItem} onClick={() => Taro.navigateTo({ url: '/pages/notifications/index' })}><Text>视频完成通知</Text><Text className={styles.arrow}>›</Text></View>
        <View className={styles.menuItem} onClick={() => Taro.showToast({ title: '更多设置即将开放', icon: 'none' })}><Text>使用说明</Text><Text className={styles.arrow}>›</Text></View>
      </View>
      <Text className={styles.footer}>智助乖乖 · Web 与小程序共享生成能力</Text>
    </View>
  );
};

export default ProfilePage;
