import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-sc";
import {
  BarChart3,
  CalendarClock,
  Crown,
  Flame,
  MessageCircle,
  Newspaper,
  Search,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import "./styles.css";

const emptyTrends = {
  highlights: [],
  signals: [],
  boards: [],
  sourceStatus: [],
  sourceReport: {},
  qualityStats: {},
};

const sourceTone = {
  知乎: "blue",
  微博: "red",
  小红书: "pink",
  X: "slate",
  Bilibili: "cyan",
  "NewsNow/V2EX": "green",
  "GitHub Trending": "black",
  "Hacker News": "orange",
  arXiv: "violet",
};

function App() {
  const [data, setData] = useState({ trends: emptyTrends, posts: [], loading: true, error: "" });
  const [activeBoard, setActiveBoard] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const [trendsResponse, postsResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/trends.json`, { cache: "no-store" }),
          fetch(`${import.meta.env.BASE_URL}data/posts.json`, { cache: "no-store" }),
        ]);

        if (!trendsResponse.ok || !postsResponse.ok) {
          throw new Error("热点数据暂时不可用");
        }

        const [nextTrends, nextPosts] = await Promise.all([
          trendsResponse.json(),
          postsResponse.json(),
        ]);

        if (!alive) return;
        setData({ trends: nextTrends, posts: nextPosts, loading: false, error: "" });
        setActiveBoard(nextTrends.boards?.[0]?.key || "");
      } catch (error) {
        if (!alive) return;
        setData({ trends: emptyTrends, posts: [], loading: false, error: error.message });
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  const activeItems = useMemo(() => {
    const board = data.trends.boards?.find((item) => item.key === activeBoard);
    const base = board?.items?.length ? board.items : data.trends.highlights || [];
    if (!query.trim()) return base;

    const normalizedQuery = query.trim().toLowerCase();
    return base.filter((item) =>
      [item.title, item.summary, item.source, item.evidence].some((value) =>
        String(value || "").toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [activeBoard, data.trends, query]);

  return (
    <main>
      <Hero trends={data.trends} loading={data.loading} />

      {data.error ? <div className="shell error-banner">{data.error}</div> : null}
      {data.loading ? (
        <div className="shell loading">
          <Sparkles size={20} />
          正在整理今日热点…
        </div>
      ) : (
        <>
        <TopStories boards={data.trends.boards} />
        <section className="shell layout">
        <aside className="sidebar">
          <SearchBox query={query} setQuery={setQuery} />
          <BoardPicker
            boards={data.trends.boards}
            activeBoard={activeBoard}
            setActiveBoard={setActiveBoard}
          />
          <CoverageCard trends={data.trends} />
          <AutomationCard />
        </aside>

        <section className="feed">
          <DailyPost post={data.posts[0]} />
          <SignalStrip signals={data.trends.signals} />
          <TrendFeed items={activeItems} />
        </section>
        </section>
        </>
      )}
    </main>
  );
}

function Hero({ trends, loading }) {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/trends/" aria-label="Trend Forum 首页">
          <span className="brand-mark">TF</span>
          <span className="brand-copy">
            <strong>Trend Forum</strong>
            <small>每日热点与技术趋势</small>
          </span>
        </a>
        <nav className="header-nav" aria-label="页面导航">
          <a href="#top-stories">今日榜首</a>
          <a href="#daily-post">今日精选</a>
          <a href="#signals">关键信号</a>
          <a href="#boards">平台榜单</a>
        </nav>
        <div className="update-badge">
          <span className={loading ? "pulse-dot loading-dot" : "pulse-dot"} />
          {loading ? "正在更新" : `${formatUpdateTime(trends.sourceReport)} 更新`}
        </div>
      </div>
    </header>
  );
}

function TopStories({ boards = [] }) {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const stories = boards
    .filter((board) => board.items?.length)
    .map((board) => ({ board, item: board.items[0] }));

  useEffect(() => {
    const track = trackRef.current;
    if (!track || stories.length < 2) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return undefined;

    let frameId;
    let previousTime = performance.now();
    let scrollPosition = track.scrollLeft;
    const speed = 24;

    const animate = (currentTime) => {
      const elapsed = Math.min(currentTime - previousTime, 32);
      previousTime = currentTime;

      if (!pausedRef.current) {
        const firstCard = track.querySelector(".top-story-card");
        const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
        const loopWidth = ((firstCard?.getBoundingClientRect().width || 0) + gap) * stories.length;

        if (loopWidth > 0) {
          scrollPosition += (speed * elapsed) / 1000;
          if (scrollPosition >= loopWidth) scrollPosition -= loopWidth;
          track.scrollLeft = scrollPosition;
        }
      } else {
        scrollPosition = track.scrollLeft;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(resumeTimerRef.current);
    };
  }, [stories.length]);

  const pauseAutoScroll = () => {
    window.clearTimeout(resumeTimerRef.current);
    pausedRef.current = true;
  };

  const resumeAutoScroll = (delay = 0) => {
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, delay);
  };

  const handleManualScroll = () => {
    pauseAutoScroll();
    resumeAutoScroll(1600);
  };

  if (!stories.length) return null;

  const renderStory = ({ board, item }, index, duplicate = false) => (
    <a
      aria-hidden={duplicate ? "true" : undefined}
      className={`top-story-card story-accent-${index % 5}`}
      href={item.url || "#"}
      key={`${duplicate ? "copy" : "original"}-${board.key}-${item.id}`}
      tabIndex={duplicate ? -1 : undefined}
      target="_blank"
      rel="noreferrer"
    >
      <div className="top-story-meta">
        <span className="story-source">{board.label}</span>
        <strong>TOP 1</strong>
      </div>
      <h2>{item.title}</h2>
      <p>{item.summary || item.evidence || "点击查看原始热点内容。"}</p>
      <div className="top-story-footer">
        <span className="story-heat">
          <Flame size={13} />
          {formatScore(item.score || item.engagement)}
        </span>
        <span aria-hidden="true">去看看 <b>↗</b></span>
      </div>
      <span className="top-story-number" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
    </a>
  );

  return (
    <section className="shell top-stories" id="top-stories">
      <div className="top-stories-heading">
        <div>
          <span className="top-stories-kicker">
            <Crown size={16} />
            今日榜首
          </span>
          <h1>每个榜单，最值得先看的一条</h1>
        </div>
        <p><span className="live-mark" />正在追踪 {stories.length} 个榜单</p>
      </div>
      <div
        className="top-stories-track"
        ref={trackRef}
        aria-label="各平台今日榜首，自动轮播"
        onMouseEnter={pauseAutoScroll}
        onMouseLeave={() => resumeAutoScroll()}
        onFocusCapture={pauseAutoScroll}
        onBlurCapture={() => resumeAutoScroll()}
        onTouchStart={pauseAutoScroll}
        onTouchEnd={() => resumeAutoScroll(1600)}
        onWheel={handleManualScroll}
      >
        {stories.map((story, index) => renderStory(story, index))}
        {stories.map((story, index) => renderStory(story, index, true))}
      </div>
    </section>
  );
}

function SearchBox({ query, setQuery }) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索标题、来源、摘要"
      />
    </label>
  );
}

function BoardPicker({ boards = [], activeBoard, setActiveBoard }) {
  return (
    <section className="panel" id="boards">
      <div className="panel-title">
        <BarChart3 size={18} />
        平台榜单
        <span className="panel-count">{boards.length}</span>
      </div>
      <div className="board-list">
        {boards.map((board) => (
          <button
            key={board.key}
            className={board.key === activeBoard ? "active" : ""}
            onClick={() => setActiveBoard(board.key)}
          >
            <span>{board.label}</span>
            <small>{board.items.length}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function AutomationCard() {
  return (
    <section className="panel automation">
      <div className="panel-title">
        <CalendarClock size={18} />
        每日更新说明
      </div>
      <ol>
        <li>每天汇总新闻、技术和社区平台的热门内容。</li>
        <li>自动整理为关键信号、平台榜单和每日精选。</li>
        <li>保留原始来源链接，方便继续阅读和核验。</li>
      </ol>
    </section>
  );
}

function DailyPost({ post }) {
  return (
    <article className="daily-post" id="daily-post">
      <div className="post-kicker">
        <Newspaper size={18} />
        今日必读
      </div>
      <h2>{post?.title || "每日热点文章待生成"}</h2>
      <p>{post?.excerpt || "今日精选正在生成中，请稍后刷新查看。"}</p>
      <div className="post-meta">
        <span>{post?.author || "Trend Forum 编辑部"}</span>
        <span>{post?.category || "每日热点"}</span>
        <span>{formatDate(post?.publishedAt)}</span>
      </div>
    </article>
  );
}

function SignalStrip({ signals = [] }) {
  return (
    <section className="signals" id="signals">
      <div className="section-heading">
        <Sparkles size={20} />
        <h2>今日关键信号</h2>
        <span>从全网热点中提炼出的变化与机会</span>
      </div>
      <div className="signal-grid">
        {signals.slice(0, 4).map((signal) => (
          <a className="signal-card" href={signal.url || "#"} key={signal.id} target="_blank" rel="noreferrer">
            <span>{signal.category}</span>
            <h3>{signal.title}</h3>
            <p>{signal.takeaway || signal.summary}</p>
            <small>{signal.sources?.join(" · ")}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function TrendFeed({ items }) {
  return (
    <section className="trend-feed">
      <div className="section-heading">
        <Flame size={20} />
        <h2>正在发生</h2>
        <span>来自当前榜单的实时热门内容</span>
      </div>
      {items.map((item) => (
        <article className="feed-card" key={item.id}>
          <div className="feed-main">
            <div className="source-row">
              <span className={`source-pill ${sourceTone[item.source] || ""}`}>{item.source}</span>
              <span>{formatDate(item.publishedAt)}</span>
            </div>
            <h3>
              <a href={item.url || "#"} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            </h3>
            <p>{item.summary || item.evidence || "暂无摘要，点击查看原始链接。"}</p>
            <div className="feed-actions">
              <span>
                <ThumbsUp size={16} />
                {Math.round(item.engagement || item.score || 0)}
              </span>
              <span>
                <MessageCircle size={16} />
                {item.evidence || "查看原始来源"}
              </span>
            </div>
          </div>
          <div className="score">
            <span>热度</span>
            <strong>{item.score || 0}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}

function CoverageCard({ trends }) {
  const availableSources = (trends.sourceStatus || []).filter((item) =>
    ["ok", "cached"].includes(item.status),
  ).length;
  const boardCount = trends.boards?.length || 0;
  const signalCount = trends.signals?.length || 0;
  const topHub = (trends.contentPortals || []).find((item) => item.url?.includes("tophub.today"));

  return (
    <section className="panel">
      <div className="panel-title">
        <Sparkles size={18} />
        今日内容覆盖
      </div>
      <div className="coverage-grid">
        <div><strong>{boardCount}</strong><span>平台榜单</span></div>
        <div><strong>{signalCount}</strong><span>关键信号</span></div>
        <div><strong>{availableSources}</strong><span>活跃来源</span></div>
      </div>
      {topHub ? (
        <a className="external-portal" href={topHub.url} target="_blank" rel="noreferrer">
          <span>
            <small>外部热点导航 · 非本站数据源</small>
            <strong>{topHub.name}</strong>
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatUpdateTime(sourceReport = {}) {
  const value = sourceReport.generatedAt;
  if (!value) return sourceReport.date || "今日";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sourceReport.date || "今日";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatScore(value) {
  const score = Number(value || 0);
  if (score >= 100000000) return `${(score / 100000000).toFixed(1)}亿`;
  if (score >= 10000) return `${(score / 10000).toFixed(1)}万`;
  return Number.isInteger(score) ? score : score.toFixed(1);
}

createRoot(document.getElementById("root")).render(<App />);
