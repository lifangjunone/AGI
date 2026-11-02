import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  Crown,
  ExternalLink,
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

const emptyInsights = {
  currentEditionId: null,
  currentItemIds: [],
  generatedAt: null,
  status: "stale",
  run: {},
  editions: [],
  items: [],
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

function storyFromUrl() {
  return new URLSearchParams(window.location.search).get("story") || "";
}

function App() {
  const [data, setData] = useState({
    trends: emptyTrends,
    insights: emptyInsights,
    posts: [],
    loading: true,
    error: "",
  });
  const [activeBoard, setActiveBoard] = useState("");
  const [query, setQuery] = useState("");
  const [storyId, setStoryId] = useState(storyFromUrl);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const [trendsResponse, insightsResponse, postsResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/trends.json`, { cache: "no-store" }),
          fetch(`${import.meta.env.BASE_URL}data/insights.json`, { cache: "no-store" }),
          fetch(`${import.meta.env.BASE_URL}data/posts.json`, { cache: "no-store" }),
        ]);

        if (!trendsResponse.ok || !insightsResponse.ok || !postsResponse.ok) {
          throw new Error("热点数据暂时不可用");
        }

        const [nextTrends, nextInsights, nextPosts] = await Promise.all([
          trendsResponse.json(),
          insightsResponse.json(),
          postsResponse.json(),
        ]);

        if (!alive) return;
        setData({
          trends: nextTrends,
          insights: nextInsights,
          posts: nextPosts,
          loading: false,
          error: "",
        });
        setActiveBoard(nextTrends.boards?.[0]?.key || "");
      } catch (error) {
        if (!alive) return;
        setData({
          trends: emptyTrends,
          insights: emptyInsights,
          posts: [],
          loading: false,
          error: error.message,
        });
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => setStoryId(storyFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectedStory = useMemo(
    () => data.insights.items?.find((item) => item.id === storyId),
    [data.insights.items, storyId],
  );

  const currentInsights = useMemo(() => {
    const ids = new Set(data.insights.currentItemIds || []);
    if (!ids.size) return data.insights.items || [];
    return (data.insights.items || []).filter((item) => ids.has(item.id));
  }, [data.insights.currentItemIds, data.insights.items]);

  useEffect(() => {
    document.title = selectedStory
      ? `${selectedStory.title} · Trend Forum`
      : "Trend Forum · 每日热点与技术趋势";
  }, [selectedStory]);

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

  const insightItems = useMemo(() => {
    if (!query.trim()) return currentInsights;
    const normalizedQuery = query.trim().toLowerCase();
    return currentInsights.filter((item) =>
      [
        item.title,
        item.originalTitle,
        item.summary,
        item.platform,
        item.reason,
        ...(item.tags || []),
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)),
    );
  }, [currentInsights, query]);

  const openStory = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("story", id);
    window.history.pushState({ story: id }, "", url);
    setStoryId(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const closeStory = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("story");
    window.history.pushState({}, "", url);
    setStoryId("");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <main>
      <Hero
        trends={data.trends}
        insights={data.insights}
        loading={data.loading}
        detail={Boolean(selectedStory)}
      />

      {data.error ? <div className="shell error-banner">{data.error}</div> : null}
      {data.loading ? (
        <div className="shell loading" role="status">
          <Sparkles size={20} aria-hidden="true" />
          正在整理今日热点…
        </div>
      ) : selectedStory ? (
        <StoryDetail item={selectedStory} insights={data.insights} onBack={closeStory} />
      ) : storyId ? (
        <MissingStory onBack={closeStory} />
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
              <DailyPost
                post={data.posts[0]}
                insights={{ ...data.insights, items: currentInsights }}
                onOpen={openStory}
              />
              <InsightSection
                insights={data.insights}
                items={insightItems}
                onOpen={openStory}
              />
              <SignalStrip signals={data.trends.signals} />
              <TrendFeed items={activeItems} />
            </section>
          </section>
        </>
      )}
    </main>
  );
}

function Hero({ trends, insights, loading, detail }) {
  const isStale = insights.status === "stale" && insights.generatedAt;
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
        {!detail ? (
          <nav className="header-nav" aria-label="页面导航">
            <a href="#top-stories">今日榜首</a>
            <a href="#ai-insights">深度精选</a>
            <a href="#signals">关键信号</a>
            <a href="#boards">平台榜单</a>
          </nav>
        ) : null}
        <div className={`update-badge ${isStale ? "stale" : ""}`}>
          <span className={loading ? "pulse-dot loading-dot" : "pulse-dot"} />
          {loading
            ? "正在更新"
            : isStale
              ? `深度精选保留至 ${formatDate(insights.generatedAt)}`
              : `${formatUpdateTime(trends.sourceReport)} 更新`}
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

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
          <Flame size={13} aria-hidden="true" />
          {formatScore(item.score || item.engagement)}
        </span>
        <span aria-hidden="true">去看看 <b>↗</b></span>
      </div>
    </a>
  );

  return (
    <section className="shell top-stories" id="top-stories">
      <div className="top-stories-heading">
        <div>
          <span className="top-stories-kicker">
            <Crown size={16} aria-hidden="true" />
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
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">搜索热点内容</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索榜单与深度精选"
        type="search"
      />
    </label>
  );
}

function BoardPicker({ boards = [], activeBoard, setActiveBoard }) {
  return (
    <section className="panel" id="boards">
      <div className="panel-title">
        <BarChart3 size={18} aria-hidden="true" />
        平台榜单
        <span className="panel-count">{boards.length}</span>
      </div>
      <div className="board-list">
        {boards.map((board) => (
          <button
            key={board.key}
            className={board.key === activeBoard ? "active" : ""}
            onClick={() => setActiveBoard(board.key)}
            aria-pressed={board.key === activeBoard}
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
        <CalendarClock size={18} aria-hidden="true" />
        每 6 小时更新
      </div>
      <ol>
        <li>先更新全网平台榜单与原始热度。</li>
        <li>再由 Horizon 评分、去重并补充背景。</li>
        <li>处理失败时保留上次精选并明确标记。</li>
      </ol>
    </section>
  );
}

function DailyPost({ post, insights, onOpen }) {
  const first = insights.items?.[0];
  return (
    <article className="daily-post" id="daily-post">
      <div className="post-kicker">
        <Newspaper size={18} aria-hidden="true" />
        今日必读
      </div>
      <h2>{post?.title || first?.title || "每日热点文章待生成"}</h2>
      <p>{post?.excerpt || first?.summary || "今日精选正在生成中，请稍后刷新查看。"}</p>
      <div className="post-meta">
        <span>{post?.author || "Trend Forum 编辑部"}</span>
        <span>{insights.run?.selectedCount || 0} 条深度精选</span>
        <span>{formatDate(insights.generatedAt || post?.publishedAt)}</span>
      </div>
      {first ? (
        <button className="primary-action" onClick={() => onOpen(first.id)}>
          从首条精选开始读
          <BookOpen size={17} aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

function InsightSection({ insights, items, onOpen }) {
  const stale = insights.status === "stale";
  return (
    <section className="insights" id="ai-insights">
      <div className="section-heading">
        <BrainCircuit size={20} aria-hidden="true" />
        <h2>Horizon 深度精选</h2>
        <span>推荐分衡量阅读价值，不等同于平台热度</span>
      </div>
      {stale ? (
        <div className="stale-notice" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            本轮深度处理未完成，当前保留
            {insights.generatedAt ? ` ${formatDate(insights.generatedAt)} ` : "上一次"}
            的有效精选；平台榜单仍是最新数据。
          </span>
        </div>
      ) : null}
      {items.length ? (
        <div className="insight-grid">
          {items.slice(0, 6).map((item, index) => (
            <button className="insight-card" key={item.id} onClick={() => onOpen(item.id)}>
              <div className="insight-card-top">
                <span>{item.platform}</span>
                <strong>推荐分 {formatRecommendation(item.score)}</strong>
              </div>
              <span className="insight-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <div className="insight-tags">
                {(item.tags || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <footer>
                <span>{profileLabel(item.profile)}</span>
                <span>阅读全文 →</span>
              </footer>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-insights">
          <BrainCircuit size={28} aria-hidden="true" />
          <strong>深度精选正在准备</strong>
          <p>平台榜单可以正常浏览，Horizon 完成首轮处理后会在这里出现。</p>
        </div>
      )}
    </section>
  );
}

function StoryDetail({ item, insights, onBack }) {
  const usefulBlocks = (item.blocks || []).filter((block) => block.content);
  return (
    <article className="shell story-detail">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        返回全部热点
      </button>
      {insights.status === "stale" ? (
        <div className="stale-notice detail-stale">
          <AlertTriangle size={18} aria-hidden="true" />
          这篇精选来自上一次成功处理，最近成功时间为 {formatDate(insights.generatedAt)}。
        </div>
      ) : null}
      <header className="story-hero">
        <div className="story-eyebrow">
          <span>{item.platform}</span>
          <span>{profileLabel(item.profile)}</span>
          <strong>Horizon 推荐 {formatRecommendation(item.score)}</strong>
        </div>
        <h1>{item.title}</h1>
        <p className="story-summary">{item.summary}</p>
        <div className="story-byline">
          <span>发布于 {formatDate(item.publishedAt)}</span>
          <span>精选于 {formatDate(insights.generatedAt)}</span>
          {item.metadata?.board ? <span>来自 {item.metadata.board}</span> : null}
        </div>
        <a className="source-action" href={item.url} target="_blank" rel="noreferrer">
          查看原始内容
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      </header>

      <div className="story-layout">
        <div className="story-content">
          <section className="story-reason">
            <span>为什么值得看</span>
            <p>{item.reason || "这条内容通过了 Horizon 的技术价值与时效性筛选。"}</p>
          </section>
          {usefulBlocks.map((block) => (
            <section className={`story-block ${block.primary ? "primary" : ""}`} key={block.id}>
              {!block.primary ? <h2>{block.title || blockLabel(block.id)}</h2> : null}
              <ContentText text={block.content} />
            </section>
          ))}
        </div>
        <aside className="story-aside">
          <section>
            <h2>内容标签</h2>
            <div className="detail-tags">
              {(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </section>
          <section>
            <h2>指标说明</h2>
            <dl>
              <div><dt>推荐分</dt><dd>{formatRecommendation(item.score)}</dd></div>
              <div><dt>平台热度</dt><dd>{formatScore(item.metadata?.engagement)}</dd></div>
            </dl>
            <p>推荐分来自内容质量判断；平台热度来自原榜单，两者不可直接比较。</p>
          </section>
          {item.citations?.length ? (
            <section>
              <h2>补充来源</h2>
              <ol className="citation-list">
                {item.citations.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function ContentText({ text }) {
  return String(text || "")
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>);
}

function MissingStory({ onBack }) {
  return (
    <section className="shell missing-story">
      <AlertTriangle size={28} aria-hidden="true" />
      <h1>这篇精选已经不在最近 7 天内</h1>
      <p>站点只保留最近 28 个版本的公开详情，你仍可以回到首页查看最新内容。</p>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        返回首页
      </button>
    </section>
  );
}

function SignalStrip({ signals = [] }) {
  return (
    <section className="signals" id="signals">
      <div className="section-heading">
        <Sparkles size={20} aria-hidden="true" />
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
        <Flame size={20} aria-hidden="true" />
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
              <span><ThumbsUp size={16} aria-hidden="true" />{Math.round(item.engagement || item.score || 0)}</span>
              <span><MessageCircle size={16} aria-hidden="true" />{item.evidence || "查看原始来源"}</span>
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
        <Sparkles size={18} aria-hidden="true" />
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

function profileLabel(profile) {
  return profile === "tech-blog" ? "技术长文" : "科技新闻";
}

function blockLabel(block) {
  return {
    summary: "内容摘要",
    background: "背景信息",
    impact: "具体影响",
    community_discussion: "社区讨论",
    solution: "技术方案",
    takeaway: "值得借鉴",
  }[block] || "深度解读";
}

function formatRecommendation(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(1) : "—";
}

function formatDate(value) {
  if (!value) return "尚未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatUpdateTime(sourceReport = {}) {
  const value = sourceReport.generatedAt;
  if (!value) return sourceReport.date || "今日";
  return formatDate(value);
}

function formatScore(value) {
  const score = Number(value || 0);
  if (score >= 100000000) return `${(score / 100000000).toFixed(1)}亿`;
  if (score >= 10000) return `${(score / 10000).toFixed(1)}万`;
  return Number.isInteger(score) ? score : score.toFixed(1);
}

createRoot(document.getElementById("root")).render(<App />);
