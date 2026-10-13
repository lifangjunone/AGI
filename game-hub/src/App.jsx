import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Gamepad2,
  LockKeyhole,
  Play,
  Search,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { isBetterScore } from "./games/gameLogic";
import { games } from "./games/registry";

const categories = ["全部", ...new Set(games.map((game) => game.category))];
const availableGames = games.filter((game) => game.available);

function readStats() {
  try {
    return JSON.parse(localStorage.getItem("game-hub-stats")) ?? {};
  } catch {
    return {};
  }
}

function GameCard({ game, index, stats, onSelect }) {
  const Icon = game.icon;
  const best = stats[game.id]?.best;
  const hasBest = Number.isFinite(best);

  return (
    <article
      className={`game-card ${game.available ? "is-ready" : "is-locked"}`}
      style={{ "--game-color": game.color, "--game-accent": game.accent, "--delay": `${index * 55}ms` }}
    >
      <div className="card-visual">
        <span className="seat-number">{String(index + 1).padStart(2, "0")}</span>
        <Icon aria-hidden="true" />
        <span className="availability">
          {game.available ? "OPEN" : <LockKeyhole aria-label="即将开放" />}
        </span>
      </div>

      <div className="card-content">
        <div className="card-meta">
          <span>{game.category}</span>
          <span>{game.duration}</span>
        </div>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
      </div>

      <div className="card-action">
        {hasBest ? (
          <span><Trophy /> {game.formatScore(best)}</span>
        ) : (
          <span><UserRound /> {game.players}</span>
        )}
        <button
          type="button"
          onClick={() => onSelect(game)}
          disabled={!game.available}
          aria-label={game.available ? `开始${game.name}` : `${game.name}即将开放`}
        >
          {game.available ? <><Play /> 开始</> : "候场中"}
        </button>
      </div>
    </article>
  );
}

function SeatMap({ onSelect }) {
  return (
    <section className="seat-map" aria-label="游戏座位状态">
      <div className="panel-heading">
        <div>
          <span className="section-label">SEAT MAP</span>
          <h2>今日座位</h2>
        </div>
        <span className="occupancy"><i /> {availableGames.length} / {games.length} 开放</span>
      </div>

      <div className="seat-grid">
        {games.map((game, index) => {
          const Icon = game.icon;
          return (
            <button
              key={game.id}
              className={game.available ? "seat is-open" : "seat"}
              style={{ "--seat-color": game.color }}
              type="button"
              disabled={!game.available}
              onClick={() => onSelect(game)}
              aria-label={game.available ? `进入${game.name}` : `${game.name}尚未开放`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <small>{game.name}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GameStage({ game, onClose, onScore }) {
  const Game = game.component;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="stage"
      style={{ "--stage-color": game.accent, "--stage-accent": game.color }}
    >
      <header className="stage-header">
        <button className="icon-button" onClick={onClose} aria-label="返回游戏厅" title="返回游戏厅">
          <ArrowLeft />
        </button>
        <div>
          <span>{game.category} · {game.duration}</span>
          <h1>{game.name}</h1>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭">
          <X />
        </button>
      </header>
      <main className="stage-body">
        <Game onScore={(score) => onScore(game, score)} />
      </main>
    </div>
  );
}

export function App() {
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [activeGame, setActiveGame] = useState(null);
  const [stats, setStats] = useState(readStats);

  const featuredGame = games.find((game) => game.available);
  const FeaturedIcon = featuredGame.icon;
  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return games.filter((game) => {
      const matchesCategory = category === "全部" || game.category === category;
      const matchesQuery = !normalizedQuery
        || `${game.name}${game.description}${game.category}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const saveScore = (game, score) => {
    setStats((current) => {
      const previous = current[game.id]?.best;
      const next = {
        ...current,
        [game.id]: {
          best: isBetterScore(game.scoreMode, previous, score) ? score : previous,
          lastPlayedAt: new Date().toISOString(),
        },
      };
      localStorage.setItem("game-hub-stats", JSON.stringify(next));
      return next;
    });
  };

  if (activeGame) {
    return <GameStage game={activeGame} onClose={() => setActiveGame(null)} onScore={saveScore} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="坐坐游戏厅首页">
          <span><Gamepad2 /></span>
          <strong>坐坐</strong>
          <small>GAME ROOM</small>
        </a>
        <div className="topbar-status">
          <span><i /> 游戏厅营业中</span>
          <span>DAY 001</span>
        </div>
      </header>

      <main className="main-content">
        <div className="welcome-row">
          <div>
            <p><Sparkles /> 每日新游戏</p>
            <h1>今天玩什么？</h1>
          </div>
          <p>选个座位，随时开一局。</p>
        </div>

        <div className="dashboard">
          <section
            className="featured-game"
            style={{ "--featured-color": featuredGame.color, "--featured-accent": featuredGame.accent }}
          >
            <div className="featured-copy">
              <div className="featured-badge">今日开放 · 01 号座</div>
              <h2>{featuredGame.name}</h2>
              <p>{featuredGame.description}</p>
              <div className="featured-meta">
                <span><Clock3 /> {featuredGame.duration}</span>
                <span><UserRound /> {featuredGame.players}</span>
                {Number.isFinite(stats[featuredGame.id]?.best) && (
                  <span><Trophy /> 最佳 {featuredGame.formatScore(stats[featuredGame.id].best)}</span>
                )}
              </div>
              <button className="play-button" onClick={() => setActiveGame(featuredGame)}>
                <Play /> 立即开玩 <ChevronRight />
              </button>
            </div>
            <div className="featured-art" aria-hidden="true">
              <span>READY?</span>
              <FeaturedIcon />
              <b>01</b>
            </div>
          </section>

          <SeatMap onSelect={setActiveGame} />
        </div>

        <section className="library" aria-label="全部游戏">
          <div className="library-header">
            <div>
              <span className="section-label">ALL GAMES</span>
              <h2>全部游戏</h2>
            </div>
            <label className="search-box">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索游戏"
                aria-label="搜索游戏"
              />
            </label>
          </div>

          <div className="category-tabs" role="tablist" aria-label="游戏分类">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "is-active" : ""}
                onClick={() => setCategory(item)}
                role="tab"
                aria-selected={category === item}
              >
                {item}
              </button>
            ))}
          </div>

          {filteredGames.length ? (
            <div className="game-grid">
              {filteredGames.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  index={index}
                  stats={stats}
                  onSelect={setActiveGame}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search />
              <strong>没有找到这个游戏</strong>
              <button onClick={() => { setQuery(""); setCategory("全部"); }}>清空筛选</button>
            </div>
          )}
        </section>
      </main>

      <footer>
        <span>坐坐游戏厅</span>
        <span>下一个座位，明天见</span>
      </footer>
    </div>
  );
}
