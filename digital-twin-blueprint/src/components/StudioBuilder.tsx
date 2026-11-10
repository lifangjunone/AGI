"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StudioDraft = {
  name: string;
  title: string;
  audience: string;
  fitQuestions: string;
  greeting: string;
  intake: string;
  boundaries: string;
};

const initialDraft: StudioDraft = {
  name: "李明",
  title: "产品与 AI 应用顾问，陪创始人把 AI 想法变成可验证的产品。",
  audience: "已有产品想法、早期原型或真实客户反馈的创始人 / 业务负责人。",
  fitQuestions: "目标用户不清晰、AI 功能优先级混乱、商业化路径需要判断。",
  greeting: "你好，我是李明的 AI 接待分身。我可以先帮你判断问题是否适合预约本人。",
  intake: "你在做什么；目前卡在哪里；希望咨询结束后得到什么结果。",
  boundaries: "不确认报价、合作、投资、录用和私人联系方式。正式建议必须交给本人确认。",
};

const previewQuestions = [
  "我现在只有一个 AI 产品想法，值得预约吗？",
  "咨询前我需要准备哪些材料？",
  "你会怎么判断我的产品机会？",
] as const;

export function StudioBuilder() {
  const [draft, setDraft] = useState(initialDraft);
  const [boundaryConfirmed, setBoundaryConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const firstName = draft.name.trim().slice(0, 1) || "分";
  const readiness = boundaryConfirmed ? "可发布 · 已确认边界" : "可发布 · 还差 1 项确认";

  const publishChecks = useMemo(
    () => [
      ["身份", draft.name.trim() && draft.title.trim() ? "已清楚" : "待补充", "访客能在 3 秒内知道你是谁"],
      ["接待", draft.greeting.trim() && draft.intake.trim() ? "已设置" : "待补充", "会先问背景，而不是直接闲聊"],
      ["边界", boundaryConfirmed ? "已确认" : "待确认", "报价和合作承诺需要本人确认"],
    ],
    [boundaryConfirmed, draft.greeting, draft.intake, draft.name, draft.title],
  );

  function updateDraft(key: keyof StudioDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function copyLink() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="studio-workbench" data-ready={ready ? "true" : "false"}>
      <aside className="studio-editor" aria-label="接待页编辑器">
        <div className="editor-header">
          <p>正在编辑</p>
          <h1>{draft.name || "你的"}的 AI 接待室</h1>
          <span>这页发布后，可以放在主页、朋友圈、邮件签名或咨询入口。</span>
        </div>

        <div className="editor-tabs" aria-label="编辑步骤">
          <button className="editor-tab active" type="button">
            内容
          </button>
          <button className="editor-tab" type="button">
            预览
          </button>
          <button className="editor-tab" type="button">
            发布
          </button>
        </div>

        <div className="editor-stack">
          <section className="editor-section">
            <div>
              <h2>公开身份</h2>
              <p>访客打开页面时，先确认自己找对了人。</p>
            </div>
            <div className="studio-fields">
              <label className="studio-field">
                <span>姓名</span>
                <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
              </label>
              <label className="studio-field">
                <span>一句话身份</span>
                <textarea value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div>
              <h2>适合接待谁</h2>
              <p>让分身先筛掉泛泛提问，把值得聊的人带到你面前。</p>
            </div>
            <div className="studio-fields">
              <label className="studio-field">
                <span>理想访客</span>
                <textarea value={draft.audience} onChange={(event) => updateDraft("audience", event.target.value)} />
              </label>
              <label className="studio-field">
                <span>适合预约的问题</span>
                <textarea
                  value={draft.fitQuestions}
                  onChange={(event) => updateDraft("fitQuestions", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div>
              <h2>接待脚本</h2>
              <p>不是替你聊天，而是替你问清背景。</p>
            </div>
            <div className="studio-fields">
              <label className="studio-field">
                <span>开场白</span>
                <textarea value={draft.greeting} onChange={(event) => updateDraft("greeting", event.target.value)} />
              </label>
              <label className="studio-field">
                <span>必须问清的事</span>
                <textarea value={draft.intake} onChange={(event) => updateDraft("intake", event.target.value)} />
              </label>
            </div>
          </section>

          <section className={`editor-section boundary-section ${boundaryConfirmed ? "confirmed" : ""}`}>
            <div>
              <h2>不能替我说</h2>
              <p>分身只负责接待和整理，不替本人做承诺。</p>
            </div>
            <div className="studio-fields">
              <label className="studio-field">
                <span>边界</span>
                <textarea
                  value={draft.boundaries}
                  onChange={(event) => {
                    updateDraft("boundaries", event.target.value);
                    setBoundaryConfirmed(false);
                  }}
                />
              </label>
              <button
                className={boundaryConfirmed ? "confirm-button confirmed" : "confirm-button"}
                type="button"
                onClick={() => setBoundaryConfirmed((value) => !value)}
              >
                {boundaryConfirmed ? "已确认边界" : "本人确认这条边界"}
              </button>
            </div>
          </section>
        </div>
      </aside>

      <section className="studio-preview-zone" aria-label="访客页实时预览">
        <div className="preview-toolbar">
          <div>
            <p>实时预览</p>
            <strong>访客真正会看到的页面</strong>
          </div>
          <span className="live-pill">{readiness}</span>
        </div>

        <div className="public-preview-frame">
          <div className="public-preview-chrome">
            <span />
            <span />
            <span />
            <p>secondself.site/li-ming</p>
          </div>

          <article className="public-preview-card">
            <header className="public-identity">
              <div className="public-avatar">{firstName}</div>
              <div>
                <p>{draft.name || "你的名字"}</p>
                <h2>先和我的 AI 接待分身聊聊</h2>
                <span>{draft.title || "一句话说明你是谁、适合帮谁。"}</span>
              </div>
            </header>

            <div className="ai-notice">
              我是{draft.name || "本人"}授权的 AI 接待分身。我可以先了解你的背景、判断是否适合预约，并把摘要交给本人确认。
            </div>

            <div className="preview-chat">
              <div className="preview-message twin">{draft.greeting}</div>
              <div className="preview-message visitor">我做了一个 AI 客服工具，但不知道该卖给谁。</div>
              <div className="preview-message twin">
                这个问题可能适合预约。我会先问：{draft.intake || "项目阶段、卡点和希望得到的结果。"}
              </div>
            </div>

            <section className="suggested-questions" aria-label="推荐问题">
              {previewQuestions.map((question) => (
                <button key={question} type="button">
                  {question}
                </button>
              ))}
            </section>

            <section className="booking-summary">
              <div>
                <p>准备预约本人？</p>
                <span>AI 分身会先整理你的背景、问题和期望结果。</span>
              </div>
              <button type="button">整理预约摘要</button>
            </section>
          </article>
        </div>

        <div className="publish-strip" aria-label="发布检查">
          {publishChecks.map(([label, state, body]) => (
            <div className="publish-check" key={label}>
              <span>{state}</span>
              <strong>{label}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>

        <div className="publish-actions">
          <button className="quiet-button" type="button" onClick={copyLink}>
            {copied ? "链接已复制" : "复制公开链接"}
          </button>
          <Link className="publish-button" href="/twin/li-ming">
            打开并测试访客页
          </Link>
        </div>
      </section>
    </section>
  );
}
