import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PersonaScore } from "@/components/PersonaScore";
import {
  pendingCorrections,
  publishChannels,
  recentVisitorQuestions,
  twin,
} from "@/lib/mock-data";

const launchTasks = [
  ["done", "已导入 12 份资料", "文章、访谈和 FAQ 已进入资料与记忆。"],
  ["done", "已生成说话方式", "自我介绍、语气、判断原则和禁区已生成草稿。"],
  ["todo", "还有 6 个回答需要你确认", "这些回答会影响分身是否真的像你。"],
  ["todo", "设置预约入口", "让访客知道什么时候该预约本人。"],
  ["todo", "发布你的专属接待页", "生成一个可分享给访客的链接。"],
] as const;

export default function WorkspacePage() {
  return (
    <AppShell active="/workspace">
      <div className="page-title">
        <div>
          <p className="eyebrow">我的分身</p>
          <h1 style={{ fontSize: "clamp(40px, 5vw, 70px)" }}>
            你的分身还差 3 步可以发布
          </h1>
          <p>
            现在先把它调成一个可靠的接待分身：能介绍你、筛选访客、整理预约摘要，也知道哪些话不能替你说。
          </p>
        </div>
        <Link className="button" href="/workspace/create">
          继续完成
        </Link>
      </div>

      <section className="section grid-2">
        <div className="workspace-card">
          <h3>发布前任务</h3>
          <div className="task-list">
            {launchTasks.map(([state, title, body], index) => (
              <div className="task-item" key={title}>
                <span className={`task-check ${state === "done" ? "done" : ""}`}>
                  {state === "done" ? "✓" : index + 1}
                </span>
                <div className="task-body">
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="workspace-card visitor-preview">
          <div className="profile-card">
            <div className="avatar">李</div>
            <div>
              <h3 style={{ marginBottom: 4 }}>{twin.title}</h3>
              <p style={{ margin: 0 }}>测试中 · 适合先发给熟悉的客户试用。</p>
            </div>
          </div>
          <div className="chat-bubble visitor">
            我应该预约你聊产品定位，还是先自己整理一下？
          </div>
          <div className="chat-bubble">
            你可以先回答我三个问题：目标用户是谁、现在卡在哪一步、你希望咨询后拿到什么结果。我会帮你判断是否适合预约本人。
          </div>
          <Link className="ghost-button" href="/chat/demo">
            打开访客接待页
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="workspace-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">辅助健康度</p>
              <h2>不是 KPI，只是帮你判断能不能发布</h2>
            </div>
            <p className="section-note">
              分数不应该成为主视觉。真正重要的是：访客是否愿意聊、回答是否像你、边界是否清楚。
            </p>
          </div>
          <PersonaScore scores={twin.scores} />
        </div>
      </section>

      <section className="section grid-2">
        <div className="workspace-card">
          <h3>最近访客想问</h3>
          <div className="progress-rail">
            {recentVisitorQuestions.map((question, index) => (
              <div className="progress-step" key={question}>
                <span className="step-index">{index + 1}</span>
                <div className="step-body">
                  <strong>{question}</strong>
                  <span>可以转成推荐问题或测试题。</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="workspace-card">
          <h3>需要你确认</h3>
          <div className="progress-rail">
            {pendingCorrections.map((item, index) => (
              <div className="progress-step" key={item.id}>
                <span className="step-index">{index + 1}</span>
                <div className="step-body">
                  <strong>这像你会说的话吗？</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="workspace-card">
          <h3>发布入口</h3>
          <div className="grid-2">
            {publishChannels.map((channel) => (
              <div className="score-card" key={channel.name}>
                <strong>{channel.readiness}</strong>
                <span>
                  {channel.name} · {channel.state}
                </span>
                <div className="meter">
                  <span style={{ width: `${channel.readiness}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
