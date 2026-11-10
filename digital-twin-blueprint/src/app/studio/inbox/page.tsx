import Link from "next/link";
import { LeadInbox } from "@/components/LeadInbox";

export default function StudioInboxPage() {
  return (
    <main className="studio-page">
      <nav className="studio-topbar" aria-label="线索收件箱导航">
        <Link className="studio-brand" href="/">
          <span className="studio-brand-mark">分</span>
          <span>分身工作室</span>
        </Link>
        <div className="studio-top-actions">
          <Link className="quiet-button" href="/studio">
            编辑接待页
          </Link>
          <Link className="quiet-button" href="/twin/li-ming">
            测试访客页
          </Link>
          <Link className="publish-button" href="/studio/inbox">
            处理线索
          </Link>
        </div>
      </nav>

      <LeadInbox />
    </main>
  );
}
