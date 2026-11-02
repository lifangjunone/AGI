import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { tr } from "./i18n";
import { KnowledgeAnswerTest } from "./KnowledgeAnswerTest";

interface Document {
  id: string; title: string; content: string; active: boolean; revision: string; updatedAt: string;
}
interface Draft { id?: string; title: string; content: string; active: boolean; revision?: string }
export function OrganizationKnowledge({ organizations, locale }: {
  organizations: Array<{ id: string; name: string }>; locale: "zh-CN" | "en";
}) {
  const client = useQueryClient();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [sourceGeneration, setSourceGeneration] = useState(0);
  const fieldId = useId();
  const dirty = draft !== null && JSON.stringify(draft) !== original;
  useEffect(() => {
    if (!organizationId && organizations[0]) setOrganizationId(organizations[0].id);
  }, [organizationId, organizations]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const documents = useInfiniteQuery({
    queryKey: ["knowledge", organizationId], enabled: Boolean(organizationId),
    initialPageParam: null as string | null,
    getNextPageParam: (page: { documents: Document[]; nextCursor: string | null }) => page.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("before", pageParam);
      const response = await fetch(`/api/v1/organizations/${organizationId}/knowledge?${params}`, { credentials: "include", signal });
      if (!response.ok) throw new Error("knowledge_unavailable");
      return await response.json() as { documents: Document[]; nextCursor: string | null };
    }
  });
  const loadedDocuments = [...new Map((documents.data?.pages.flatMap(page => page.documents) ?? [])
    .map(item => [item.id, item])).values()];
  function mayDiscard() {
    return !dirty || window.confirm(tr(locale, "有未保存修改，确定放弃吗？", "Discard unsaved changes?"));
  }
  function edit(next: Draft | null) {
    if (busy || !mayDiscard()) return;
    setDraft(next); setOriginal(JSON.stringify(next)); setError(""); setFeedback("");
    setConflict(false); setDeletePending(false);
  }
  async function save(deleting = false) {
    if (!draft || busy) return;
    if (!deleting && (!draft.title.trim() || !draft.content.trim())) {
      setError(tr(locale, "请填写文档标题和正文，不能为空。", "Title and content cannot be empty."));
      return;
    }
    setBusy(true); setError(""); setFeedback("");
    const endpoint = `/api/v1/organizations/${organizationId}/knowledge${draft.id ? `/${draft.id}` : ""}`;
    try {
      const response = await fetch(endpoint, {
        credentials: "include", method: deleting ? "DELETE" : draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(deleting ? { revision: draft.revision } : {
          title: draft.title.trim(), content: draft.content.trim(), active: draft.active,
          ...(draft.id ? { revision: draft.revision } : {})
        })
      });
      if (response.status === 409) {
        setConflict(true);
        throw new Error("conflict");
      }
      if (!response.ok) throw new Error("save_failed");
      setSourceGeneration(value => value + 1);
      setDraft(null); setOriginal(""); setDeletePending(false); setConflict(false);
      setFeedback(tr(locale, deleting ? "文档已删除" : "文档已保存", deleting ? "Document deleted" : "Document saved"));
      await client.invalidateQueries({ queryKey: ["knowledge", organizationId] });
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "conflict"
        ? tr(locale, "文档已被修改。你的草稿已保留，请先读取最新版本并核对后再编辑。", "Document changed. Your draft is retained. Load the latest version and review before editing.")
        : tr(locale, "操作失败，草稿已保留，请重试。", "Action failed. Your draft is retained; please retry."));
    } finally { setBusy(false); }
  }
  async function readDocument(id: string) {
    if (busy || !mayDiscard()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/organizations/${organizationId}/knowledge/${id}`, { credentials: "include" });
      if (!response.ok) throw new Error("document_unavailable");
      const { document: latest } = await response.json() as { document: Document };
      const next = { id: latest.id, title: latest.title, content: latest.content, active: latest.active, revision: latest.revision };
      setDraft(next); setOriginal(JSON.stringify(next)); setConflict(false); setDeletePending(false); setError(""); setFeedback("");
    } catch {
      setError(tr(locale, "无法读取最新版本，文档可能已删除；草稿仍保留。", "Latest version unavailable or deleted. Your draft is retained."));
    } finally { setBusy(false); }
  }
  return <section className="organization-knowledge" aria-label={tr(locale, "企业知识库", "Organization knowledge base")}>
    <header><div><BookOpen size={20} aria-hidden="true" /><span><b>{tr(locale, "企业知识库", "Organization knowledge base")}</b>
      <small>{tr(locale, "管理真实来源文档；自动回答尚未接入。", "Manage real source documents. Automatic answers are not connected yet.")}</small></span></div>
      {organizations.length > 0 && <label>{tr(locale, "企业空间", "Organization")}
        <select value={organizationId} disabled={busy} onChange={event => {
          if (!mayDiscard()) return;
          setOrganizationId(event.target.value); setDraft(null); setOriginal("");
          setError(""); setFeedback(""); setConflict(false); setDeletePending(false);
        }}>{organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label>}
    </header>
    {!organizations.length ? <p>{tr(locale, "先创建企业空间，再添加知识文档。", "Create an organization before adding knowledge documents.")}</p> : <>
      <div className="knowledge-actions"><span>{tr(locale, `已加载 ${loadedDocuments.length} 篇`, `${loadedDocuments.length} loaded`)}</span>
        <button disabled={busy} onClick={() => edit({ title: "", content: "", active: true })}><Plus size={16} aria-hidden="true" />{tr(locale, "新建文档", "New document")}</button></div>
      {documents.isPending && <p role="status">{tr(locale, "正在读取文档…", "Loading documents…")}</p>}
      {documents.isError && <p role="alert">{tr(locale, "文档读取失败。", "Documents could not be loaded.")} <button onClick={() => void documents.refetch()}>{tr(locale, "重试", "Retry")}</button></p>}
      <div className="knowledge-document-list" aria-busy={documents.isFetchingNextPage}>{loadedDocuments.map(item => <button key={item.id} disabled={busy}
        onClick={() => void readDocument(item.id)}>
        <span><b>{item.title}</b><small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updatedAt))}</small></span>
        <em>{tr(locale, item.active ? "已启用" : "已停用", item.active ? "Enabled" : "Disabled")}</em>
      </button>)}</div>
      {documents.hasNextPage && <button disabled={documents.isFetchingNextPage || busy} onClick={() => void documents.fetchNextPage()}>
        {tr(locale, documents.isFetchingNextPage ? "正在加载…" : "加载更多文档", documents.isFetchingNextPage ? "Loading…" : "Load more documents")}
      </button>}
      {documents.isFetchNextPageError && <p role="alert">{tr(locale, "加载更多失败，已有文档仍可查看，请重试。", "Could not load more. Existing documents remain available; please retry.")}</p>}
      {!documents.isPending && !documents.isError && !loadedDocuments.length && <p>{tr(locale, "还没有知识文档，添加业务介绍、常见问题或服务政策。", "No documents yet. Add service information, FAQs or policies.")}</p>}
      {draft && <form className="knowledge-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h3>{tr(locale, draft.id ? "编辑文档" : "新建文档", draft.id ? "Edit document" : "New document")}</h3>
        <label htmlFor={`${fieldId}-title`}>{tr(locale, "文档标题", "Document title")}</label>
        <input id={`${fieldId}-title`} value={draft.title} maxLength={160} disabled={busy} required
          aria-describedby={`${fieldId}-help`} onChange={event => setDraft({ ...draft, title: event.target.value })} />
        <label htmlFor={`${fieldId}-content`}>{tr(locale, "文档正文", "Document content")}</label>
        <textarea id={`${fieldId}-content`} value={draft.content} maxLength={50000} disabled={busy} required
          aria-describedby={`${fieldId}-help`} onChange={event => setDraft({ ...draft, content: event.target.value })} />
        <small id={`${fieldId}-help`}>{tr(locale, "标题 1–160 字符，正文 1–50,000 字符。只填写获授权的企业资料。", "Title: 1–160 characters. Content: 1–50,000. Use only authorized organization information.")}</small>
        <label className="knowledge-active"><input type="checkbox" checked={draft.active} disabled={busy}
          onChange={event => setDraft({ ...draft, active: event.target.checked })} />{tr(locale, "启用这篇文档", "Enable this document")}</label>
        {error && <p role="alert">{error}</p>}
        {conflict && <button type="button" disabled={busy} onClick={() => void readDocument(draft.id!)}>{tr(locale, "读取最新版本", "Load latest version")}</button>}
        {deletePending && <div className="knowledge-delete-confirm" role="alert">
          <p>{tr(locale, "确定删除这篇文档？删除后无法恢复，可选择停用以保留正文。", "Delete this document permanently? Disable it instead to retain its content.")}</p>
          <button type="button" disabled={busy} onClick={() => void save(true)}>{tr(locale, "确认删除", "Confirm delete")}</button>
          <button type="button" disabled={busy} onClick={() => setDeletePending(false)}>{tr(locale, "取消删除", "Cancel deletion")}</button>
        </div>}
        <footer><button type="button" disabled={busy} onClick={() => edit(null)}>{tr(locale, "取消编辑", "Cancel editing")}</button>
          {draft.id && <button type="button" disabled={busy} onClick={() => setDeletePending(true)}><Trash2 size={16} aria-hidden="true" />{tr(locale, "删除文档", "Delete document")}</button>}
          <button className="primary-small" disabled={busy || conflict} type="submit">{tr(locale, busy ? "正在保存…" : "保存文档", busy ? "Saving…" : "Save document")}</button></footer>
      </form>}
      {!draft && error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      <KnowledgeAnswerTest key={organizationId} organizationId={organizationId} locale={locale}
        sourceGeneration={sourceGeneration} />
    </>}
  </section>;
}
