import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TASKS = [
  { id: "reply", title: "给客户回消息", done: false },
  { id: "laundry", title: "买洗衣液", done: false },
  { id: "post", title: "发布一条朋友圈", done: false }
];

const COPY_TEMPLATES = {
  "自然记录": (count) => `今天的快乐很具体。${count} 张照片，记录一点刚刚好的生活。`,
  "轻松分享": () => "随手记录一下今天，风景、心情和好事都值得被保存。",
  "精致生活": () => "把普通的一天认真过好，喜欢的画面就慢慢收藏起来。"
};

function safeUserId(value) {
  return String(value || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "anonymous";
}

export function createLifeAssistant({ dataDirectory }) {
  const root = path.join(dataDirectory, "life-assistant");

  async function readUser(userId) {
    try {
      return JSON.parse(await readFile(path.join(root, `${safeUserId(userId)}.json`), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { tasks: DEFAULT_TASKS, mood: "" };
      throw error;
    }
  }

  async function writeUser(userId, value) {
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, `${safeUserId(userId)}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600 }
    );
    return value;
  }

  async function today(userId) {
    const user = await readUser(userId);
    return {
      date: new Date().toISOString().slice(0, 10),
      weather: {
        condition: "晴转小雨",
        temperature: "18°/25°",
        advice: "下午有雨，出门记得带伞；薄外套更舒服。",
        source: "local-template"
      },
      mood: user.mood || "",
      tasks: user.tasks || DEFAULT_TASKS
    };
  }

  async function saveTasks(userId, tasks) {
    const user = await readUser(userId);
    const normalized = Array.isArray(tasks)
      ? tasks.slice(0, 50).map((task, index) => ({
        id: String(task.id || `task-${Date.now()}-${index}`).slice(0, 100),
        title: String(task.title || "").trim().slice(0, 200),
        done: Boolean(task.done)
      })).filter((task) => task.title)
      : DEFAULT_TASKS;
    return (await writeUser(userId, { ...user, tasks: normalized })).tasks;
  }

  async function saveMood(userId, mood) {
    const user = await readUser(userId);
    return (await writeUser(userId, { ...user, mood: String(mood || "").slice(0, 20) })).mood;
  }

  function createPhotoCopy({ photoCount, style }) {
    const count = Math.min(Math.max(Number(photoCount) || 0, 1), 9);
    const selectedStyle = COPY_TEMPLATES[style] ? style : "自然记录";
    return {
      style: selectedStyle,
      photoCount: count,
      copy: COPY_TEMPLATES[selectedStyle](count),
      order: Array.from({ length: count }, (_, index) => index + 1),
      source: "local-template"
    };
  }

  function splitChore(title) {
    const cleanTitle = String(title || "").trim().slice(0, 300);
    if (!cleanTitle) throw new Error("请先写下让你烦的事情");
    return {
      title: cleanTitle,
      steps: [
        `先写清楚“${cleanTitle}”最终要达到什么结果`,
        "找出现在最卡住的一步，先只处理这一件",
        "准备需要的资料、物品或联系人",
        "安排一个 20 分钟的小时间段开始行动",
        "完成后检查结果，再决定下一步"
      ],
      source: "local-template"
    };
  }

  return { today, saveTasks, saveMood, createPhotoCopy, splitChore };
}
