import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import {
  setEnterpriseAuthSession,
  type EnterpriseAuthSession,
} from '../auth';
import PublicProductHeader from '../components/PublicProductHeader';
import { appPath } from '../lib/app-path';

export default function AuthCallbackPage({
  onLogin,
}: {
  onLogin: (session: EnterpriseAuthSession) => void;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api.post<EnterpriseAuthSession>('/api/auth/sso/exchange')
      .then((session) => {
        if (cancelled) return;
        setEnterpriseAuthSession(session);
        onLogin(session);
        navigate('/workspace/gallery', { replace: true });
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : '统一账号连接失败');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, onLogin]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8f7f2]">
      <div className="auth-callback-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <PublicProductHeader />
      <main className="relative z-10 grid flex-1 place-items-center px-[20px] py-[48px]">
        <section
          aria-busy={!error}
          className="w-full max-w-[440px] rounded-[28px] border border-black/8 bg-white/88 px-[28px] py-[42px] text-center shadow-[0_30px_90px_rgba(17,20,17,0.12)] backdrop-blur-xl sm:px-[48px]"
        >
          {error ? (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-[16px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a43b32]"
            >
              <span className="mx-auto grid size-[52px] place-items-center rounded-2xl bg-[#f2f1eb] text-[#111411]">
                <RotateCcw className="size-[22px]" aria-hidden="true" />
              </span>
              <h1 className="mt-[22px] text-[25px] font-semibold tracking-[-0.03em] text-[#111411]">连接没有完成</h1>
              <p className="mt-[10px] text-[14px] leading-7 text-[#6d726e]">{error}</p>
              <a
                href={appPath('/auth/login')}
                className="mt-[26px] flex min-h-[46px] w-full items-center justify-center rounded-[12px] bg-[#111411] text-[15px] font-medium text-white hover:bg-[#252a25] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111411]"
              >
                重新登录
              </a>
            </div>
          ) : (
            <>
              <span className="mx-auto grid size-[52px] place-items-center rounded-2xl bg-[#111411] text-[#d8ff3e]">
                <LoaderCircle className="size-[23px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
              </span>
              <h1 className="mt-[22px] text-[25px] font-semibold tracking-[-0.03em] text-[#111411]">正在进入数字团队</h1>
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="mt-[10px] text-[14px] leading-7 text-[#6d726e]"
              >
                正在安全连接你的 LifeYouMe 统一账号…
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
