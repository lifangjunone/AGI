import Taro from '@tarojs/taro';

const API_BASE = 'https://www.lifeyoume.icu/video';

export interface LifeTask {
  id: string;
  title: string;
  done: boolean;
}

export interface TodaySnapshot {
  date: string;
  weather: {
    condition: string;
    temperature: string;
    advice: string;
    source: string;
  };
  mood: string;
  tasks: LifeTask[];
}

function request<T>(path: string, options: Partial<Taro.request.Option> = {}) {
  return Taro.request<T>({
    url: `${API_BASE}/api/life${path}`,
    ...options,
    header: {
      'content-type': 'application/json',
      ...(options.header || {})
    }
  });
}

export async function getTodaySnapshot(): Promise<TodaySnapshot> {
  const response = await request<TodaySnapshot>('/today');
  if (response.statusCode !== 200) throw new Error('今日数据暂时无法加载');
  return response.data;
}

export async function saveLifeTasks(tasks: LifeTask[]): Promise<LifeTask[]> {
  const response = await request<{ tasks: LifeTask[] }>('/tasks', {
    method: 'PUT',
    data: { tasks }
  });
  if (response.statusCode !== 200) throw new Error('待办保存失败');
  return response.data.tasks;
}

export async function saveLifeMood(mood: string): Promise<string> {
  const response = await request<{ mood: string }>('/mood', {
    method: 'PUT',
    data: { mood }
  });
  if (response.statusCode !== 200) throw new Error('心情保存失败');
  return response.data.mood;
}
