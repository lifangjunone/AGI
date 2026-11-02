export function startCustomerWorker({
  baseUrl, token, request = fetch, onError = (event: string) => console.error(JSON.stringify({ level: "error", event }))
}: {
  baseUrl: string; token: string; request?: typeof fetch; onError?: (event: string) => void;
}) {
  const origin = baseUrl.replace(/\/$/, "");
  let stopped = false;
  let executing = false;
  let heartbeatRunning = false;
  const controllers = new Set<AbortController>();
  async function invoke(path: string, timeout: number) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await request(`${origin}/internal/jobs/${path}`, {
        method: "POST", headers: { "x-meyou-worker-token": token, "content-type": "application/json" },
        body: "{}", signal: controller.signal
      });
      if (!response.ok) throw new Error("worker_request_failed");
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function heartbeat() {
    if (stopped || heartbeatRunning) return;
    heartbeatRunning = true;
    try { await invoke("customer-agent-heartbeat", 5000); }
    catch { if (!stopped) onError("customer.heartbeat_unavailable"); }
    finally { heartbeatRunning = false; }
  }
  async function drain() {
    if (stopped || executing) return;
    executing = true;
    try { await invoke("customer-agents", 3_660_000); }
    catch { if (!stopped) onError("customer.agents_unavailable"); }
    finally { executing = false; }
  }
  const heartbeats = setInterval(() => void heartbeat(), 10000);
  const tasks = setInterval(() => void drain(), 5000);
  void heartbeat();
  void drain();
  return () => {
    stopped = true;
    clearInterval(heartbeats); clearInterval(tasks);
    for (const controller of controllers) controller.abort();
  };
}
