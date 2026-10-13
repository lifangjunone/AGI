import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";

const TARGET_MS = 10_000;
const HIDE_AFTER_MS = 3_000;

export function TimeGuessGame({ onScore }) {
  const [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [delta, setDelta] = useState(null);
  const startedAtRef = useRef(0);
  const intervalRef = useRef(null);

  const clearTimer = useCallback(() => {
    window.clearInterval(intervalRef.current);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const start = () => {
    clearTimer();
    startedAtRef.current = performance.now();
    setElapsed(0);
    setDelta(null);
    setPhase("running");
    intervalRef.current = window.setInterval(() => {
      setElapsed(performance.now() - startedAtRef.current);
    }, 50);
  };

  const stop = () => {
    if (phase !== "running") return;
    clearTimer();
    const finalElapsed = performance.now() - startedAtRef.current;
    const finalDelta = Math.round(Math.abs(TARGET_MS - finalElapsed));
    setElapsed(finalElapsed);
    setDelta(finalDelta);
    setPhase("done");
    onScore(finalDelta);
  };

  const visibleTime = phase !== "running" || elapsed < HIDE_AFTER_MS;
  const resultText = delta === null
    ? "10.00"
    : `${elapsed < TARGET_MS ? "早" : "晚"} ${(delta / 1000).toFixed(2)} 秒`;

  return (
    <div className="mini-game time-game">
      <div className="mini-game-status">
        <span>目标 10.00 秒</span>
        <span>{phase === "done" ? `实际 ${(elapsed / 1000).toFixed(2)} 秒` : "误差越小越好"}</span>
      </div>

      <div className="game-message" aria-live="polite">
        <Clock3 aria-hidden="true" />
        <div>
          <strong>{phase === "done" ? resultText : "十秒直觉"}</strong>
          <span>{phase === "running" ? "数字隐藏后，凭感觉按停" : "前三秒可见，之后只能相信自己"}</span>
        </div>
      </div>

      <button
        type="button"
        className={`time-dial phase-${phase}`}
        onClick={phase === "running" ? stop : start}
        aria-label={phase === "running" ? "停止计时" : "开始十秒挑战"}
      >
        <Clock3 aria-hidden="true" />
        <strong>{visibleTime ? `${(elapsed / 1000).toFixed(2)}` : "•••"}</strong>
        <span>{phase === "running" ? "点击停止" : phase === "done" ? resultText : "点击开始"}</span>
      </button>

      {phase === "done" && (
        <button className="primary-action" onClick={start}>
          <RotateCcw />
          再猜一次
        </button>
      )}
    </div>
  );
}
