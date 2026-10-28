package custom

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "custom", Name: "Custom Runtime", Vendor: "Customer", Category: "custom",
		DeploymentModes: []string{"private_server", "kubernetes", "local_device"},
		Capabilities:    []string{"stream"},
	}}
}
