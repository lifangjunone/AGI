import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Zap } from "lucide-react";

const ROUNDS = 5;

export function ReactionGame({ onScore }) {
  const [phase, setPhase] = useState("idle");
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState([]);
  const timeoutRef = useRef(null);
  const startedAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const armRound = useCallback((nextRound) => {
    clearTimer();
    setRound(nextRound);
    setPhase("waiting");
    timeoutRef.current = window.setTimeout(() => {
      startedAtRef.current = performance.now();
      setPhase("ready");
    }, 900 + Math.random() * 2200);
  }, [clearTimer]);

  const start = () => {
    setTimes([]);
    armRound(1);
  };

  const handlePress = () => {
    if (phase === "waiting") {
      clearTimer();
      setPhase("early");
      return;
    }

    if (phase !== "ready") return;

    const reaction = Math.round(performance.now() - startedAtRef.current);
    const nextTimes = [...times, reaction];
    setTimes(nextTimes);

    if (round === ROUNDS) {
      const average = Math.round(nextTimes.reduce((sum, time) => sum + time, 0) / ROUNDS);
      setPhase("done");
      onScore(average);
      return;
    }

    setPhase("between");
    timeoutRef.current = window.setTimeout(() => armRound(round + 1), 700);
  };

  const average = times.length
    ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
    : null;

  const labels = {
    idle: ["准备好了吗？", "看到绿色立刻点击"],
    waiting: ["稳住，别抢跑", `第 ${round} / ${ROUNDS} 轮`],
    ready: ["现在！", "点击屏幕"],
    early: ["抢跑了", "这轮不算，再试一次"],
    between: [`${times.at(-1)} ms`, "不错，下一轮要来了"],
    done: [`${average} ms`, average < 250 ? "反应快得离谱" : "再来一次，还能更快"],
  };

  const [headline, helper] = labels[phase];

  return (
    <div className="reaction-game">
      <div className="reaction-stats" aria-label="本局进度">
        <span>轮次 {Math.min(round, ROUNDS)}/{ROUNDS}</span>
        <span>平均 {average ? `${average} ms` : "--"}</span>
      </div>

      <button
        className={`reaction-pad reaction-pad--${phase}`}
        onClick={handlePress}
        disabled={phase === "idle" || phase === "done" || phase === "between"}
      >
        <Zap aria-hidden="true" />
        <strong>{headline}</strong>
        <span>{helper}</span>
      </button>

      {(phase === "idle" || phase === "done") && (
        <button className="primary-action" onClick={start}>
          {phase === "done" ? <RotateCcw aria-hidden="true" /> : <Zap aria-hidden="true" />}
          {phase === "done" ? "再玩一局" : "开始挑战"}
        </button>
      )}

      {phase === "early" && (
        <button className="primary-action" onClick={() => armRound(round)}>
          <RotateCcw aria-hidden="true" />
          重试本轮
        </button>
      )}

      <div className="round-dots" aria-label="每轮成绩">
        {Array.from({ length: ROUNDS }, (_, index) => (
          <span key={index} className={times[index] ? "is-finished" : ""}>
            {times[index] ?? index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
