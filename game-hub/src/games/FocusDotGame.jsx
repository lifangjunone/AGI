import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { pickDifferentIndex } from "./gameLogic";

const DURATION_MS = 20_000;

export function FocusDotGame({ onScore }) {
  const [phase, setPhase] = useState("idle");
  const [target, setTarget] = useState(5);
  const [hits, setHits] = useState(0);
  const [remaining, setRemaining] = useState(DURATION_MS);
  const hitsRef = useRef(0);
  const intervalRef = useRef(null);
  const finishRef = useRef(null);
  const endsAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    window.clearInterval(intervalRef.current);
    window.clearTimeout(finishRef.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finish = useCallback(() => {
    clearTimers();
    setRemaining(0);
    setPhase("done");
    onScore(hitsRef.current);
  }, [clearTimers, onScore]);

  const start = () => {
    clearTimers();
    hitsRef.current = 0;
    setHits(0);
    setTarget(pickDifferentIndex(target, 16));
    setRemaining(DURATION_MS);
    setPhase("playing");
    endsAtRef.current = performance.now() + DURATION_MS;

    intervalRef.current = window.setInterval(() => {
      setRemaining(Math.max(0, endsAtRef.current - performance.now()));
    }, 100);
    finishRef.current = window.setTimeout(finish, DURATION_MS);
  };

  const hitTarget = () => {
    if (phase !== "playing") return;
    hitsRef.current += 1;
    setHits(hitsRef.current);
    setTarget((current) => pickDifferentIndex(current, 16));
  };

  return (
    <div className="mini-game focus-game">
      <div className="mini-game-status">
        <span>命中 {hits}</span>
        <span>{(remaining / 1000).toFixed(1)} 秒</span>
      </div>

      <div className="game-message" aria-live="polite">
        <Crosshair aria-hidden="true" />
        <div>
          <strong>{phase === "done" ? `${hits} 次命中` : "盯住圆点"}</strong>
          <span>{phase === "playing" ? "它每次都会换位置" : "20 秒内尽可能多地点中目标"}</span>
        </div>
      </div>

      <div className={`focus-grid ${phase === "playing" ? "is-playing" : ""}`}>
        {Array.from({ length: 16 }, (_, cell) => (
          <div className="focus-cell" key={cell}>
            {cell === target && (
              <button
                type="button"
                className="focus-target"
                onClick={hitTarget}
                disabled={phase !== "playing"}
                aria-label="点击目标"
              >
                <i />
              </button>
            )}
          </div>
        ))}
      </div>

      {(phase === "idle" || phase === "done") && (
        <button className="primary-action" onClick={start}>
          {phase === "idle" ? <Crosshair /> : <RotateCcw />}
          {phase === "idle" ? "开始追踪" : "再玩一次"}
        </button>
      )}
    </div>
  );
}
