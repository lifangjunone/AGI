import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(HERE, "data");
const STORE_PATH = resolve(DATA_DIR, "store.json");

function blankStore() {
  return { diagnostics: {}, orders: {}, notifyEvents: {}, refunds: {} };
}

function readStore() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_PATH)) return blankStore();
  return { ...blankStore(), ...JSON.parse(readFileSync(STORE_PATH, "utf8")) };
}

function writeStore(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temporary, STORE_PATH);
}

let queue = Promise.resolve();
function transaction(mutator) {
  const run = queue.then(() => {
    const data = readStore();
    const result = mutator(data);
    writeStore(data);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDiagnostic(payload) {
  const diagnostic = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
  };
  await transaction((data) => {
    data.diagnostics[diagnostic.id] = diagnostic;
  });
  return diagnostic;
}

export function getDiagnostic(id) {
  return readStore().diagnostics[id] || null;
}

export async function createOrder({ diagnosticId, projectName, contact, amount }) {
  const orderId = `FDE${Date.now()}${randomBytes(3).toString("hex").toUpperCase()}`;
  const accessToken = randomBytes(24).toString("base64url");
  const order = {
    id: orderId,
    diagnosticId,
    projectName,
    contact,
    amount,
    subject: "FDE AI 项目交付风险完整诊断报告",
    status: "PENDING_PAYMENT",
    accessTokenHash: hashToken(accessToken),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tradeNo: null,
    lastQueriedAt: null,
    paidAt: null,
  };
  await transaction((data) => {
    data.orders[order.id] = order;
  });
  return { order, accessToken };
}

export function getOrder(id) {
  return readStore().orders[id] || null;
}

export async function updateOrder(id, patch) {
  return transaction((data) => {
    const order = data.orders[id];
    if (!order) return null;
    Object.assign(order, patch, { updatedAt: new Date().toISOString() });
    return order;
  });
}

export async function insertNotifyEventOnce(event) {
  return transaction((data) => {
    const key =
      event.notifyId ||
      `${event.outTradeNo}:${event.tradeNo || "none"}:${event.tradeStatus || "none"}`;
    if (data.notifyEvents[key]) return false;
    data.notifyEvents[key] = { ...event, receivedAt: new Date().toISOString() };
    return true;
  });
}

export async function createRefundRecord(payload) {
  return transaction((data) => {
    if (data.refunds[payload.outRequestNo]) {
      const existing = data.refunds[payload.outRequestNo];
      if (
        existing.orderId !== payload.orderId ||
        existing.amount !== payload.amount
      ) {
        throw new Error("refund idempotency conflict");
      }
      return existing;
    }
    const refund = {
      ...payload,
      status: "REQUESTED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.refunds[payload.outRequestNo] = refund;
    return refund;
  });
}

export async function updateRefund(outRequestNo, patch) {
  return transaction((data) => {
    const refund = data.refunds[outRequestNo];
    if (!refund) return null;
    Object.assign(refund, patch, { updatedAt: new Date().toISOString() });
    return refund;
  });
}

export function getRefund(outRequestNo) {
  return readStore().refunds[outRequestNo] || null;
}

export function listRefundsByOrder(orderId) {
  return Object.values(readStore().refunds).filter(
    (refund) => refund.orderId === orderId,
  );
}
