import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  Flame,
  Mic2,
  RotateCcw,
  TrendingUp
} from "lucide-react";
import AudioPlayButton from "./AudioPlayButton";
import { isNativeApp } from "../lib/nativeConnection";
import type {
  AppProgress,
  BaselineResult,
  LearnerProfile
} from "../types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Props {
  profile: LearnerProfile;
  baseline: BaselineResult;
  progress: AppProgress;
  onReset: () => void;
}

export default function ProgressView({
  profile,
  baseline,
  progress,
  onReset
}: Props) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    const listener = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);

  const latestScores = useMemo(() => {
    const records = progress.records.filter((record) => record.feedback);
    if (!records.length) return baseline.scores;
    const recent = records.slice(-5);
    const average = (key: keyof BaselineResult["scores"]) =>
      Number(
        (
          recent.reduce((sum, record) => sum + (record.feedback?.[key] ?? 0), 0) /
          recent.length
        ).toFixed(1)
      );
    return {
      intelligibility: average("intelligibility"),
      fluency: average("fluency"),
      expression: average("expression"),
      interaction: average("interaction")
    };
  }, [baseline.scores, progress.records]);

  const scoreRows = [
    ["可理解度", latestScores.intelligibility, baseline.scores.intelligibility],
    ["流利度", latestScores.fluency, baseline.scores.fluency],
    ["表达力", latestScores.expression, baseline.scores.expression],
    ["互动能力", latestScores.interaction, baseline.scores.interaction]
  ] as const;
  const baselineRecords = [
    {
      label: "自我介绍基线",
      transcript: baseline.selfIntroTranscript,
      audioId: baseline.selfIntroAudioId
    },
    {
      label: "经历描述基线",
      transcript: baseline.storyTranscript,
      audioId: baseline.storyAudioId
    }
  ];

  return (
    <div className="page progress-page">
      <header className="top-header">
        <div>
          <span className="eyebrow">YOUR PROGRESS</span>
          <h1>进步要看得见</h1>
        </div>
        <span className="profile-dot">{profile.name.slice(0, 1).toUpperCase()}</span>
      </header>

      <section className="metric-grid">
        <article>
          <Flame size={21} />
          <strong>{progress.streak}</strong>
          <span>连续学习</span>
        </article>
        <article>
          <Mic2 size={21} />
          <strong>{Math.round(progress.weeklySpeakingSeconds / 60)}</strong>
          <span>本周开口分钟</span>
        </article>
        <article>
          <CalendarDays size={21} />
          <strong>{progress.completedTaskIds.length}</strong>
          <span>完成任务</span>
        </article>
      </section>

      <section className="growth-card">
        <div className="section-title">
          <div>
            <span className="eyebrow">最近5次训练</span>
            <h2>四项能力变化</h2>
          </div>
          <TrendingUp size={22} />
        </div>
        <div className="score-bars">
          {scoreRows.map(([label, current, start]) => (
            <div className="score-row" key={label}>
              <div>
                <span>{label}</span>
                <small>
                  基线 {start} → 当前 {current}
                </small>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(current / 5) * 100}%` }} />
              </div>
              <strong>{current}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">YOUR STARTING POINT</span>
            <h2>回听最初的自己</h2>
          </div>
        </div>
        <div className="record-list">
          {baselineRecords.map((record) => (
            <article key={record.label}>
              <AudioPlayButton
                audioId={record.audioId}
                label={record.label}
              />
              <div>
                <strong>{record.label}</strong>
                <small>{record.transcript || "未保存转写"}</small>
              </div>
              <span className="record-tag">基线</span>
            </article>
          ))}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">RECORDS</span>
            <h2>最近的开口记录</h2>
          </div>
        </div>
        {progress.records.length ? (
          <div className="record-list">
            {progress.records
              .slice(-4)
              .reverse()
              .map((record) => (
                <article key={record.id}>
                  <AudioPlayButton
                    audioId={record.audioId}
                    label="训练录音"
                  />
                  <div>
                    <strong>{record.transcript || "录音练习"}</strong>
                    <small>
                      {new Date(record.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                      {record.durationSeconds} 秒
                    </small>
                  </div>
                  <span
                    className={
                      record.completionMode === "user-confirmed"
                        ? "record-tag confirmed"
                        : "record-score"
                    }
                  >
                    {record.completionMode === "user-confirmed"
                      ? "待补强"
                      : record.feedback?.fluency ?? "-"}
                  </span>
                </article>
              ))}
          </div>
        ) : (
          <div className="empty-state">完成第一段训练后，这里会出现能力变化。</div>
        )}
      </section>

      {!isNativeApp() && (
        <section className="install-card">
          <Download size={23} />
          <div>
            <strong>安装到手机桌面</strong>
            <p>
              {installPrompt
                ? "像普通 App 一样全屏打开，并保留离线基础界面。"
                : "iPhone 请点分享后选择“添加到主屏幕”；Android 使用浏览器安装菜单。"}
            </p>
          </div>
          {installPrompt && (
            <button
              onClick={async () => {
                await installPrompt.prompt();
                await installPrompt.userChoice;
                setInstallPrompt(undefined);
              }}
            >
              安装
            </button>
          )}
        </section>
      )}

      <section className="settings-section">
        {!showReset ? (
          <button className="danger-link" onClick={() => setShowReset(true)}>
            <RotateCcw size={16} /> 重新开始学习档案
          </button>
        ) : (
          <div className="reset-confirm">
            <p>这会删除本机上的计划、进度和录音。</p>
            <button onClick={() => setShowReset(false)}>取消</button>
            <button onClick={onReset}>确认删除</button>
          </div>
        )}
      </section>
    </div>
  );
}
