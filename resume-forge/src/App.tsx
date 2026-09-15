import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Gauge,
  Menu,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  analyzeBullet,
  analyzeMatch,
  buildEvidenceBullet,
  documentHealth,
  emptyResume,
  Experience,
  exportResumeHtml,
  normalizeResume,
  ResumeData,
  sampleResume,
} from "./domain";

const STORAGE_KEY = "resume-forge-draft-v1";
type Tab = "profile" | "job" | "experience" | "review";
type MobileView = "edit" | "preview" | "review";

function loadResume() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeResume(JSON.parse(saved)) : sampleResume;
  } catch {
    return sampleResume;
  }
}

function App() {
  const [resume, setResume] = useState<ResumeData>(loadResume);
  const [tab, setTab] = useState<Tab>("profile");
  const [mobileView, setMobileView] = useState<MobileView>("edit");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState(0);
  const [skillDraft, setSkillDraft] = useState("");
  const [savedAt, setSavedAt] = useState("刚刚");
  const [toast, setToast] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [account, setAccount] = useState<{ displayName: string } | null>(null);
  const [builder, setBuilder] = useState({
    action: "主导",
    task: "",
    metric: "",
    result: "",
  });

  const match = useMemo(() => analyzeMatch(resume), [resume]);
  const health = useMemo(() => documentHealth(resume), [resume]);
  const currentExperience = resume.experiences[selectedExperience] ?? resume.experiences[0];
  const allBullets = resume.experiences.flatMap((experience) =>
    experience.bullets.map((bullet) => ({
      experienceId: experience.id,
      bullet,
      analysis: analyzeBullet(bullet),
    })),
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
    setSavedAt(
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
  }, [resume]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!location.hostname.endsWith("lifeyoume.icu")) return;
    fetch("https://auth.lifeyoume.icu/api/v1/session/state", {
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.authenticated && payload.user) {
          setAccount({
            displayName: payload.user.display_name || payload.user.email || "我的账号",
          });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("source") !== "fde-playbook") return;
    setTab("job");
    setMobileView("edit");
    setToast("已从 FDE 手册进入，请粘贴目标岗位 JD");
  }, []);

  const update = <K extends keyof ResumeData>(key: K, value: ResumeData[K]) => {
    setResume((current) => ({ ...current, [key]: value }));
  };

  const updateExperience = <K extends keyof Experience>(
    index: number,
    key: K,
    value: Experience[K],
  ) => {
    setResume((current) => ({
      ...current,
      experiences: current.experiences.map((experience, itemIndex) =>
        itemIndex === index ? { ...experience, [key]: value } : experience,
      ),
    }));
  };

  const addSkill = (value = skillDraft) => {
    const skill = value.trim();
    if (!skill || resume.skills.includes(skill)) return;
    update("skills", [...resume.skills, skill]);
    setSkillDraft("");
  };

  const addExperience = () => {
    const next: Experience = {
      id: `exp-${Date.now()}`,
      company: "",
      role: "",
      period: "",
      bullets: [""],
    };
    update("experiences", [...resume.experiences, next]);
    setSelectedExperience(resume.experiences.length);
  };

  const removeExperience = (index: number) => {
    if (resume.experiences.length === 1) return;
    update(
      "experiences",
      resume.experiences.filter((_, itemIndex) => itemIndex !== index),
    );
    setSelectedExperience(Math.max(0, index - 1));
  };

  const addGeneratedBullet = () => {
    const bullet = buildEvidenceBullet(builder);
    if (!bullet || bullet === "。") {
      setToast("至少填写动作或任务");
      return;
    }
    updateExperience(selectedExperience, "bullets", [
      ...currentExperience.bullets.filter(Boolean),
      bullet,
    ]);
    setBuilder({ action: "主导", task: "", metric: "", result: "" });
    setToast("成果要点已加入当前经历");
  };

  const download = () => {
    const blob = new Blob([exportResumeHtml(resume)], {
      type: "text/html;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${resume.name || "我的"}-${resume.targetRole || "岗位"}-简历.html`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setToast("简历已导出，可用浏览器打印为 PDF");
  };

  const confirmReset = () => {
    setResume(structuredClone(emptyResume));
    setSelectedExperience(0);
    setTab("profile");
    setMobileView("edit");
    setShowReset(false);
  };

  return (
    <div className="app-shell">
      <aside className={mobileNav ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand">
          <span className="brand-stamp">RF</span>
          <div>
            <strong>简历锻造厂</strong>
            <small>RESUME FORGE</small>
          </div>
          <button
            className="icon-button close-menu"
            onClick={() => setMobileNav(false)}
            aria-label="关闭导航"
          >
            <X size={17} />
          </button>
        </div>

        <div className="file-card">
          <span>当前版本</span>
          <strong>{resume.targetRole || "未命名岗位"}</strong>
          <small>本地草稿 · {savedAt}</small>
        </div>

        <nav>
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            <UserRound size={17} /> 基础资料
          </button>
          <button
            className={tab === "job" ? "active" : ""}
            onClick={() => setTab("job")}
          >
            <Target size={17} /> 岗位匹配
          </button>
          <button
            className={tab === "experience" ? "active" : ""}
            onClick={() => setTab("experience")}
          >
            <BriefcaseBusiness size={17} /> 工作经历
          </button>
          <button
            className={tab === "review" ? "active" : ""}
            onClick={() => setTab("review")}
          >
            <Gauge size={17} /> 质量诊断
          </button>
        </nav>

        <div className="career-links">
          <span>求职产品线</span>
          <a href="https://lifeyoume.icu/products/fde-playbook">FDE 岗位手册</a>
          <a href="https://lifeyoume.icu/products/english-speaking-coach">英语表达训练</a>
        </div>

        <div className="privacy-note">
          <ShieldCheck size={16} />
          <span>
            <strong>隐私模式</strong>
            简历内容仅保存在此浏览器
          </span>
        </div>
      </aside>

      {mobileNav && (
        <button className="menu-scrim" onClick={() => setMobileNav(false)} />
      )}

      <main className="main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileNav(true)}
            aria-label="打开导航"
          >
            <Menu size={19} />
          </button>
          <div>
            <span>JOB-TARGETED RESUME</span>
            <h1>{resume.targetRole || "创建你的岗位简历"}</h1>
          </div>
          <div className="top-actions">
            <span className="save-state">
              <Save size={13} /> 已保存 {savedAt}
            </span>
            <a
              className="account-link"
              href={
                account
                  ? "https://auth.lifeyoume.icu/account"
                  : `https://auth.lifeyoume.icu/login?return_to=${encodeURIComponent(location.href)}`
              }
            >
              <UserRound size={15} />
              {account?.displayName || "统一账号"}
            </a>
            <button
              className="icon-button"
              onClick={() => setShowReset(true)}
              aria-label="创建空白简历"
              title="创建空白简历"
            >
              <RotateCcw size={17} />
            </button>
            <button className="export-button" onClick={download}>
              <Download size={16} /> 导出简历
            </button>
          </div>
        </header>

        <section className="score-strip">
          <article>
            <div className="score-orbit" style={{ "--score": `${match.score * 3.6}deg` } as React.CSSProperties}>
              <strong>{match.score}</strong>
            </div>
            <span>
              <small>岗位匹配</small>
              <b>{match.score >= 80 ? "有竞争力" : match.score >= 60 ? "继续补强" : "需要调整"}</b>
            </span>
          </article>
          <article>
            <FileText size={19} />
            <span>
              <small>关键词覆盖</small>
              <b>{match.keywordCoverage}% · {match.matched.length}/{match.keywords.length || 0}</b>
            </span>
          </article>
          <article>
            <Sparkles size={19} />
            <span>
              <small>要点质量</small>
              <b>{health.averageBulletScore}%</b>
            </span>
          </article>
          <article>
            {health.onePageLikely ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
            <span>
              <small>篇幅判断</small>
              <b>{health.onePageLikely ? "适合一页" : "建议精简"}</b>
            </span>
          </article>
        </section>

        <div className="mobile-modes" role="group" aria-label="移动端视图">
          <button
            className={mobileView === "edit" ? "active" : ""}
            onClick={() => setMobileView("edit")}
          >
            <PencilLine size={14} /> 编辑
          </button>
          <button
            className={mobileView === "preview" ? "active" : ""}
            onClick={() => setMobileView("preview")}
          >
            <Eye size={14} /> 预览
          </button>
          <button
            className={mobileView === "review" ? "active" : ""}
            onClick={() => {
              setMobileView("review");
              setTab("review");
            }}
          >
            <Gauge size={14} /> 诊断
          </button>
        </div>

        <div className="workspace">
          <section
            className={
              mobileView === "preview"
                ? "editor mobile-hidden"
                : "editor"
            }
          >
            <div className="editor-heading">
              <div>
                <span>EDIT / 真实信息</span>
                <h2>
                  {tab === "profile" && "建立基本信息"}
                  {tab === "job" && "对准目标岗位"}
                  {tab === "experience" && "写出可信成果"}
                  {tab === "review" && "完成投递前检查"}
                </h2>
              </div>
              <span>{resume.name || "未命名"}</span>
            </div>

            <div className="desktop-tabs" role="tablist">
              {([
                ["profile", "01 基础"],
                ["job", "02 岗位"],
                ["experience", "03 经历"],
                ["review", "04 诊断"],
              ] as const).map(([key, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === key}
                  className={tab === key ? "active" : ""}
                  key={key}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "profile" && (
              <div className="form-content">
                <div className="field-grid">
                  <label>
                    <span>姓名</span>
                    <input
                      value={resume.name}
                      onChange={(event) => update("name", event.target.value)}
                      placeholder="真实姓名"
                    />
                  </label>
                  <label>
                    <span>目标岗位</span>
                    <input
                      value={resume.targetRole}
                      onChange={(event) => update("targetRole", event.target.value)}
                      placeholder="例如：高级产品经理"
                    />
                  </label>
                </div>
                <div className="field-grid three">
                  <label>
                    <span>手机</span>
                    <input
                      value={resume.phone}
                      onChange={(event) => update("phone", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>邮箱</span>
                    <input
                      value={resume.email}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>城市</span>
                    <input
                      value={resume.city}
                      onChange={(event) => update("city", event.target.value)}
                    />
                  </label>
                </div>
                <label>
                  <span>职业摘要</span>
                  <textarea
                    value={resume.summary}
                    onChange={(event) => update("summary", event.target.value)}
                    placeholder="年限 + 领域 + 核心能力 + 可验证优势"
                  />
                </label>
                <label>
                  <span>教育经历</span>
                  <input
                    value={resume.education}
                    onChange={(event) => update("education", event.target.value)}
                    placeholder="学校 · 专业 · 学历 · 时间"
                  />
                </label>
                <fieldset>
                  <legend>专业技能</legend>
                  <div className="skill-list">
                    {resume.skills.map((skill) => (
                      <button
                        key={skill}
                        onClick={() =>
                          update(
                            "skills",
                            resume.skills.filter((item) => item !== skill),
                          )
                        }
                        title={`移除 ${skill}`}
                      >
                        {skill} <X size={12} />
                      </button>
                    ))}
                  </div>
                  <div className="add-skill">
                    <input
                      value={skillDraft}
                      onChange={(event) => setSkillDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="输入技能后按回车"
                    />
                    <button onClick={() => addSkill()} aria-label="添加技能">
                      <Plus size={16} />
                    </button>
                  </div>
                </fieldset>
                <button className="next-button" onClick={() => setTab("job")}>
                  对准目标岗位 <ChevronRight size={16} />
                </button>
              </div>
            )}

            {tab === "job" && (
              <div className="form-content">
                <label>
                  <span>目标岗位 JD</span>
                  <textarea
                    className="jd-input"
                    value={resume.jobDescription}
                    onChange={(event) => update("jobDescription", event.target.value)}
                    placeholder="粘贴完整岗位描述，系统会提取可验证关键词"
                  />
                </label>
                <div className="match-breakdown">
                  <article>
                    <span>资料完整度</span>
                    <strong>{match.completeness}%</strong>
                    <i style={{ width: `${match.completeness}%` }} />
                  </article>
                  <article>
                    <span>关键词覆盖</span>
                    <strong>{match.keywordCoverage}%</strong>
                    <i style={{ width: `${match.keywordCoverage}%` }} />
                  </article>
                </div>
                <section className="keyword-section">
                  <div>
                    <h3>已命中</h3>
                    <div className="keyword-list matched">
                      {match.matched.map((keyword) => (
                        <span key={keyword}>
                          <Check size={12} /> {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3>待补证据</h3>
                    <div className="keyword-list missing">
                      {match.missing.map((keyword) => (
                        <button
                          key={keyword}
                          onClick={() => {
                            addSkill(keyword);
                            setToast(`已将「${keyword}」加入技能，请在经历中补充证据`);
                          }}
                        >
                          <Plus size={12} /> {keyword}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <p className="truth-note">
                  <ShieldCheck size={15} />
                  只添加你真实掌握、能在面试中举证的关键词。
                </p>
                <button className="next-button" onClick={() => setTab("experience")}>
                  编写成果经历 <ChevronRight size={16} />
                </button>
              </div>
            )}

            {tab === "experience" && (
              <div className="form-content">
                <div className="experience-tabs">
                  {resume.experiences.map((experience, index) => (
                    <button
                      className={selectedExperience === index ? "active" : ""}
                      key={experience.id}
                      onClick={() => setSelectedExperience(index)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {experience.company || "新经历"}
                    </button>
                  ))}
                  <button className="add-experience" onClick={addExperience}>
                    <Plus size={15} /> 新增
                  </button>
                </div>
                <div className="experience-form">
                  <div className="field-grid three">
                    <label>
                      <span>公司</span>
                      <input
                        value={currentExperience.company}
                        onChange={(event) =>
                          updateExperience(selectedExperience, "company", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>职位</span>
                      <input
                        value={currentExperience.role}
                        onChange={(event) =>
                          updateExperience(selectedExperience, "role", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>时间</span>
                      <input
                        value={currentExperience.period}
                        onChange={(event) =>
                          updateExperience(selectedExperience, "period", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend>成果要点</legend>
                    {currentExperience.bullets.map((bullet, index) => {
                      const analysis = analyzeBullet(bullet);
                      return (
                        <article className="bullet-row" key={index}>
                          <textarea
                            aria-label={`成果要点 ${index + 1}`}
                            value={bullet}
                            onChange={(event) => {
                              const bullets = [...currentExperience.bullets];
                              bullets[index] = event.target.value;
                              updateExperience(selectedExperience, "bullets", bullets);
                            }}
                          />
                          <div className="bullet-meta">
                            <strong>{analysis.score}</strong>
                            <span>{analysis.checks.filter((item) => item.passed).length}/4 项通过</span>
                            <button
                              className="icon-button"
                              onClick={() =>
                                updateExperience(
                                  selectedExperience,
                                  "bullets",
                                  currentExperience.bullets.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                              aria-label={`删除成果要点 ${index + 1}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    <button
                      className="add-row-button"
                      onClick={() =>
                        updateExperience(selectedExperience, "bullets", [
                          ...currentExperience.bullets,
                          "",
                        ])
                      }
                    >
                      <Plus size={15} /> 添加成果要点
                    </button>
                  </fieldset>
                  <section className="evidence-builder">
                    <div>
                      <WandSparkles size={18} />
                      <span>
                        <strong>事实句锻造器</strong>
                        只组合你填写的信息，不补造数字
                      </span>
                    </div>
                    <div className="builder-grid">
                      <label>
                        <span>动作</span>
                        <input
                          value={builder.action}
                          onChange={(event) =>
                            setBuilder((current) => ({
                              ...current,
                              action: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>任务</span>
                        <input
                          value={builder.task}
                          onChange={(event) =>
                            setBuilder((current) => ({
                              ...current,
                              task: event.target.value,
                            }))
                          }
                          placeholder="做了什么"
                        />
                      </label>
                      <label>
                        <span>数字证据</span>
                        <input
                          value={builder.metric}
                          onChange={(event) =>
                            setBuilder((current) => ({
                              ...current,
                              metric: event.target.value,
                            }))
                          }
                          placeholder="覆盖 6 个部门"
                        />
                      </label>
                      <label>
                        <span>业务结果</span>
                        <input
                          value={builder.result}
                          onChange={(event) =>
                            setBuilder((current) => ({
                              ...current,
                              result: event.target.value,
                            }))
                          }
                          placeholder="交付周期缩短 40%"
                        />
                      </label>
                    </div>
                    <button onClick={addGeneratedBullet}>
                      <Sparkles size={15} /> 生成并加入
                    </button>
                  </section>
                  <button
                    className="remove-experience"
                    onClick={() => removeExperience(selectedExperience)}
                    disabled={resume.experiences.length === 1}
                  >
                    <Trash2 size={14} /> 删除这段经历
                  </button>
                </div>
              </div>
            )}

            {tab === "review" && (
              <div className="form-content review-content">
                <section className="review-hero">
                  <div className="score-orbit large" style={{ "--score": `${match.score * 3.6}deg` } as React.CSSProperties}>
                    <strong>{match.score}</strong>
                  </div>
                  <div>
                    <span>投递准备度</span>
                    <h3>{match.score >= 80 ? "可以投递，继续针对岗位微调" : "先补齐关键证据再投递"}</h3>
                    <p>评分由关键词覆盖和资料完整度构成，不代表招聘结果。</p>
                  </div>
                </section>
                <div className="review-grid">
                  <article>
                    <span>关键词缺口</span>
                    <strong>{match.missing.length}</strong>
                    <p>{match.missing.slice(0, 5).join("、") || "核心关键词已覆盖"}</p>
                    <button onClick={() => setTab("job")}>返回岗位匹配</button>
                  </article>
                  <article>
                    <span>成果要点</span>
                    <strong>{health.averageBulletScore}%</strong>
                    <p>{health.bulletCount} 条要点，优先补充数字和业务结果。</p>
                    <button onClick={() => setTab("experience")}>优化工作经历</button>
                  </article>
                  <article>
                    <span>篇幅</span>
                    <strong>{health.characterCount}</strong>
                    <p>{health.onePageLikely ? "当前内容适合一页排版。" : "内容偏长，建议删除重复表达。"}</p>
                    <button onClick={() => setMobileView("preview")}>查看一页预览</button>
                  </article>
                </div>
                <section className="bullet-audit">
                  <h3>逐条检查</h3>
                  {allBullets.map((item, index) => (
                    <article key={`${item.experienceId}-${index}`}>
                      <div>
                        <strong>{item.analysis.score}</strong>
                        <p>{item.bullet || "空白要点"}</p>
                      </div>
                      <div>
                        {item.analysis.checks.map((check) => (
                          <span className={check.passed ? "passed" : ""} key={check.label}>
                            {check.passed ? <Check size={11} /> : <X size={11} />}
                            {check.label}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            )}
          </section>

          <aside
            className={
              mobileView === "preview"
                ? "preview"
                : mobileView === "review"
                  ? "preview mobile-hidden"
                  : "preview mobile-hidden"
            }
          >
            <div className="preview-bar">
              <span>
                <Eye size={14} /> A4 实时预览
              </span>
              <b>{health.onePageLikely ? "一页安全" : "可能超页"}</b>
            </div>
            <article className="resume-paper">
              <header>
                <div>
                  <h2>{resume.name || "你的姓名"}</h2>
                  <strong>{resume.targetRole || "目标岗位"}</strong>
                </div>
                <p>
                  {resume.phone || "手机"}<br />
                  {resume.email || "邮箱"}<br />
                  {resume.city || "城市"}
                </p>
              </header>
              <p className="resume-summary">
                {resume.summary || "用一句话概括年限、领域、能力与可验证优势。"}
              </p>
              <h3>EXPERIENCE / 工作经历</h3>
              {resume.experiences.map((experience) => (
                <section key={experience.id}>
                  <div className="resume-role">
                    <span>
                      <b>{experience.company || "公司名称"}</b>
                      <small>{experience.role || "职位"}</small>
                    </span>
                    <time>{experience.period || "时间"}</time>
                  </div>
                  <ul>
                    {experience.bullets.filter(Boolean).map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <h3>SKILLS / 专业技能</h3>
              <div className="resume-skills">
                {resume.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <h3>EDUCATION / 教育经历</h3>
              <p className="resume-education">{resume.education || "学校 · 专业 · 学历 · 时间"}</p>
            </article>
          </aside>
        </div>
      </main>

      {showReset && (
        <div className="modal-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="reset-title" className="confirm-modal">
            <button className="icon-button" onClick={() => setShowReset(false)} aria-label="关闭">
              <X size={17} />
            </button>
            <span>NEW RESUME</span>
            <h2 id="reset-title">创建空白简历？</h2>
            <p>当前本地草稿会被清空，已导出的文件不受影响。</p>
            <div>
              <button onClick={() => setShowReset(false)}>继续编辑</button>
              <button className="danger" onClick={confirmReset}>清空并创建</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
