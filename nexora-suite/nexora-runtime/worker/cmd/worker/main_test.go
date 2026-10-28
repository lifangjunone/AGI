package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAllowedToolsEnforcesPermissionProfiles(t *testing.T) {
	tests := []struct {
		profile string
		want    []string
		deny    []string
	}{
		{profile: "tools_only", want: []string{"read", "grep"}, deny: []string{"write", "edit", "bash"}},
		{profile: "workspace_read", want: []string{"read", "glob"}, deny: []string{"write", "edit", "bash"}},
		{profile: "workspace_write", want: []string{"read", "write", "edit"}, deny: []string{"bash"}},
		{profile: "device_control", want: []string{"read", "write", "bash"}},
	}
	for _, test := range tests {
		got := allowedTools(taskRequest{PermissionProfile: test.profile})
		for _, name := range test.want {
			if !contains(got, name) {
				t.Errorf("%s must allow %s: %v", test.profile, name, got)
			}
		}
		for _, name := range test.deny {
			if contains(got, name) {
				t.Errorf("%s must deny %s: %v", test.profile, name, got)
			}
		}
	}
}

func TestPrepareTaskWritesIsolatedPrivateModelConfig(t *testing.T) {
	root := t.TempDir()
	w := &worker{maasURL: "http://127.0.0.1:8083", workspaceRoot: root}
	dir, agentDir, err := w.prepareTask(taskRequest{TaskID: "../../task-one", ModelRoute: "qwen3-4b-prod"}, "secret-token")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Dir(dir))
	if filepath.Dir(filepath.Dir(dir)) != root {
		t.Fatalf("task escaped workspace root: %s", dir)
	}
	if filepath.Dir(agentDir) != filepath.Dir(dir) || strings.HasPrefix(agentDir, dir+string(os.PathSeparator)) {
		t.Fatalf("engine config must be a workspace-invisible sibling: workspace=%s agent=%s", dir, agentDir)
	}
	info, err := os.Stat(filepath.Join(agentDir, "models.yml"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("models.yml permissions = %o, want 600", info.Mode().Perm())
	}
	raw, err := os.ReadFile(filepath.Join(agentDir, "models.yml"))
	if err != nil {
		t.Fatal(err)
	}
	config := string(raw)
	for _, value := range []string{"http://127.0.0.1:8083/v1", "qwen3-4b-prod", "secret-token"} {
		if !strings.Contains(config, value) {
			t.Fatalf("models.yml missing %q", value)
		}
	}
}

func TestRedactCredentials(t *testing.T) {
	value := `Authorization Bearer top-secret apiKey:another-secret`
	got := redact(value)
	if strings.Contains(got, "top-secret") || strings.Contains(got, "another-secret") {
		t.Fatalf("credential leaked: %s", got)
	}
}

func TestPromptWithHistory(t *testing.T) {
	got := promptWithHistory(taskRequest{
		Input: "current",
		Messages: []map[string]any{
			{"role": "user", "content": "first"},
			{"role": "assistant", "content": "second"},
			{"role": "system", "content": "must not be copied"},
		},
	})
	if !strings.Contains(got, "user: first") || !strings.Contains(got, "assistant: second") ||
		!strings.Contains(got, "Current task:\ncurrent") || strings.Contains(got, "must not be copied") {
		t.Fatalf("unexpected prompt: %s", got)
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
