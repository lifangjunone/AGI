package codex

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "codex", Name: "Codex", Vendor: "OpenAI", Category: "coding",
		DeploymentModes: []string{"local_device", "private_server"},
		Capabilities:    []string{"stream", "code", "terminal", "workspace", "approvals"},
	}}
}
