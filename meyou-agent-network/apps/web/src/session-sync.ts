export const SESSION_CHANGE_KEY = "meyou-session-change";

// This is a notification, never authentication evidence. Receivers must recheck the server.
export function notifySessionChange() {
  try { window.localStorage.setItem(SESSION_CHANGE_KEY, crypto.randomUUID()); }
  catch { /* Focus revalidation remains available when storage is disabled. */ }
}
