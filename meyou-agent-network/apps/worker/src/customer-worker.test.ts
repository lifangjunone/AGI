import { afterEach, expect, it, vi } from "vitest";
import { startCustomerWorker } from "./customer-worker.js";
afterEach(() => vi.useRealTimers());
it("keeps heartbeats running during a long task and never overlaps drains", async () => {
  vi.useFakeTimers();
  let complete!: (value: Response) => void;
  const request = vi.fn<typeof fetch>(async url => {
    if (String(url).endsWith("/customer-agents")) return new Promise(resolve => { complete = resolve; });
    return new Response("{}");
  });
  const stop = startCustomerWorker({ baseUrl: "http://api.invalid", token: "test-only", request });
  await vi.advanceTimersByTimeAsync(20000);
  expect(request.mock.calls.filter(([url]) => String(url).endsWith("/customer-agents"))).toHaveLength(1);
  expect(request.mock.calls.filter(([url]) => String(url).endsWith("/customer-agent-heartbeat"))).toHaveLength(3);
  complete(new Response("{}"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(request.mock.calls.filter(([url]) => String(url).endsWith("/customer-agents"))).toHaveLength(2);
  stop();
});
it("stops timers and aborts in-flight requests on shutdown", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    signals.push(init!.signal!);
    return new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  const errors = vi.fn();
  const stop = startCustomerWorker({ baseUrl: "http://api.invalid", token: "test-only", request, onError: errors });
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(errors).not.toHaveBeenCalled();
});
