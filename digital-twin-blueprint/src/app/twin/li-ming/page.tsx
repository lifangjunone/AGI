import Link from "next/link";
import { PublicTwinRoom } from "@/components/PublicTwinRoom";

const intakeItems = [
  ["你在做什么", "产品阶段、目标用户、已有反馈"],
  ["现在卡在哪里", "定位、功能优先级、商业化或获客"],
  ["想得到什么结果", "一次咨询后希望更清楚的决定"],
] as const;

export default function PublicTwinPage() {
  return (
    <main className="public-twin-page">
      <nav className="public-twin-nav" aria-label="访客页导航">
        <Link className="studio-brand" href="/">
          <span className="studio-brand-mark">李</span>
          <span>李明的 AI 接待室</span>
        </Link>
        <div className="studio-top-actions">
          <Link className="quiet-button" href="/studio/inbox">
            查看线索
          </Link>
          <Link className="quiet-button" href="/studio">
            创建我的接待页
          </Link>
        </div>
      </nav>

      <section className="public-twin-shell">
        <aside className="host-card" aria-label="专家信息">
          <div className="host-avatar">李</div>
          <p>李明</p>
          <h1>产品与 AI 应用顾问</h1>
          <span>
            陪创始人判断 AI 产品机会、梳理目标用户、确定第一版该验证什么。
          </span>

          <div className="host-divider" />

          <h2>这个 AI 分身会先帮你做什么</h2>
          <div className="intake-list">
            {intakeItems.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>

          <div className="host-notice">
            我不会替李明确认报价、合作、投资或私人联系方式。需要正式判断的内容，会整理后交给本人确认。
          </div>
        </aside>

        <PublicTwinRoom />
      </section>
    </main>
  );
}
