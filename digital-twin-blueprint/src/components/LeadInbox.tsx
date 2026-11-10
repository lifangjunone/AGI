"use client";

import { useMemo, useState } from "react";

type LeadStatus = "new" | "accepted" | "follow_up" | "declined";

type Lead = {
  id: string;
  name: string;
  source: string;
  time: string;
  intent: string;
  summary: string;
  fit: "high" | "medium" | "low";
  status: LeadStatus;
  questions: string[];
  risk: string;
  nextStep: string;
};

const initialLeads: Lead[] = [
  {
    id: "lead-1",
    name: "周祺",
    source: "公开接待页",
    time: "今天 10:42",
    intent: "想判断一个 AI 客服工具该卖给谁",
    summary:
      "已有早期原型，试过 3 个潜在客户，但客户反馈分散。最不确定目标用户、定价和第一版应该验证什么。",
    fit: "high",
    status: "new",
    questions: [
      "现在有真实客户吗？",
      "客户为什么愿意试用？",
      "你最不确定的是定位、定价还是获客？",
    ],
    risk: "没有要求报价或私人联系方式，适合继续判断。",
    nextStep: "建议预约 30 分钟，目标是收敛目标用户和验证路径。",
  },
  {
    id: "lead-2",
    name: "许然",
    source: "朋友圈链接",
    time: "昨天 21:18",
    intent: "只有一个知识库产品想法，想先听判断",
    summary:
      "还没有原型，只有方向和几段用户访谈。希望知道是否值得做，但尚未说明具体目标人群。",
    fit: "medium",
    status: "follow_up",
    questions: ["目标用户是谁？", "已有访谈里最强烈的痛点是什么？"],
    risk: "信息不足，不建议马上预约长咨询。",
    nextStep: "先补问目标用户和已有证据，再决定是否预约。",
  },
  {
    id: "lead-3",
    name: "匿名访客",
    source: "主页按钮",
    time: "周一 16:05",
    intent: "询问报价、合作方式和私人微信",
    summary:
      "没有提供项目背景，只询问报价与私人联系方式。AI 分身已拒绝替本人确认承诺。",
    fit: "low",
    status: "new",
    questions: ["你代表什么项目？", "希望解决什么具体问题？"],
    risk: "涉及报价和私人联系方式，必须本人确认或拒绝。",
    nextStep: "建议先拒绝直接报价，要求补充项目背景。",
  },
];

const statusCopy: Record<LeadStatus, string> = {
  new: "待处理",
  accepted: "已约谈",
  follow_up: "需补问",
  declined: "已婉拒",
};

export function LeadInbox() {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0].id);
  const [note, setNote] = useState("这类问题适合短咨询，但需要先确认真实客户反馈是否足够。");

  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId) ?? leads[0],
    [leads, selectedId],
  );

  const counts = useMemo(
    () => ({
      new: leads.filter((lead) => lead.status === "new").length,
      accepted: leads.filter((lead) => lead.status === "accepted").length,
      followUp: leads.filter((lead) => lead.status === "follow_up").length,
    }),
    [leads],
  );

  function updateStatus(status: LeadStatus) {
    setLeads((current) =>
      current.map((lead) => (lead.id === selected.id ? { ...lead, status } : lead)),
    );
  }

  return (
    <section className="inbox-shell" data-ready="true">
      <aside className="inbox-list" aria-label="访客线索列表">
        <div className="inbox-list-head">
          <p>今天的接待结果</p>
          <h1>线索收件箱</h1>
          <span>AI 分身只把值得你判断的访客送到这里。</span>
        </div>

        <div className="inbox-stats" aria-label="线索统计">
          <div>
            <strong>{counts.new}</strong>
            <span>待处理</span>
          </div>
          <div>
            <strong>{counts.followUp}</strong>
            <span>需补问</span>
          </div>
          <div>
            <strong>{counts.accepted}</strong>
            <span>已约谈</span>
          </div>
        </div>

        <div className="lead-list">
          {leads.map((lead) => (
            <button
              className={`lead-card ${lead.id === selected.id ? "active" : ""}`}
              key={lead.id}
              type="button"
              onClick={() => setSelectedId(lead.id)}
            >
              <span className={`fit-dot ${lead.fit}`} />
              <div>
                <strong>{lead.name}</strong>
                <p>{lead.intent}</p>
                <small>
                  {lead.time} · {statusCopy[lead.status]}
                </small>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="lead-detail" aria-label="线索详情">
        <div className="lead-detail-head">
          <div>
            <p>{selected.source}</p>
            <h2>{selected.name} 想和你聊什么</h2>
          </div>
          <span className={`fit-badge ${selected.fit}`}>
            {selected.fit === "high" ? "高度匹配" : selected.fit === "medium" ? "需要补问" : "谨慎处理"}
          </span>
        </div>

        <div className={`decision-strip ${selected.status}`}>
          <strong>{statusCopy[selected.status]}</strong>
          <span>
            {selected.status === "accepted"
              ? "这条线索已经进入预约路径，可以准备下一步沟通。"
              : selected.status === "follow_up"
                ? "还需要访客补充信息，暂时不建议直接约谈。"
                : selected.status === "declined"
                  ? "这条线索已被婉拒，AI 分身后续会保持边界。"
                  : "还没有处理，请决定是否预约、补问或婉拒。"}
          </span>
        </div>

        <div className="lead-summary-card">
          <p>AI 分身整理的摘要</p>
          <h3>{selected.intent}</h3>
          <span>{selected.summary}</span>
        </div>

        <div className="lead-grid">
          <section className="lead-panel">
            <h3>分身已经问过</h3>
            <div className="question-trace">
              {selected.questions.map((question) => (
                <span key={question}>{question}</span>
              ))}
            </div>
          </section>

          <section className="lead-panel">
            <h3>边界提醒</h3>
            <p>{selected.risk}</p>
          </section>
        </div>

        <section className="lead-panel recommendation">
          <div>
            <h3>建议下一步</h3>
            <p>{selected.nextStep}</p>
          </div>
          <div className="lead-actions">
            <button className="publish-button" type="button" onClick={() => updateStatus("accepted")}>
              接受预约
            </button>
            <button className="quiet-button" type="button" onClick={() => updateStatus("follow_up")}>
              先补问
            </button>
            <button className="decline-button" type="button" onClick={() => updateStatus("declined")}>
              婉拒
            </button>
          </div>
        </section>

        <section className="lead-note">
          <label>
            <span>给自己的处理备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="note-preview">
            <p>保存后你会看到</p>
            <span>{note || "这里会显示你的内部备注，不会发给访客。"}</span>
          </div>
        </section>
      </section>
    </section>
  );
}
