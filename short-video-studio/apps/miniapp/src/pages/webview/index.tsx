import React from 'react';
import { View, WebView } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import styles from './index.module.scss';

const WEB_BASE = 'https://www.lifeyoume.icu/video/zhizhu/?from=miniapp';

const WebviewPage: React.FC = () => {
  const [source, setSource] = React.useState(`${WEB_BASE}&tool=article`);

  useLoad((options) => {
    const tool = options?.tool;
    if (tool === 'product' || tool === 'article' || tool === 'social') {
      setSource(`${WEB_BASE}&tool=${tool}`);
    }
  });

  return (
    <View className={styles.page}>
      <WebView className={styles.webview} src={source} />
    </View>
  );
};

export default WebviewPage;
