package qwenpaw

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "qwenpaw", Name: "QwenPaw", Vendor: "Qwen", Category: "device",
		DeploymentModes: []string{"local_device", "managed_device"},
		Capabilities:    []string{"stream", "desktop", "workspace", "tools"},
	}}
}
