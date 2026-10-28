package openclaw

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "openclaw", Name: "OpenClaw", Vendor: "OpenClaw", Category: "server",
		DeploymentModes: []string{"private_server", "kubernetes"},
		Capabilities:    []string{"stream", "tools", "workspace"},
	}}
}
