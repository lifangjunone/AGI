import { expect, it, vi } from "vitest";
import { fetchChatUpdates } from "./customer-chat-sync";

it("drains all forward pages and deduplicates overlap", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    const second = String(url).includes("after=next");
    return new Response(JSON.stringify({ thread: { subject: "Question", status: "active" },
      messages: (second ? ["b", "c"] : ["a", "b"]).map(id => ({ id })),
      nextAfterCursor: second ? null : "next" }));
  });
  try {
    const result = await fetchChatUpdates("/api/v1/customers", "thread", "start", new AbortController().signal);
    expect(result.messages.map(message => message.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally { fetchMock.mockRestore(); }
});
it("fails rather than accepting incomplete history or a repeating cursor", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    thread: { subject: "Question", status: "active" }, messages: [], nextAfterCursor: "start"
  })));
  try {
    await expect(fetchChatUpdates("/api/v1/customers", "thread", "start", new AbortController().signal))
      .rejects.toThrow("chat_cursor_not_advancing");
    fetchMock.mockResolvedValue(new Response("offline", { status: 503 }));
    await expect(fetchChatUpdates("/api/v1/customers", "thread", "start", new AbortController().signal))
      .rejects.toThrow("chat_sync_unavailable");
  } finally { fetchMock.mockRestore(); }
});
