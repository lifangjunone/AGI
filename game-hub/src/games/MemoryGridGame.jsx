import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, RotateCcw } from "lucide-react";
import { createMemorySequence } from "./gameLogic";

const MAX_LEVEL = 5;

export function MemoryGridGame({ onScore }) {
  const [phase, setPhase] = useState("idle");
  const [level, setLevel] = useState(1);
  const [sequence, setSequence] = useState([]);
  const [activeCell, setActiveCell] = useState(null);
  const [inputIndex, setInputIndex] = useState(0);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showSequence = useCallback((nextLevel) => {
    clearTimers();
    const nextSequence = createMemorySequence(nextLevel + 2);
    setLevel(nextLevel);
    setSequence(nextSequence);
    setInputIndex(0);
    setPhase("showing");

    nextSequence.forEach((cell, index) => {
      timersRef.current.push(window.setTimeout(() => setActiveCell(cell), 350 + index * 650));
      timersRef.current.push(window.setTimeout(() => setActiveCell(null), 760 + index * 650));
    });

    timersRef.current.push(window.setTimeout(() => {
      setActiveCell(null);
      setPhase("input");
    }, 900 + nextSequence.length * 650));
  }, [clearTimers]);

  const handleCell = (cell) => {
    if (phase !== "input") return;

    if (cell !== sequence[inputIndex]) {
      setActiveCell(cell);
      setPhase("lost");
      onScore(level);
      return;
    }

    const nextInput = inputIndex + 1;
    setActiveCell(cell);
    timersRef.current.push(window.setTimeout(() => setActiveCell(null), 180));

    if (nextInput < sequence.length) {
      setInputIndex(nextInput);
      return;
    }

    if (level === MAX_LEVEL) {
      setPhase("won");
      onScore(MAX_LEVEL);
      return;
    }

    setPhase("success");
    timersRef.current.push(window.setTimeout(() => showSequence(level + 1), 750));
  };

  const labels = {
    idle: ["闪记方格", "看清亮起顺序，再完整复现"],
    showing: [`记住这 ${sequence.length} 步`, "现在不要点击"],
    input: ["轮到你了", `${inputIndex} / ${sequence.length}`],
    success: ["完全正确", "下一关即将开始"],
    lost: ["顺序错了", `你到达了第 ${level} 关`],
    won: ["全部通关", "五关记忆挑战完成"],
  };
  const [title, helper] = labels[phase];

  return (
    <div className="mini-game memory-game">
      <div className="mini-game-status">
        <span>关卡 {level}/{MAX_LEVEL}</span>
        <span>{phase === "input" ? `还剩 ${sequence.length - inputIndex} 步` : "3 × 3"}</span>
      </div>

      <div className="game-message" aria-live="polite">
        <Brain aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <span>{helper}</span>
        </div>
      </div>

      <div className={`memory-grid phase-${phase}`}>
        {Array.from({ length: 9 }, (_, cell) => (
          <button
            key={cell}
            type="button"
            className={activeCell === cell ? "is-active" : ""}
            onClick={() => handleCell(cell)}
            disabled={phase !== "input"}
            aria-label={`方格 ${cell + 1}`}
          />
        ))}
      </div>

      {(phase === "idle" || phase === "lost" || phase === "won") && (
        <button className="primary-action" onClick={() => showSequence(1)}>
          {phase === "idle" ? <Brain /> : <RotateCcw />}
          {phase === "idle" ? "开始记忆" : "重新挑战"}
        </button>
      )}
    </div>
  );
}
