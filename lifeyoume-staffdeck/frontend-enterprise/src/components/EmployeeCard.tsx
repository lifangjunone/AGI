import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

import IconChat from '../assets/icons/chat.svg?react';
import { employeeDisplayNameWithCreator, employeeProfile, agentResourceCount } from '../employee';
import type { AgentProfileRead } from '../types';
import EmployeeAvatar from './EmployeeAvatar';

export type EmployeeCardProps = {
  employee: AgentProfileRead;
  selected?: boolean;
  busy?: boolean;
  actions?: ReactNode;
  onOpen: () => void;
  onChat: () => void;
};

export default function EmployeeCard({
  employee,
  selected = false,
  busy = false,
  actions,
  onOpen,
  onChat,
}: EmployeeCardProps) {
  const profile = employeeProfile(employee);
  const sopCount = agentResourceCount(employee, 'skill');
  const skillCount = agentResourceCount(employee, 'general_skill');
  const kbCount = agentResourceCount(employee, 'knowledge_base');
  const online = employee.status === 'active';

  // Show raw API values on the card (bypass the SD1 term relabeling in staffdeckDisplayText).
  const rawRoleName = (employee.metadata?.role_name as string | undefined) || profile.roleName;
  const displayName = employee.is_overall ? '开放广场' : employeeDisplayNameWithCreator(employee);
  const displayDescription = employee.description || '暂无描述';

  const stats: Array<{ value: number; label: string }> = [
    { value: kbCount, label: '资料' },
    { value: skillCount, label: '技能' },
    { value: sopCount, label: 'SOP' },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!busy) onOpen();
      }}
      onKeyDown={(event) => {
        if (!busy && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-pressed={selected}
      aria-busy={busy}
      className={cn(
        'group relative flex h-full flex-col cursor-pointer overflow-visible rounded-[20px] border border-[#F6F6F6] bg-white py-[12px] px-[10px] transition-shadow',
        '',
        selected && 'shadow-[0_16px_30px_0_rgba(0,0,0,0.10)]',
      )}
    >
      {/* Header band (shorter than the avatar so the illustration overflows above it) */}
      <div className="flex rounded-[18px] h-[68px] box-border gap-[10px] bg-[#f6f6f6] p-[8px] mt-[34px]" >

        {/* Avatar illustration — absolutely positioned so its head pokes above the gray band */}
        <div className='w-[80px] relative'>
          <div className='absolute inset-0 flex items-end justify-center'>
            <EmployeeAvatar
              agent={employee}
              width={80}
              height={94}
              fit="contain"
              objectPosition="center bottom"
              className="overflow-visible! rounded-none! border-0! bg-transparent! bg-none! shadow-none! after:hidden!"
            />
          </div>
          

        </div>

        {/* Name / role / status */}
        <div className="flex-1 flex flex-col gap-[2px]">
          <strong className="truncate text-[12px] font-bold text-[#18181A]">
            {employee.is_overall ? displayName : <span data-i18n-ignore>{displayName}</span>}
          </strong>
          <span className="truncate text-[10px] text-[#757F9C]">
            {rawRoleName === '待补充岗位' ? rawRoleName : <span data-i18n-ignore>{rawRoleName}</span>}
          </span>
          <div className="leading-none">
            <span className="inline-flex items-center gap-[2px] py-[2px] px-[4px] text-[8px] font-semibold text-[#757F9C] rounded-[90px] bg-white">
              <i className={cn('size-[6px] shrink-0 rounded-full', online ? 'bg-[#22c55e]' : 'bg-[#9ca3af]')} aria-hidden="true" />
              {online ? '在线' : '下线'}
            </span>
          </div>
        </div>

        {/* Chat button */}
        <button
          type="button"
          aria-label="发起对话"
          disabled={!online || busy}
          onClick={(event) => {
            event.stopPropagation();
            onChat();
          }}
          className="grid size-[44px] shrink-0 self-center place-items-center rounded-[12px] bg-white text-[#757F9C] transition-colors hover:text-[#18181A] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[#757F9C]"
        >
          <IconChat className="size-[16px]!" />
        </button>

      </div>

      {actions}

      {/* Description */}
      <p className="line-clamp-2 mt-[8px] h-[36px] shrink-0 text-[12px] leading-[18px] text-[#757F9C]">
        {employee.description ? <span data-i18n-ignore>{displayDescription}</span> : displayDescription}
      </p>

      {/* Work style tags */}
      <div className="flex flex-wrap my-[8px] items-center gap-[10px]">
        {profile.workStyles.slice(0, 3).map((item) => (
          <span
            key={item}
            className="rounded-[20px] px-[8px] py-px text-[10px] leading-[13px] text-[#757f9c] border border-[#E3E7F1]"
          >
            <span data-i18n-ignore>{item}</span>
          </span>
        ))}
      </div>

      {/* Stats — pinned to the bottom of the card */}
      <div className="mt-auto grid grid-cols-3 rounded-[14px] border border-[#E3E7F1] box-sizing: border-box">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              'flex flex-col justify-center gap-[4px] px-[20px] py-[6px]',
              index < stats.length - 1 && 'border-r border-[#eef1f5]',
            )}
          >
            <strong className="text-[18px] leading-[24px] font-bold text-[#18181A]">{stat.value}</strong>
            <em className="text-[10px] not-italic text-[#464C5E]">{stat.label}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
