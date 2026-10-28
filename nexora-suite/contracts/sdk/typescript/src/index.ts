export interface AgentManifest {
  schema_version: "1.0" | "1.1";
  agent_id: string;
  name: string;
  version: string;
  endpoint: string;
  capabilities: string[];
  execution_type?: "workflow" | "agent_loop";
  runtime?: {
    runtime_id?: string;
    deployment_mode?: string;
    endpoint?: string;
    credential_ref?: string;
    permission_profile?: string;
    max_steps?: number;
    timeout_seconds?: number;
  };
  metadata?: Record<string, unknown>;
}

export class NexoraClient {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  registerAgent(manifest: AgentManifest) {
    return this.request("/api/v1/agents", {
      external_id: manifest.agent_id,
      name: manifest.name,
      source: "external",
      version: manifest.version,
      endpoint: manifest.endpoint,
      capabilities: manifest.capabilities,
      manifest,
    });
  }

  invoke(agentID: string, input: string) {
    return this.request(`/api/v1/gateway/agents/${agentID}/invoke`, { input });
  }

  runtimeTask(taskID: string) {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskID)}`, undefined, "GET");
  }

  cancelRuntimeTask(taskID: string) {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskID)}/cancel`, {});
  }

  private async request(path: string, body: unknown, method = "POST") {
    const response = await fetch(`${this.baseURL.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message ?? `Nexora HTTP ${response.status}`);
    return result;
  }
}
