// Images stay on this browser, never in server-side storage.
// Expired records are removed when this product is opened again.
const storageKey = "statusCapsule:session";
function sessionId() {
  let id = sessionStorage.getItem(storageKey);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(storageKey, id); }
  return id;
}
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("status-capsule-preview", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sessions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", mode);
      let value;
      action(tx.objectStore("sessions"), (next) => { value = next; });
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("storage_aborted"));
    });
  } finally { db.close(); }
}
export async function readSession() {
  const id = sessionId();
  await transaction("readwrite", (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      if (cursor.result.value.expiresAt < Date.now()) cursor.result.delete();
      cursor.result.continue();
    };
  });
  return transaction("readonly", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result);
  });
}
export async function writeSession(record) {
  const id = sessionId();
  return transaction("readwrite", (store) => store.put({ ...record, expiresAt: Date.now() + 2 * 60 * 60 * 1000 }, id));
}
export async function clearSession() {
  const id = sessionId();
  await transaction("readwrite", (store) => store.delete(id));
  sessionStorage.removeItem(storageKey);
}
