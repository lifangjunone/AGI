import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api-client";
import { tr } from "./i18n";
import { useAppStore } from "./store";
import { SESSION_CHANGE_KEY } from "./session-sync";

export interface SessionRecord {
  user: { id: string; name: string; email?: string } | null;
  authLoginUrl?: string;
}

export function SessionGate({ children, login }: { children: ReactNode; login: ReactNode }) {
  const locale = useAppStore(s => s.locale);
  const client = useQueryClient();
  const [acceptedIdentity, setAcceptedIdentity] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const transition = useRef(0);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api<SessionRecord>("/api/v1/session", { signal }),
    retry: false,
    refetchOnWindowFocus: "always"
  });
  const identity = session.data?.user?.id ?? "";
  useEffect(() => {
    if (syncing || !session.data || session.error || identity === acceptedIdentity) return;
    const version = ++transition.current;
    void client.cancelQueries({ predicate: query => query.queryKey[0] !== "session" }).then(() => {
      if (version !== transition.current) return;
      client.removeQueries({ predicate: query => query.queryKey[0] !== "session" });
      useAppStore.getState().setAgentPaused(false);
      setAcceptedIdentity(identity);
    });
    return () => { transition.current++; };
  }, [identity, acceptedIdentity, session.data, session.error, client, syncing]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== SESSION_CHANGE_KEY) return;
      setAcceptedIdentity(null);
      setSyncing(true);
      void client.invalidateQueries({ queryKey: ["session"] }).finally(() => setSyncing(false));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [client]);
  if (session.isPending) return <div className="auth-page"><div className="state-card" role="status">
    <RefreshCw aria-hidden="true" /><h2>{tr(locale, "正在确认登录状态…", "Checking your session…")}</h2>
  </div></div>;
  const validSession = session.data && (session.data.user === null
    || (typeof session.data.user?.id === "string" && Boolean(session.data.user.id)
      && typeof session.data.user?.name === "string"));
  if (session.error || !validSession) return <div className="auth-page">
    <div className="state-card error" role="alert"><CircleAlert aria-hidden="true" />
      <h2>{tr(locale, "暂时无法验证登录状态", "Unable to verify your session")}</h2>
      <p>{tr(locale, "请检查网络后重试。验证成功前不会加载你的工作台。", "Check your connection and retry. Your workspace will open after verification.")}</p>
      <button className="primary-small" disabled={session.isFetching} onClick={() => void session.refetch()}>
        {tr(locale, session.isFetching ? "正在重试…" : "重新验证", session.isFetching ? "Retrying…" : "Verify again")}
      </button>
    </div>
  </div>;
  if (syncing || acceptedIdentity !== identity) return <div className="auth-page"><div className="state-card" role="status">
    <RefreshCw aria-hidden="true" /><h2>{tr(locale, "正在切换账号空间…", "Switching account workspace…")}</h2>
  </div></div>;
  return session.data?.user ? <Fragment key={identity}>{children}</Fragment> : login;
}
