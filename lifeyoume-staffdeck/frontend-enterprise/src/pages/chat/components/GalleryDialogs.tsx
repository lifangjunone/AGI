import { ConfirmDialog } from '@/components/ConfirmDialog';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { employeeDisplayNameWithCreator, employeeProfile } from '@/employee';

import type { UseGallerySession } from '../useGallerySession';

export default function GalleryDialogs({ chat }: { chat: UseGallerySession }) {
  return (
    <>
      <Dialog
        open={chat.showHandoffInbox}
        onOpenChange={(open) => !open && chat.setShowHandoffInbox(false)}
      >
        <DialogContent className="max-w-[min(920px,calc(100vw-40px))] sm:max-w-[920px]">
          <DialogHeader><DialogTitle>待回答</DialogTitle></DialogHeader>
          {chat.handoffs.length === 0 ? (
            <div className="py-[40px] text-center text-[13px] text-[#858b9c]">
              {chat.handoffsLoading ? '正在加载待回答消息' : '暂无待回答消息'}
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto">
              {chat.handoffs.map((handoff) => {
                const agent = chat.agents.find((item) => item.id === handoff.agent_id);
                return (
                  <article key={handoff.id} className="rounded-[16px] border border-[#e3e7f1] p-[16px]">
                    <div className="flex items-center gap-[10px]">
                      {agent && <EmployeeAvatar profile={employeeProfile(agent)} size={36} radius={10} />}
                      <strong>{agent ? employeeDisplayNameWithCreator(agent) : '数字员工'}</strong>
                    </div>
                    <p className="mt-[12px] text-[13px] text-[#464c5e]">
                      {handoff.pending_question || handoff.context_summary || '请补充人工回复。'}
                    </p>
                    <Textarea
                      className="mt-[12px]"
                      rows={3}
                      value={chat.handoffReplies[handoff.id] || ''}
                      placeholder="输入回复，提交后原会话会继续执行"
                      onChange={(event) => chat.setHandoffReplies((current) => ({
                        ...current,
                        [handoff.id]: event.target.value,
                      }))}
                    />
                    <div className="mt-[12px] flex justify-end gap-[8px]">
                      <Button variant="outline" onClick={() => chat.openSession(handoff.session_id)}>
                        打开原会话
                      </Button>
                      <Button onClick={() => void chat.submitHandoffReply(handoff)}>回复并恢复</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(chat.renameSession)}
        onOpenChange={(open) => {
          if (!open) {
            chat.setRenameSession(null);
            chat.setRenameTitle('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>重命名</DialogTitle></DialogHeader>
          <Input
            autoFocus
            maxLength={80}
            value={chat.renameTitle}
            onChange={(event) => chat.setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void chat.saveRename();
            }}
          />
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" onClick={() => chat.setRenameSession(null)}>取消</Button>
            <Button onClick={() => void chat.saveRename()}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(chat.pendingDelete)}
        onOpenChange={(open) => !open && chat.setPendingDelete(null)}
        title="删除会话"
        description="删除后无法恢复该会话及其消息记录，确定继续吗？"
        onConfirm={() => void chat.confirmDeleteSession()}
      />
    </>
  );
}
