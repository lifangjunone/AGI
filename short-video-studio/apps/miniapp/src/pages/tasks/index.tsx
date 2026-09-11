import React, { useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import styles from './index.module.scss';

interface Task {
  id: string;
  title: string;
  done: boolean;
}

const seedTasks: Task[] = [
  { id: 'reply', title: '给客户回消息', done: false },
  { id: 'laundry', title: '买洗衣液', done: false },
  { id: 'post', title: '发布一条朋友圈', done: false }
];

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(
    (Taro.getStorageSync('zhizhu:today-tasks') || seedTasks) as Task[]
  );
  const [newTask, setNewTask] = useState('');
  const [chore, setChore] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [isChoreMode, setIsChoreMode] = useState(false);

  useLoad((options) => {
    setIsChoreMode(options?.mode === 'chore');
  });

  const saveTasks = (nextTasks: Task[]) => {
    setTasks(nextTasks);
    Taro.setStorageSync('zhizhu:today-tasks', nextTasks);
  };

  const addTask = () => {
    const title = newTask.trim();
    if (!title) {
      Taro.showToast({ title: '先写一件要做的事', icon: 'none' });
      return;
    }
    saveTasks([...tasks, { id: `${Date.now()}`, title, done: false }]);
    setNewTask('');
  };

  const splitChore = () => {
    const title = chore.trim();
    if (!title) {
      Taro.showToast({ title: '先写下让你烦的事情', icon: 'none' });
      return;
    }
    setSteps([
      `先写清楚“${title}”最终要达到什么结果`,
      '找出现在最卡住的一步，先只处理这一件',
      '准备需要的资料、物品或联系人',
      '安排一个 20 分钟的小时间段开始行动',
      '完成后检查结果，再决定下一步'
    ]);
    console.info('[TasksPage] chore split', { length: title.length });
  };

  return (
    <View className={styles.page}>
      <View className={styles.heading}>
        <Text className={styles.eyebrow}>{isChoreMode ? 'LIFE / UNSTUCK' : 'TODAY / TASKS'}</Text>
        <Text className={styles.title}>{isChoreMode ? '先把烦心事拆小。' : '今天要做什么？'}</Text>
        <Text className={styles.subtitle}>{isChoreMode ? '不用一次解决全部，先找到下一步。' : '写下来，事情就不会一直占着你的脑子。'}</Text>
      </View>

      {isChoreMode ? (
        <View>
          <View className={styles.inputCard}>
            <Text className={styles.fieldLabel}>这件烦心事是什么？</Text>
            <Textarea className={styles.textarea} value={chore} maxlength={300} placeholder="例如：周末要搬家，不知道从哪里开始" onInput={(event) => setChore(event.detail.value)} />
            <Button className={styles.primaryButton} onClick={splitChore}>帮我拆成下一步</Button>
          </View>
          {steps.length ? <View className={styles.stepsCard}><Text className={styles.cardTitle}>可以这样开始</Text>{steps.map((step, index) => <View className={styles.stepRow} key={step}><Text className={styles.stepNumber}>0{index + 1}</Text><Text className={styles.stepText}>{step}</Text></View>)}</View> : null}
        </View>
      ) : (
        <View>
          <View className={styles.addRow}>
            <Input className={styles.input} value={newTask} placeholder="添加一件今天要做的事" onInput={(event) => setNewTask(event.detail.value)} />
            <Button className={styles.addButton} onClick={addTask}>添加</Button>
          </View>
          <View className={styles.taskCard}>
            {tasks.map((task) => <View className={styles.taskRow} key={task.id}><View className={`${styles.checkbox} ${task.done ? styles.checkboxDone : ''}`} onClick={() => saveTasks(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}>{task.done ? <Text>✓</Text> : null}</View><Text className={`${styles.taskTitle} ${task.done ? styles.taskDone : ''}`}>{task.title}</Text></View>)}
          </View>
          <View className={styles.tipCard}><Text className={styles.tipMark}>↗</Text><Text className={styles.tipText}>有一件事特别烦？回到首页，点“整理一件烦事”。</Text></View>
        </View>
      )}
    </View>
  );
};

export default TasksPage;
