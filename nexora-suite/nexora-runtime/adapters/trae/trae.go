package trae

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "trae", Name: "TRAE", Vendor: "ByteDance", Category: "coding",
		DeploymentModes: []string{"private_server", "local_device"},
		Capabilities:    []string{"stream", "code", "terminal", "workspace"},
	}}
}
