import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import PublicProductHeader from '../components/PublicProductHeader';
import { BRAND } from '../config/brand';
import { useI18n } from '../i18n';
import { appPath } from '../lib/app-path';

type AuthMode = 'login' | 'register';
type InvalidField = 'displayName' | 'email' | 'password' | 'confirmPassword' | 'form';

function errorFromHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.querySelector('[role="alert"]')?.textContent?.trim()
    || document.querySelector('.error')?.textContent?.trim()
    || '没有完成，请检查填写内容后重试';
}

function invalidFieldFromMessage(message: string, mode: AuthMode): InvalidField {
  const mentionsDisplayName = mode === 'register' && /显示名称|称呼/.test(message);
  const mentionsEmail = /邮箱|账号/.test(message);
  const mentionsConfirmPassword = mode === 'register' && /确认密码|两次.*密码|密码.*一致/.test(message);
  const mentionsPassword = /密码/.test(message);
  const fieldCount = [
    mentionsDisplayName,
    mentionsEmail,
    mentionsConfirmPassword,
    mentionsPassword && !mentionsConfirmPassword,
  ].filter(Boolean).length;
  if (fieldCount !== 1) return 'form';
  if (mentionsDisplayName) return 'displayName';
  if (mentionsEmail) return 'email';
  if (mentionsConfirmPassword) return 'confirmPassword';
  return 'password';
}

function clientValidationError(
  mode: AuthMode,
  displayName: string,
  email: string,
  password: string,
  confirmPassword: string,
): { field: Exclude<InvalidField, 'form'>; message: string } | null {
  if (mode === 'register' && displayName.trim().length < 2) {
    return { field: 'displayName', message: '显示名称至少需要 2 个字符' };
  }
  if (!email.trim()) return { field: 'email', message: '请输入邮箱' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { field: 'email', message: '请输入有效的邮箱地址' };
  }
  if (!password) return { field: 'password', message: '请输入密码' };
  if (mode === 'register' && password.length < 12) {
    return { field: 'password', message: '密码至少需要 12 位' };
  }
  if (mode === 'register' && !confirmPassword) {
    return { field: 'confirmPassword', message: '请再次输入密码' };
  }
  if (mode === 'register' && password !== confirmPassword) {
    return { field: 'confirmPassword', message: '两次输入的密码不一致' };
  }
  return null;
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const mode: AuthMode = location.pathname.endsWith('/register') ? 'register' : 'login';
  const [csrfToken, setCsrfToken] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  const [focusErrorRequest, setFocusErrorRequest] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const shouldFocusErrorRef = useRef(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setInvalidField(null);
    setCsrfToken('');
    setBootstrapFailed(false);
    void fetch(appPath(`/auth/session/bootstrap/${mode}`), {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    })
      .then(async (response) => {
        if (response.redirected && response.url.includes('/auth/callback')) {
          window.location.assign(response.url);
          return;
        }
        const html = await response.text();
        const document = new DOMParser().parseFromString(html, 'text/html');
        const token = document.querySelector<HTMLInputElement>('input[name="csrf_token"]')?.value;
        if (!response.ok || !token) throw new Error(errorFromHtml(html));
        if (!cancelled) setCsrfToken(token);
      })
      .catch((reason) => {
        if (!cancelled) {
          shouldFocusErrorRef.current = true;
          setFocusErrorRequest((request) => request + 1);
          setError(reason instanceof Error ? reason.message : '身份服务暂时不可用');
          setInvalidField('form');
          setBootstrapFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt, mode]);

  useEffect(() => {
    const pageName = mode === 'login' ? t('欢迎回来') : t('创建统一账号');
    document.title = `${pageName} · ${BRAND.name}`;
  }, [locale, mode, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || submitting) return;
    const validationError = clientValidationError(
      mode,
      displayName,
      email,
      password,
      confirmPassword,
    );
    if (validationError) {
      shouldFocusErrorRef.current = true;
      setFocusErrorRequest((request) => request + 1);
      setError(validationError.message);
      setInvalidField(validationError.field);
      return;
    }
    setSubmitting(true);
    setError('');
    setInvalidField(null);
    const body = new FormData();
    body.set('csrf_token', csrfToken);
    body.set('return_to', `${window.location.origin}${appPath('/auth/callback')}`);
    body.set('email', email.trim());
    body.set('password', password);
    if (mode === 'register') body.set('display_name', displayName.trim());

    try {
      const response = await fetch(appPath(`/auth/session/submit/${mode}`), {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
      if (response.redirected && response.url.includes('/auth/callback')) {
        window.location.assign(response.url);
        return;
      }
      const html = await response.text();
      const message = errorFromHtml(html);
      shouldFocusErrorRef.current = true;
      setFocusErrorRequest((request) => request + 1);
      setError(message);
      setInvalidField(invalidFieldFromMessage(message, mode));
      const document = new DOMParser().parseFromString(html, 'text/html');
      const token = document.querySelector<HTMLInputElement>('input[name="csrf_token"]')?.value;
      if (token) setCsrfToken(token);
    } catch {
      shouldFocusErrorRef.current = true;
      setFocusErrorRequest((request) => request + 1);
      setError('网络连接中断，请稍后重试');
      setInvalidField('form');
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: AuthMode) {
    setPassword('');
    setConfirmPassword('');
    setError('');
    setInvalidField(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    navigate(`/auth/${next}`, { replace: true });
  }

  function retryBootstrap() {
    if (loading) return;
    setBootstrapAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    if (!error || !shouldFocusErrorRef.current) return;
    shouldFocusErrorRef.current = false;
    if (invalidField === 'displayName') displayNameRef.current?.focus();
    else if (invalidField === 'email') emailRef.current?.focus();
    else if (invalidField === 'password') passwordRef.current?.focus();
    else if (invalidField === 'confirmPassword') confirmPasswordRef.current?.focus();
    else if (invalidField === 'form') errorRef.current?.focus();
  }, [error, focusErrorRequest, invalidField]);

  const fieldClass =
    'flex h-[50px] items-center gap-[11px] rounded-[13px] border border-black/10 bg-white px-[14px] text-[#111411] shadow-[0_1px_0_rgba(17,20,17,0.02)] focus-within:border-[#111411] focus-within:ring-4 focus-within:ring-[#d8ff3e]/20';
  const labelClass = 'grid gap-[7px] text-[12px] font-medium text-[#555c53]';
  const passwordDescription = [
    mode === 'register' ? 'auth-password-help' : '',
    error && invalidField === 'password' ? 'auth-password-error' : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8f7f2]">
      <div className="auth-page-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <PublicProductHeader destination="product" />

      <main className="relative z-10 grid flex-1 items-center px-[18px] py-[34px] sm:px-[32px] sm:py-[56px]">
        <div className="mx-auto grid w-full max-w-[1040px] overflow-hidden rounded-[30px] border border-black/8 bg-white/82 shadow-[0_32px_100px_rgba(17,20,17,0.13)] backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative hidden min-h-[650px] overflow-hidden border-r border-black/6 p-[52px] lg:flex lg:flex-col">
            <div className="auth-panel-orbit pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <span className="inline-flex items-center gap-[7px] rounded-full border border-black/8 bg-white/65 px-[11px] py-[7px] text-[11px] font-semibold tracking-[0.1em] text-[#4b5148]">
                <span className="size-[6px] rounded-full bg-[#9fc800]" />
                LIFEYOUME ID
              </span>
              <h2 className="mt-[28px] max-w-[430px] text-[42px] font-semibold leading-[1.14] tracking-[-0.045em] text-[#111411]">
                一次登录，
                <br />
                让你的数字团队开始工作。
              </h2>
              <p className="mt-[20px] max-w-[410px] text-[15px] leading-7 text-[#666d63]">
                使用 LifeYouMe 统一账号进入。账号身份跨产品通用，数字员工、会话和知识仍由数字团队独立管理。
              </p>
            </div>
            <div className="relative mt-auto grid gap-[12px]">
              {['跨产品统一身份', '密码仅由身份服务验证', '工作区数据独立隔离'].map((item) => (
                <div key={item} className="flex items-center gap-[11px] text-[13px] font-medium text-[#333933]">
                  <span className="grid size-[24px] place-items-center rounded-full bg-[#d8ff3e]/70">
                    <Check className="size-[14px]" strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[610px] flex-col justify-center px-[24px] py-[38px] sm:px-[54px] lg:min-h-[650px]">
            <div className="mx-auto w-full max-w-[390px]">
              <p className="text-[12px] font-semibold tracking-[0.12em] text-[#858b80]">数字团队工作区</p>
              <h1 className="mt-[10px] text-[30px] font-semibold tracking-[-0.04em] text-[#111411]">
                {mode === 'login' ? '欢迎回来' : '创建统一账号'}
              </h1>
              <p className="mt-[9px] text-[14px] leading-6 text-[#6d726e]">
                {mode === 'login'
                  ? '登录后继续管理你的数字员工与团队任务。'
                  : '一个账号即可进入 LifeYouMe 的所有产品。'}
              </p>

              <div className="relative mt-[28px] grid grid-cols-2 rounded-[13px] bg-[#efeee8] p-[4px]">
                <span
                  className={`absolute inset-y-[4px] w-[calc(50%-4px)] rounded-[10px] bg-white shadow-[0_3px_12px_rgba(17,20,17,0.08)] transition-transform duration-300 ease-out ${
                    mode === 'register' ? 'translate-x-full' : 'translate-x-0'
                  } motion-reduce:transition-none`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  aria-pressed={mode === 'login'}
                  onClick={() => switchMode('login')}
                  className={`relative z-10 min-h-[44px] rounded-[10px] text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411] ${mode === 'login' ? 'text-[#111411]' : 'text-[#747a71]'}`}
                >
                  登录
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'register'}
                  onClick={() => switchMode('register')}
                  className={`relative z-10 min-h-[44px] rounded-[10px] text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411] ${mode === 'register' ? 'text-[#111411]' : 'text-[#747a71]'}`}
                >
                  注册
                </button>
              </div>

              <form className="mt-[24px] space-y-[15px]" onSubmit={submit} noValidate>
                {mode === 'register' && (
                  <div className={labelClass}>
                    <label htmlFor="auth-display-name">显示名称</label>
                    <span className={fieldClass}>
                      <UserRound className="size-[18px] shrink-0 text-[#8b9187]" aria-hidden="true" />
                      <input
                        ref={displayNameRef}
                        id="auth-display-name"
                        required
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        aria-invalid={invalidField === 'displayName' || undefined}
                        aria-describedby={error && invalidField === 'displayName' ? 'auth-display-name-error' : undefined}
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          if (invalidField === 'displayName') {
                            setError('');
                            setInvalidField(null);
                          }
                        }}
                        placeholder="你的称呼"
                        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-[#9ca199]"
                      />
                    </span>
                    {error && invalidField === 'displayName' && (
                      <span id="auth-display-name-error" role="alert" className="text-[12px] font-normal leading-5 text-[#a43b32]">
                        {error}
                      </span>
                    )}
                  </div>
                )}
                <div className={labelClass}>
                  <label htmlFor="auth-email">邮箱</label>
                  <span className={fieldClass}>
                    <Mail className="size-[18px] shrink-0 text-[#8b9187]" aria-hidden="true" />
                    <input
                      ref={emailRef}
                      id="auth-email"
                      required
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      aria-invalid={invalidField === 'email' || undefined}
                      aria-describedby={error && invalidField === 'email' ? 'auth-email-error' : undefined}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (invalidField === 'email') {
                          setError('');
                          setInvalidField(null);
                        }
                      }}
                      placeholder="name@example.com"
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-[#9ca199]"
                    />
                  </span>
                  {error && invalidField === 'email' && (
                    <span id="auth-email-error" role="alert" className="text-[12px] font-normal leading-5 text-[#a43b32]">
                      {error}
                    </span>
                  )}
                </div>
                <div className={labelClass}>
                  <label htmlFor="auth-password">密码</label>
                  <span className={fieldClass}>
                    <LockKeyhole className="size-[18px] shrink-0 text-[#8b9187]" aria-hidden="true" />
                    <input
                      ref={passwordRef}
                      id="auth-password"
                      required
                      type={showPassword ? 'text' : 'password'}
                      minLength={mode === 'register' ? 12 : undefined}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      aria-invalid={invalidField === 'password' || undefined}
                      aria-describedby={passwordDescription}
                      value={password}
                      onChange={(event) => {
                        const nextPassword = event.target.value;
                        setPassword(nextPassword);
                        if (invalidField === 'password') {
                          setError('');
                          setInvalidField(null);
                        } else if (
                          invalidField === 'confirmPassword'
                          && confirmPassword
                          && nextPassword === confirmPassword
                        ) {
                          setError('');
                          setInvalidField(null);
                        }
                      }}
                      onBlur={(event) => {
                        const nextPassword = event.currentTarget.value;
                        if (
                          mode === 'register'
                          && nextPassword.length >= 12
                          && confirmPassword
                          && nextPassword !== confirmPassword
                        ) {
                          shouldFocusErrorRef.current = false;
                          setError('两次输入的密码不一致');
                          setInvalidField('confirmPassword');
                        }
                      }}
                      placeholder={mode === 'register' ? '设置密码' : '输入密码'}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-[#9ca199]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      aria-controls="auth-password"
                      aria-pressed={showPassword}
                      className="grid size-[44px] shrink-0 place-items-center rounded-[10px] text-[#858b80] hover:bg-black/5 hover:text-[#111411] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411]"
                    >
                      {showPassword ? <EyeOff className="size-[17px]" aria-hidden="true" /> : <Eye className="size-[17px]" aria-hidden="true" />}
                    </button>
                  </span>
                  {mode === 'register' && (
                    <span id="auth-password-help" className="text-[12px] font-normal leading-5 text-[#6d726e]">
                      至少 12 位，可使用密码管理器生成并填入。
                    </span>
                  )}
                  {error && invalidField === 'password' && (
                    <span id="auth-password-error" role="alert" className="text-[12px] font-normal leading-5 text-[#a43b32]">
                      {error}
                    </span>
                  )}
                </div>
                {mode === 'register' && (
                  <div className={labelClass}>
                    <label htmlFor="auth-confirm-password">确认密码</label>
                    <span className={fieldClass}>
                      <LockKeyhole className="size-[18px] shrink-0 text-[#8b9187]" aria-hidden="true" />
                      <input
                        ref={confirmPasswordRef}
                        id="auth-confirm-password"
                        required
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        aria-invalid={invalidField === 'confirmPassword' || undefined}
                        aria-describedby={error && invalidField === 'confirmPassword' ? 'auth-confirm-password-error' : undefined}
                        value={confirmPassword}
                        onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          if (invalidField === 'confirmPassword') {
                            setError('');
                            setInvalidField(null);
                          }
                        }}
                        onBlur={() => {
                          if (confirmPassword && password !== confirmPassword) {
                            shouldFocusErrorRef.current = false;
                            setError('两次输入的密码不一致');
                            setInvalidField('confirmPassword');
                          }
                        }}
                        placeholder="再次输入密码"
                        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-[#9ca199]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                        aria-controls="auth-confirm-password"
                        aria-pressed={showConfirmPassword}
                        className="grid size-[44px] shrink-0 place-items-center rounded-[10px] text-[#858b80] hover:bg-black/5 hover:text-[#111411] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411]"
                      >
                        {showConfirmPassword
                          ? <EyeOff className="size-[17px]" aria-hidden="true" />
                          : <Eye className="size-[17px]" aria-hidden="true" />}
                      </button>
                    </span>
                    {error && invalidField === 'confirmPassword' && (
                      <span id="auth-confirm-password-error" role="alert" className="text-[12px] font-normal leading-5 text-[#a43b32]">
                        {error}
                      </span>
                    )}
                  </div>
                )}

                {error && invalidField === 'form' && (
                  <div
                    ref={errorRef}
                    id="auth-form-error"
                    role="alert"
                    tabIndex={-1}
                    className="grid gap-[10px] rounded-[11px] border border-[#f0c8c4] bg-[#fff4f2] px-[13px] py-[10px] text-[12px] leading-5 text-[#a43b32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a43b32]"
                  >
                    <span>{error}</span>
                    {bootstrapFailed && (
                      <button
                        type="button"
                        onClick={retryBootstrap}
                        className="min-h-[44px] justify-self-start rounded-[10px] border border-[#dba9a4] bg-white px-[14px] font-medium text-[#8f3029] transition-colors hover:bg-[#fff9f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a43b32]"
                      >
                        重新连接
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || submitting || !csrfToken}
                  className="group flex min-h-[50px] w-full items-center justify-center gap-[9px] rounded-[13px] bg-[#111411] text-[14px] font-medium text-white shadow-[0_13px_30px_rgba(17,20,17,0.2)] hover:-translate-y-0.5 hover:bg-[#252a25] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
                >
                  {loading || submitting ? (
                    <>
                      <LoaderCircle className="size-[17px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      {submitting ? '正在验证…' : '连接身份服务…'}
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? '进入数字团队' : '创建账号并进入'}
                      <ArrowRight className="size-[16px] transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-[20px] text-center text-[12px] leading-5 text-[#6d726e]">
                继续即表示你使用的是 LifeYouMe 统一身份服务。
                <br />
                密码不会存储在数字团队中。
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
