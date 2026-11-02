import { lazy, Suspense, type CSSProperties } from 'react';

import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { CHAT_MAIN_CLASS } from './chatPageStyles';
import { sessionHasUnreadReply } from './chatHelpers';
import { useChatSession } from './useChatSession';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import Composer from './components/Composer';

const ChatDialogs = lazy(() => import('./components/ChatDialogs'));

export default function ChatPage() {
  const chat = useChatSession();
  const isMobile = useIsMobile();
  const dialogsOpen = Boolean(
    chat.showHandoffInbox
    || chat.activeCitation
    || chat.renameSession
    || chat.pendingDelete
    || chat.modelSetupOpen,
  );

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
        activeSessionId={chat.sessionId}
        sessionFilter={chat.sessionAgentFilter}
        onSessionFilterChange={chat.setSessionAgentFilter}
        sessionFilterOptions={chat.sessionFilterOptions}
        isSessionUnread={(session) => sessionHasUnreadReply(session, chat.sessionReadTimes, chat.sessionId)}
        onOpenSession={chat.openSession}
        onNewConversation={() => {
          const selectedAgent = chat.sessionAgentFilter === 'all'
            ? chat.displayedAgent
            : chat.agents.find((agent) => agent.id === chat.sessionAgentFilter);
          if (selectedAgent) chat.openDraftForAgent(selectedAgent.id);
          else chat.openGallery();
        }}
        onOpenGallery={chat.openGallery}
        handoffCount={chat.handoffs.length}
        onOpenHandoffs={chat.openHandoffInbox}
        onRenameSession={chat.openRename}
        onDeleteSession={chat.requestDelete}
        onOpenAdmin={chat.openAdmin}
      />
      <main className={cn(CHAT_MAIN_CLASS, 'flex-1')}>
        <ChatHeader chat={chat} />
        <MessageList chat={chat} />
        <Composer chat={chat} />
      </main>
      {dialogsOpen && (
        <Suspense fallback={null}>
          <ChatDialogs chat={chat} />
        </Suspense>
      )}
    </SidebarProvider>
  );
}
