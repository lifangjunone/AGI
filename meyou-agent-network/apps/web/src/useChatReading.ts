import { useLayoutEffect, useRef, useState } from "react";

/** Local reading state only: does not write server read receipts. */
export function useChatReading(messageIds: string[]) {
  const historyRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previous = useRef<string[]>([]);
  const initialized = useRef(false);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [readingHistory, setReadingHistory] = useState(false);
  const signature = JSON.stringify(messageIds);

  function captureAnchor() {
    const box = historyRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    const node = [...box.querySelectorAll<HTMLElement>("[data-message-id]")]
      .find(item => item.getBoundingClientRect().bottom > top);
    anchor.current = node ? { id: node.dataset.messageId!, offset: node.getBoundingClientRect().top - top } : null;
  }
  function onScroll() {
    const box = historyRef.current;
    if (!box) return;
    following.current = box.scrollHeight - box.clientHeight - box.scrollTop < 48;
    setReadingHistory(!following.current);
    if (following.current) setPendingCount(0);
    captureAnchor();
  }
  function showLatest() {
    const box = historyRef.current;
    if (!box) return;
    following.current = true;
    box.scrollTop = box.scrollHeight;
    setReadingHistory(false);
    setPendingCount(0);
    captureAnchor();
  }
  function beforeEarlier() {
    following.current = false;
    setReadingHistory(true);
    captureAnchor();
  }
  useLayoutEffect(() => {
    const box = historyRef.current;
    if (!box) return;
    const oldLatest = previous.current.at(-1);
    const oldIndex = oldLatest ? messageIds.indexOf(oldLatest) : -1;
    const incoming = initialized.current && oldIndex >= 0 ? messageIds.length - oldIndex - 1 : 0;
    if (following.current) {
      box.scrollTop = box.scrollHeight;
      setPendingCount(0);
    } else {
      const saved = anchor.current;
      const node = saved && [...box.querySelectorAll<HTMLElement>("[data-message-id]")]
        .find(item => item.dataset.messageId === saved.id);
      if (node && saved) box.scrollTop += node.getBoundingClientRect().top - box.getBoundingClientRect().top - saved.offset;
      if (incoming > 0) setPendingCount(count => count + incoming);
    }
    initialized.current = true;
    previous.current = messageIds;
    captureAnchor();
  }, [signature]);
  return { historyRef, onScroll, beforeEarlier, showLatest, pendingCount, readingHistory };
}
