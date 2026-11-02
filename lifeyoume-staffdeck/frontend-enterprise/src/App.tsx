import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { api, isAuthError } from "./api/client";
import {
  clearEnterpriseAuthSession,
  getEnterpriseAuthSession,
  setEnterpriseAuthSession,
  type EnterpriseAuthSession,
  type EnterpriseAuthUser,
} from "./auth";
import { useI18n } from "./i18n";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AuthPage from "./pages/AuthPage";
import LoginPage from "./pages/LoginPage";

const loadAuthenticatedApp = () => import("./AuthenticatedApp");
const AuthenticatedApp = lazy(loadAuthenticatedApp);

function WorkspaceLoading() {
  return (
    <main className="workspace-loading" aria-busy="true" aria-live="polite">
      <span className="workspace-loading__mark" aria-hidden="true">LY</span>
      <span>正在进入数字团队…</span>
    </main>
  );
}

export default function App() {
  useI18n();
  const [auth, setAuth] = useState<EnterpriseAuthSession | null>(() =>
    getEnterpriseAuthSession(),
  );
  const [authChecked, setAuthChecked] = useState(() => !auth?.token);

  useEffect(() => {
    if (!auth?.token) {
      setAuthChecked(true);
      return undefined;
    }

    let cancelled = false;
    setAuthChecked(false);
    // Returning users can download the workspace while the server validates
    // their session. Anonymous visitors never cross this loading seam.
    void loadAuthenticatedApp();
    void api.get<EnterpriseAuthUser>("/api/auth/me")
      .then((user) => {
        if (cancelled) return;
        const refreshed = {
          token: getEnterpriseAuthSession()?.token || auth.token,
          user,
        };
        setEnterpriseAuthSession(refreshed);
        setAuth(refreshed);
        setAuthChecked(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isAuthError(error)) {
          clearEnterpriseAuthSession();
          setAuth(null);
        }
        setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [auth?.token]);

  function logout() {
    void api.post("/api/auth/logout").catch(() => undefined);
    clearEnterpriseAuthSession();
    setAuth(null);
    setAuthChecked(true);
  }

  const content = auth && !authChecked
    ? <WorkspaceLoading />
    : auth
      ? (
        <Suspense fallback={<WorkspaceLoading />}>
          <AuthenticatedApp auth={auth} onLogout={logout} />
        </Suspense>
      )
      : (
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage onLogin={setAuth} />} />
          <Route path="/auth/login" element={<AuthPage />} />
          <Route path="/auth/register" element={<AuthPage />} />
          <Route path="*" element={<LoginPage onLogin={setAuth} />} />
        </Routes>
      );

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {content}
    </BrowserRouter>
  );
}
