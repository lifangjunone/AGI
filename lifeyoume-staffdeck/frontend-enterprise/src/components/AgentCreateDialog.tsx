import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DIALOG_CANCEL_BUTTON_CLASS,
  DIALOG_FOOTER_CLASS,
  DIALOG_PRIMARY_BUTTON_CLASS,
  SELECT_TRIGGER_CLASS,
} from '@/lib/enterprise-ui';
import { cn } from '@/lib/utils';

import { isGalleryEmployee } from '../auth';
import {
  employeeDisplayNameWithCreator,
  employeeProfile,
} from '../employee';
import type { AgentProfileRead } from '../types';

export type AgentCreateMode = 'copy' | 'blank';

export type AgentCreateFormState = {
  name: string;
  description: string;
  roleName: string;
  sourceMode: AgentCreateMode;
  copyFromAgentId: string;
};

export default function AgentCreateDialog({
  form,
  isAdmin,
  onClose,
  onCreate,
  onFormChange,
  sourceAgents,
}: {
  form: AgentCreateFormState;
  isAdmin: boolean;
  onClose: () => void;
  onCreate: () => void;
  onFormChange: Dispatch<SetStateAction<AgentCreateFormState>>;
  sourceAgents: AgentProfileRead[];
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-[16px] p-0 sm:max-w-[520px]">
        <DialogTitle className="shrink-0 px-[24px] py-[16px] text-[16px] font-semibold text-foreground">
          新建数字员工
        </DialogTitle>
        <div className="agent-editor-form min-h-0 flex-1 overflow-y-auto px-[24px] pb-[16px]">
          <label>
            创建方式
            <div className="inline-flex w-fit gap-[4px] rounded-[10px] border border-border p-[2px]">
              {[
                { label: '从广场复制', value: 'copy' as const },
                { label: '从空白开始', value: 'blank' as const },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'rounded-[8px] px-[14px] py-[5px] text-[13px] font-medium transition-colors',
                    form.sourceMode === option.value
                      ? 'bg-[#18181a] text-white'
                      : 'text-[#5b6273] hover:text-foreground',
                  )}
                  onClick={() =>
                    onFormChange((previous) => ({
                      ...previous,
                      sourceMode: option.value,
                      copyFromAgentId:
                        option.value === 'blank' ? '' : previous.copyFromAgentId,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </label>
          <label>
            职位
            <Input
              value={form.roleName}
              onChange={(event) =>
                onFormChange((previous) => ({
                  ...previous,
                  roleName: event.target.value,
                }))
              }
              placeholder="例如 研发工程师、财务助理"
            />
          </label>
          <div className="grid content-start gap-[6px]">
            {form.sourceMode === 'copy' && (
              <label>
                复制来源
                <Select
                  value={form.copyFromAgentId || undefined}
                  onValueChange={(value) =>
                    onFormChange((previous) => {
                      const nextSource = sourceAgents.find(
                        (item) => item.id === value,
                      );
                      return {
                        ...previous,
                        copyFromAgentId: value,
                        roleName:
                          previous.roleName ||
                          (nextSource && !nextSource.is_overall
                            ? employeeProfile(nextSource).roleName
                            : ''),
                      };
                    })
                  }
                >
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, 'w-full')}>
                    <SelectValue placeholder="选择复制来源" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.is_overall
                          ? '开放广场'
                          : `${employeeDisplayNameWithCreator(agent)} · ${employeeProfile(agent).roleName}${isGalleryEmployee(agent) ? ' · 广场' : ''}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            {form.sourceMode === 'blank' && (
              <div className="agent-definition-note">
                从空白开始创建，不继承任何已有配置。
              </div>
            )}
          </div>
          <label>
            数字员工姓名
            <Input
              value={form.name}
              onChange={(event) =>
                onFormChange((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            岗位描述
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                onFormChange((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              placeholder="概括这个数字员工的岗位边界、服务风格和执行重点"
            />
          </label>
        </div>
        <div className={cn(DIALOG_FOOTER_CLASS, 'shrink-0 border-t border-border')}>
          <Button
            variant="outline"
            className={DIALOG_CANCEL_BUTTON_CLASS}
            onClick={onClose}
          >
            取消
          </Button>
          <Button className={DIALOG_PRIMARY_BUTTON_CLASS} onClick={onCreate}>
            创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
