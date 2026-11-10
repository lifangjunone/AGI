import Link from "next/link";

export function TopNav() {
  return (
    <nav className="top-nav" aria-label="主导航">
      <Link href="/" className="brand">
        <span className="brand-mark">分</span>
        <span>分身工作室</span>
      </Link>
      <div className="nav-links">
        <Link className="nav-link" href="/workspace">
          我的分身
        </Link>
        <Link className="nav-link" href="/chat/demo">
          访客会看到什么
        </Link>
        <Link className="nav-link" href="/blueprint">
          架构图册
        </Link>
      </div>
    </nav>
  );
}
