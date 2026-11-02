import { Pointer } from 'lucide-react';

import type { EnterpriseAuthSession } from '../auth';
import PublicProductHeader from '../components/PublicProductHeader';
import loginPreview from '../assets/staffdeck/login-preview.png';
import { BRAND } from '../config/brand';
import { appPath } from '../lib/app-path';

export type LoginPageProps = {
  onLogin: (session: EnterpriseAuthSession) => void;
};

/**
 * Signed-out landing page with the product preview anchored below the primary
 * action. Authentication lives on its own route and is handled by LifeYouMe ID.
 */
export default function LoginPage({ onLogin: _onLogin }: LoginPageProps) {
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
      <PublicProductHeader />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-start px-[16px] py-[28px] sm:justify-center sm:px-[32px]">
        <h1 className="sr-only">LifeYouMe 数字团队</h1>
        <div className="w-full max-w-[1120px]">
          <div className="rounded-[24px] border border-black/10 bg-white p-[6px] shadow-[0_30px_90px_rgba(17,20,17,0.12)] sm:p-[10px]">
            <div className="overflow-hidden rounded-[17px] border border-black/5">
              <img
                src={loginPreview}
                alt={`${BRAND.fullName}产品界面预览`}
                className="block h-auto w-full select-none object-contain"
                draggable={false}
              />
            </div>
          </div>
          <div className="mt-[14px] flex justify-center sm:mt-[18px]">
            <div className="relative">
              <a
                href={appPath('/auth/login')}
                className="flex min-h-[48px] whitespace-nowrap items-center justify-center rounded-full bg-[#111411] px-[32px] py-[12px] text-[15px] font-medium text-white shadow-[0_12px_32px_rgba(17,20,17,0.22)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#252a25] hover:shadow-[0_16px_36px_rgba(17,20,17,0.26)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111411] motion-reduce:transform-none"
              >
                进入数字团队
              </a>
              <Pointer
                aria-hidden="true"
                strokeWidth={1.8}
                className="ai-team-entry-hand absolute -right-[29px] bottom-[-11px] size-[26px] rotate-[-18deg] text-[#111411] drop-shadow-[0_2px_3px_rgba(255,255,255,0.9)] motion-reduce:animate-none"
              />
            </div>
          </div>
        </div>
        <p className="pt-[18px] text-center text-[12px] leading-[1.6] text-[#7c8179]">
          基于{' '}
          <a
            href={BRAND.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-[8px] px-[5px] underline decoration-black/25 underline-offset-4 hover:text-[#111411] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411]"
          >
            {BRAND.upstreamName}
          </a>
          {' '}构建 · AGPL-3.0
        </p>
      </main>
    </div>
  );
}
