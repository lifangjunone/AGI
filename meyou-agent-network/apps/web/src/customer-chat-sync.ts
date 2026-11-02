export interface ChatPage {
  thread: { subject: string; status: string; agentMode?: string };
  messages: Array<{ id: string; actor: string; content: string; createdAt: string;
    trace?: { taskId: string; sources: Array<{ documentId: string; quote: string; revision: string }>;
      model?: { provider: string; model: string } } }>;
  nextCursor?: string | null;
  nextAfterCursor?: string | null;
}

/** Read every forward page before advancing the caller's checkpoint. */
export async function fetchChatUpdates(prefix: string, id: string, after: string, signal: AbortSignal) {
  let cursor = after;
  const messages = new Map<string, ChatPage["messages"][number]>();
  const seen = new Set<string>([after]);
  let page: ChatPage;
  do {
    const params = new URLSearchParams({ limit: "100", after: cursor });
    const response = await fetch(`${prefix}/${id}/messages?${params}`, { credentials: "include", signal });
    if (!response.ok) throw new Error("chat_sync_unavailable");
    page = await response.json() as ChatPage;
    for (const message of page.messages) messages.set(message.id, message);
    if (!page.nextAfterCursor) break;
    if (seen.has(page.nextAfterCursor)) throw new Error("chat_cursor_not_advancing");
    seen.add(page.nextAfterCursor);
    cursor = page.nextAfterCursor;
  } while (!signal.aborted);
  signal.throwIfAborted();
  return { ...page!, messages: [...messages.values()] };
}
