import React from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

const ProfilePage: React.FC = () => {
  const records = (Taro.getStorageSync('zhizhu:records') || []) as unknown[];

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
        <View className={styles.menuItem} onClick={() => Taro.showToast({ title: '微信虚拟支付接入中', icon: 'none' })}><Text>支付与订单</Text><Text className={styles.arrow}>›</Text></View>
        <View className={styles.menuItem} onClick={() => Taro.showToast({ title: '更多设置即将开放', icon: 'none' })}><Text>使用说明</Text><Text className={styles.arrow}>›</Text></View>
      </View>
      <Text className={styles.footer}>智助乖乖 · Web 与小程序共享生成能力</Text>
    </View>
  );
};

export default ProfilePage;
