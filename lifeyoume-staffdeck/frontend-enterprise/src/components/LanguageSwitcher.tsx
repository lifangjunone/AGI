import { Check } from 'lucide-react';

import IconChevronDown from '@/assets/icons/chevron-down.svg?react';
import IconGlobe from '@/assets/icons/globe.svg?react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n, type AppLocale } from '@/i18n';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ locale: AppLocale; label: string; shortLabel: string }> = [
  { locale: 'zh-CN', label: '中文', shortLabel: '中' },
  { locale: 'en-US', label: 'English', shortLabel: 'EN' },
];

export default function LanguageSwitcher({
  className,
  touchFriendly = false,
}: {
  className?: string;
  touchFriendly?: boolean;
}) {
  const { locale, setLocale } = useI18n();
  const active = OPTIONS.find((option) => option.locale === locale) || OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-i18n-ignore
        aria-label={locale === 'zh-CN' ? '切换语言' : 'Switch language'}
        className={cn(
          'flex h-[32px] w-[74px] shrink-0 items-center justify-center gap-[6px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white px-[8px] text-[12px] font-medium text-[#757f9c] transition-colors hover:border-[#cbd3e6] hover:text-[#18181a]',
          touchFriendly && 'h-[44px] w-[60px] rounded-full border-black/8 bg-white/70 px-[7px] text-[#464c5e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111411]',
          className,
        )}
      >
        <IconGlobe className="size-[14px] shrink-0" />
        <span className="min-w-[18px] text-center">{active.shortLabel}</span>
        <IconChevronDown className="size-[12px] shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-i18n-ignore
        align="end"
        className="w-[132px] rounded-[12px] border-[0.5px] border-[#eceef1] bg-white p-[4px] shadow-[0_10px_28px_rgba(0,0,0,0.1)]"
      >
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.locale}
            onSelect={() => setLocale(option.locale)}
            className={cn(
              'h-[34px] cursor-pointer justify-between rounded-[8px] px-[10px] text-[13px] text-[#464c5e]',
              touchFriendly && 'min-h-[44px]',
            )}
          >
            <span>{option.label}</span>
            <Check
              className={cn(
                'size-[14px] text-[#18181a]',
                locale !== option.locale && 'invisible',
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
