package workbuddy

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "workbuddy", Name: "WorkBuddy", Vendor: "WorkBuddy", Category: "device",
		DeploymentModes: []string{"local_device", "managed_device"},
		Capabilities:    []string{"stream", "desktop", "workspace", "tools"},
	}}
}
