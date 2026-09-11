import React, { useMemo, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getTodaySnapshot, LifeTask, saveLifeMood, saveLifeTasks } from '@/services/lifeAssistant';
import styles from './index.module.scss';

type Mood = '开心' | '一般' | '疲惫' | '烦躁';

const defaultTasks: LifeTask[] = [
  { id: 'reply', title: '给客户回消息', done: false },
  { id: 'laundry', title: '买洗衣液', done: false },
  { id: 'post', title: '发布一条朋友圈', done: false }
];

const moodOptions: Mood[] = ['开心', '一般', '疲惫', '烦躁'];

const IndexPage: React.FC = () => {
  const [mood, setMood] = useState<Mood | ''>(
    (Taro.getStorageSync('zhizhu:mood') || '') as Mood | ''
  );
  const [tasks, setTasks] = useState<LifeTask[]>(
    (Taro.getStorageSync('zhizhu:today-tasks') || defaultTasks) as LifeTask[]
  );
  const [weather, setWeather] = useState({
    title: '晴转小雨 · 18°/25°',
    advice: '下午有雨，出门记得带伞；薄外套更舒服。'
  });

  React.useEffect(() => {
    getTodaySnapshot()
      .then((snapshot) => {
        setTasks(snapshot.tasks);
        setMood((snapshot.mood || '') as Mood | '');
        setWeather({
          title: `${snapshot.weather.condition} · ${snapshot.weather.temperature}`,
          advice: snapshot.weather.advice
        });
      })
      .catch((error) => console.error('[HomePage] today snapshot failed', error));
  }, []);

  const completedCount = useMemo(
    () => tasks.filter((task) => task.done).length,
    [tasks]
  );

  const selectMood = (nextMood: Mood) => {
    setMood(nextMood);
    Taro.setStorageSync('zhizhu:mood', nextMood);
    saveLifeMood(nextMood).catch((error) => console.error('[HomePage] mood sync failed', error));
  };

  const toggleTask = (id: string) => {
    const nextTasks = tasks.map((task) =>
      task.id === id ? { ...task, done: !task.done } : task
    );
    setTasks(nextTasks);
    Taro.setStorageSync('zhizhu:today-tasks', nextTasks);
    saveLifeTasks(nextTasks).catch((error) => console.error('[HomePage] task sync failed', error));
  };

  const openTasks = () => Taro.navigateTo({ url: '/pages/tasks/index' });
  const openPhoto = () => Taro.navigateTo({ url: '/pages/photo/index' });

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <View>
          <Text className={styles.eyebrow}>ZHIZHU GUAI GUAI · TODAY</Text>
          <Text className={styles.title}>今天，先把一件事做好。</Text>
          <Text className={styles.subtitle}>天气、待办和内容，都替你理清楚。</Text>
        </View>
        <View className={styles.dateBadge}>
          <Text className={styles.dateNumber}>{new Date().getDate()}</Text>
          <Text className={styles.dateLabel}>今日</Text>
        </View>
      </View>

      <View className={styles.weatherCard}>
        <View>
          <Text className={styles.cardKicker}>今日天气</Text>
          <Text className={styles.weatherTitle}>{weather.title}</Text>
          <Text className={styles.weatherTip}>{weather.advice}</Text>
        </View>
        <Text className={styles.weatherIcon}>☂</Text>
      </View>

      <View className={styles.sectionHeading}>
        <Text className={styles.sectionTitle}>今天的状态</Text>
        <Text className={styles.sectionHint}>{mood ? `今天感觉${mood}` : '选一个最接近的'}</Text>
      </View>
      <View className={styles.moodRow}>
        {moodOptions.map((option) => (
          <View
            key={option}
            className={`${styles.moodItem} ${mood === option ? styles.moodActive : ''}`}
            onClick={() => selectMood(option)}
          >
            <Text className={styles.moodDot}>{option === '开心' ? '✦' : option === '疲惫' ? '◒' : option === '烦躁' ? '!' : '·'}</Text>
            <Text>{option}</Text>
          </View>
        ))}
      </View>

      <View className={styles.sectionHeading}>
        <Text className={styles.sectionTitle}>今日待办</Text>
        <Text className={styles.sectionLink} onClick={openTasks}>查看全部 ›</Text>
      </View>
      <View className={styles.taskCard}>
        {tasks.slice(0, 3).map((task) => (
          <View className={styles.taskRow} key={task.id} onClick={() => toggleTask(task.id)}>
            <View className={`${styles.checkbox} ${task.done ? styles.checkboxDone : ''}`}>
              {task.done ? <Text>✓</Text> : null}
            </View>
            <Text className={`${styles.taskTitle} ${task.done ? styles.taskDone : ''}`}>{task.title}</Text>
          </View>
        ))}
        <View className={styles.progressLine}>
          <View className={styles.progressTrack}><View className={styles.progressValue} style={{ width: `${tasks.length ? (completedCount / tasks.length) * 100 : 0}%` }} /></View>
          <Text className={styles.progressText}>{completedCount}/{tasks.length} 完成</Text>
        </View>
      </View>

      <View className={styles.sectionHeading}>
        <Text className={styles.sectionTitle}>现在可以帮你</Text>
      </View>
      <View className={styles.actionGrid}>
        <View className={`${styles.actionCard} ${styles.actionPhoto}`} onClick={openPhoto}>
          <Text className={styles.actionIcon}>▧</Text>
          <Text className={styles.actionTitle}>照片写朋友圈</Text>
          <Text className={styles.actionText}>选几张照片，排好顺序并生成文案</Text>
        </View>
        <View className={`${styles.actionCard} ${styles.actionChore}`} onClick={() => Taro.navigateTo({ url: '/pages/tasks/index?mode=chore' })}>
          <Text className={styles.actionIcon}>↗</Text>
          <Text className={styles.actionTitle}>整理一件烦事</Text>
          <Text className={styles.actionText}>把混乱的事情拆成下一步</Text>
        </View>
      </View>

      <Button className={styles.primaryButton} onClick={openTasks}>
        <Text>添加今天的待办</Text><Text>＋</Text>
      </Button>
    </View>
  );
};

export default IndexPage;
