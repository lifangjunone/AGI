import { lazy, Suspense, type CSSProperties } from 'react';

import { api, TENANT_ID } from '@/api/client';
import AppSidebar from '@/components/AppSidebar';
import { notify } from '@/components/ui/app-toast';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getEnterpriseAuthSession, isEnterpriseAdmin } from '@/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AgentProfileRead } from '@/types';

import EmployeeGalleryPage from '../EmployeeGalleryPage';
import { sessionHasUnreadReply } from './sessionReadState';
import { useGallerySession } from './useGallerySession';

const GalleryDialogs = lazy(() => import('./components/GalleryDialogs'));

export default function ChatGalleryPage() {
  const chat = useGallerySession();
  const isMobile = useIsMobile();
  const auth = getEnterpriseAuthSession();
  const isAdmin = isEnterpriseAdmin(auth?.user);
  const dialogsOpen = Boolean(
    chat.showHandoffInbox
    || chat.renameSession
    || chat.pendingDelete
  );

  async function startGalleryChat(agent: AgentProfileRead) {
    try {
      await api.post<AgentProfileRead>(`/api/chat/agents/${agent.id}/use?tenant_id=${TENANT_ID}`, {});
      await chat.refreshAgents(agent.id);
      chat.setSessionAgentFilter(agent.id);
      chat.openDraftForAgent(agent.id);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '无法打开数字员工');
    }
  }

  return (
    <SidebarProvider
      open={!chat.sidebarCollapsed && !isMobile}
      onOpenChange={(open) => {
        if (open === chat.sidebarCollapsed) chat.toggleSidebar();
      }}
      style={
        {
          '--sidebar-width': '220px',
          '--sidebar-width-icon': '72px',
        } as CSSProperties
      }
      className="chat-workspace-shell h-screen min-h-0 overflow-x-clip bg-[#fcfcfc] text-[#18181a]"
    >
      <AppSidebar
        variant="chat"
        sessions={chat.visibleSidebarSessions}
        sessionsLoading={chat.sessionsLoading}
        agents={chat.agents}
        scopeTeams={chat.teams}
        sessionFilter={chat.sessionAgentFilter}
        onSessionFilterChange={chat.setSessionAgentFilter}
        sessionFilterOptions={chat.sessionFilterOptions}
        isSessionUnread={(session) => sessionHasUnreadReply(session, chat.sessionReadTimes)}
        onOpenSession={chat.openSession}
        onOpenGallery={chat.openGallery}
        galleryActive
        handoffCount={chat.handoffs.length}
        onOpenHandoffs={chat.openHandoffInbox}
        onRenameSession={chat.openRename}
        onDeleteSession={chat.requestDelete}
        onOpenAdmin={chat.openAdmin}
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <EmployeeGalleryPage
          currentUser={auth?.user}
          isAdmin={isAdmin}
          onStartChat={startGalleryChat}
          onLogout={chat.logout}
          teams={chat.teams}
          teamsLoadFailed={chat.teamsLoadFailed}
          onRetryTeams={chat.refreshTeams}
        />
      </main>
      {dialogsOpen && (
        <Suspense fallback={null}>
          <GalleryDialogs chat={chat} />
        </Suspense>
      )}
    </SidebarProvider>
  );
}
