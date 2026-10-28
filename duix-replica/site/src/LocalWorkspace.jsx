import React, { useEffect, useRef, useState } from "react";

const draftKey = "duix-local-avatar-draft";
const avatarsKey = "duix-local-avatars";
const inquiriesKey = "duix-local-inquiries";
const emptyDraft = {
  name: "",
  role: "AI customer service",
  greeting: "Hello! How can I help you today?",
  description: "",
};

function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export default function LocalWorkspace({ panel, onClose, previewImage, initialRole }) {
  const firstControl = useRef(null);
  const errorSummary = useRef(null);
  const [draft, setDraft] = useState(() => readLocal(draftKey, emptyDraft));
  const [avatars, setAvatars] = useState(() => readLocal(avatarsKey, []));
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", message: "" });

  useEffect(() => {
    if (!panel) return undefined;
    if (initialRole) setDraft((current) => ({ ...current, role: initialRole }));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => firstControl.current?.focus(), 0);
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [panel, initialRole, onClose]);

  if (!panel) return null;

  const updateDraft = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    window.localStorage.setItem(draftKey, JSON.stringify(next));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateField = (field) => {
    const value = draft[field]?.trim();
    let message = "";
    if (field === "name" && !value) message = "Enter an avatar name.";
    if (field === "greeting" && !value) message = "Add the first words your avatar will say.";
    setErrors((current) => ({ ...current, [field]: message }));
    return !message;
  };

  const saveAvatar = (event) => {
    event.preventDefault();
    const nameValid = validateField("name");
    const greetingValid = validateField("greeting");
    if (!nameValid || !greetingValid) {
      window.setTimeout(() => errorSummary.current?.focus(), 0);
      return;
    }
    const avatar = {
      ...draft,
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      image: previewImage,
      createdAt: new Date().toISOString(),
    };
    const next = [avatar, ...avatars];
    setAvatars(next);
    window.localStorage.setItem(avatarsKey, JSON.stringify(next));
    window.localStorage.removeItem(draftKey);
    setDraft(emptyDraft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const deleteAvatar = (id) => {
    const next = avatars.filter((avatar) => avatar.id !== id);
    setAvatars(next);
    window.localStorage.setItem(avatarsKey, JSON.stringify(next));
  };

  const saveInquiry = (event) => {
    event.preventDefault();
    const inquiries = readLocal(inquiriesKey, []);
    window.localStorage.setItem(
      inquiriesKey,
      JSON.stringify([{ ...contact, createdAt: new Date().toISOString() }, ...inquiries]),
    );
    setContact({ name: "", email: "", message: "" });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="workspace-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="workspace-sheet" role="dialog" aria-modal="true" aria-labelledby="workspace-title">
        <header className="workspace-header">
          <div>
            <span className="local-badge">Local workspace</span>
            <h2 id="workspace-title">
              {panel === "create" && "Create an AI avatar"}
              {panel === "library" && "Your local avatars"}
              {panel === "docs" && "Local developer guide"}
              {panel === "contact" && "Project inquiry"}
              {panel === "legal" && "Local project information"}
            </h2>
          </div>
          <button className="workspace-close" onClick={onClose} aria-label="Close local workspace">×</button>
        </header>

        {panel === "create" && (
          <div className="creator-layout">
            <div className="avatar-preview">
              <img src={previewImage} alt="" />
              <div>
                <span>Live local preview</span>
                <strong>{draft.name || "Your avatar"}</strong>
                <p>{draft.greeting || "Add a greeting to preview the conversation."}</p>
              </div>
            </div>
            <form className="creator-form" onSubmit={saveAvatar} noValidate>
              {Object.values(errors).some(Boolean) && (
                <div className="error-summary" role="alert" tabIndex="-1" ref={errorSummary}>
                  <strong>Check the highlighted fields.</strong>
                  <p>Your draft is still saved locally.</p>
                </div>
              )}
              <label htmlFor="avatar-name">Avatar name <span>*</span></label>
              <input
                ref={firstControl}
                id="avatar-name"
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                onBlur={() => validateField("name")}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "avatar-name-error" : undefined}
                placeholder="e.g. Maya"
              />
              <p className="field-error" id="avatar-name-error">{errors.name}</p>

              <label htmlFor="avatar-role">Role</label>
              <select id="avatar-role" value={draft.role} onChange={(event) => updateDraft("role", event.target.value)}>
                <option>AI customer service</option>
                <option>AI doctor</option>
                <option>AI interview</option>
                <option>AI girlfriend</option>
                <option>AI boyfriend</option>
                <option>School AI</option>
              </select>

              <label htmlFor="avatar-greeting">Greeting <span>*</span></label>
              <textarea
                id="avatar-greeting"
                rows="3"
                value={draft.greeting}
                onChange={(event) => updateDraft("greeting", event.target.value)}
                onBlur={() => validateField("greeting")}
                aria-invalid={Boolean(errors.greeting)}
                aria-describedby={errors.greeting ? "avatar-greeting-error" : "avatar-greeting-help"}
              />
              <p className="field-help" id="avatar-greeting-help">This is the first line shown in the local preview.</p>
              <p className="field-error" id="avatar-greeting-error">{errors.greeting}</p>

              <label htmlFor="avatar-description">Personality and knowledge</label>
              <textarea
                id="avatar-description"
                rows="4"
                value={draft.description}
                onChange={(event) => updateDraft("description", event.target.value)}
                placeholder="Describe tone, expertise, and conversation style."
              />
              <div className="form-actions">
                <button type="button" className="button button-outline" onClick={onClose}>Keep draft</button>
                <button type="submit" className="button">Save local avatar</button>
              </div>
            </form>
          </div>
        )}

        {panel === "library" && (
          <div className="local-library" ref={firstControl} tabIndex="-1">
            {avatars.length === 0 ? (
              <div className="workspace-empty">
                <strong>No local avatars yet</strong>
                <p>Create one from any “Start locally” button. Drafts and saved avatars stay in this browser.</p>
              </div>
            ) : avatars.map((avatar) => (
              <article key={avatar.id}>
                <img src={avatar.image} alt="" />
                <div><strong>{avatar.name}</strong><span>{avatar.role}</span><p>{avatar.greeting}</p></div>
                <button onClick={() => deleteAvatar(avatar.id)}>Delete</button>
              </article>
            ))}
          </div>
        )}

        {panel === "docs" && (
          <div className="local-docs" ref={firstControl} tabIndex="-1">
            <p>This project runs entirely from the local Vite app. No Duix account or cloud API is required for the replicated interface.</p>
            <pre><code>cd site{"\n"}npm install{"\n"}npm run dev</code></pre>
            <h3>Included official source</h3>
            <ul>
              <li><code>upstream/Duix-Avatar</code> — official Electron/Vue client</li>
              <li><code>upstream/duix-doc</code> — official API documentation source</li>
              <li><code>upstream/duix-skills</code> — official agent skills</li>
            </ul>
            <p>The avatar inference runtime is separate and requires its documented NVIDIA/Docker environment. The local workspace never pretends GPU generation has completed.</p>
          </div>
        )}

        {panel === "contact" && (
          <form className="creator-form contact-form" onSubmit={saveInquiry}>
            <p>Save a project brief locally. Nothing is submitted externally.</p>
            <label htmlFor="contact-name">Name</label>
            <input ref={firstControl} id="contact-name" required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} />
            <label htmlFor="contact-email">Email</label>
            <input id="contact-email" type="email" required value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} />
            <label htmlFor="contact-message">What are you building?</label>
            <textarea id="contact-message" rows="6" required value={contact.message} onChange={(event) => setContact({ ...contact, message: event.target.value })} />
            <button className="button" type="submit">Save inquiry locally</button>
          </form>
        )}

        {panel === "legal" && (
          <div className="local-docs" ref={firstControl} tabIndex="-1">
            <p>This is a local product replica for development and evaluation. It does not collect accounts, payments, or cloud-generation data.</p>
            <p>Drafts, saved avatars, and project inquiries are stored only in this browser’s local storage.</p>
            <p>Official Duix source and public assets remain subject to their original licenses and rights notices.</p>
          </div>
        )}

        <div className="workspace-status" aria-live="polite">{saved && "Saved in this browser."}</div>
      </section>
    </div>
  );
}
