import { useState, type KeyboardEvent } from 'react';

import { api, TENANT_ID } from '../api/client';
import { setEnterpriseAuthSession, type EnterpriseAuthSession } from '../auth';
import AppHeader from '../components/AppHeader';
import BrandLogo from '../components/BrandLogo';
import IconFieldClear from '../assets/icons/field-clear.svg?react';
import IconFieldEye from '../assets/icons/field-eye.svg?react';
import IconFieldEyeOn from '../assets/icons/field-eye-on.svg?react';
import loginPreview from '../assets/staffdeck/login-preview.png';
import { BRAND } from '../config/brand';

export type LoginPageProps = {
  onLogin: (session: EnterpriseAuthSession) => void;
};

/**
 * Signed-out landing / login page. Mirrors Figma node 68:201 (`Login_light`):
 * a full-bleed hero with the LifeYouMe product lockup and product preview
 * anchored to the bottom. Clicking "登录" slides the credentials form (node 68:1563)
 * down into view in place of the call-to-action button.
 */
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    setUsernameError(trimmedUsername ? '' : '请输入账号');
    setPasswordError(trimmedPassword ? '' : '请输入密码');
    if (!trimmedUsername || !trimmedPassword) return;

    setLoading(true);
    try {
      const session = await api.post<EnterpriseAuthSession>('/api/auth/login', {
        tenant_id: TENANT_ID,
        username: trimmedUsername,
        password: trimmedPassword,
      });
      setEnterpriseAuthSession(session);
      onLogin(session);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '登录失败';
      setUsernameError('账号输入错误');
      setPasswordError(messageText || '密码输入错误');
    } finally {
      setLoading(false);
    }
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void login();
  }

  const inputBaseClass =
    'flex h-[44px] w-full items-center gap-[8px] rounded-[10px] border bg-white px-[16px] transition-colors';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8f7f2]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-80"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(216,255,62,0.24), transparent 58%)',
        }}
      />
      <AppHeader
        className="relative z-10 h-[64px] shrink-0 items-center border-b border-black/5 px-[20px] sm:px-[32px]"
        left={<BrandLogo markSize={28} />}
        right={(
          <a
            href={BRAND.productsUrl}
            className="rounded-full px-[12px] py-[8px] text-[13px] font-medium text-[#464c5e] transition-colors hover:bg-black/5 hover:text-[#111411] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411]"
          >
            返回产品目录
          </a>
        )}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center px-[16px] sm:px-[32px]">
        <div className="flex max-w-[820px] flex-col items-center pt-[48px] sm:pt-[68px]">
          <span className="flex items-center justify-center rounded-full border border-[#cbd68b] bg-[#f5ffd2] px-[16px] py-[7px] text-[13px] font-medium text-[#3b4219]">
            LifeYouMe AI 工程产品
          </span>
          <h1 className="mt-[18px] text-balance text-center text-[40px] font-semibold leading-[1.12] tracking-[-0.04em] text-[#111411] sm:text-[58px]">
            {BRAND.tagline}
          </h1>
          <p className="mt-[18px] max-w-[640px] text-center text-[15px] leading-[1.75] text-[#62675f] sm:text-[17px]">
            {BRAND.description}
          </p>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-[28px] flex min-h-[44px] items-center justify-center rounded-full bg-[#111411] px-[30px] py-[11px] text-[15px] font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#252a25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411] motion-reduce:transform-none"
            >
              进入数字团队
            </button>
          ) : (
            <form
              className="mt-[28px] flex w-full max-w-[360px] flex-col rounded-[20px] border border-black/8 bg-white/90 p-[20px] shadow-[0_20px_60px_rgba(17,20,17,0.08)] duration-300 ease-out animate-in fade-in slide-in-from-top-4"
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <div
                className={`${inputBaseClass} ${usernameError ? 'border-[#f54a45]' : username ? 'border-[#18181a]' : 'border-[#e3e7f1]'}`}
              >
                <input
                  value={username}
                  autoComplete="username"
                  placeholder="请输入账号"
                  aria-label="账号"
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (usernameError) setUsernameError('');
                  }}
                  onKeyDown={onFieldKeyDown}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#18181a] outline-none placeholder:text-[#757f9c]"
                />
                {username && (
                  <button
                    type="button"
                    aria-label="清空账号"
                    onClick={() => {
                      setUsername('');
                      setUsernameError('');
                    }}
                    className="grid size-[18px] shrink-0 place-items-center text-[#667085] outline-none transition-colors hover:text-[#464c5e]"
                  >
                    <IconFieldClear className="size-[18px]" />
                  </button>
                )}
              </div>

              <div
                className={`mt-[24px] ${inputBaseClass} ${passwordError ? 'border-[#f54a45]' : password ? 'border-[#18181a]' : 'border-[#e3e7f1]'}`}
              >
                <input
                  value={password}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  aria-label="密码"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  onKeyDown={onFieldKeyDown}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#18181a] outline-none placeholder:text-[#757f9c]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="grid size-[18px] shrink-0 place-items-center text-[#677185] outline-none transition-colors hover:text-[#464c5e]"
                >
                  {showPassword ? (
                    <IconFieldEyeOn className="size-[18px]" />
                  ) : (
                    <IconFieldEye className="size-[18px]" />
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-[24px] flex min-h-[44px] w-full items-center justify-center self-center rounded-[10px] bg-[#111411] text-[15px] font-medium text-white transition-colors hover:bg-[#252a25] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '登录中…' : '登录'}
              </button>
            </form>
          )}
        </div>

        <div className="mt-[44px] w-full max-w-[1240px] rounded-t-[24px] border border-black/10 bg-white p-[6px] pb-0 shadow-[0_30px_90px_rgba(17,20,17,0.12)] sm:p-[10px] sm:pb-0">
          <div className="overflow-hidden rounded-t-[17px] border border-black/5">
            <img
              src={loginPreview}
              alt={`${BRAND.fullName}产品界面预览`}
              className="h-auto w-full select-none object-contain"
              draggable={false}
            />
          </div>
        </div>
        <p className="py-[20px] text-center text-[12px] leading-[1.6] text-[#7c8179]">
          基于{' '}
          <a
            href={BRAND.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-black/25 underline-offset-4 hover:text-[#111411]"
          >
            {BRAND.upstreamName}
          </a>
          {' '}构建 · AGPL-3.0
        </p>
      </main>
    </div>
  );
}
