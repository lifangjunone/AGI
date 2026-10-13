import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboard,
  classifyMessage,
  extractTodo,
} from "../src/message-engine.mjs";

const preferences = {
  importantPeople: ["老板"],
  importantGroups: ["核心群"],
};

test("@我且来自重要群的消息应为最高优先级", () => {
  const result = classifyMessage(
    {
      id: "1",
      sender: "同事",
      group: "核心群",
      content: "@我 请确认方案",
      mentionedMe: true,
    },
    preferences,
  );

  assert.equal(result.priority, "critical");
  assert.deepEqual(result.reasons, ["@我", "重要群"]);
  assert.equal(result.channelType, "group");
});

test("重要联系人私聊应为高优先级", () => {
  const result = classifyMessage(
    {
      id: "2",
      sender: "老板",
      content: "看一下新方案",
      mentionedMe: false,
    },
    preferences,
  );

  assert.equal(result.priority, "high");
  assert.equal(result.channelType, "direct");
});

test("任务型消息可以提取待办和截止时间", () => {
  const message = classifyMessage(
    {
      id: "3",
      sender: "同事",
      group: "核心群",
      platform: "飞书",
      content: "@我 请今天完成上线检查",
      mentionedMe: true,
    },
    preferences,
  );
  const todo = extractTodo(message);

  assert.equal(todo.due, "今天");
  assert.equal(todo.priority, "critical");
  assert.match(todo.title, /完成上线检查/);
});

test("仪表盘聚合重要消息、@我与待办", () => {
  const messages = [
    {
      id: "1",
      platform: "飞书",
      sender: "同事",
      group: "核心群",
      content: "@我 请今天确认",
      mentionedMe: true,
      timestamp: "2026-09-30T10:00:00+08:00",
    },
    {
      id: "2",
      platform: "微信",
      sender: "朋友",
      content: "晚上吃饭吗",
      mentionedMe: false,
      timestamp: "2026-09-30T09:00:00+08:00",
    },
  ];
  const dashboard = buildDashboard(messages, preferences);

  assert.equal(dashboard.summary.total, 2);
  assert.equal(dashboard.summary.important, 1);
  assert.equal(dashboard.summary.mentions, 1);
  assert.equal(dashboard.summary.todoCount, 1);
});

test("普通群的泛化回复请求和完成通知不应进入紧急待办", () => {
  const messages = [
    classifyMessage(
      {
        id: "4",
        platform: "微信",
        sender: "朋友",
        group: "普通群",
        content: "周末聚餐，大家有空回复一下。",
        mentionedMe: false,
      },
      preferences,
    ),
    classifyMessage(
      {
        id: "5",
        platform: "飞书",
        sender: "机器人",
        group: "通知群",
        content: "构建成功，测试环境部署完成。",
        mentionedMe: false,
      },
      preferences,
    ),
  ];

  assert.deepEqual(messages.map(extractTodo), [null, null]);
});
