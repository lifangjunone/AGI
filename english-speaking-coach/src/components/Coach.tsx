import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Flag,
  LoaderCircle,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2
} from "lucide-react";
import { useSpeechRecorder } from "../hooks/useSpeechRecorder";
import { continueRoleplay, finishRoleplay } from "../lib/api";
import { speakText } from "../lib/speech";
import { getLanguage } from "../data/languages";
import type {
  CoachFeedback,
  CoachMessage,
  LearnerProfile,
  WeekPlan
} from "../types";

interface Props {
  profile: LearnerProfile;
  week: WeekPlan;
  onComplete: (
    feedback: CoachFeedback,
    speakingSeconds: number,
    transcript: string,
    userConfirmed?: boolean
  ) => void;
}

export default function Coach({ profile, week, onComplete }: Props) {
  const initialMessage = useMemo<CoachMessage>(
    () => ({
      id: "opening",
      role: "coach",
      content:
        week.lesson?.dialogues[0]?.target ??
        getLanguage(profile.targetLanguage).sample
    }),
    [profile.targetLanguage, week.lesson]
  );
  const [messages, setMessages] = useState<CoachMessage[]>([initialMessage]);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<CoachFeedback>();
  const [speakingSeconds, setSpeakingSeconds] = useState(0);
  const [confirmEarlyFinish, setConfirmEarlyFinish] = useState(false);
  const recorder = useSpeechRecorder(profile.targetLanguage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const learnerTurns = messages.filter((message) => message.role === "learner").length;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  const sendAnswer = async (value: string) => {
    const content = value.trim();
    if (!content || sending) return;

    const learnerMessage: CoachMessage = {
      id: `learner-${Date.now()}`,
      role: "learner",
      content
    };
    const nextMessages = [...messages, learnerMessage];
    const accumulatedSeconds = speakingSeconds + recorder.seconds;
    setMessages(nextMessages);
    setTypedAnswer("");
    setSpeakingSeconds(accumulatedSeconds);
    recorder.reset();
    setSending(true);

    if (learnerTurns + 1 >= 10) {
      const result = await finishRoleplay({
        profile,
        scenario: week.theme,
        messages: nextMessages
      });
      setFeedback(result);
      setSending(false);
      const transcript = nextMessages
        .filter((message) => message.role === "learner")
        .map((message) => message.content)
        .join("\n");
      onComplete(result, accumulatedSeconds, transcript);
      return;
    }

    const result = await continueRoleplay({
      profile,
      scenario: week.theme,
      messages: nextMessages
    });
    const coachMessage: CoachMessage = {
      id: `coach-${Date.now()}`,
      role: "coach",
      content: result.message
    };
    setMessages([...nextMessages, coachMessage]);
    setSending(false);
    void speakText(result.message, profile.accent, profile.targetLanguage);
  };

  const resetConversation = () => {
    setMessages([initialMessage]);
    setFeedback(undefined);
    setTypedAnswer("");
    setSpeakingSeconds(0);
    recorder.reset();
  };

  const finishEarly = async () => {
    if (learnerTurns === 0 || sending) return;
    setSending(true);
    const result = await finishRoleplay({
      profile,
      scenario: week.theme,
      messages
    });
    const transcript = messages
      .filter((message) => message.role === "learner")
      .map((message) => message.content)
      .join("\n");
    setFeedback(result);
    setConfirmEarlyFinish(false);
    setSending(false);
    onComplete(result, speakingSeconds, transcript, true);
  };

  return (
    <div className="page coach-page">
      <header className="top-header coach-top">
        <div>
          <span className="eyebrow">AI ROLEPLAY · {learnerTurns}/10</span>
          <h1>{week.theme}</h1>
        </div>
        <div className="coach-header-actions">
          {learnerTurns > 0 && learnerTurns < 10 && !feedback && (
            <button
              className="icon-button"
              onClick={() => setConfirmEarlyFinish(true)}
              aria-label="提前结束对话"
              title="提前结束"
            >
              <Flag size={19} />
            </button>
          )}
          <button
            className="icon-button"
            onClick={resetConversation}
            aria-label="重新开始"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      {!feedback ? (
        <>
          <div className="conversation" ref={scrollRef}>
            <div className="scenario-note">
              <Sparkles size={17} />
              对话中不纠错。建议完成十轮；状态不好时可确认提前结束。
            </div>
            {messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                {message.role === "coach" && <span className="coach-avatar">E</span>}
                <div className="message-bubble">
                  <p>{message.content}</p>
                  {message.role === "coach" && (
                    <button
                      onClick={() =>
                        void speakText(
                          message.content,
                          profile.accent,
                          profile.targetLanguage
                        )
                      }
                      aria-label="朗读"
                    >
                      <Volume2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="message-row coach">
                <span className="coach-avatar">E</span>
                <div className="message-bubble typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>

          <div className="coach-composer">
            {confirmEarlyFinish && (
              <section className="coach-exit-confirm">
                <AlertCircle size={20} />
                <div>
                  <strong>确认提前结束？</strong>
                  <p>
                    已完成 {learnerTurns}/10 轮。现在结束也会通过，本次记录会标记为用户确认。
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-button"
                    onClick={() => setConfirmEarlyFinish(false)}
                  >
                    继续对话
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void finishEarly()}
                    disabled={sending}
                  >
                    确认结束
                  </button>
                </div>
              </section>
            )}
            {recorder.audioBlob && (
              <label className="voice-transcript">
                <span>
                  {recorder.isTranscribing
                    ? "本地模型正在转写..."
                    : recorder.transcriptionSource === "local"
                      ? "确认本地模型转写"
                      : "确认你的回答"}
                </span>
                <textarea
                  value={recorder.transcript}
                  onChange={(event) => recorder.setTranscript(event.target.value)}
                  placeholder="自动转写不可用时，可手动输入"
                />
                <button
                  onClick={() => sendAnswer(recorder.transcript)}
                  disabled={
                    recorder.isTranscribing || !recorder.transcript.trim()
                  }
                >
                  {recorder.isTranscribing ? "转写中..." : "发送这段回答"}{" "}
                  <Send size={16} />
                </button>
              </label>
            )}
            {!recorder.audioBlob && (
              <div className="composer-row">
                <button
                  className={`voice-button ${recorder.isRecording ? "active" : ""}`}
                  onClick={recorder.isRecording ? recorder.stop : recorder.start}
                  aria-label={recorder.isRecording ? "停止录音" : "开始录音"}
                >
                  {recorder.isRecording ? (
                    <Square size={18} fill="currentColor" />
                  ) : (
                    <Mic size={21} />
                  )}
                </button>
                <input
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void sendAnswer(typedAnswer);
                  }}
                  placeholder={recorder.isRecording ? `正在录音 ${recorder.seconds}s` : "说或输入你的回答"}
                />
                <button
                  className="send-button"
                  onClick={() => sendAnswer(typedAnswer)}
                  disabled={!typedAnswer.trim() || sending}
                >
                  {sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <section className="roleplay-result">
          <div className="success-seal">
            <Check size={28} />
          </div>
          <span className="eyebrow">
            {learnerTurns >= 10 ? "10轮对话已完成" : `${learnerTurns}轮后主动结束`}
          </span>
          <h2>你没有躲开这次真实表达</h2>
          <p>{feedback.summary}</p>
          <div className="score-grid">
            {[
              ["听懂", feedback.intelligibility],
              ["流利", feedback.fluency],
              ["表达", feedback.expression],
              ["互动", feedback.interaction]
            ].map(([label, score]) => (
              <div key={label}>
                <strong>{score}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <article className="priority-fix">
            <span>下次只盯这一件事</span>
            <p>{feedback.priorityIssue}</p>
          </article>
          <button className="primary-button full" onClick={resetConversation}>
            <RotateCcw size={18} /> 再来一个十轮
          </button>
        </section>
      )}
    </div>
  );
}
