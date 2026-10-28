package native

import "github.com/nexora-suite/nexora-runtime/adapters"

func New() adapters.Adapter {
	return adapters.ProtocolBridge{Info: adapters.Descriptor{
		ID: "native", Name: "Nexora Native Runtime", Vendor: "Nexora", Category: "managed",
		DeploymentModes: []string{"managed", "kubernetes"},
		Capabilities:    []string{"stream", "reasoning", "knowledge", "tools", "skills", "plugins", "approvals"},
		BuiltIn:         true, Status: "ready", Integration: "native_worker",
	}}
}
