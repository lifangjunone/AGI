import React, { useEffect, useRef, useState } from "react";
import { readBlob, removeBlob, renderLocalVideo, saveBlob, speakPreview } from "./localEngine";
import {
  AVATARS_KEY,
  DRAFT_KEY,
  WORKS_KEY,
  makeId,
  mediaUrl,
  posterFromVideo,
  readLocal,
  writeLocal,
} from "./localStore";
import { asset } from "./assets";

const stockAvatars = [
  [asset("customer-service.webp"), "Professional"],
  [asset("doctor.webp"), "Clinician"],
  [asset("interview.webp"), "Interviewer"],
  [asset("school.webp"), "Educator"],
];
const emptyDraft = {
  stockImage: stockAvatars[0][0],
  sourceKey: "",
  posterKey: "",
  sourceName: "",
  language: "English (US)",
  voice: "Female",
  name: "",
  role: "AI customer service",
  greeting: "Hello! How can I help you today?",
  description: "",
  rights: false,
};
const stepNames = ["Appearance", "Voice", "Persona", "Review"];

function FieldError({ id, children }) {
  return children ? <p className="field-error" id={id}>{children}</p> : null;
}

function AvatarImage({ avatar, className = "" }) {
  const [source, setSource] = useState(avatar.stockImage);
  useEffect(() => {
    let active = true;
    let objectUrl;
    mediaUrl(avatar.posterKey, avatar.stockImage).then((url) => {
      objectUrl = url;
      if (active) setSource(url);
    });
    return () => {
      active = false;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [avatar.posterKey, avatar.stockImage]);
  return <img className={className} src={source} alt={`${avatar.name} avatar`} />;
}

function AvatarWizard({ initialRole, onCreated, notify }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft,
    ...readLocal(DRAFT_KEY, {}),
    ...(initialRole ? { role: initialRole } : {}),
  }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const errorSummary = useRef(null);

  const update = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    writeLocal(DRAFT_KEY, next);
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const validate = () => {
    const next = {};
    if (step === 0 && !draft.stockImage && !draft.posterKey) next.appearance = "Choose an example or upload your media.";
    if (step === 2) {
      if (!draft.name.trim()) next.name = "Enter an avatar name.";
      if (!draft.greeting.trim()) next.greeting = "Add a greeting.";
    }
    if (step === 3 && !draft.rights) next.rights = "Confirm that you have permission to use this likeness.";
    setErrors(next);
    if (Object.keys(next).length) setTimeout(() => errorSummary.current?.focus(), 0);
    return !Object.keys(next).length;
  };

  const uploadAppearance = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrors({});
    try {
      const sourceKey = makeId("avatar-source");
      let poster = file;
      if (file.type.startsWith("video/")) {
        const result = await posterFromVideo(file);
        if (result.duration < 8) throw new Error("Training videos must be at least 8 seconds long.");
        poster = result.blob;
      } else if (!file.type.startsWith("image/")) {
        throw new Error("Choose an image, MP4, MOV, or WebM file.");
      }
      const posterKey = makeId("avatar-poster");
      await Promise.all([saveBlob(sourceKey, file), saveBlob(posterKey, poster)]);
      update("sourceKey", sourceKey);
      setDraft((current) => {
        const next = { ...current, posterKey, stockImage: "", sourceName: file.name };
        writeLocal(DRAFT_KEY, next);
        return next;
      });
    } catch (error) {
      setErrors({ appearance: error.message });
    } finally {
      event.target.value = "";
    }
  };

  const createAvatar = async () => {
    if (!validate()) return;
    setBusy(true);
    for (const value of [18, 42, 71, 100]) {
      await new Promise((resolve) => setTimeout(resolve, 160));
      setProgress(value);
    }
    const avatar = {
      ...draft,
      id: makeId("avatar"),
      createdAt: new Date().toISOString(),
      status: "ready",
    };
    const avatars = [avatar, ...readLocal(AVATARS_KEY, [])];
    writeLocal(AVATARS_KEY, avatars);
    localStorage.removeItem(DRAFT_KEY);
    setBusy(false);
    notify("Avatar created and stored in this browser.");
    onCreated(avatar.id);
  };

  const next = () => {
    if (validate()) setStep((value) => Math.min(3, value + 1));
  };

  return (
    <div className="wizard">
      <ol className="wizard-steps" aria-label="Avatar creation progress">
        {stepNames.map((name, index) => (
          <li key={name} className={index === step ? "active" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index + 1}</span><small>{name}</small>
          </li>
        ))}
      </ol>
      <div className="wizard-stage">
        {Object.keys(errors).length > 0 && (
          <div className="error-summary" role="alert" tabIndex="-1" ref={errorSummary}>
            <strong>Complete this step to continue.</strong>
            <p>{Object.values(errors)[0]}</p>
          </div>
        )}

        {step === 0 && (
          <>
            <div className="stage-heading"><span>Step 1 of 4</span><h3>Choose an appearance</h3><p>Use an included example, or upload a photo or training video. Files never leave this browser.</p></div>
            <div className="stock-grid">
              {stockAvatars.map(([image, label]) => (
                <button key={image} type="button" className={draft.stockImage === image ? "selected" : ""} onClick={() => {
                  update("stockImage", image);
                  update("posterKey", "");
                  update("sourceName", "");
                }}>
                  <img src={image} alt="" /><span>{label}</span><b>{draft.stockImage === image ? "Selected" : "Choose"}</b>
                </button>
              ))}
            </div>
            <label className="upload-drop" htmlFor="avatar-media">
              <strong>Upload your own</strong>
              <span>Image or video · video must be at least 8 seconds</span>
              <input id="avatar-media" type="file" accept="image/*,video/mp4,video/quicktime,video/webm" onChange={uploadAppearance} />
              {draft.sourceName && <em>Ready: {draft.sourceName}</em>}
            </label>
            <FieldError id="appearance-error">{errors.appearance}</FieldError>
          </>
        )}

        {step === 1 && (
          <>
            <div className="stage-heading"><span>Step 2 of 4</span><h3>Set the voice</h3><p>Choose how previews are spoken. The browser uses an installed system voice.</p></div>
            <div className="choice-grid">
              <label>Speaking language<select value={draft.language} onChange={(event) => update("language", event.target.value)}><option>English (US)</option><option>中文（普通话）</option><option>日本語</option><option>Español</option></select></label>
              <label>Voice preset<select value={draft.voice} onChange={(event) => update("voice", event.target.value)}><option>Female</option><option>Male</option><option>Neutral</option></select></label>
            </div>
            <button type="button" className="button button-outline" onClick={() => {
              try { speakPreview(draft.greeting, draft.voice); notify("Playing a system voice preview."); }
              catch (error) { setErrors({ voice: error.message }); }
            }}>Preview voice</button>
            <FieldError id="voice-error">{errors.voice}</FieldError>
          </>
        )}

        {step === 2 && (
          <>
            <div className="stage-heading"><span>Step 3 of 4</span><h3>Define the persona</h3><p>This metadata is saved locally and used in the video studio.</p></div>
            <div className="creator-form compact-form">
              <label htmlFor="avatar-name">Avatar name <span>*</span></label>
              <input id="avatar-name" value={draft.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
              <FieldError id="avatar-name-error">{errors.name}</FieldError>
              <label htmlFor="avatar-role">Role</label>
              <select id="avatar-role" value={draft.role} onChange={(event) => update("role", event.target.value)}><option>AI customer service</option><option>AI doctor</option><option>AI interview</option><option>AI companion</option><option>School AI</option></select>
              <label htmlFor="avatar-greeting">Greeting <span>*</span></label>
              <textarea id="avatar-greeting" rows="3" value={draft.greeting} onChange={(event) => update("greeting", event.target.value)} aria-invalid={Boolean(errors.greeting)} />
              <FieldError id="avatar-greeting-error">{errors.greeting}</FieldError>
              <label htmlFor="avatar-description">Personality and knowledge</label>
              <textarea id="avatar-description" rows="4" value={draft.description} onChange={(event) => update("description", event.target.value)} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="stage-heading"><span>Step 4 of 4</span><h3>Review and create</h3><p>Your source and metadata remain on this device.</p></div>
            <div className="review-panel">
              <dl><div><dt>Name</dt><dd>{draft.name}</dd></div><div><dt>Role</dt><dd>{draft.role}</dd></div><div><dt>Voice</dt><dd>{draft.language} · {draft.voice}</dd></div><div><dt>Source</dt><dd>{draft.sourceName || "Included example"}</dd></div></dl>
              <p><strong>Capability boundary:</strong> this local app stores your avatar and renders real WebM video. Neural likeness training and lip-sync require the included official Duix-Avatar NVIDIA/Docker runtime.</p>
              <label className="check-row"><input type="checkbox" checked={draft.rights} onChange={(event) => update("rights", event.target.checked)} /><span>I own or have permission to use this person's likeness and media.</span></label>
              <FieldError id="rights-error">{errors.rights}</FieldError>
              {busy && <div className="process-bar" role="status"><span style={{ width: `${progress}%` }} /><p>Processing locally… {progress}%</p></div>}
            </div>
          </>
        )}

        <div className="wizard-actions">
          <button type="button" className="button button-outline" disabled={step === 0 || busy} onClick={() => setStep((value) => value - 1)}>Back</button>
          {step < 3
            ? <button type="button" className="button" onClick={next}>Continue</button>
            : <button type="button" className="button" disabled={busy} onClick={createAvatar}>{busy ? "Creating…" : "Create local avatar"}</button>}
        </div>
      </div>
    </div>
  );
}

function AvatarLibrary({ avatars, setAvatars, openStudio, openCreate, notify }) {
  const deleteAvatar = async (avatar) => {
    await Promise.all([avatar.sourceKey, avatar.posterKey].filter(Boolean).map(removeBlob));
    const next = avatars.filter((item) => item.id !== avatar.id);
    setAvatars(next);
    writeLocal(AVATARS_KEY, next);
    notify("Avatar deleted.");
  };
  if (!avatars.length) return <div className="workspace-empty"><strong>No avatars yet</strong><p>Create an avatar first, then use it to make a local video.</p><button className="button" onClick={openCreate}>Create avatar</button></div>;
  return <div className="avatar-library-grid">{avatars.map((avatar) => (
    <article key={avatar.id}>
      <AvatarImage avatar={avatar} />
      <div className="card-body"><span className="ready-pill">Ready</span><h3>{avatar.name}</h3><p>{avatar.role}</p><small>{avatar.language} · {avatar.voice}</small></div>
      <div className="card-actions"><button className="button" onClick={() => openStudio(avatar.id)}>Create video</button><button className="danger-button" onClick={() => deleteAvatar(avatar)}>Delete</button></div>
    </article>
  ))}</div>;
}

function VideoStudio({ avatars, initialAvatarId, onRendered, notify }) {
  const [avatarId, setAvatarId] = useState(initialAvatarId || avatars[0]?.id || "");
  const [mode, setMode] = useState("text");
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [audio, setAudio] = useState(null);
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const avatar = avatars.find((item) => item.id === avatarId);

  const render = async () => {
    const next = {};
    if (!avatar) next.avatar = "Select an avatar.";
    if (!name.trim()) next.name = "Enter a video name.";
    if (mode === "text" && !script.trim()) next.script = "Enter the words to show in the video.";
    if (mode === "audio" && !audio) next.audio = "Choose an audio file.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setRendering(true);
    const workId = makeId("work");
    const blobKey = `${workId}-video`;
    const works = [{ id: workId, blobKey, name, avatarId, script: script || audio.name, status: "rendering", createdAt: new Date().toISOString() }, ...readLocal(WORKS_KEY, [])];
    writeLocal(WORKS_KEY, works);
    try {
      const imageSource = await mediaUrl(avatar.posterKey, avatar.stockImage);
      const blob = await renderLocalVideo({ imageSource, script: script || "Uploaded audio", name, audioBlob: mode === "audio" ? audio : undefined, onProgress: setProgress });
      if (imageSource.startsWith("blob:")) URL.revokeObjectURL(imageSource);
      await saveBlob(blobKey, blob);
      const completed = works.map((item) => item.id === workId ? { ...item, status: "success", size: blob.size } : item);
      writeLocal(WORKS_KEY, completed);
      notify("Local WebM rendered successfully.");
      onRendered();
    } catch (error) {
      writeLocal(WORKS_KEY, works.map((item) => item.id === workId ? { ...item, status: "failed", error: error.message } : item));
      setErrors({ render: error.message });
    } finally {
      setRendering(false);
    }
  };

  if (!avatars.length) return <div className="workspace-empty"><strong>Create an avatar first</strong><p>The studio needs a local avatar before it can render a video.</p></div>;
  return <div className="studio-layout">
    <aside className="studio-avatar-list"><h3>1. Choose avatar</h3>{avatars.map((item) => <button className={item.id === avatarId ? "selected" : ""} key={item.id} onClick={() => setAvatarId(item.id)}><AvatarImage avatar={item} /><span>{item.name}</span></button>)}<FieldError>{errors.avatar}</FieldError></aside>
    <section className="studio-preview">{avatar && <><AvatarImage avatar={avatar} /><div><strong>{name || "Untitled video"}</strong><p>{script || (audio ? audio.name : "Your script will appear here.")}</p></div></>}</section>
    <section className="studio-editor creator-form">
      <h3>2. Add content</h3>
      <label htmlFor="video-name">Video name <span>*</span></label><input id="video-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} /><FieldError>{errors.name}</FieldError>
      <div className="mode-tabs" role="tablist"><button className={mode === "text" ? "active" : ""} role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>Text to video</button><button className={mode === "audio" ? "active" : ""} role="tab" aria-selected={mode === "audio"} onClick={() => setMode("audio")}>Audio to video</button></div>
      {mode === "text" ? <><label htmlFor="video-script">Script <span>*</span></label><textarea id="video-script" rows="7" value={script} onChange={(event) => setScript(event.target.value)} /><FieldError>{errors.script}</FieldError><button className="button button-outline" type="button" onClick={() => { try { speakPreview(script || avatar.greeting, avatar.voice); notify("Playing speech preview."); } catch (error) { setErrors({ render: error.message }); } }}>Preview speech</button></> : <><label className="upload-drop" htmlFor="audio-file"><strong>Upload audio</strong><span>MP3, WAV, M4A, or WebM · local demo renders up to 60 seconds</span><input id="audio-file" type="file" accept="audio/*" onChange={(event) => setAudio(event.target.files?.[0] || null)} />{audio && <em>Ready: {audio.name}</em>}</label><FieldError>{errors.audio}</FieldError></>}
      <FieldError>{errors.render}</FieldError>
      {rendering && <div className="process-bar" role="status"><span style={{ width: `${progress}%` }} /><p>Rendering locally… {progress}%</p></div>}
      <button className="button render-button" disabled={rendering} onClick={render}>{rendering ? "Rendering…" : "Render local video"}</button>
    </section>
  </div>;
}

function WorkCard({ work, avatar, onDelete, notify, locale }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (work.status !== "success") return undefined;
    let active = true;
    let objectUrl;
    readBlob(work.blobKey).then((blob) => {
      if (!blob || !active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [work]);
  const download = async () => {
    const blob = await readBlob(work.blobKey);
    if (!blob) return notify("The rendered file is missing.");
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${work.name.replace(/[^a-z0-9_-]+/gi, "-") || "duix-video"}.webm`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  return <article className="work-card">
    {url ? <video src={url} controls preload="metadata" aria-label={`${work.name} rendered video`} /> : <div className="work-placeholder">{work.status === "failed" ? "Render failed" : "Loading local video…"}</div>}
    <div className="card-body"><span className={`status-pill ${work.status}`}>{work.status}</span><h3>{work.name}</h3><p>{avatar?.name || "Deleted avatar"} · {new Date(work.createdAt).toLocaleString(locale)}</p>{work.error && <small className="field-error">{work.error}</small>}</div>
    <div className="card-actions">{work.status === "success" && <button className="button" onClick={download}>Download WebM</button>}<button className="danger-button" onClick={() => onDelete(work)}>Delete</button></div>
  </article>;
}

function WorksLibrary({ works, setWorks, avatars, notify, locale }) {
  const remove = async (work) => {
    await removeBlob(work.blobKey);
    const next = works.filter((item) => item.id !== work.id);
    setWorks(next);
    writeLocal(WORKS_KEY, next);
    notify("Work deleted.");
  };
  if (!works.length) return <div className="workspace-empty"><strong>No works yet</strong><p>Render a text or audio video in the local studio. It will appear here as a real WebM file.</p></div>;
  return <div className="works-grid">{works.map((work) => <WorkCard key={work.id} work={work} avatar={avatars.find((item) => item.id === work.avatarId)} onDelete={remove} notify={notify} locale={locale} />)}</div>;
}

export default function LocalWorkspace({ panel, onClose, initialRole, locale }) {
  const [view, setView] = useState(panel);
  const [avatars, setAvatars] = useState(() => readLocal(AVATARS_KEY, []));
  const [works, setWorks] = useState(() => readLocal(WORKS_KEY, []));
  const [studioAvatar, setStudioAvatar] = useState("");
  const [notice, setNotice] = useState("");
  const sheet = useRef(null);
  const previousFocus = useRef(null);
  const notify = (message) => { setNotice(message); setTimeout(() => setNotice(""), 2600); };

  useEffect(() => {
    setView(panel);
    if (!panel) return undefined;
    previousFocus.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => sheet.current?.focus(), 0);
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = sheet.current?.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", handleKey);
      previousFocus.current?.focus();
    };
  }, [panel, onClose]);

  useEffect(() => {
    setAvatars(readLocal(AVATARS_KEY, []));
    setWorks(readLocal(WORKS_KEY, []));
  }, [view]);
  if (!panel) return null;

  const goStudio = (id) => { setStudioAvatar(id); setView("studio"); };
  const titles = { create: "Create an AI avatar", library: "My avatars", studio: "Video studio", works: "My works", docs: "Local developer guide", contact: "Project inquiry", legal: "Local project information" };
  return <div className="workspace-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={sheet} className="workspace-sheet workspace-product" role="dialog" aria-modal="true" aria-labelledby="workspace-title" tabIndex="-1">
      <header className="workspace-header"><div><span className="local-badge">100% local workspace</span><h2 id="workspace-title">{titles[view] || "Local workspace"}</h2></div><div className="workspace-head-actions"><button className="workspace-close" onClick={onClose} aria-label="Close local workspace">×</button></div></header>
      {!["docs", "contact", "legal"].includes(view) && <nav className="workspace-nav" aria-label="Local product navigation">
        {[["create", "Create avatar"], ["library", "My avatars"], ["studio", "Video studio"], ["works", "My works"]].map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
      </nav>}
      <main className="workspace-content">
        {view === "create" && <AvatarWizard initialRole={initialRole} notify={notify} onCreated={() => { setAvatars(readLocal(AVATARS_KEY, [])); setView("library"); }} />}
        {view === "library" && <AvatarLibrary avatars={avatars} setAvatars={setAvatars} openStudio={goStudio} openCreate={() => setView("create")} notify={notify} />}
        {view === "studio" && <VideoStudio key={studioAvatar} avatars={avatars} initialAvatarId={studioAvatar} notify={notify} onRendered={() => { setWorks(readLocal(WORKS_KEY, [])); setView("works"); }} />}
        {view === "works" && <WorksLibrary works={works} setWorks={setWorks} avatars={avatars} notify={notify} locale={locale} />}
        {view === "docs" && <div className="local-docs"><p>This replica makes the browser-safe core flow real: media stays in IndexedDB, metadata stays in localStorage, and videos are rendered by Canvas + MediaRecorder.</p><pre><code>cd site{"\n"}npm install{"\n"}npm run dev</code></pre><h3>Full neural runtime</h3><p>The included <code>upstream/Duix-Avatar</code> source provides the official NVIDIA/Docker path for neural avatar inference and lip-sync. The browser studio does not falsely claim to run that GPU model.</p></div>}
        {view === "contact" && <div className="local-docs"><h3>Local-only project mode</h3><p>This build deliberately contains no external lead form or redirect. Use the Create avatar and Video studio tabs to evaluate the complete local path.</p></div>}
        {view === "legal" && <div className="local-docs"><p>This local product replica does not collect accounts, payment, or cloud-generation data. Uploaded media and rendered works remain in this browser profile.</p><p>Official Duix source and public assets remain subject to their original licenses and rights notices.</p></div>}
      </main>
      <div className="workspace-status" aria-live="polite">{notice}</div>
    </section>
  </div>;
}
