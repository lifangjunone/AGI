import { startCustomerWorker } from "./customer-worker.js";

const token = process.env.WORKER_INTERNAL_TOKEN;
if (!token) throw new Error("worker_internal_token_missing");
const stop = startCustomerWorker({
  baseUrl: process.env.API_INTERNAL_URL ?? "http://127.0.0.1:43180", token
});
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
