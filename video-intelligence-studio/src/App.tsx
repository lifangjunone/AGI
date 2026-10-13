import {
  AudioLines,
  BookOpenText,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Eye,
  Film,
  FolderOpen,
  GitBranch,
  Image,
  Layers3,
  Link2,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
  Zap,
} from "lucide-react";
import { ChangeEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NewProjectModal } from "./components/NewProjectModal";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { QueueCenter } from "./components/QueueCenter";
import { ResultViewer } from "./components/ResultViewer";
import {
  AnalysisResult,
  getAnalysis,
  TimelineMoment,
  uploadVideo,
} from "./lib/analysis";
import { Job, JobType, useJobQueue } from "./lib/jobs";
import { getProjects, ProjectSummary, saveProject } from "./lib/projects";

const KnowledgeGraph = lazy(() =>
  import("./components/KnowledgeGraph").then((module) => ({ default: module.KnowledgeGraph })));

type View = "understand" | "remix" | "fission" | "preroll" | "hooks";
type AnalysisState = "idle" | "running" | "done";
type InsightTab = "highlights" | "relations" | "story" | "audio";
type StoredSession = {
  fileName?: string;
  analysis?: AnalysisState;
  projectId?: string;
  projectName?: string;
  assetId?: string;
};

const FRAMES = [
  "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=cinematic%20film%20still%2C%20Asian%20woman%20at%20a%20rainy%20train%20station%20discovering%20a%20red%20envelope%2C%20close-up%2C%20realistic%20dramatic%20lighting%2C%20no%20text&image_size=landscape_16_9",
  "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=cinematic%20film%20still%2C%20two%20Asian%20siblings%20arguing%20under%20a%20train%20station%20clock%2C%20medium%20shot%2C%20rainy%20night%2C%20realistic%2C%20no%20text&image_size=landscape_16_9",
  "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=cinematic%20film%20still%2C%20elderly%20Asian%20man%20waiting%20alone%20on%20a%20train%20platform%2C%20warm%20backlight%2C%20emotional%2C%20realistic%2C%20no%20text&image_size=landscape_16_9",
];

const navItems: Array<{ id: View; label: string; note: string; icon: typeof Film }> = [
  { id: "understand", label: "视频理解", note: "故事与证据", icon: Search },
  { id: "remix", label: "视频二创", note: "重组与改写", icon: Scissors },
  { id: "fission", label: "视频裂变", note: "规模化变体", icon: GitBranch },
  { id: "preroll", label: "生成前贴", note: "丝滑压入正片", icon: Layers3 },
  { id: "hooks", label: "黄金钩子", note: "前 5 秒实验", icon: Zap },
];

const formatTime = (seconds: number) => {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${minute}:${second.toString().padStart(2, "0")}`;
};

function loadSession(): StoredSession {
  try {
    return JSON.parse(localStorage.getItem("narrative-lens-session") ?? "{}") as StoredSession;
  } catch {
    return {};
  }
}

function App() {
  const initialSession = useMemo(loadSession, []);
  const [view, setView] = useState<View>("understand");
  const [analysis, setAnalysis] = useState<AnalysisState>(initialSession.analysis ?? "idle");
  const [progress, setProgress] = useState(0);
  const [analysisJobId, setAnalysisJobId] = useState("");
  const [videoUrl, setVideoUrl] = useState(
    initialSession.assetId ? `/api/assets/${initialSession.assetId}/content` : "",
  );
  const [fileName, setFileName] = useState(initialSession.fileName ?? "尚未上传视频");
  const [assetId, setAssetId] = useState(initialSession.assetId ?? "");
  const [projectId, setProjectId] = useState<string>(
    initialSession.projectId ?? crypto.randomUUID(),
  );
  const [projectName, setProjectName] = useState(
    initialSession.projectName ?? "未命名视频项目",
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedMoment, setSelectedMoment] = useState<TimelineMoment>();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [hookStrength, setHookStrength] = useState(78);
  const [audience, setAudience] = useState("女频 · 25–40");
  const [selectedHook, setSelectedHook] = useState(0);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [resultJob, setResultJob] = useState<Job>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisStatusRef = useRef("");
  const { jobs, connected, enqueue, clearCompleted } = useJobQueue(
    projectId,
    assetId,
    fileName,
  );
  const analysisJob = jobs.find((job) => job.id === analysisJobId);
  const viewJobType: Record<View, JobType> = {
    understand: "analysis",
    remix: "remix",
    fission: "fission",
    preroll: "preroll",
    hooks: "hooks",
  };
  const latestResult = jobs.find(
    (job) => job.type === viewJobType[view] && job.status === "completed" && job.result,
  );
  const activeViewJob = jobs.find(
    (job) => job.type === viewJobType[view] && ["queued", "running"].includes(job.status),
  );

  const refreshProjects = async () => {
    setProjectsLoading(true);
    try {
      setProjects(await getProjects());
    } catch {
      setNotice("项目列表加载失败");
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    void saveProject(projectId, projectName).catch(() => undefined);
    void refreshProjects();
  }, [projectId, projectName]);

  useEffect(() => {
    let cancelled = false;
    setAnalysisResult(null);
    setSelectedMoment(undefined);
    void getAnalysis(projectId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setAnalysis("idle");
          return;
        }
        setAnalysisResult(result);
        setSelectedMoment(result.moments[0]);
        setAnalysis("done");
      })
      .catch(() => {
        if (!cancelled) setNotice("历史分析结果加载失败");
      });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    localStorage.setItem(
      "narrative-lens-session",
      JSON.stringify({ fileName, analysis, projectId, projectName, assetId }),
    );
  }, [analysis, assetId, fileName, projectId, projectName]);

  useEffect(() => {
    if (!analysisJob) return;
    setProgress(analysisJob.progress);
    if (["queued", "running"].includes(analysisJob.status)) setAnalysis("running");
    if (analysisJob.status === "completed") {
      setAnalysis("done");
      void getAnalysis(projectId).then((result) => {
        setAnalysisResult(result);
        setSelectedMoment(result?.moments[0]);
      });
    }
    if (analysisJob.status === "failed") setAnalysis("idle");
    if (analysisStatusRef.current !== analysisJob.status) {
      if (analysisJob.status === "completed") setNotice("视频理解与知识图谱已完成");
      if (analysisJob.status === "failed") setNotice(analysisJob.error ?? "理解失败，请查看任务详情");
      analysisStatusRef.current = analysisJob.status;
    }
  }, [analysisJob]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleMoments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const moments = analysisResult?.moments ?? [];
    if (!normalized) return moments;
    return moments.filter((moment) =>
      [moment.title, moment.emotion, moment.transcript, moment.evidence]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [analysisResult, query]);

  const hooks = useMemo(
    () => [
      {
        score: Math.min(99, hookStrength + 17),
        type: "信息差",
        text: "所有人都以为她卷走了父亲的救命钱，直到这段被藏了十年的录音突然响起。",
        beat: "指控 → 隐藏证据 → 真相将爆",
      },
      {
        score: Math.min(96, hookStrength + 12),
        type: "关系反转",
        text: "哥哥在车站拦住失踪十年的妹妹，却不知道她手里那封信能让全家彻底翻盘。",
        beat: "重逢 → 误判 → 底牌前置",
      },
      {
        score: Math.min(93, hookStrength + 8),
        type: "倒计时",
        text: "列车还有五分钟进站，女人必须在离开前证明：当年背叛这个家的人根本不是她。",
        beat: "时限 → 冤屈 → 证明任务",
      },
    ],
    [hookStrength],
  );

  const setVideoFile = async (file: File, targetProjectId = projectId) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const previewUrl = URL.createObjectURL(file);
    setVideoUrl(previewUrl);
    setFileName(file.name);
    setAssetId("");
    setAnalysis("idle");
    setAnalysisResult(null);
    setSelectedMoment(undefined);
    setAnalysisJobId("");
    setProgress(0);
    setCurrentTime(0);
    setUploading(true);
    setNotice("正在上传视频");
    try {
      const asset = await uploadVideo(targetProjectId, file);
      URL.revokeObjectURL(previewUrl);
      setVideoUrl(asset.url);
      setAssetId(asset.id);
      setFileName(asset.name);
      setNotice("视频已上传，可开始真实分析");
      if (projectListOpen) void refreshProjects();
    } catch (error) {
      setVideoUrl("");
      setFileName("尚未上传视频");
      setNotice(error instanceof Error ? error.message : "视频上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void setVideoFile(file);
  };

  const queueTask = async (
    type: JobType,
    title: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (!assetId) {
      setNotice(uploading ? "视频仍在上传，请稍候" : "请先为当前项目上传视频");
      return null;
    }
    try {
      const job = await enqueue({
        type,
        title,
        metadata: { ...metadata, projectName, assetId, assetName: fileName },
      });
      setNotice(`${title}已进入队列`);
      setQueueOpen(true);
      return job;
    } catch {
      setNotice("任务入队失败，请检查 API 服务");
      return null;
    }
  };

  const startAnalysis = async () => {
    const job = await queueTask("analysis", `理解 ${fileName}`);
    if (!job) return;
    setAnalysisJobId(job.id);
    analysisStatusRef.current = job.status;
    setProgress(job.progress);
    setAnalysis("running");
  };

  const createProject = async (name: string, file?: File) => {
    const nextProjectId = crypto.randomUUID();
    try {
      await saveProject(nextProjectId, name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "项目创建失败");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setProjectId(nextProjectId);
    setProjectName(name);
    setFileName("尚未上传视频");
    setAssetId("");
    setVideoUrl("");
    setView("understand");
    setAnalysis("idle");
    setAnalysisJobId("");
    setProgress(0);
    setCurrentTime(0);
    setSelectedMoment(undefined);
    setAnalysisResult(null);
    setQuery("");
    setNewProjectOpen(false);
    setProjectListOpen(false);
    setNotice(`项目「${name}」已创建`);
    if (file) void setVideoFile(file, nextProjectId);
  };

  const openProjectList = () => {
    setProjectListOpen(true);
    void refreshProjects();
  };

  const switchProject = (project: ProjectSummary) => {
    if (project.id === projectId) {
      setProjectListOpen(false);
      return;
    }
    if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setProjectId(project.id);
    setProjectName(project.name);
    setFileName(project.assetName || "尚未上传视频");
    setAssetId(project.assetId || "");
    setVideoUrl(project.assetId ? `/api/assets/${project.assetId}/content` : "");
    setView("understand");
    setAnalysis(project.hasAnalysis ? "done" : "idle");
    setAnalysisJobId("");
    setProgress(0);
    setCurrentTime(0);
    setSelectedMoment(undefined);
    setAnalysisResult(null);
    setQuery("");
    setProjectListOpen(false);
    setNotice(`已打开「${project.name}」`);
  };

  const seek = (moment: TimelineMoment) => {
    setSelectedMoment(moment);
    setCurrentTime(moment.start);
    if (videoRef.current) videoRef.current.currentTime = moment.start;
  };

  const togglePlay = () => {
    if (!videoRef.current) {
      setPlaying((value) => !value);
      return;
    }
    if (videoRef.current.paused) {
      void videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setNotice("已复制");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">叙</span>
          <div>
            <strong>叙镜</strong>
            <small>NARRATIVE LENS</small>
          </div>
        </div>

        <button className="project-library-trigger" onClick={openProjectList}>
          <FolderOpen size={17} />
          <span>
            <b>我的项目</b>
            <small>{projects.length > 0 ? `${projects.length} 个项目` : "查看全部项目"}</small>
          </span>
          <ChevronRight size={14} />
        </button>

        <button className="new-project" onClick={() => setNewProjectOpen(true)}>
          <Plus size={16} />
          新建视频项目
        </button>

        <nav aria-label="主要功能">
          <p className="nav-label">WORKBENCH</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${view === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>
                  <b>{item.label}</b>
                  <small>{item.note}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="engine-status">
            <span className="status-dot" />
            <span>
              <b>项目工作流在线</b>
              <small>任务按当前视频隔离</small>
            </span>
          </div>
          <button className="icon-button" title="收起侧栏" aria-label="收起侧栏">
            <PanelLeftClose size={18} />
          </button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <div className="breadcrumb">项目 / {projectName} / {fileName}</div>
            <h1>{navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="top-actions">
            <QueueCenter
              jobs={jobs}
              connected={connected}
              open={queueOpen}
              onOpen={() => setQueueOpen(true)}
              onClose={() => setQueueOpen(false)}
              onClear={() => void clearCompleted()}
              onViewResult={(job) => {
                setResultJob(job);
                setQueueOpen(false);
              }}
            />
            <label className="upload-button">
              <Upload size={16} />
              上传视频
              <input type="file" accept="video/*" onChange={handleUpload} />
            </label>
            <button className="icon-button" title="帮助" aria-label="帮助">
              <CircleHelp size={18} />
            </button>
            <span className="avatar">YL</span>
          </div>
        </header>

        <section className="active-asset-context">
          <div className="asset-identity">
            <span className="asset-icon"><Film size={17} /></span>
            <span>
              <small>当前项目</small>
              <b>{projectName}</b>
            </span>
            <i />
            <span>
              <small>当前视频 · 左侧所有功能共用</small>
              <b>{fileName}</b>
            </span>
          </div>
          <div className="asset-job-state">
            {activeViewJob && (
              <span className="asset-running">
                <LoaderCircle className="spin" size={14} />
                {activeViewJob.currentStage} · {activeViewJob.progress}%
              </span>
            )}
            {latestResult && !activeViewJob && (
              <button className="secondary-button" onClick={() => setResultJob(latestResult)}>
                <Eye size={15} />
                查看本视频最新结果
              </button>
            )}
            {fileName === "尚未上传视频" && <b className="asset-missing">等待上传视频</b>}
          </div>
        </section>

        <div className="workspace" key={view}>
          {view === "understand" && (
            <UnderstandingView
              analysis={analysis}
              analysisJob={analysisJob}
              analysisResult={analysisResult}
              currentTime={currentTime}
              fileName={fileName}
              playing={playing}
              progress={progress}
              projectId={projectId}
              query={query}
              selectedMoment={selectedMoment}
              uploading={uploading}
              videoRef={videoRef}
              videoUrl={videoUrl}
              visibleMoments={visibleMoments}
              onAnalyze={startAnalysis}
              onPlay={togglePlay}
              onQuery={setQuery}
              onSeek={seek}
              onTime={setCurrentTime}
            />
          )}
          {view !== "understand" && (
            <PendingModule
              label={navItems.find((item) => item.id === view)?.label ?? "生成模块"}
              hasAnalysis={Boolean(analysisResult)}
              fileName={fileName}
            />
          )}
        </div>
      </main>
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={createProject}
      />
      <ProjectSwitcher
        currentProjectId={projectId}
        loading={projectsLoading}
        open={projectListOpen}
        projects={projects}
        onClose={() => setProjectListOpen(false)}
        onCreate={() => {
          setProjectListOpen(false);
          setNewProjectOpen(true);
        }}
        onSelect={switchProject}
      />
      <ResultViewer job={resultJob} onClose={() => setResultJob(undefined)} />
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

function PendingModule({
  label,
  hasAnalysis,
  fileName,
}: {
  label: string;
  hasAnalysis: boolean;
  fileName: string;
}) {
  return (
    <section className="module-page pending-module">
      <span className="pending-icon"><Film size={24} /></span>
      <span className="eyebrow">REAL PIPELINE ONLY</span>
      <h2>{label}尚未接入真实生成服务</h2>
      <p>
        当前视频：{fileName}。{hasAnalysis
          ? "真实理解结果已就绪，但本模块不会用演示模板伪造输出。"
          : "请先完成真实视频理解；本模块不会展示与当前视频无关的示例结果。"}
      </p>
    </section>
  );
}

type UnderstandingProps = {
  analysis: AnalysisState;
  analysisJob?: Job;
  analysisResult: AnalysisResult | null;
  currentTime: number;
  fileName: string;
  playing: boolean;
  progress: number;
  projectId: string;
  query: string;
  selectedMoment?: TimelineMoment;
  uploading: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  visibleMoments: TimelineMoment[];
  onAnalyze: () => void;
  onPlay: () => void;
  onQuery: (value: string) => void;
  onSeek: (moment: TimelineMoment) => void;
  onTime: (value: number) => void;
};

function UnderstandingView(props: UnderstandingProps) {
  const [insightTab, setInsightTab] = useState<InsightTab>("highlights");
  const duration = props.analysisResult?.duration
    ?? props.videoRef.current?.duration
    ?? 0;
  const moments = props.analysisResult?.moments ?? [];
  const palette = ["#ec6a45", "#d24d36", "#217a70", "#cf9b42"];

  return (
    <>
      <section className="context-strip">
        <div>
          <span className="eyebrow">ACTIVE ASSET</span>
          <strong>{props.fileName}</strong>
          <span>
            {props.analysisResult
              ? `${formatTime(props.analysisResult.duration)} · ${props.analysisResult.language} · 真实模型结果`
              : "等待媒体探测与模型分析"}
          </span>
        </div>
        {props.uploading ? (
          <div className="analysis-progress">
            <LoaderCircle className="spin" size={16} />
            <span>上传原始视频<small>完成后才可提交真实分析</small></span>
          </div>
        ) : props.analysis === "running" ? (
          <div className="analysis-progress">
            <LoaderCircle className="spin" size={16} />
            <span>
              {props.analysisJob?.currentStage ?? "等待任务调度"}
              <small>
                已用 {formatTime(props.analysisJob?.elapsedSeconds ?? 0)}
                {" · "}
                预计剩余 {formatTime(props.analysisJob?.etaSeconds ?? 0)}
              </small>
            </span>
            <b>{props.progress}%</b>
            <i style={{ width: `${props.progress}%` }} />
          </div>
        ) : (
          <button
            className="primary-button"
            onClick={props.onAnalyze}
            disabled={props.fileName === "尚未上传视频"}
          >
            <Sparkles size={16} />
            {props.analysis === "done" ? "重新理解" : "开始深度理解"}
          </button>
        )}
      </section>

      <div className="understand-grid">
        <section className="viewer-column">
          <div className="video-stage">
            {props.videoUrl ? (
              <video
                ref={props.videoRef}
                src={props.videoUrl}
                onTimeUpdate={(event) => props.onTime(event.currentTarget.currentTime)}
                onEnded={() => props.onPlay()}
              />
            ) : (
              <div className="video-empty">
                <Upload size={28} />
                <b>尚未上传视频</b>
                <span>上传后将使用真实文件进行 ASR 与多模态分析</span>
              </div>
            )}
            <div className="safe-frame" />
            {props.videoUrl && <div className="video-badge">原始视频 · {formatTime(props.currentTime)}</div>}
            {props.videoUrl && <button className="play-button" onClick={props.onPlay} aria-label={props.playing ? "暂停" : "播放"}>
              {props.playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>}
            {props.selectedMoment?.transcript && (
              <div className="video-caption">{props.selectedMoment.transcript}</div>
            )}
          </div>
          <div className="transport">
            <button className="icon-button" onClick={props.onPlay} aria-label={props.playing ? "暂停" : "播放"}>
              {props.playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <b>{formatTime(props.currentTime)}</b>
            <div className="scrubber">
              {moments.map((moment, index) => (
                <button
                  key={moment.id}
                  className={moment.id === props.selectedMoment?.id ? "selected" : ""}
                  style={{
                    left: `${duration ? (moment.start / duration) * 100 : 0}%`,
                    width: `${duration ? ((moment.end - moment.start) / duration) * 100 : 0}%`,
                    background: palette[index % palette.length],
                  }}
                  onClick={() => props.onSeek(moment)}
                  title={moment.title}
                />
              ))}
              <i style={{ left: `${duration ? (props.currentTime / duration) * 100 : 0}%` }} />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </section>

        <section className="evidence-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">EVIDENCE GRAPH</span>
              <h2>理解结果</h2>
            </div>
            <div className="search-field">
              <Search size={15} />
              <input
                value={props.query}
                onChange={(event) => props.onQuery(event.target.value)}
                placeholder="搜人物、对白、情绪"
              />
            </div>
          </div>

          {props.analysisResult ? <div className="summary">
            <div className="summary-label">
              <BookOpenText size={17} />
              故事一句话
            </div>
            <p>{props.analysisResult.summary}</p>
            <div className="story-tags">
              {props.analysisResult.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div> : (
            <div className="analysis-empty">
              <Search size={22} />
              <b>{props.analysis === "running" ? "正在生成真实分析结果" : "等待真实分析"}</b>
              <span>结果完成前不会展示示例摘要、高光或图谱。</span>
            </div>
          )}

          {props.analysisResult && <div className="insight-tabs">
            {[
              ["highlights", "高光时刻", props.analysisResult.moments.length],
              ["relations", "语义网络", props.analysisResult.metrics[1]?.[1] ?? 0],
              ["story", "社区地图", props.analysisResult.metrics[3]?.[1] ?? 0],
              ["audio", "音频", props.analysisResult.audioEvidence.length],
            ].map(([id, label, count]) => (
              <button
                className={insightTab === id ? "active" : ""}
                key={id}
                onClick={() => setInsightTab(id as InsightTab)}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>}

          {props.analysisResult && insightTab === "highlights" && (
            <div className="moment-list">
              {props.visibleMoments.map((moment, index) => (
                <button
                  className={`moment-row ${moment.id === props.selectedMoment?.id ? "active" : ""}`}
                  key={moment.id}
                  onClick={() => props.onSeek(moment)}
                >
                  <span className="moment-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="moment-time">{formatTime(moment.start)}–{formatTime(moment.end)}</span>
                  <span className="moment-copy">
                    <b>{moment.title}</b>
                    <small>{moment.evidence}</small>
                  </span>
                  <span className="emotion">{moment.emotion}</span>
                  <span className="score">{moment.score}</span>
                </button>
              ))}
            </div>
          )}

          {props.analysisResult && insightTab === "relations" && (
            <Suspense fallback={<div className="graph-state"><LoaderCircle className="spin" size={22} /></div>}>
              <KnowledgeGraph
                projectId={props.projectId}
                mode="relations"
                refreshToken={`${props.analysisJob?.id}-${props.analysisJob?.status}`}
              />
            </Suspense>
          )}

          {props.analysisResult && insightTab === "story" && (
            <Suspense fallback={<div className="graph-state"><LoaderCircle className="spin" size={22} /></div>}>
              <KnowledgeGraph
                projectId={props.projectId}
                mode="story"
                refreshToken={`${props.analysisJob?.id}-${props.analysisJob?.status}`}
              />
            </Suspense>
          )}

          {props.analysisResult && insightTab === "audio" && (
            <div className="audio-insights">
              {props.analysisResult.audioEvidence.map((item, index) => (
                <button key={`${item.start}-${index}`} onClick={() => props.onTime(item.start)}>
                  <span>{formatTime(item.start)}–{formatTime(item.end)}</span>
                  <b>{item.type} · {item.speaker}</b>
                  <p>{item.text}</p>
                  <small>{item.confidence ? `置信度 ${item.confidence}%` : "SeedASR"}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function RemixView({
  onRun,
}: {
  onRun: (title: string, metadata?: Record<string, unknown>) => void;
}) {
  const [template, setTemplate] = useState(0);
  const templates = [
    { name: "冲突加速版", duration: "00:36", note: "删除铺垫，提前 11 秒进入指控", lift: "+24%" },
    { name: "情绪递进版", duration: "00:48", note: "保留雨夜重逢，强化误解到和解", lift: "+18%" },
    { name: "悬疑倒叙版", duration: "00:41", note: "录音先行，再回溯兄妹冲突", lift: "+31%" },
  ];
  return (
    <section className="module-page">
      <div className="module-intro">
        <div>
          <span className="eyebrow">REMIX WITH EVIDENCE</span>
          <h2>先选叙事目标，再动时间轴</h2>
          <p>每次删改都保留来源时间码，避免二创后人物动机断裂。</p>
        </div>
        <button
          className="primary-button"
          onClick={() => onRun(`生成粗剪 · ${templates[template].name}`, {
            strategy: templates[template].name,
            duration: templates[template].duration,
          })}
        >
          <WandSparkles size={16} />
          生成粗剪
        </button>
      </div>
      <div className="remix-layout">
        <div className="template-list">
          <span className="section-kicker">叙事策略</span>
          {templates.map((item, index) => (
            <button
              className={`template-row ${template === index ? "active" : ""}`}
              key={item.name}
              onClick={() => setTemplate(index)}
            >
              <span className="radio">{template === index && <i />}</span>
              <span>
                <b>{item.name}</b>
                <small>{item.note}</small>
              </span>
              <span>
                <b>{item.duration}</b>
                <small className="positive">预测留存 {item.lift}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="edit-timeline">
          <div className="timeline-head">
            <span>自动粗剪 · {templates[template].name}</span>
            <span>磁吸到对白边界</span>
          </div>
          {[
            { label: "画面", icon: Film, blocks: ["重逢", "指控", "录音反转", "和解"] },
            { label: "对白", icon: AudioLines, blocks: ["为什么回来", "她拿走了钱", "别怪你妹妹", "信给你"] },
            { label: "字幕", icon: MessageSquareText, blocks: ["黄金开场", "冲突加粗", "真相高亮", "结尾 CTA"] },
          ].map((track) => {
            const Icon = track.icon;
            return (
              <div className="track" key={track.label}>
                <div className="track-label"><Icon size={15} />{track.label}</div>
                <div className="track-content">
                  {track.blocks.map((block, index) => <span key={block} className={`block b${index}`}>{block}</span>)}
                </div>
              </div>
            );
          })}
          <div className="edit-ruler">
            <span>00:00</span><span>00:12</span><span>00:24</span><span>00:36</span><span>00:48</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FissionView({
  onRun,
}: {
  onRun: (title: string, metadata?: Record<string, unknown>) => void;
}) {
  const [formats, setFormats] = useState(["9:16", "1:1"]);
  const [count, setCount] = useState(12);
  const toggle = (format: string) =>
    setFormats((current) => current.includes(format) ? current.filter((item) => item !== format) : [...current, format]);
  return (
    <section className="module-page">
      <div className="module-intro">
        <div>
          <span className="eyebrow">CONTROLLED VARIATION</span>
          <h2>一条母版，裂变成可归因的实验矩阵</h2>
          <p>只改变钩子、节奏、画幅或字幕中的一个变量，结果才可比较。</p>
        </div>
        <button
          className="primary-button"
          onClick={() => onRun(`生成 ${count} 个裂变版本`, { count, formats })}
        >
          <GitBranch size={16} />
          创建 {count} 个任务
        </button>
      </div>
      <div className="fission-grid">
        <div className="controls-panel">
          <label>输出数量 <b>{count}</b></label>
          <input type="range" min="4" max="36" step="4" value={count} onChange={(event) => setCount(Number(event.target.value))} />
          <label>画幅</label>
          <div className="segment-control">
            {["9:16", "1:1", "16:9"].map((format) => (
              <button className={formats.includes(format) ? "active" : ""} key={format} onClick={() => toggle(format)}>
                {format}
              </button>
            ))}
          </div>
          <label>可变维度</label>
          {["黄金钩子", "前 5 秒镜头", "字幕视觉", "CTA 结尾"].map((item, index) => (
            <label className="check-row" key={item}>
              <input type="checkbox" defaultChecked={index < 3} />
              <span><Check size={13} /></span>
              {item}
            </label>
          ))}
        </div>
        <div className="matrix-panel">
          <div className="matrix-head">
            <span>变体预览</span>
            <span>控制变量</span>
            <span>留存预测</span>
          </div>
          {[
            ["A01", "信息差钩子 · 9:16", "钩子", "92"],
            ["A02", "倒计时钩子 · 9:16", "钩子", "88"],
            ["B01", "近景开场 · 1:1", "镜头", "86"],
            ["B02", "录音波形开场 · 1:1", "镜头", "91"],
            ["C01", "关键词逐字字幕 · 9:16", "字幕", "84"],
          ].map((row, index) => (
            <div className="matrix-row" key={row[0]}>
              <span className="variant-thumb"><img src={FRAMES[index % FRAMES.length]} alt="" /><b>{row[0]}</b></span>
              <span>{row[1]}</span>
              <span className="variable">{row[2]}</span>
              <span className="prediction">{row[3]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrerollView({
  onCopy,
  onRun,
}: {
  onCopy: (value: string) => void;
  onRun: (title: string, metadata?: Record<string, unknown>) => void;
}) {
  const [duration, setDuration] = useState("8s");
  const script =
    "所有人都以为女人卷走了父亲的救命钱，只有她知道那笔钱救了哥哥。十年后，女人带着唯一的录音回到车站，怎料哥哥当众撕碎车票，逼她立刻离开。就在录音即将被雨水浸透时，父亲的声音突然响起。";
  return (
    <section className="module-page">
      <div className="module-intro">
        <div>
          <span className="eyebrow">PRE-ROLL BUILDER</span>
          <h2>不是总结正片，而是为正片编一个入口</h2>
          <p>前贴独立成立，保留人物锚点，最后一拍精准压入原片冲突。</p>
        </div>
        <button
          className="primary-button"
          onClick={() => onRun(`生成 ${duration} 视频前贴`, { duration })}
        >
          <Sparkles size={16} />
          生成前贴
        </button>
      </div>
      <div className="preroll-layout">
        <div className="script-editor">
          <div className="editor-head">
            <span>前贴口播 · 112 字</span>
            <button className="icon-button" title="复制脚本" onClick={() => onCopy(script)}><Copy size={16} /></button>
          </div>
          <p>{script}</p>
          <div className="script-beats">
            <span><b>0–2s</b> 背叛误判</span>
            <span><b>2–5s</b> 十年录音底牌</span>
            <span><b>5–8s</b> 当众冲突</span>
            <span><b>入正片</b> 父亲原声响起</span>
          </div>
        </div>
        <div className="shot-board">
          <div className="board-head">
            <span>AI 分镜</span>
            <div className="segment-control compact">
              {["5s", "8s", "12s"].map((item) => <button className={duration === item ? "active" : ""} onClick={() => setDuration(item)} key={item}>{item}</button>)}
            </div>
          </div>
          <div className="shots">
            {FRAMES.map((frame, index) => (
              <div className="shot" key={frame}>
                <img src={frame} alt={`前贴分镜 ${index + 1}`} />
                <span>0{index + 1}</span>
                <p>{["信封落入雨水，极近景", "兄妹对峙，手持镜头", "录音响起，表情反转"][index]}</p>
              </div>
            ))}
          </div>
          <div className="continuity-check">
            <Check size={16} />
            <span><b>衔接检查通过</b> 人物、道具、雨夜场景与正片首镜一致</span>
          </div>
        </div>
      </div>
    </section>
  );
}

type HookViewProps = {
  audience: string;
  hookStrength: number;
  hooks: Array<{ score: number; type: string; text: string; beat: string }>;
  selectedHook: number;
  onAudience: (value: string) => void;
  onCopy: (value: string) => void;
  onRun: (title: string, metadata?: Record<string, unknown>) => void;
  onSelect: (value: number) => void;
  onStrength: (value: number) => void;
};

function HookView(props: HookViewProps) {
  return (
    <section className="module-page">
      <div className="module-intro">
        <div>
          <span className="eyebrow">GOLDEN FIVE SECONDS</span>
          <h2>先抢到注意力，再交付故事</h2>
          <p>钩子评分基于具体爆点、信息差、情绪站位和正片承接，不用空泛“震撼感”。</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => props.onRun("生成一组黄金钩子", {
            audience: props.audience,
            strength: props.hookStrength,
          })}
        >
          <RefreshCw size={16} />
          再生成一组
        </button>
      </div>
      <div className="hook-layout">
        <div className="hook-controls">
          <label>目标受众</label>
          <select value={props.audience} onChange={(event) => props.onAudience(event.target.value)}>
            <option>女频 · 25–40</option>
            <option>男频 · 18–35</option>
            <option>泛人群 · 18–45</option>
          </select>
          <label>钩子强度 <b>{props.hookStrength}</b></label>
          <input type="range" min="40" max="90" value={props.hookStrength} onChange={(event) => props.onStrength(Number(event.target.value))} />
          <div className="guardrail">
            <Link2 size={16} />
            <span><b>事实护栏开启</b> 主角身份与正片入口不可漂移</span>
          </div>
        </div>
        <div className="hook-results">
          {props.hooks.map((hook, index) => (
            <button
              className={`hook-result ${props.selectedHook === index ? "active" : ""}`}
              key={hook.text}
              onClick={() => props.onSelect(index)}
            >
              <span className="hook-rank">0{index + 1}</span>
              <span className="hook-content">
                <span className="hook-type">{hook.type}</span>
                <b>{hook.text}</b>
                <small>{hook.beat}</small>
              </span>
              <span className="hook-score"><b>{hook.score}</b><small>留存势能</small></span>
              <span
                className="copy-hook"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onCopy(hook.text);
                }}
              >
                <Copy size={15} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="hook-breakdown">
        <div><span>0–2 秒</span><b>误判落地</b><p>所有人都认定她卷走救命钱</p></div>
        <ChevronRight size={18} />
        <div><span>2–4 秒</span><b>底牌出现</b><p>藏了十年的父亲录音</p></div>
        <ChevronRight size={18} />
        <div><span>第 5 秒</span><b>悬念断点</b><p>录音即将公开，但不提前揭底</p></div>
      </div>
    </section>
  );
}

export default App;
