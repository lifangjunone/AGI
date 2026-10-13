import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, RotateCcw } from "lucide-react";
import { createMathQuestion } from "./gameLogic";

const DURATION_MS = 30_000;

export function QuickMathGame({ onScore }) {
  const [phase, setPhase] = useState("idle");
  const [question, setQuestion] = useState(() => createMathQuestion());
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [remaining, setRemaining] = useState(DURATION_MS);
  const [feedback, setFeedback] = useState(null);
  const correctRef = useRef(0);
  const comboRef = useRef(0);
  const endsAtRef = useRef(0);
  const intervalRef = useRef(null);
  const finishRef = useRef(null);
  const feedbackRef = useRef(null);

  const clearTimers = useCallback(() => {
    window.clearInterval(intervalRef.current);
    window.clearTimeout(finishRef.current);
    window.clearTimeout(feedbackRef.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finish = useCallback(() => {
    clearTimers();
    setRemaining(0);
    setPhase("done");
    onScore(correctRef.current);
  }, [clearTimers, onScore]);

  const start = () => {
    clearTimers();
    correctRef.current = 0;
    comboRef.current = 0;
    setCorrect(0);
    setCombo(0);
    setRemaining(DURATION_MS);
    setFeedback(null);
    setQuestion(createMathQuestion());
    setPhase("playing");
    endsAtRef.current = performance.now() + DURATION_MS;

    intervalRef.current = window.setInterval(() => {
      setRemaining(Math.max(0, endsAtRef.current - performance.now()));
    }, 100);
    finishRef.current = window.setTimeout(finish, DURATION_MS);
  };

  const chooseAnswer = (answer) => {
    if (phase !== "playing") return;
    const isCorrect = answer === question.answer;

    if (isCorrect) {
      correctRef.current += 1;
      comboRef.current += 1;
      setCorrect(correctRef.current);
      setCombo(comboRef.current);
      setFeedback("correct");
    } else {
      comboRef.current = 0;
      setCombo(0);
      setFeedback("wrong");
    }

    setQuestion(createMathQuestion());
    window.clearTimeout(feedbackRef.current);
    feedbackRef.current = window.setTimeout(() => setFeedback(null), 220);
  };

  return (
    <div className="mini-game math-game">
      <div className="mini-game-status">
        <span>答对 {correct}</span>
        <span>连击 ×{combo}</span>
        <span>{Math.ceil(remaining / 1000)} 秒</span>
      </div>

      <div className="game-message" aria-live="polite">
        <Brain aria-hidden="true" />
        <div>
          <strong>{phase === "done" ? `${correct} 题正确` : "心算快跑"}</strong>
          <span>{phase === "playing" ? "选出正确答案，答错不扣分" : "30 秒，看看你能跑多远"}</span>
        </div>
      </div>

      <div className={`math-board feedback-${feedback ?? "none"}`}>
        <div className="math-question">
          {phase === "playing" ? question.prompt : "准备"}
          <span>= ?</span>
        </div>
        <div className="answer-grid">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseAnswer(option)}
              disabled={phase !== "playing"}
              aria-label={`答案 ${option}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {(phase === "idle" || phase === "done") && (
        <button className="primary-action" onClick={start}>
          {phase === "idle" ? <Brain /> : <RotateCcw />}
          {phase === "idle" ? "开始心算" : "再跑一次"}
        </button>
      )}
    </div>
  );
}
