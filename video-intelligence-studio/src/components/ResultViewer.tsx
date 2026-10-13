import { CheckCircle2, FileOutput, Film, X } from "lucide-react";
import type { Job } from "../lib/jobs";

type ResultViewerProps = {
  job?: Job;
  onClose: () => void;
};

const typeLabel: Record<Job["type"], string> = {
  analysis: "视频理解",
  remix: "视频二创",
  fission: "视频裂变",
  preroll: "生成前贴",
  hooks: "黄金钩子",
};

export function ResultViewer({ job, onClose }: ResultViewerProps) {
  if (!job?.result) return null;

  const result = job.result as {
    title?: string;
    summary?: string;
    metrics?: Array<[string, string]>;
    outputs?: string[];
    sections?: string[];
  };
  const items = result.outputs ?? result.sections ?? [];

  return (
    <div className="result-layer">
      <button className="modal-scrim" onClick={onClose} aria-label="关闭结果" />
      <section className="result-viewer" aria-label="任务结果">
        <header>
          <div className="result-icon"><FileOutput size={21} /></div>
          <div>
            <span className="eyebrow">GENERATED RESULT</span>
            <h2>{result.title ?? job.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="result-context">
          <span><Film size={14} />输入视频</span>
          <b>{job.assetName}</b>
          <small>{typeLabel[job.type]} · 项目内结果</small>
        </div>

        <p className="result-summary">{result.summary}</p>

        <div className="result-metrics">
          {result.metrics?.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>

        <div className="result-outputs">
          <span className="section-kicker">结果内容</span>
          {items.map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item}</b>
              <CheckCircle2 size={16} />
            </div>
          ))}
        </div>

        <footer>
          <code>{job.id}</code>
          <button className="primary-button" onClick={onClose}>返回工作台</button>
        </footer>
      </section>
    </div>
  );
}
