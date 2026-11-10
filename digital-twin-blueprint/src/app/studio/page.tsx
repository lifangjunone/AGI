import Link from "next/link";
import { StudioBuilder } from "@/components/StudioBuilder";

export default function StudioPage() {
  return (
    <main className="studio-page">
      <nav className="studio-topbar" aria-label="创建导航">
        <Link className="studio-brand" href="/">
          <span className="studio-brand-mark">分</span>
          <span>分身工作室</span>
        </Link>
        <div className="studio-top-actions">
          <Link className="quiet-button" href="/studio/inbox">
            线索收件箱
          </Link>
          <Link className="quiet-button" href="/twin/li-ming">
            打开公开页
          </Link>
          <Link className="publish-button" href="/twin/li-ming">
            发布接待页
          </Link>
        </div>
      </nav>

      <StudioBuilder />
    </main>
  );
}
