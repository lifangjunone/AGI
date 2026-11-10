"use client";

import { useMemo, useState } from "react";
import { conversationSamples } from "@/lib/mock-data";
import type { ChatMessage, ConversationSample } from "@/lib/types";
import { CorrectionPanel } from "./CorrectionPanel";

const initialMessages: ChatMessage[] = [
  {
    id: "system-1",
    role: "system",
    content:
      "你好，我是李明的 AI 接待分身，不是本人实时在线。我可以先帮你了解他的观点、服务边界和是否适合预约本人。",
    risk: "none",
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const selectedSample = useMemo(
    () => conversationSamples.find((sample) => sample.id === selectedQuestion),
    [selectedQuestion],
  );

  function askQuestion(sample: ConversationSample) {
    setSelectedQuestion(sample.id);
    setMessages([
      ...initialMessages,
      {
        id: `${sample.id}-visitor`,
        role: "visitor",
        content: sample.question,
        risk: "none",
      },
      {
        id: `${sample.id}-answer`,
        role: "twin",
        content: sample.answer,
        risk: sample.risk,
        sourceIds: sample.sourceIds,
      },
    ]);
  }

  return (
    <div className="chat-shell">
      <section className="workspace-card">
        <div className="page-title">
          <div>
            <p className="eyebrow">访客接待页预览</p>
            <h2>先和李明的 AI 分身聊聊</h2>
            <p>
              这是访客真正会看到的体验：先问清背景，再判断是否适合预约本人；涉及承诺和隐私时，会转本人确认。
            </p>
          </div>
          {selectedSample ? (
            <span className={`risk-pill ${selectedSample.risk ?? "none"}`}>
              {riskLabel(selectedSample.risk)}
            </span>
          ) : null}
        </div>

        <div className="chat-log">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="chip-row" style={{ marginBottom: 10 }}>
                <span className="tag">{roleLabel(message.role)}</span>
                {message.risk ? (
                  <span className={`risk-pill ${message.risk}`}>
                    {riskLabel(message.risk)}
                  </span>
                ) : null}
                {message.sourceIds?.map((id) => (
                  <span className="tag mono" key={id}>
                    {id}
                  </span>
                ))}
              </div>
              <p>{message.content}</p>
              {message.role === "twin" ? <CorrectionPanel messageId={message.id} /> : null}
            </article>
          ))}
        </div>
      </section>

      <aside className="workspace-card">
        <div className="profile-card" style={{ marginBottom: 18 }}>
          <div className="avatar">李</div>
          <div>
            <h3 style={{ marginBottom: 4 }}>李明 · 产品与 AI 顾问</h3>
            <p style={{ margin: 0 }}>适合聊产品机会判断、AI 应用落地、专家型服务设计。</p>
          </div>
        </div>
        <h3>你可以先问</h3>
        <div className="correction-actions">
          {conversationSamples.map((sample) => (
            <button
              className="question-button"
              key={sample.id}
              type="button"
              onClick={() => askQuestion(sample)}
            >
              {sample.question}
            </button>
          ))}
        </div>
        <div className="workspace-card" style={{ marginTop: 16, boxShadow: "none" }}>
          <h3>准备预约本人</h3>
          <p>
            分身会把你的背景、问题和期望结果整理成摘要，避免预约前来回解释。
          </p>
          <button className="button" type="button">
            整理预约摘要
          </button>
        </div>
      </aside>
    </div>
  );
}

function roleLabel(role: ChatMessage["role"]) {
  if (role === "visitor") return "访客";
  if (role === "twin") return "AI 分身";
  return "系统声明";
}

function riskLabel(risk: ChatMessage["risk"]) {
  if (risk === "blocked") return "已拦截";
  if (risk === "sensitive") return "敏感";
  return "安全";
}
