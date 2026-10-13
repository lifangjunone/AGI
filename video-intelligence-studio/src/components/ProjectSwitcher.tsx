import {
  CheckCircle2,
  Clock3,
  Film,
  FolderOpen,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectSummary } from "../lib/projects";

type ProjectSwitcherProps = {
  currentProjectId: string;
  loading: boolean;
  open: boolean;
  projects: ProjectSummary[];
  onClose: () => void;
  onCreate: () => void;
  onSelect: (project: ProjectSummary) => void;
};

function formatUpdatedAt(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
  const [query, setQuery] = useState("");
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return props.projects;
    return props.projects.filter((project) =>
      `${project.name} ${project.assetName}`.toLocaleLowerCase().includes(normalized));
  }, [props.projects, query]);

  if (!props.open) return null;

  return (
    <div className="modal-layer project-list-layer" role="presentation">
      <button className="modal-scrim" onClick={props.onClose} aria-label="关闭项目列表" />
      <section className="project-list-dialog" role="dialog" aria-modal="true" aria-label="我的项目">
        <header>
          <div>
            <span className="eyebrow">PROJECT LIBRARY</span>
            <h2>我的项目</h2>
          </div>
          <div className="project-list-actions">
            <button className="primary-button" onClick={props.onCreate}>
              <Plus size={15} />
              新建项目
            </button>
            <button className="icon-button" onClick={props.onClose} aria-label="关闭">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="project-list-tools">
          <label>
            <Search size={15} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目或视频"
            />
          </label>
          <span>{props.projects.length} 个项目</span>
        </div>

        <div className="project-list-body">
          {props.loading && (
            <div className="project-list-state">
              <LoaderCircle className="spin" size={21} />
              正在读取项目
            </div>
          )}

          {!props.loading && visibleProjects.length === 0 && (
            <div className="project-list-state">
              <FolderOpen size={24} />
              <b>{query ? "没有匹配的项目" : "还没有项目"}</b>
            </div>
          )}

          {!props.loading && visibleProjects.map((project, index) => {
            const active = project.id === props.currentProjectId;
            return (
              <button
                className={`project-list-item ${active ? "active" : ""}`}
                key={project.id}
                onClick={() => props.onSelect(project)}
              >
                <span className="project-list-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="project-list-main">
                  <b>{project.name}</b>
                  <small>
                    <Film size={12} />
                    {project.assetName || "尚未上传视频"}
                  </small>
                </span>
                <span className="project-list-meta">
                  <span>
                    {project.activeJobStatus
                      ? <><LoaderCircle className="spin" size={12} />处理中</>
                      : project.hasAnalysis
                        ? <><CheckCircle2 size={12} />理解完成</>
                        : <><Clock3 size={12} />待处理</>}
                  </span>
                  <small>{formatUpdatedAt(project.updatedAt)}</small>
                </span>
                <span className="project-list-open">
                  {active ? "当前项目" : "打开"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
