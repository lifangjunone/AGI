import Link from "next/link";
import { ChatPanel } from "@/components/ChatPanel";

export default function ChatDemoPage() {
  return (
    <main className="app-page">
      <nav className="top-nav" aria-label="访客对话导航">
        <Link href="/" className="brand">
          <span className="brand-mark">李</span>
          <span>李明的 AI 接待室</span>
        </Link>
        <div className="nav-links">
          <Link className="nav-link" href="/workspace">
            返回分身工作室
          </Link>
          <Link className="nav-link" href="/blueprint">
            查看架构
          </Link>
        </div>
      </nav>
      <ChatPanel />
    </main>
  );
}
