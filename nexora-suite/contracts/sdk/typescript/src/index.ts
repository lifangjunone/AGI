export interface AgentManifest {
  schema_version: "1.0";
  agent_id: string;
  name: string;
  version: string;
  endpoint: string;
  capabilities: string[];
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

  private async request(path: string, body: unknown) {
    const response = await fetch(`${this.baseURL.replace(/\/$/, "")}${path}`, {
      method: "POST",
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
