import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Eye,
  ListTodo,
  LoaderCircle,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Job, JobStatus } from "../lib/jobs";

type QueueCenterProps = {
  jobs: Job[];
  connected: boolean;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onClear: () => void;
  onViewResult: (job: Job) => void;
};

const statusLabel: Record<JobStatus, string> = {
  queued: "排队中",
  running: "处理中",
  completed: "已完成",
  failed: "失败",
};

const typeLabel: Record<Job["type"], string> = {
  analysis: "视频理解",
  remix: "视频二创",
  fission: "视频裂变",
  preroll: "生成前贴",
  hooks: "黄金钩子",
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "running") return <LoaderCircle className="spin" size={16} />;
  if (status === "completed") return <CheckCircle2 size={16} />;
  if (status === "failed") return <XCircle size={16} />;
  return <CircleDashed size={16} />;
}

export function QueueCenter(props: QueueCenterProps) {
  const activeJobs = props.jobs.filter((job) => ["queued", "running"].includes(job.status));
  const preferredJobId = activeJobs[0]?.id ?? props.jobs[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (props.open && preferredJobId) {
      setSelectedId(preferredJobId);
      return;
    }
    if (!selectedId && props.jobs[0]) setSelectedId(props.jobs[0].id);
    if (selectedId && !props.jobs.some((job) => job.id === selectedId)) {
      setSelectedId(props.jobs[0]?.id ?? "");
    }
  }, [preferredJobId, props.jobs, props.open, selectedId]);

  const selected = useMemo(
    () => props.jobs.find((job) => job.id === selectedId) ?? props.jobs[0],
    [props.jobs, selectedId],
  );

  return (
    <>
      <button
        className={`queue-trigger ${activeJobs.length ? "has-active" : ""}`}
        onClick={props.onOpen}
        aria-label="打开任务中心"
      >
        <ListTodo size={17} />
        <span>任务</span>
        <b>{activeJobs.length}</b>
      </button>

      {props.open && (
        <>
          <button className="drawer-scrim" onClick={props.onClose} aria-label="关闭任务中心" />
          <aside className="queue-drawer" aria-label="任务中心">
            <header className="queue-head">
              <div>
                <span className="eyebrow">PROCESS QUEUE</span>
                <h2>任务中心</h2>
              </div>
              <button className="icon-button" onClick={props.onClose} aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <div className="queue-health">
              <span className={`status-dot ${props.connected ? "" : "offline"}`} />
              <span>
                <b>{props.connected ? "调度服务在线" : "调度服务离线"}</b>
                <small>单并发执行 · {activeJobs.length} 个待处理</small>
              </span>
              {props.jobs.some((job) => ["completed", "failed"].includes(job.status)) && (
                <button className="icon-button" onClick={props.onClear} title="清理已完成任务">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="queue-body">
              <div className="queue-list">
                {props.jobs.length === 0 && (
                  <div className="queue-empty">
                    <ListTodo size={24} />
                    <b>暂无任务</b>
                    <span>理解、二创和生成任务会在这里排队。</span>
                  </div>
                )}
                {props.jobs.map((job) => (
                  <button
                    key={job.id}
                    className={`queue-row ${job.status} ${selected?.id === job.id ? "active" : ""}`}
                    onClick={() => setSelectedId(job.id)}
                  >
                    <span className="queue-status-icon"><StatusIcon status={job.status} /></span>
                    <span className="queue-row-copy">
                      <span>
                        <small>{typeLabel[job.type]}</small>
                        <em>{statusLabel[job.status]}</em>
                      </span>
                      <b>{job.title}</b>
                      <span className="queue-mini-progress">
                        <i style={{ width: `${job.progress}%` }} />
                      </span>
                      <small>{job.currentStage}</small>
                    </span>
                    <span className="queue-percent">{job.progress}%</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>

              {selected && (
                <section className="job-detail">
                  <div className="job-detail-title">
                    <span className={`job-state ${selected.status}`}>
                      <StatusIcon status={selected.status} />
                      {statusLabel[selected.status]}
                    </span>
                    <h3>{selected.title}</h3>
                    <p>{selected.currentStage}</p>
                  </div>

                  <div className="job-progress">
                    <div><span>总体进度</span><b>{selected.progress}%</b></div>
                    <span><i style={{ width: `${selected.progress}%` }} /></span>
                  </div>

                  <div className="job-time-grid">
                    <div>
                      <Clock3 size={15} />
                      <span>已耗时<small>{formatDuration(selected.elapsedSeconds)}</small></span>
                    </div>
                    <div>
                      <Clock3 size={15} />
                      <span>预计剩余<small>{selected.status === "completed" ? "已完成" : formatDuration(selected.etaSeconds)}</small></span>
                    </div>
                  </div>

                  <div className="job-stages">
                    {selected.stages.map((stage, index) => {
                      const stageProgress = (index + 1) / selected.stages.length * 100;
                      const done = selected.progress >= stageProgress || selected.status === "completed";
                      const active = !done && selected.currentStage === stage;
                      return (
                        <div className={`${done ? "done" : ""} ${active ? "active" : ""}`} key={stage}>
                          <span>{done ? <CheckCircle2 size={15} /> : active ? <LoaderCircle className="spin" size={15} /> : index + 1}</span>
                          <b>{stage}</b>
                        </div>
                      );
                    })}
                  </div>

                  {selected.error && <p className="job-error">{selected.error}</p>}
                  {selected.status === "completed" && selected.result && (
                    <button
                      className="primary-button job-result-button"
                      onClick={() => props.onViewResult(selected)}
                    >
                      <Eye size={16} />
                      查看结果
                    </button>
                  )}
                  <code>{selected.id}</code>
                </section>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
