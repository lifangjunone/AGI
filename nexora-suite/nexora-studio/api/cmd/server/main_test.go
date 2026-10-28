package main

import (
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	health(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestAgentLoopRuntimeValidation(t *testing.T) {
	valid := runtimeConfig{
		RuntimeID: "nexora-native", DeploymentMode: "managed",
		PermissionProfile: "tools_only", MaxSteps: 20, TimeoutSeconds: 300,
	}
	if err := validateAgentRuntime("agent_loop", valid); err != nil {
		t.Fatalf("valid native runtime rejected: %v", err)
	}
	external := valid
	external.RuntimeID = "codex"
	if err := validateAgentRuntime("agent_loop", external); err != nil {
		t.Fatalf("runtime profile reference rejected: %v", err)
	}
	external.RuntimeID = ""
	if err := validateAgentRuntime("agent_loop", external); err == nil {
		t.Fatal("missing Runtime profile must be rejected")
	}
}

func TestNormalizeExecutionType(t *testing.T) {
	if got := normalizeExecutionType(""); got != "workflow" {
		t.Fatalf("empty execution type = %q", got)
	}
	if got := normalizeExecutionType("agent_loop"); got != "agent_loop" {
		t.Fatalf("agent_loop execution type = %q", got)
	}
	if got := normalizeExecutionType("unknown"); got != "" {
		t.Fatalf("unknown execution type = %q", got)
	}
}
