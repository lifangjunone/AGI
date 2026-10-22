import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Aperture, ArrowRight, Bell, Boxes, ChevronDown, ChevronLeft, ChevronRight,
  Check, CircleHelp, Clock3, Clapperboard, Copy, Cpu, Download, Eye, Film, FolderOpen, Grid2X2,
  Image as ImageIcon, Layers3, LayoutDashboard, Maximize2, Menu, Mic2, MoreHorizontal,
  Music2, Pause, Play, Plus, Radio, Redo2, Search, Send, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, Square, Star, Trash2, Undo2, Upload, Users, Video, Volume2, WandSparkles, X,
  Zap
} from "lucide-react";
import "./styles.css";

const CDN = "https://images.unsplash.com/";
const assets = [
  { id: 1, title: "雾中来信", author: "Yuan Studio", image: `${CDN}photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=86`, ratio: "16:9", likes: "2.4k", tag: "电影感" },
  { id: 2, title: "霓虹之后", author: "MONO", image: `${CDN}photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=86`, ratio: "9:16", likes: "1.8k", tag: "都市" },
  { id: 3, title: "玻璃海", author: "Mori", image: `${CDN}photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=86`, ratio: "16:9", likes: "3.1k", tag: "自然" },
  { id: 4, title: "明日档案", author: "404 Lab", image: `${CDN}photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=86`, ratio: "16:9", likes: "982", tag: "科幻" },
  { id: 5, title: "暮色列车", author: "Wave Film", image: `${CDN}photo-1473445361085-b9a07f55608b?auto=format&fit=crop&w=700&q=86`, ratio: "9:16", likes: "1.6k", tag: "旅行" },
  { id: 6, title: "白昼梦游", author: "Aster", image: `${CDN}photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=86`, ratio: "16:9", likes: "4.2k", tag: "奇幻" },
];

const presets = [
  { name: "电影运镜", sub: "低机位推进 · 景深变化", icon: Aperture, tone: "violet" },
  { name: "首尾帧", sub: "精准控制画面转场", icon: Layers3, tone: "cyan" },
  { name: "角色一致", sub: "人物多镜头稳定生成", icon: Users, tone: "orange" },
  { name: "商品广告", sub: "一键生成营销短片", icon: Boxes, tone: "pink" },
];

const modelTypes = [
  { id: "llm", name: "创意与脚本", icon: Sparkles, required: true, description: "提示词扩写、脚本、分镜和镜头语言", capabilities: ["文本生成", "结构化输出"], examples: "OpenAI / Claude / DeepSeek / 豆包" },
  { id: "image", name: "图像生成与编辑", icon: ImageIcon, required: true, description: "首尾帧、角色设定、参考图与局部重绘", capabilities: ["文生图", "图生图", "局部编辑"], examples: "FLUX / SDXL / 即梦 / GPT Image" },
  { id: "video", name: "视频生成", icon: Video, required: true, description: "文生视频、图生视频、续写与镜头控制", capabilities: ["文生视频", "图生视频", "首尾帧"], examples: "可灵 / Seedance / Veo / Runway" },
  { id: "tts", name: "语音合成", icon: Volume2, required: true, description: "旁白、角色对白、音色选择与声音克隆", capabilities: ["TTS", "多音色", "声音克隆"], examples: "ElevenLabs / 豆包语音 / CosyVoice" },
  { id: "stt", name: "语音识别", icon: Mic2, required: true, description: "自动字幕、说话人识别和时间轴对齐", capabilities: ["ASR", "时间戳", "说话人分离"], examples: "Whisper / 豆包 ASR / FunASR" },
  { id: "vision", name: "视觉理解", icon: Eye, required: false, description: "分析素材、抽取人物场景和自动生成描述", capabilities: ["图像理解", "视频理解", "OCR"], examples: "GPT-4.1 / Gemini / Qwen-VL" },
  { id: "avatar", name: "数字人与口型", icon: Users, required: false, description: "音频驱动人物、唇形同步和表情迁移", capabilities: ["口型同步", "数字人", "表情驱动"], examples: "HeyGen / MuseTalk / LivePortrait" },
  { id: "music", name: "音乐与音效", icon: Music2, required: false, description: "配乐、环境音、转场音效与节拍对齐", capabilities: ["文生音乐", "音效生成", "伴奏"], examples: "Suno / Udio / Stable Audio" },
  { id: "enhance", name: "画质增强", icon: Aperture, required: false, description: "超分、补帧、降噪、去闪烁与人脸修复", capabilities: ["超分辨率", "补帧", "修复"], examples: "Topaz / Real-ESRGAN / RIFE" },
  { id: "moderation", name: "安全审核", icon: ShieldCheck, required: false, description: "提示词、输入素材与生成结果的内容安全", capabilities: ["文本审核", "图像审核", "视频审核"], examples: "云厂商审核 / 自建分类器" },
];

function Logo() {
  return <div className="logo"><span className="logo-mark"><span /></span><b>FLOWFRAME</b><i>BETA</i></div>;
}

function Modal({ open, title, children, onClose, wide = false }) {
  if (!open) return null;
  return <div className="modal-mask" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><b>{title}</b></div><button aria-label="关闭" onClick={onClose}><X size={18}/></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

function Toast({ message }) {
  return <div className={`toast ${message ? "show" : ""}`} role="status"><Check size={15}/>{message}</div>;
}

function Preferences({ onClose, onToast }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      return { autoSave: true, notifications: true, quality: "1080p", ...JSON.parse(localStorage.getItem("flowframe.preferences") || "{}") };
    } catch {
      return { autoSave: true, notifications: true, quality: "1080p" };
    }
  });
  const save = () => {
    localStorage.setItem("flowframe.preferences", JSON.stringify(preferences));
    onClose();
    onToast("偏好设置已保存在当前浏览器");
  };
  return <div className="settings-list">
    <label>自动保存<input type="checkbox" checked={preferences.autoSave} onChange={event=>setPreferences({...preferences,autoSave:event.target.checked})}/><i/></label>
    <label>生成完成时通知<input type="checkbox" checked={preferences.notifications} onChange={event=>setPreferences({...preferences,notifications:event.target.checked})}/><i/></label>
    <label>默认画质<select value={preferences.quality} onChange={event=>setPreferences({...preferences,quality:event.target.value})}><option>720p</option><option>1080p</option><option>4K</option></select></label>
    <button className="primary" onClick={save}>保存设置</button>
  </div>;
}

function Sidebar({ page, setPage, collapsed, setCollapsed, onAction, quickMode }) {
  const nav = [
    ["create", Sparkles, "创作"],
    ["inspiration", Aperture, "灵感"],
    ["projects", FolderOpen, "项目"],
    ["assets", Grid2X2, "素材库"],
    ["models", Cpu, "模型中心"],
  ];
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="side-head"><Logo/><button aria-label={collapsed ? "展开侧栏" : "折叠侧栏"} title={collapsed ? "展开侧栏" : "折叠侧栏"} onClick={() => setCollapsed(!collapsed)}><Menu size={18}/></button></div>
    <nav>
      <small>工作台</small>
      {nav.map(([key, Icon, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>
        <Icon size={19}/><span>{label}</span>{key === "create" && <em>AI</em>}
      </button>)}
      <small>快捷创作</small>
      <button onClick={() => quickMode("文生视频")}><Video size={19}/><span>文生视频</span></button>
      <button onClick={() => quickMode("图生视频")}><ImageIcon size={19}/><span>图生视频</span></button>
      <button onClick={() => quickMode("多图参考")}><Clapperboard size={19}/><span>智能成片</span></button>
      <button onClick={() => quickMode("视频特效")}><WandSparkles size={19}/><span>视频特效</span></button>
    </nav>
    <div className="side-bottom">
      <div className="credit"><div><Zap size={14}/><span>算力点</span></div><strong>1,280</strong><button onClick={() => onAction("upgrade")}>升级</button></div>
      <button onClick={() => onAction("help")}><CircleHelp size={18}/><span>帮助与反馈</span></button>
      <button onClick={() => onAction("settings")}><Settings2 size={18}/><span>偏好设置</span></button>
      <div className="profile"><span>Y</span><div><b>Yuan</b><small>个人专业版</small></div><MoreHorizontal size={18}/></div>
    </div>
  </aside>
}

function Topbar({ title, onOpenJobs, onAction }) {
  return <header className="topbar">
    <div className="mobile-logo"><Logo/></div>
    <h2>{title}</h2>
    <div className="top-actions">
      <button className="search" onClick={() => onAction("search")}><Search size={17}/><span>搜索作品、素材</span><kbd>⌘ K</kbd></button>
      <button className="icon-btn" aria-label="生成任务" onClick={onOpenJobs}><Clock3 size={18}/><i className="dot"/></button>
      <button className="icon-btn" aria-label="通知" onClick={() => onAction("notifications")}><Bell size={18}/></button>
      <button className="invite" onClick={() => onAction("invite")}><Users size={16}/> 邀请协作</button>
    </div>
  </header>
}

function SelectPill({ children, options = [], value, onChange, label }) {
  const [open, setOpen] = useState(false);
  return <div className="select-wrap">
    <button className="select-pill" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>{children}<ChevronDown size={14}/></button>
    {open && <div className="select-menu">{options.map(option => {
      const item = typeof option === "object" ? option : { value: option, label: option };
      return <button className={value === item.value ? "active" : ""} key={item.value} onClick={() => { onChange?.(item.value); setOpen(false); }}>{item.label}{value === item.value && <Check size={13}/>}</button>;
    })}</div>}
  </div>;
}

function CreatePanel({ onGenerate, generating, requestedMode, onToast, videoModels, onConfigureModels }) {
  const [mode, setMode] = useState(requestedMode || "文生视频");
  const [prompt, setPrompt] = useState("清晨的海岸公路，一辆银色复古跑车穿过薄雾，镜头低角度跟随，阳光从云层间洒落，电影感，细腻光影");
  const [ratio, setRatio] = useState("16:9");
  const [advanced, setAdvanced] = useState(false);
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceInput = React.useRef(null);
  const [model, setModel] = useState("");
  const [duration, setDuration] = useState("5 秒");
  useEffect(() => { if (requestedMode) setMode(requestedMode === "视频特效" ? "图生视频" : requestedMode); }, [requestedMode]);
  useEffect(() => {
    if (!videoModels.some(item => item.id === model)) setModel(videoModels[0]?.id || "");
  }, [videoModels, model]);
  const selectedModel = videoModels.find(item => item.id === model);
  const uploadReference = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return onToast("参考图不能超过 8MB");
    setUploadingReference(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Type": file.type,
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok || !result.ok || result.asset.category !== "image") throw new Error(result.message || "参考素材必须是图片");
      setReferenceAsset(result.asset);
      onToast("参考图已安全上传");
    } catch (error) {
      onToast(`参考图上传失败：${error.message}`);
    } finally {
      setUploadingReference(false);
    }
  };
  return <section className="create-card">
    <div className="mode-tabs">
      {["文生视频", "图生视频", "多图参考"].map(x => <button className={mode === x ? "active" : ""} onClick={() => setMode(x)} key={x}>{x}</button>)}
      <span/>
      <button className="help" aria-label="创作帮助" onClick={() => onToast("提示：描述主体、动作、镜头和光线，效果会更稳定")}><CircleHelp size={16}/></button>
    </div>
    {mode !== "文生视频" && <><input ref={referenceInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadReference}/><button className={`upload-slot ${referenceAsset ? "filled" : ""}`} disabled={uploadingReference} onClick={() => referenceAsset ? setReferenceAsset(null) : referenceInput.current?.click()}>
      {uploadingReference ? <><span className="spinner"/><span>上传中</span></> : referenceAsset ? <><ImageIcon size={21}/><span>{referenceAsset.name}</span><X size={15}/></> : <><Upload size={20}/><span>添加参考图片</span><small>支持 JPG / PNG / WebP · 最大 8MB</small></>}
    </button></>}
    <div className="prompt-box">
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1000} placeholder="描述你想生成的画面、动作和镜头语言…"/>
      <div className="prompt-tools">
        <div>
          <button title="添加参考图" onClick={() => { setMode("图生视频"); referenceInput.current?.click(); }}><ImageIcon size={17}/></button>
          <button title="智能扩写" onClick={() => setPrompt(p => p + "，柔和的胶片颗粒，画面叙事感强，主体运动自然流畅")}><WandSparkles size={17}/><span>智能扩写</span></button>
        </div>
        <small>{prompt.length} / 1000</small>
      </div>
    </div>
    <div className="controls">
      {videoModels.length ? <SelectPill label="选择模型" options={videoModels.map(item => ({ value: item.id, label: `${item.name} · ${item.model}` }))} value={model} onChange={setModel}>
        <span className="model-gem">◆</span> {selectedModel?.name || "选择模型"}
      </SelectPill> : <button className="select-pill model-missing" onClick={onConfigureModels}><Cpu size={14}/> 配置视频模型</button>}
      <SelectPill label="选择时长" options={["5 秒","10 秒","15 秒"]} value={duration} onChange={setDuration}><Clock3 size={14}/> {duration}</SelectPill>
      <div className="ratio-group">{["16:9","9:16","1:1"].map(x => <button key={x} className={ratio===x?"active":""} onClick={()=>setRatio(x)}>{x}</button>)}</div>
      <button className={`advanced ${advanced ? "active": ""}`} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15}/> 高级设置</button>
      <button className="generate" disabled={!prompt.trim() || generating || !selectedModel || (mode !== "文生视频" && !referenceAsset)} onClick={() => onGenerate({ prompt, ratio, mode, model: selectedModel, duration, referenceAssetId: referenceAsset?.id || "" })}>
        {generating ? <><span className="spinner"/>生成中 68%</> : <><Sparkles size={17}/>立即生成<span className="cost"><Zap size={12}/> 25</span></>}
      </button>
    </div>
    {advanced && <div className="advanced-panel">
      <label>镜头运动 <select><option>智能运镜</option><option>镜头推进</option><option>环绕主体</option><option>固定镜头</option></select></label>
      <label>创意强度 <input type="range" min="0" max="100" defaultValue="72"/></label>
      <label>生成数量 <select><option>1 个</option><option>2 个</option><option>4 个</option></select></label>
      <label className="toggle-line">无缝循环 <input type="checkbox"/><i/></label>
    </div>}
  </section>
}

function GenerationResult({ job, onEdit }) {
  if (!job) return null;
  return <section className="result-card">
    <div className="result-preview" style={{backgroundImage:`url(${job.outputUrl || assets[0].image})`}}>
      {job.status === "failed" ? <div className="rendering failed"><X size={20}/><b>生成失败</b><small>{job.error || "请检查模型配置"}</small></div> :
      job.status !== "done" ? <div className="rendering"><span className="scan"/><div className="ring"/><b>{job.status === "queued" ? "任务已排队" : "正在构建画面"}</b><small>供应商处理中 · {job.progress || 0}%</small></div> :
      <button className="play-big" aria-label="打开生成视频" onClick={() => window.open(job.outputUrl,"_blank","noopener,noreferrer")}><Play size={22} fill="currentColor"/></button>}
    </div>
    <div className="result-info">
      <div><b>{job.status === "done" ? "视频生成完成" : job.status === "failed" ? "视频生成失败" : "正在生成你的视频"}</b><small>{job.modelName || job.model?.name || "自定义模型"} · {job.ratio} · {job.duration}</small></div>
      <span className={`status ${job.status}`}>{job.status === "done" ? "已完成" : job.status === "failed" ? "失败" : "生成中"}</span>
      {job.status === "done" && <><button onClick={onEdit}><Clapperboard size={15}/> 进入编辑</button><a className="result-download" aria-label="下载视频" href={job.outputUrl} target="_blank" rel="noreferrer"><Download size={15}/></a></>}
    </div>
  </section>
}

function PresetCards({ onUse, onAll }) {
  return <section className="block">
    <div className="section-head"><div><h3>快速开始</h3><p>选择工作流，快速实现你的创意</p></div><button onClick={onAll}>全部工具 <ArrowRight size={15}/></button></div>
    <div className="preset-grid">
      {presets.map(({name, sub, icon:Icon, tone}) => <button className={`preset ${tone}`} key={name} onClick={onUse}>
        <span><Icon size={22}/></span><div><b>{name}</b><small>{sub}</small></div><ArrowRight size={17}/>
      </button>)}
    </div>
  </section>
}

function Inspiration({ onUse, onExplore, onToast, compact = false }) {
  const [filter, setFilter] = useState("推荐");
  const shown = compact ? assets.slice(0,4) : assets;
  return <section className="block inspiration">
    <div className="section-head"><div><h3>{compact ? "灵感广场" : "发现灵感"}</h3><p>{compact ? "来自社区的优秀创作" : "探索热门视觉风格和创作者作品"}</p></div>{compact && <button onClick={onExplore}>探索更多 <ArrowRight size={15}/></button>}</div>
    {!compact && <div className="filters">{["推荐","电影感","产品广告","人物","动漫","自然"].map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}<button className="sort" onClick={() => onToast("已按热度与发布时间综合排序")}><SlidersHorizontal size={14}/> 筛选</button></div>}
    <div className={`masonry ${compact ? "compact" : ""}`}>
      {shown.map((item, i) => <article className="work-card" key={item.id}>
        <div className="cover" style={{backgroundImage:`url(${item.image})`}}>
          <span className="tag">{item.tag}</span><span className="duration">0:05</span>
          <div className="hover-actions"><button aria-label={`查看${item.title}参数`} onClick={() => onToast(`《${item.title}》：${item.tag} · ${item.ratio}`)}><Eye size={18}/></button><button onClick={() => onUse(item)}><WandSparkles size={15}/> 做同款</button></div>
        </div>
        <div className="meta"><div><b>{item.title}</b><small><span className="avatar">{item.author[0]}</span>{item.author}</small></div><span><Star size={13}/> {item.likes}</span></div>
      </article>)}
    </div>
  </section>
}

function CreatePage({ onEdit, requestedMode, onPage, onToast, onAction, videoModels, onJobChange }) {
  const [job, setJob] = useState(null);
  const generating = job && !["done", "failed"].includes(job.status);
  const generate = async data => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: data.prompt,
          ratio: data.ratio,
          mode: data.mode,
          duration: data.duration,
          modelId: data.model.id,
          referenceAssetId: data.referenceAssetId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setJob(result.job);
      onJobChange(result.job);
    } catch (error) {
      onToast(`创建生成任务失败：${error.message}`);
    }
  };
  useEffect(() => {
    if (!job || ["done", "failed"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/jobs/${job.id}`);
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
        setJob(result.job);
        onJobChange(result.job);
      } catch (error) {
        window.clearInterval(timer);
        onToast(`任务状态同步失败：${error.message}`);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, onJobChange, onToast]);
  return <main className="page-content create-page">
    <div className="hero-copy"><span><Sparkles size={14}/> AI VIDEO STUDIO</span><h1>让每一个想象，<em>跃然成片</em></h1><p>从一个想法开始，用 AI 完成创意、生成与剪辑。</p></div>
    <CreatePanel onGenerate={generate} generating={generating} requestedMode={requestedMode} onToast={onToast} videoModels={videoModels} onConfigureModels={() => onPage("models")}/>
    <GenerationResult job={job} onEdit={() => onEdit(job)}/>
    <PresetCards onUse={() => { window.scrollTo({top:0,behavior:"smooth"}); onToast("工作流已载入创作面板"); }} onAll={() => onAction("tools")}/>
    <Inspiration compact onUse={(item) => { window.scrollTo({top:0,behavior:"smooth"}); onToast(`已载入《${item.title}》的创作参数`); }} onExplore={() => onPage("inspiration")} onToast={onToast}/>
  </main>
}

function ProjectPage({ onEdit, onToast, projects, onCreate, onDelete, loading }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [sort, setSort] = useState("最近编辑");
  const visibleProjects = projects
    .filter(x => x.title.includes(query) && (status === "全部" || (status === "草稿" ? x.status !== "completed" : x.status === "completed")))
    .sort((a,b) => sort === "名称排序" ? a.title.localeCompare(b.title, "zh-CN") : sort === "最早创建" ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt));
  return <main className="page-content library-page">
    <div className="title-row"><div><h1>我的项目</h1><p>管理你的创作草稿与成片</p></div><button className="primary" onClick={onCreate}><Plus size={17}/> 新建项目</button></div>
    <div className="library-tools"><div className="inline-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索项目"/></div><div>{["全部","草稿","已完成"].map(x=><button className={status===x?"active":""} onClick={()=>setStatus(x)} key={x}>{x}</button>)}</div><SelectPill label="项目排序" options={["最近编辑","最早创建","名称排序"]} value={sort} onChange={(v)=>{setSort(v);onToast(`项目已按“${v}”排序`);}}>{sort}</SelectPill></div>
    <div className="project-grid">
      <button className="new-project" onClick={onCreate}><span><Plus size={25}/></span><b>创建新项目</b><small>开始一段新的创作</small></button>
      {loading ? <div className="project-empty"><span className="spinner"/>正在读取项目</div> :
      visibleProjects.length === 0 ? <div className="project-empty"><FolderOpen size={25}/><b>没有符合条件的项目</b><small>新建项目后会安全保存到服务器</small></div> :
      visibleProjects.map(x=><article className="project" key={x.id} onClick={()=>onEdit(x)}><div style={{backgroundImage:`url(${x.image||assets[0].image})`}}><span>{x.ratio}</span><button aria-label={`删除${x.title}`} title="删除项目" onClick={e=>{e.stopPropagation();onDelete(x);}}><Trash2/></button></div><b>{x.title}</b><p>{x.status==="completed"?"已完成":"草稿"} · {new Date(x.updatedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p></article>)}
    </div>
  </main>
}

function AssetPage({ onToast }) {
  const [category, setCategory] = useState("全部素材");
  const [uploading, setUploading] = useState(false);
  const [assetItems, setAssetItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileInput = React.useRef(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/assets`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
        setAssetItems(result.assets || []);
      })
      .catch(error => onToast(`素材读取失败：${error.message}`))
      .finally(() => setLoading(false));
  }, [onToast]);
  const visibleAssets = assetItems.filter(item =>
    category === "全部素材" ||
    (category === "视频" && item.category === "video") ||
    (category === "图片" && item.category === "image") ||
    (category === "音频" && item.category === "audio"));
  const count = kind => kind === "全部素材" ? assetItems.length : assetItems.filter(item => item.category === kind).length;
  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) return onToast("文件超过 32MB 上传上限");
    setUploading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Type": file.type,
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setAssetItems(items => [result.asset, ...items]);
      onToast("素材已安全上传并保存");
    } catch (error) {
      onToast(`上传失败：${error.message}`);
    } finally {
      setUploading(false);
    }
  };
  const remove = async item => {
    if (!window.confirm(`确定删除“${item.name}”吗？`)) return;
    const response = await fetch(`${import.meta.env.BASE_URL}api/assets/${item.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) return onToast(`删除失败：${result.message || response.status}`);
    setAssetItems(items => items.filter(asset => asset.id !== item.id));
    onToast("素材已删除");
  };
  return <main className="page-content library-page">
    <div className="title-row"><div><h1>素材库</h1><p>你的图片、视频、音频与品牌资产</p></div><button className="primary" onClick={()=>fileInput.current?.click()} disabled={uploading}>{uploading?<><span className="spinner"/>上传中</>:<><Upload size={17}/> 上传素材</>}</button><input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg" onChange={upload}/></div>
    <div className="asset-summary">
      {[["全部素材","全部素材",Grid2X2],["视频","video",Video],["图片","image",ImageIcon],["音频","audio",Music2]].map(([n,key,I])=><button className={category===n?"active":""} onClick={()=>setCategory(n)} key={n}><I size={20}/><div><b>{count(key)}</b><span>{n}</span></div></button>)}
    </div>
    {loading ? <div className="drawer-empty"><span className="spinner"/>正在读取素材</div> :
    visibleAssets.length === 0 ? <div className="drawer-empty"><Upload size={24}/><b>这里还没有素材</b><small>上传后会安全保存到你的工作空间</small></div> :
    <div className="asset-list">{visibleAssets.map(item=><article key={item.id}><div style={item.category==="image"?{backgroundImage:`url(${item.url})`}:{}} onClick={()=>window.open(item.url,"_blank","noopener,noreferrer")}>{item.category==="video"?<Play size={17}/>:item.category==="audio"?<Music2 size={20}/>:null}</div><b>{item.name}</b><small>{item.category==="video"?"视频":item.category==="audio"?"音频":"图片"} · {(item.size/1024/1024).toFixed(2)} MB</small><button aria-label={`删除${item.name}`} onClick={()=>remove(item)}><Trash2 size={17}/></button></article>)}</div>}
  </main>
}

function ModelCenter({ onToast, configs, setConfigs, loading }) {
  const [selectedType, setSelectedType] = useState("video");
  const [editingConfig, setEditingConfig] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const selected = modelTypes.find(x => x.id === selectedType);
  const SelectedIcon = selected.icon;
  const typeConfigs = configs.filter(x => x.type === selectedType);
  const verifiedConfigs = configs.filter(x => x.status === "verified");
  const verifiedCoreTypes = new Set(verifiedConfigs.filter(x => modelTypes.find(t => t.id === x.type)?.required).map(x => x.type));
  const openConfig = config => {
    setTestResult(null);
    setEditingConfig(config ? { ...config, apiKey: "" } : {
      id: null, type: selectedType, name: "", provider: "OpenAI Compatible",
      baseUrl: "", model: "", apiKey: "", auth: "Bearer Token", mode: selectedType === "video" ? "异步任务" : "同步响应", enabled: true,
    });
  };
  const updateEditing = changes => {
    setEditingConfig(current => ({ ...current, ...changes, status: "draft" }));
    setTestResult(null);
  };
  const save = async () => {
    if (!editingConfig.name || !editingConfig.model) return onToast("请填写配置名称和模型 ID");
    setSaving(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/model-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editingConfig, verify: Boolean(testResult?.ok) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setConfigs(items => items.some(x => x.id === result.config.id)
        ? items.map(x => x.id === result.config.id ? result.config : x)
        : [...items, result.config]);
      setEditingConfig(null);
      onToast(result.config.status === "verified" ? "模型已重新验证并安全保存" : "配置已保存为草稿，尚未接入工作流");
    } catch (error) {
      onToast(`保存失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  };
  const updateState = async (config, changes) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/model-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, ...changes, apiKey: "", verify: false }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setConfigs(items => items.map(item => item.id === result.config.id ? result.config : item));
      onToast(result.config.enabled ? "模型已启用；重新验证后才会进入工作流" : "模型已停用");
    } catch (error) {
      onToast(`操作失败：${error.message}`);
    }
  };
  const remove = async config => {
    if (!window.confirm(`确定删除“${config.name}”吗？此操作不会删除供应商侧模型。`)) return;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/model-configs/${config.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setConfigs(items => items.filter(item => item.id !== config.id));
      onToast("模型配置已删除");
    } catch (error) {
      onToast(`删除失败：${error.message}`);
    }
  };
  const test = async () => {
    if (!editingConfig.baseUrl || !editingConfig.model) {
      setTestResult({ ok: false, message: "请先填写 Base URL 和模型 ID。" });
      return;
    }
    if (editingConfig.auth !== "无需鉴权" && !editingConfig.apiKey) {
      setTestResult({ ok: false, message: "当前鉴权方式需要填写 API Key。" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/model-connections/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingConfig.id,
          type: editingConfig.type,
          provider: editingConfig.provider,
          baseUrl: editingConfig.baseUrl,
          model: editingConfig.model,
          apiKey: editingConfig.apiKey,
          auth: editingConfig.auth,
          mode: editingConfig.mode,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("MODEL_VERIFY_SERVICE_MISSING");
      }
      const result = await response.json();
      if (result.code === "MODEL_VERIFY_SERVICE_MISSING") {
        throw new Error("MODEL_VERIFY_SERVICE_MISSING");
      }
      if (!response.ok) {
        throw new Error(result.code === "MODEL_VERIFY_SERVICE_MISSING" || response.status === 404
          ? "MODEL_VERIFY_SERVICE_MISSING"
          : result.message || `HTTP_${response.status}`);
      }
      if (!result.ok || !result.verified) throw new Error(result.message || "模型服务未通过验证");
      const latency = `${result.latencyMs || Math.round(performance.now() - startedAt)}ms`;
      setTestResult({ ok: true, latency, message: `验证成功：${result.evidence || "鉴权与最小推理请求均通过"}` });
      setEditingConfig(current => ({ ...current, status: "verified" }));
    } catch (error) {
      const serviceMissing = error.message === "MODEL_VERIFY_SERVICE_MISSING";
      setTestResult({
        ok: false,
        message: serviceMissing
          ? "无法验证：服务端模型验证接口尚未部署。配置不会标记为已接入。"
          : `验证失败：${error.message || "无法连接模型服务"}`,
      });
    } finally {
      setTesting(false);
    }
  };
  return <main className="page-content library-page model-page">
    <div className="title-row"><div><h1>模型中心</h1><p>接入并管理你自己的 AI 模型，工作流按能力自动路由</p></div><button className="primary" onClick={() => openConfig()}><Plus size={17}/> 添加模型</button></div>
    <div className="model-overview">
      <div><span>已验证接入</span><b>{verifiedConfigs.length}</b><small>{configs.length - verifiedConfigs.length} 个草稿配置</small></div>
      <div><span>核心链路</span><b>{verifiedCoreTypes.size} / 5</b><small>仅统计真实验证通过的模型</small></div>
      <div><span>当前状态</span><b className={verifiedConfigs.length ? "healthy" : "unconfigured"}><Radio size={16}/> {verifiedConfigs.length ? "部分可用" : "未配置"}</b><small>{verifiedConfigs.length ? "存在已验证模型" : "尚无可用于工作流的模型"}</small></div>
    </div>
    <section className="model-layout">
      <aside className="model-types">
        <header><b>模型能力类型</b><small>核心 5 类 · 增强 5 类</small></header>
        {modelTypes.map(({id,name,icon:Icon,required}) => <button className={selectedType===id?"active":""} onClick={()=>setSelectedType(id)} key={id}><span><Icon size={17}/></span><div><b>{name}</b><small>{required?"核心必需":"增强可选"}</small></div><i className={configs.some(x=>x.type===id && x.status==="verified")?"configured":configs.some(x=>x.type===id)?"draft":""}/></button>)}
      </aside>
      <div className="model-detail">
        <div className="model-type-head"><span><SelectedIcon size={22}/></span><div><h2>{selected.name}</h2><p>{selected.description}</p></div><em>{selected.required?"核心必需":"增强可选"}</em></div>
        <div className="capability-row">{selected.capabilities.map(x=><span key={x}>{x}</span>)}<small>常见模型：{selected.examples}</small></div>
        <div className="model-list-head"><div><b>已配置模型</b><small>工作流会优先使用启用且健康的模型</small></div><button onClick={()=>openConfig()}><Plus size={15}/> 添加</button></div>
        <div className="model-config-list">
          {loading ? <div className="model-empty"><span className="spinner"/><b>正在读取服务器配置</b></div> :
          typeConfigs.length===0 ? <div className="model-empty"><Cpu size={27}/><b>还没有配置{selected.name}模型</b><p>添加一个自有 API 或兼容服务，完成后即可在创作流程中使用。</p><button className="primary" onClick={()=>openConfig()}>立即配置</button></div> :
          typeConfigs.map(config=><article key={config.id}><span className="provider-icon">{config.name.slice(0,1)}</span><div><b>{config.name}</b><small>{config.provider} · {config.model}</small></div><span className={`health ${config.status==="verified"?"":"draft"}`}><i/>{config.status==="verified"?"已验证":"草稿 · 未验证"}</span><small>{config.enabled===false?"已停用":config.latency}</small><button aria-label={`${config.enabled===false?"启用":"停用"}${config.name}`} title={config.enabled===false?"启用":"停用"} onClick={()=>updateState(config,{enabled:config.enabled===false})}><Radio size={16}/></button><button aria-label={`编辑${config.name}`} onClick={()=>openConfig(config)}><Settings2 size={16}/></button><button aria-label={`删除${config.name}`} onClick={()=>remove(config)}><Trash2 size={16}/></button></article>)}
        </div>
      </div>
    </section>
    <Modal open={!!editingConfig} title={`${editingConfig?.id?"编辑":"添加"}${selected?.name}模型`} onClose={()=>setEditingConfig(null)} wide>
      {editingConfig && <div className="model-form">
        <div className="form-grid">
          <label>配置名称<input value={editingConfig.name} onChange={e=>updateEditing({name:e.target.value})} placeholder="例如：我的可灵 Pro"/></label>
          <label>接口协议<select value={editingConfig.provider} onChange={e=>updateEditing({provider:e.target.value})}><option>OpenAI Compatible</option><option>Custom API</option><option>Replicate</option><option>本地服务</option></select></label>
          <label className="full">Base URL<input value={editingConfig.baseUrl||""} onChange={e=>updateEditing({baseUrl:e.target.value})} placeholder="https://api.example.com/v1"/></label>
          <label>模型 ID<input value={editingConfig.model} onChange={e=>updateEditing({model:e.target.value})} placeholder="model-name-or-id"/></label>
          <label>鉴权方式<select value={editingConfig.auth||"Bearer Token"} onChange={e=>updateEditing({auth:e.target.value})}><option>Bearer Token</option><option>API Key Header</option><option>无需鉴权</option></select></label>
          <label className="full">API Key<input type="password" value={editingConfig.apiKey||""} onChange={e=>updateEditing({apiKey:e.target.value})} placeholder={editingConfig.hasApiKey?"已安全保存；留空则保留原密钥":"仅发送到 FlowFrame 服务端受限目录"}/></label>
          <label>调用模式<select value={editingConfig.mode||"同步响应"} onChange={e=>updateEditing({mode:e.target.value})}><option>同步响应</option><option>异步任务</option><option>流式响应</option></select></label>
          <label>超时时间<input defaultValue={selectedType==="video"?"300 秒":"60 秒"}/></label>
        </div>
        <div className="security-note"><ShieldCheck size={16}/><div><b>真实连接验证</b><small>服务端会读取供应商模型目录并确认模型 ID 精确存在。密钥仅保存于服务器 0600 文件，永不回传浏览器。</small></div></div>
        {testResult && <div className={`test-result ${testResult.ok?"success":"error"}`} role="status">{testResult.ok?<Check size={16}/>:<X size={16}/>}<div><b>{testResult.ok?"连接已验证":"连接未验证"}</b><small>{testResult.message}</small></div></div>}
        <div className="form-actions"><button onClick={test} disabled={testing||saving}>{testing?<><span className="spinner"/>测试中</>:<><Radio size={15}/>测试连接</>}</button><button className="primary" onClick={save} disabled={saving}>{saving?<><span className="spinner"/>保存中</>:<>保存配置</>}</button></div>
      </div>}
    </Modal>
  </main>
}

function Editor({ project, onClose, onToast, onSave }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(project?.timeline?.time || 0);
  const [exporting, setExporting] = useState(false);
  const [tool, setTool] = useState(project?.timeline?.tool || "媒体");
  const [mediaTab, setMediaTab] = useState(project?.timeline?.mediaTab || "项目素材");
  const [propertyTab, setPropertyTab] = useState(project?.timeline?.propertyTab || "基础");
  const [panelOpen, setPanelOpen] = useState(true);
  const [history, setHistory] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [clips, setClips] = useState(project?.timeline?.clips ?? 1);
  const [saveState, setSaveState] = useState("已保存");
  useEffect(()=>{
    if(!playing) return;
    const id=setInterval(()=>setTime(t=>t>=10?0:t+.1),100);
    return ()=>clearInterval(id);
  },[playing]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setSaveState("保存中…");
      try {
        await onSave(project.id, { timeline: { time, clips, tool, mediaTab, propertyTab, removedBg: false } });
        setSaveState("已自动保存");
      } catch {
        setSaveState("保存失败");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [project.id, time, clips, tool, mediaTab, propertyTab, onSave]);
  return <div className="editor">
    <header><button className="back" onClick={onClose}><ChevronLeft size={18}/> 返回</button><div><b>{project?.title || "未命名项目"}</b><span>{saveState}</span></div><div className="edit-actions"><button aria-label="撤销" onClick={()=>{setHistory(h=>Math.max(0,h-1));onToast("已撤销上一步操作");}}><Undo2 size={17}/></button><button aria-label="重做" onClick={()=>{setHistory(h=>h+1);onToast("已恢复操作");}}><Redo2 size={17}/></button><button className="export" onClick={()=>onToast("尚未配置视频渲染器，未创建虚假导出任务")}><Download size={16}/>导出</button></div></header>
    <div className={`edit-body ${panelOpen?"":"panel-closed"}`}>
      <aside className="tool-rail">{[[Upload,"媒体"],[Film,"素材"],[Music2,"音频"],[Square,"文本"],[Sparkles,"特效"],[SlidersHorizontal,"调节"]].map(([I,n])=><button className={tool===n?"active":""} onClick={()=>{setTool(n);setPanelOpen(true);}} key={n}><I size={20}/><span>{n}</span></button>)}</aside>
      {panelOpen && <section className="media-panel"><div className="panel-title"><b>{tool}</b><button aria-label="关闭素材面板" onClick={()=>setPanelOpen(false)}><X size={16}/></button></div><button className="upload-media" onClick={()=>onToast("请返回素材库上传文件；编辑器会在下一阶段接入素材选择器")}><Upload size={18}/> 前往素材库上传</button><div className="media-tabs">{["项目素材","生成记录"].map(x=><button className={mediaTab===x?"active":""} onClick={()=>setMediaTab(x)} key={x}>{x}</button>)}</div><div className="media-grid"><button aria-label="添加项目封面到时间线" onClick={()=>{setClips(c=>c+1);setHistory(h=>h+1);onToast("已将项目封面添加到时间线");}} style={{backgroundImage:`url(${project?.image||assets[0].image})`}}><Plus size={16}/></button></div></section>}
      <section className="canvas-area">
        <div className="canvas-top"><span>{fullscreen?"100%":"适应"}</span><ChevronDown size={13}/><button aria-label="切换全屏预览" onClick={()=>setFullscreen(!fullscreen)}><Maximize2 size={16}/></button></div>
        <div className="stage" style={{backgroundImage:`url(${project?.image||assets[0].image})`}}><div className="safe-frame"/><button onClick={()=>setPlaying(!playing)}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button></div>
        <div className="transport"><button aria-label="上一帧" onClick={()=>setTime(t=>Math.max(0,t-.1))}><ChevronLeft size={18}/></button><button className="main-play" aria-label={playing?"暂停":"播放"} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><button aria-label="下一帧" onClick={()=>setTime(t=>Math.min(10,t+.1))}><ChevronRight size={18}/></button><span><b>00:0{Math.floor(time)}.{Math.floor((time%1)*10)}</b> / 00:10.0</span></div>
      </section>
      <aside className="properties"><div className="panel-title"><b>画面</b><button aria-label="重置画面参数" onClick={()=>onToast("画面参数已重置")}><X size={16}/></button></div><div className="property-tabs">{["基础","调色","动画"].map(x=><button className={propertyTab===x?"active":""} onClick={()=>setPropertyTab(x)} key={x}>{x}</button>)}</div>
        <label>缩放 <div><input type="range" defaultValue="68"/><span>100%</span></div></label>
        <label>位置 <div className="dual"><input defaultValue="0"/><input defaultValue="0"/></div></label>
        <label>旋转 <div><input type="range" defaultValue="0"/><span>0°</span></div></label>
        <hr/><label>不透明度 <div><input type="range" defaultValue="100"/><span>100%</span></div></label>
        <button className="remove-bg" onClick={()=>onToast("尚未配置图像分割模型，未执行虚假抠像")}><WandSparkles size={15}/> AI 智能抠像</button>
      </aside>
    </div>
    <div className="timeline">
      <div className="timeline-head"><div><button aria-label="添加轨道" onClick={()=>{setClips(c=>c+1);onToast("已添加新视频片段");}}><Plus size={16}/></button><button aria-label="删除片段" onClick={()=>{setClips(c=>Math.max(0,c-1));onToast("已删除选中片段");}}><Trash2 size={16}/></button></div><div><SlidersHorizontal size={14}/><input aria-label="时间线缩放" type="range" defaultValue="55"/></div></div>
      <div className="timeline-body"><div className="track-labels"><span><Video size={14}/> 视频</span><span><Music2 size={14}/> 音频</span></div><div className="tracks">
        <div className="ruler">{[0,2,4,6,8,10].map(n=><i key={n} style={{left:`${n*10}%`}}>{n}s</i>)}</div>
        <div className="playhead" style={{left:`${time*10}%`}}><i/></div>
        {clips>0 && <div className="video-clip" style={{backgroundImage:`url(${project?.image||assets[0].image})`,width:`${Math.min(88,48+clips*4)}%`}}><span>清晨海岸.mp4 · {clips} 个片段</span></div>}
        <div className="audio-clip"><span>♫ Morning drift</span><div className="wave">{Array.from({length:45}).map((_,i)=><i key={i} style={{height:5+(i*7)%18}}/>)}</div></div>
      </div></div>
    </div>
  </div>
}

function JobsDrawer({ open, onClose, jobs, loading }) {
  return <><div className={`drawer-mask ${open?"show":""}`} onClick={onClose}/><aside className={`jobs-drawer ${open?"show":""}`}><div className="drawer-head"><div><h3>生成任务</h3><span>{jobs.length} 个任务</span></div><button aria-label="关闭任务抽屉" onClick={onClose}><X size={18}/></button></div>
    {loading ? <div className="drawer-empty"><span className="spinner"/>正在读取任务</div> :
      jobs.length === 0 ? <div className="drawer-empty"><Clapperboard size={24}/><b>还没有生成任务</b><small>验证并选择视频模型后开始创作</small></div> :
      jobs.map(item => <div className={`job ${item.status}`} key={item.id}><div className="job-thumb" style={{backgroundImage:`url(${item.outputUrl || assets[0].image})`}}>{!["done","failed"].includes(item.status)?<span className="spinner"/>:item.status==="done"?<Play size={15}/>:<X size={15}/>}</div><div><b>{item.prompt.slice(0,24)}</b><small>{item.modelName} · {item.status==="done"?"已完成":item.status==="failed"?"失败":"生成中"}</small>{!["done","failed"].includes(item.status)&&<progress value={item.progress||0} max="100"/>}</div></div>)}
  </aside></>
}

function App() {
  const [page, setPage] = useState("create");
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(null);
  const [jobs, setJobs] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [quickMode, setQuickMode] = useState("文生视频");
  const [globalQuery, setGlobalQuery] = useState("");
  const [modelConfigs, setModelConfigs] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [jobItems, setJobItems] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [projectItems, setProjectItems] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const showToast = useCallback(message => {
    setToast(message);
    window.clearTimeout(window.__flowToast);
    window.__flowToast = window.setTimeout(() => setToast(""), 2400);
  }, []);
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("search");
      }
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!jobs) return;
    let active = true;
    setJobsLoading(true);
    fetch(`${import.meta.env.BASE_URL}api/jobs`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
        if (active) setJobItems(result.jobs || []);
      })
      .catch(error => {
        if (active) showToast(`任务读取失败：${error.message}`);
      })
      .finally(() => {
        if (active) setJobsLoading(false);
      });
    return () => { active = false; };
  }, [jobs]);
  const updateJob = useCallback(job => {
    setJobItems(items => [job, ...items.filter(item => item.id !== job.id)]);
  }, []);
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}api/model-configs`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
        if (active) setModelConfigs(result.configs || []);
      })
      .catch(error => {
        if (active) showToast(`模型配置读取失败：${error.message}`);
      })
      .finally(() => {
        if (active) setModelsLoading(false);
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}api/projects`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
        if (active) setProjectItems(result.projects || []);
      })
      .catch(error => {
        if (active) showToast(`项目读取失败：${error.message}`);
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => { active = false; };
  }, [showToast]);
  const createProject = useCallback(async seed => {
    const payload = {
      title: seed?.title || `未命名项目 ${projectItems.length + 1}`,
      image: seed?.outputUrl || seed?.image || assets[0].image,
      ratio: seed?.ratio || "16:9",
      status: seed?.status === "done" ? "completed" : "draft",
      timeline: { time: 0, clips: 1, tool: "媒体", mediaTab: "项目素材", propertyTab: "基础", removedBg: false },
    };
    const response = await fetch(`${import.meta.env.BASE_URL}api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
    setProjectItems(items => [result.project, ...items]);
    setEditing(result.project);
    return result.project;
  }, [projectItems.length]);
  const saveProject = useCallback(async (id, changes) => {
    const response = await fetch(`${import.meta.env.BASE_URL}api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
    setProjectItems(items => items.map(item => item.id === id ? result.project : item));
    setEditing(current => current?.id === id ? result.project : current);
    return result.project;
  }, []);
  const deleteProject = useCallback(async project => {
    if (!window.confirm(`确定删除“${project.title}”吗？`)) return;
    const response = await fetch(`${import.meta.env.BASE_URL}api/projects/${project.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) return showToast(`删除失败：${result.message || response.status}`);
    setProjectItems(items => items.filter(item => item.id !== project.id));
    showToast("项目已删除");
  }, [showToast]);
  const openQuickMode = mode => {
    setQuickMode(mode);
    setPage("create");
    showToast(`已切换到${mode}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const title = {create:"创作工作台", inspiration:"灵感广场", projects:"我的项目", assets:"素材库", models:"模型中心"}[page];
  const videoModels = modelConfigs.filter(config => config.type === "video" && config.status === "verified" && config.enabled !== false);
  if (editing) return <><Editor project={editing} onClose={()=>setEditing(null)} onToast={showToast} onSave={saveProject}/><Toast message={toast}/></>;
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} onAction={setModal} quickMode={openQuickMode}/><div className="main-shell"><Topbar title={title} onOpenJobs={()=>setJobs(true)} onAction={setModal}/>
    {page==="create"&&<CreatePage onEdit={job=>createProject(job).catch(error=>showToast(`创建项目失败：${error.message}`))} requestedMode={quickMode} onPage={setPage} onToast={showToast} onAction={setModal} videoModels={videoModels} onJobChange={updateJob}/>}
    {page==="inspiration"&&<main className="page-content library-page"><div className="title-row"><div><h1>灵感广场</h1><p>发现创意，复刻工作流，开始你的作品</p></div></div><Inspiration onUse={(item)=>{setQuickMode("文生视频");setPage("create");showToast(`已载入《${item.title}》的创作参数`);}} onToast={showToast}/></main>}
    {page==="projects"&&<ProjectPage onEdit={setEditing} onToast={showToast} projects={projectItems} loading={projectsLoading} onCreate={()=>createProject().catch(error=>showToast(`新建失败：${error.message}`))} onDelete={deleteProject}/>}
    {page==="assets"&&<AssetPage onToast={showToast}/>}
    {page==="models"&&<ModelCenter onToast={showToast} configs={modelConfigs} setConfigs={setModelConfigs} loading={modelsLoading}/>}
  </div><JobsDrawer open={jobs} onClose={()=>setJobs(false)} jobs={jobItems} loading={jobsLoading}/>
    <Modal open={modal==="search"} title="全局搜索" onClose={()=>setModal(null)} wide><div className="global-search"><Search size={18}/><input autoFocus value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)} placeholder="搜索你的项目…"/></div><div className="search-results">{projectItems.filter(item=>item.title.toLowerCase().includes(globalQuery.toLowerCase())).slice(0,6).map(item=><button key={item.id} onClick={()=>{setModal(null);setEditing(item);}}><span style={{backgroundImage:`url(${item.image||assets[0].image})`}}/><div><b>{item.title}</b><small>项目 · {item.ratio} · {item.status==="completed"?"已完成":"草稿"}</small></div><ArrowRight size={15}/></button>)}{globalQuery&&projectItems.every(item=>!item.title.toLowerCase().includes(globalQuery.toLowerCase()))&&<div className="drawer-empty"><Search size={22}/><b>没有找到项目</b><small>可前往项目页新建或调整关键词</small></div>}</div></Modal>
    <Modal open={modal==="notifications"} title="通知中心" onClose={()=>setModal(null)}><div className="notice-list"><article><span className="notice-icon"><Check size={16}/></span><div><b>《玻璃海岸线》生成完成</b><small>刚刚 · 点击可查看结果</small></div></article><article><span className="notice-icon purple"><Users size={16}/></span><div><b>Mori 邀请你参与项目</b><small>2 小时前 · 海边咖啡品牌片</small></div></article></div></Modal>
    <Modal open={modal==="invite"} title="邀请团队成员" onClose={()=>setModal(null)}><p className="modal-copy">当前部署尚未配置团队身份与邮件服务，因此不会伪造邀请链接或发送结果。</p><div className="security-note"><Users size={16}/><div><b>协作能力未启用</b><small>接入账号体系、工作空间权限和邮件供应商后才能开放。</small></div></div></Modal>
    <Modal open={modal==="upgrade"} title="升级专业创作方案" onClose={()=>setModal(null)}><div className="plan-card"><span>未配置</span><h3>当前没有启用付费方案</h3><p>支付与算力计费服务尚未接入，本页面不会创建虚假订单或扣费。</p><button className="primary" onClick={()=>{setModal(null);setPage("models");}}>先配置自有模型</button></div></Modal>
    <Modal open={modal==="help"} title="帮助与反馈" onClose={()=>setModal(null)}><div className="help-grid"><button onClick={()=>{setModal(null);setPage("models");}}>模型接入<small>配置并验证自有模型</small></button><button onClick={()=>showToast("快捷键：⌘/Ctrl + K 打开全局搜索，Esc 关闭弹窗")}>快捷键<small>查看当前可用操作</small></button><button onClick={()=>showToast("反馈渠道尚未配置，请联系站点管理员")}>反馈渠道<small>当前部署尚未接入工单系统</small></button></div></Modal>
    <Modal open={modal==="settings"} title="偏好设置" onClose={()=>setModal(null)}><Preferences onClose={()=>setModal(null)} onToast={showToast}/></Modal>
    <Modal open={modal==="tools"} title="AI 创作工具箱" onClose={()=>setModal(null)} wide><div className="tools-grid">{presets.concat([{name:"智能配乐",sub:"根据画面生成音乐",icon:Music2,tone:"cyan"},{name:"数字人口播",sub:"角色与声音一键合成",icon:Mic2,tone:"orange"}]).map(({name,sub,icon:Icon})=><button key={name} onClick={()=>{setModal(null);openQuickMode(name==="首尾帧"?"图生视频":"文生视频");}}><Icon size={21}/><div><b>{name}</b><small>{sub}</small></div><ArrowRight size={15}/></button>)}</div></Modal>
    <Toast message={toast}/>
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
