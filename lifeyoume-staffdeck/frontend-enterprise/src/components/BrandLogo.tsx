import { cn } from '@/lib/utils';
import logoMark from '../assets/lifeyoume-mark.svg';
import { BRAND } from '../config/brand';

export type BrandLogoProps = {
  /** Hide the LifeYouMe wordmark and only render the logo mark. */
  markOnly?: boolean;
  /** Size of the square logo mark in pixels. */
  markSize?: number;
  className?: string;
  /** Extra classes applied to the wordmark wrapper (e.g. to hide it responsively). */
  wordmarkClassName?: string;
};

/** LifeYouMe product lockup used across signed-in and signed-out surfaces. */
export default function BrandLogo({
  markOnly = false,
  markSize = 28,
  className,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <span className={cn('flex items-center gap-[8px] overflow-hidden p-[4px]', className)}>
      <img
        src={logoMark}
        alt={BRAND.name}
        className="shrink-0"
        style={{ width: markSize, height: markSize }}
      />
      {!markOnly && (
        <span className={cn('flex flex-col items-start gap-[3px] leading-none', wordmarkClassName)}>
          <strong className="text-[16px] font-semibold leading-none tracking-[-0.02em] text-[#18181a]">
            {BRAND.name}
          </strong>
          <span className="text-[10px] font-medium leading-none tracking-[0.08em] text-[#757f9c]">
            {BRAND.productName}
          </span>
        </span>
      )}
    </span>
  );
}
