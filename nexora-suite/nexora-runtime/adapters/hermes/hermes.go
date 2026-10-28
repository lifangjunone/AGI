package hermes

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "hermes-agent", Name: "Hermes Agent", Vendor: "Nous Research", Category: "server",
		DeploymentModes: []string{"private_server", "kubernetes"},
		Capabilities:    []string{"stream", "tools", "skills", "workspace"},
	}}
}
