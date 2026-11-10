"use client";

import { useEffect, useState } from "react";

type ChatMessage = {
  id: string;
  role: "visitor" | "twin";
  content: string;
  risk?: "none" | "blocked";
};

const questions = [
  "我现在只有一个 AI 产品想法，值得预约吗？",
  "咨询前我需要准备哪些材料？",
  "你会怎么判断我的产品机会？",
  "如果我只是有个模糊方向，还适合聊吗？",
] as const;

const responses: Record<string, string> = {
  "我现在只有一个 AI 产品想法，值得预约吗？":
    "可以先聊，但我会先确认三件事：你想服务谁、为什么他们现在会需要、你希望这次咨询帮你做出什么决定。如果这三件事还完全没有答案，我会建议你先整理一页背景，再预约会更有效。",
  "咨询前我需要准备哪些材料？":
    "最好准备：一句话产品说明、目标用户画像、已有用户反馈或访谈记录、你现在最纠结的 1-2 个问题。没有完整文档也没关系，我可以先帮你把背景整理成摘要。",
  "你会怎么判断我的产品机会？":
    "李明通常会先看问题是否真实、目标用户是否足够具体、现有替代方案是什么、AI 是否真的改善体验或成本。不会一上来讨论炫技功能。",
  "如果我只是有个模糊方向，还适合聊吗？":
    "适合，但咨询目标要改成“澄清方向”，不是马上定方案。我会先问你为什么关注这个方向、你掌握什么用户线索、你愿意先验证哪一个假设。",
};

const starterMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "twin",
    content: "你可以先告诉我：你正在做什么？目前卡在哪里？希望和李明聊完后得到什么结果？",
  },
  {
    id: "m2",
    role: "visitor",
    content: "我做了一个 AI 客服工具，但不知道该卖给谁。",
  },
  {
    id: "m3",
    role: "twin",
    content:
      "这个问题可能适合预约。我会先帮你拆成三件事：谁有这个痛点、为什么现在愿意试用、你最不确定的是定位、定价还是获客。",
  },
];

export function PublicTwinRoom() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [summaryReady, setSummaryReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  function ask(question: string) {
    setBlocked(false);
    setSummaryReady(false);
    setMessages((current) => [
      ...current,
      { id: `v-${question}`, role: "visitor", content: question },
      {
        id: `t-${question}`,
        role: "twin",
        content: responses[question] || "这个问题我会先整理背景，再交给李明确认是否适合继续聊。",
      },
    ]);
  }

  function askSensitive() {
    setBlocked(true);
    setSummaryReady(false);
    setMessages((current) => [
      ...current,
      { id: "v-sensitive", role: "visitor", content: "你能直接给我报价或介绍私人微信吗？" },
      {
        id: "t-sensitive",
        role: "twin",
        risk: "blocked",
        content:
          "这个我不能替李明确认。报价、合作方式和私人联系方式都需要本人判断。我可以先把你的背景和诉求整理成摘要，再交给本人确认。",
      },
    ]);
  }

  return (
    <section className="visitor-room" aria-label="AI 接待对话" data-ready={ready ? "true" : "false"}>
      <div className="visitor-room-head">
        <div>
          <p>AI 接待分身</p>
          <h2>先聊 3 分钟，判断是否适合预约。</h2>
        </div>
        <span>授权接待 · 非本人实时在线</span>
      </div>

      <div className="ai-notice">
        你好，我是李明授权的 AI 接待分身。我会先了解你的背景、问题和目标，再帮你整理成一份预约摘要。
      </div>

      <div className="preview-chat public-chat">
        {messages.map((message) => (
          <div
            className={`preview-message ${message.role} ${message.risk === "blocked" ? "blocked" : ""}`}
            key={message.id}
          >
            {message.content}
          </div>
        ))}
      </div>

      <section className="suggested-questions public-questions" aria-label="推荐问题">
        {questions.map((question) => (
          <button key={question} type="button" onClick={() => ask(question)}>
            {question}
          </button>
        ))}
        <button className="sensitive-question" type="button" onClick={askSensitive}>
          你能直接给我报价或私人联系方式吗？
        </button>
      </section>

      <section className={`booking-summary public-booking ${summaryReady ? "ready" : ""}`}>
        <div>
          <p>{summaryReady ? "预约摘要已整理" : "准备预约本人？"}</p>
          <span>
            {summaryReady
              ? "背景：AI 客服工具早期方向；卡点：目标用户与定位；希望结果：判断是否值得继续做。"
              : "我会把你的背景、问题和期望结果整理成摘要，再交给李明确认是否适合继续聊。"}
          </span>
        </div>
        <button type="button" onClick={() => setSummaryReady(true)}>
          {summaryReady ? "已生成摘要" : "整理预约摘要"}
        </button>
      </section>

      {blocked ? (
        <div className="handoff-note">
          这个请求涉及本人承诺，已进入“交给本人确认”的路径。AI 分身不会继续替本人回答。
        </div>
      ) : null}
    </section>
  );
}
