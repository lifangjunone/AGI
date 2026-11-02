import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { KeyRound } from 'lucide-react';

import IconChat from '../assets/icons/chat.svg?react';
import IconEdit from '../assets/icons/edit.svg?react';
import IconImage from '../assets/icons/image.svg?react';
import IconMore from '../assets/icons/more.svg?react';
import IconPause from '../assets/icons/pause.svg?react';
import IconPlatform from '../assets/icons/nav-platform.svg?react';
import IconPlay from '../assets/icons/play.svg?react';
import IconTrash from '../assets/icons/trash.svg?react';
import { isGalleryEmployee } from '../auth';
import type { AgentProfileRead } from '../types';

const MENU_ITEM_CLASS =
  'cursor-pointer gap-[4px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#858b9c] focus:text-[#18181a]';
const MENU_ITEM_DANGER_CLASS =
  'cursor-pointer gap-[4px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#d20b0b] focus:bg-[#fce7e7] focus:text-[#d20b0b] focus:[&_svg]:text-[#d20b0b]!';

export default function EmployeeCardActions({
  employee,
  canManage,
  busy = false,
  onStatus,
  onGallery,
  onDelete,
  onAvatar,
  onEdit,
  onChat,
  onApiKeys,
}: {
  employee: AgentProfileRead;
  canManage: boolean;
  busy?: boolean;
  onStatus: (status: 'active' | 'archived') => void;
  onGallery: (published: boolean) => void;
  onDelete: () => void;
  onAvatar: () => void;
  onEdit: () => void;
  onChat: () => void;
  onApiKeys?: () => void;
}) {
  const online = employee.status === 'active';
  const galleryPublished = isGalleryEmployee(employee);

  return (
    <div className="absolute right-[12px] top-[12px] z-20">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="员工操作"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="grid size-7 place-items-center rounded-[10px] text-[#757F9C] transition-colors outline-none hover:bg-black/5 focus-visible:bg-black/5"
        >
          <IconMore className="size-[16px]!" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="flex w-auto min-w-[128px] flex-col gap-[4px] rounded-[14px] border-0 bg-white p-[4px] shadow-[0px_0px_8px_rgba(0,0,0,0.1)] ring-0 [--accent:#F6F6F6] [--accent-foreground:#18181A]"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            disabled={!online || busy}
            onClick={(event) => event.stopPropagation()}
            onSelect={onChat}
          >
            <IconChat className="size-[16px]" />
            发起对话
          </DropdownMenuItem>
          {online ? (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              disabled={!canManage || busy}
              onClick={(event) => event.stopPropagation()}
              onSelect={() => onStatus('archived')}
            >
              <IconPause className="size-[16px]" />
              下线
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              disabled={!canManage || busy}
              onClick={(event) => event.stopPropagation()}
              onSelect={() => onStatus('active')}
            >
              <IconPlay className="size-[16px]" />
              上线
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            disabled={!canManage || busy}
            onClick={(event) => event.stopPropagation()}
            onSelect={() => onGallery(!galleryPublished)}
          >
            <IconPlatform className="size-[16px]" />
            {galleryPublished ? '从广场下架' : '发布到广场'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            disabled={!canManage || busy}
            onClick={(event) => event.stopPropagation()}
            onSelect={onEdit}
          >
            <IconEdit className="size-[16px]" />
            编辑资料
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            disabled={!canManage || busy}
            onClick={(event) => event.stopPropagation()}
            onSelect={onAvatar}
          >
            <IconImage className="size-[16px]" />
            设置头像
          </DropdownMenuItem>
          {onApiKeys && (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              disabled={!canManage || busy}
              onClick={(event) => event.stopPropagation()}
              onSelect={onApiKeys}
            >
              <KeyRound className="size-[16px]" />
              API 密钥
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="my-[2px] bg-[#eef0f4]" />
          <DropdownMenuItem
            variant="destructive"
            className={MENU_ITEM_DANGER_CLASS}
            disabled={!canManage || busy}
            onClick={(event) => event.stopPropagation()}
            onSelect={onDelete}
          >
            <IconTrash className="size-[16px]" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
