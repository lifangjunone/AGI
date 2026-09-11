import React, { useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

type CopyStyle = '自然记录' | '轻松分享' | '精致生活';

const styleOptions: CopyStyle[] = ['自然记录', '轻松分享', '精致生活'];

const PhotoPage: React.FC = () => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [copyStyle, setCopyStyle] = useState<CopyStyle>('自然记录');
  const [copy, setCopy] = useState('');

  const choosePhotos = async () => {
    try {
      const result = await Taro.chooseImage({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      setPhotos(result.tempFilePaths);
      setCopy('');
      console.info('[PhotoPage] photos selected', { count: result.tempFilePaths.length });
    } catch (error) {
      console.error('[PhotoPage] choose photos failed', error);
    }
  };

  const generateCopy = () => {
    if (!photos.length) {
      Taro.showToast({ title: '先选择至少一张照片', icon: 'none' });
      return;
    }
    const templates: Record<CopyStyle, string> = {
      自然记录: `今天的快乐很具体。${photos.length} 张照片，记录一点刚刚好的生活。`,
      轻松分享: `随手记录一下今天，风景、心情和好事都值得被保存。`,
      精致生活: `把普通的一天认真过好，喜欢的画面就慢慢收藏起来。`
    };
    setCopy(templates[copyStyle]);
    Taro.setStorageSync('zhizhu:last-photo-copy', templates[copyStyle]);
    Taro.showToast({ title: '文案已整理', icon: 'success' });
  };

  const copyText = () => {
    if (!copy) return;
    Taro.setClipboardData({ data: copy }).then(() => {
      Taro.showToast({ title: '已复制', icon: 'success' });
    }).catch((error) => console.error('[PhotoPage] copy failed', error));
  };

  return (
    <View className={styles.page}>
      <View className={styles.heading}>
        <Text className={styles.eyebrow}>CONTENT / PHOTO</Text>
        <Text className={styles.title}>让照片自己说话。</Text>
        <Text className={styles.subtitle}>选几张照片，给你一个自然、不用费劲的朋友圈版本。</Text>
      </View>

      <View className={styles.photoCard}>
        <View className={styles.photoGrid}>
          {photos.map((photo) => <Image key={photo} className={styles.photo} src={photo} mode="aspectFill" />)}
          {!photos.length ? (
            <View className={styles.emptyPhoto} onClick={choosePhotos}>
              <Text className={styles.plus}>＋</Text>
              <Text>选择照片</Text>
              <Text className={styles.photoHint}>最多 9 张</Text>
            </View>
          ) : (
            <View className={styles.addPhoto} onClick={choosePhotos}><Text>＋</Text></View>
          )}
        </View>
        <Text className={styles.orderHint}>{photos.length ? `已选择 ${photos.length} 张，默认按选择顺序排列` : '照片只用于本次整理，不会自动公开发布'}</Text>
      </View>

      <View className={styles.sectionTitle}>你想用什么语气？</View>
      <View className={styles.styleRow}>
        {styleOptions.map((option) => <View key={option} className={`${styles.styleItem} ${copyStyle === option ? styles.styleActive : ''}`} onClick={() => setCopyStyle(option)}><Text>{option}</Text></View>)}
      </View>

      <Button className={styles.primaryButton} onClick={generateCopy}>整理朋友圈文案</Button>

      {copy ? (
        <View className={styles.resultCard}>
          <View className={styles.resultTop}><Text className={styles.resultTitle}>朋友圈草稿</Text><Text className={styles.resultBadge}>{copyStyle}</Text></View>
          <Text className={styles.copy}>{copy}</Text>
          <Button className={styles.copyButton} onClick={copyText}>复制文案</Button>
        </View>
      ) : (
        <View className={styles.tipCard}><Text className={styles.tipMark}>✦</Text><Text className={styles.tipText}>先选择照片，再选择你今天想表达的感觉。</Text></View>
      )}
    </View>
  );
};

export default PhotoPage;
