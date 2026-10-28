package deepseek

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "deepseek-agent", Name: "DeepSeek Agent", Vendor: "DeepSeek", Category: "server",
		DeploymentModes: []string{"private_server", "kubernetes"},
		Capabilities:    []string{"stream", "reasoning", "tools"},
	}}
}
