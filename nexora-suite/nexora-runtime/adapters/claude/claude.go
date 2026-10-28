package claude

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "claude-agent", Name: "Claude Agent SDK", Vendor: "Anthropic", Category: "coding",
		DeploymentModes: []string{"private_server", "kubernetes", "local_device"},
		Capabilities:    []string{"stream", "code", "tools", "workspace", "approvals"},
	}}
}
