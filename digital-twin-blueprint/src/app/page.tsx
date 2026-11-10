import Link from "next/link";

export default function HomePage() {
  return (
    <main className="site">
      <Nav />
      <section className="hero-slice">
        <div>
          <p className="small-line">给专家和创始人的 AI 接待页生成器</p>
          <h1>别再让每个访客都从零认识你。</h1>
          <p className="lead">
            把你的文章、访谈和常见回答整理成一个 AI 接待分身。它先帮访客判断是否适合预约你，问清背景，整理摘要，再把真正值得聊的人带到你面前。
          </p>
          <div className="actions">
            <Link className="primary" href="/studio">
              创建我的接待分身
            </Link>
            <Link className="secondary" href="/twin/li-ming">
              看一个真实访客页
            </Link>
          </div>
        </div>

        <ReceptionPreview />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="small-line">这个 MVP 只做一件事</p>
            <h2>让访客先被接待，而不是直接打扰你。</h2>
          </div>
          <p className="muted">
            我们先砍掉复杂后台，只保留真正能验证价值的闭环：创建、预览、发布、接待、整理预约摘要。
          </p>
        </div>
        <div className="cards">
          <div className="card">
            <h3>它知道你适合帮谁</h3>
            <p>不是泛泛聊天，而是先判断访客的问题、阶段和目标是否值得预约本人。</p>
          </div>
          <div className="card">
            <h3>它知道哪些话不能替你说</h3>
            <p>合作、报价、投资、私人联系方式，都只收集背景并转你确认。</p>
          </div>
          <div className="card">
            <h3>它给你一份预约摘要</h3>
            <p>你看到的不再是散乱聊天记录，而是访客背景、问题和期望结果。</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Nav() {
  return (
    <nav className="topbar" aria-label="主导航">
      <Link className="wordmark" href="/">
        <span className="mark">分</span>
        <span>分身工作室</span>
      </Link>
      <div className="nav">
        <Link className="link-pill" href="/studio">
          创建
        </Link>
        <Link className="link-pill" href="/twin/li-ming">
          访客页
        </Link>
        <Link className="link-pill" href="/blueprint">
          架构图
        </Link>
      </div>
    </nav>
  );
}

function ReceptionPreview() {
  return (
    <aside className="reception-card" aria-label="AI 接待页预览">
      <div className="person">
        <div className="portrait">李</div>
        <div>
          <h3 style={{ marginBottom: 4 }}>李明的 AI 接待分身</h3>
          <p style={{ margin: 0 }}>
            产品与 AI 应用顾问 · 先判断是否适合预约本人
          </p>
        </div>
      </div>
      <div className="conversation">
        <div className="bubble user">我想做 AI 产品，但不知道该不该约你聊。</div>
        <div className="bubble">
          可以。我会先问你三个问题：你服务谁、现在卡在哪里、希望咨询后得到什么结果。
        </div>
        <div className="bubble user">你能直接给我报价吗？</div>
        <div className="bubble">
          我不能替本人确认报价。但我可以把你的背景整理成摘要，交给本人判断是否适合继续聊。
        </div>
      </div>
    </aside>
  );
}
