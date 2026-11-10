import Link from "next/link";
import { twin } from "@/lib/mock-data";

const navItems = [
  { href: "/workspace", label: "我的分身", suffix: "准备发布" },
  { href: "/workspace/create", label: "创建向导", suffix: "5 步" },
  { href: "/workspace/knowledge", label: "资料与记忆", suffix: "可控" },
  { href: "/workspace/persona", label: "说话方式", suffix: "像我" },
  { href: "/chat/demo", label: "访客接待页", suffix: "预览" },
  { href: "/blueprint", label: "内部架构图", suffix: "团队" },
];

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="工作台导航">
        <Link href="/" className="brand">
          <span className="brand-mark">分</span>
          <span>分身工作室</span>
        </Link>
        <div style={{ marginTop: 18 }}>
          <span className="status-pill warning">{statusLabel(twin.status)}</span>
          <h3 style={{ marginTop: 14, marginBottom: 6 }}>{twin.title}</h3>
          <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
            帮访客先了解你、判断是否适合预约，并把背景整理给本人。
          </p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${active === item.href ? "active" : ""}`}
            >
              <span>{item.label}</span>
              <small className="mono">{item.suffix}</small>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "testing") return "测试中";
  return "草稿";
}
