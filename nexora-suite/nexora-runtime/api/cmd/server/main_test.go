package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestUpdateNativeProfilePreservesTenantStorageKey(t *testing.T) {
	a := newApp("test-secret", "", "http://127.0.0.1:8094")
	c := claims{TenantID: "tenant_a"}
	a.ensureNative(c.TenantID)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/runtime-profiles/nexora-native", bytes.NewBufferString(`{"name":"Platform Native","permission_profile":"workspace_read"}`))
	req.SetPathValue("id", "nexora-native")
	res := httptest.NewRecorder()
	a.updateProfile(res, req, c)

	if res.Code != http.StatusOK {
		t.Fatalf("update returned %d: %s", res.Code, res.Body.String())
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	if len(a.profiles) != 1 {
		t.Fatalf("expected one native profile, got %d", len(a.profiles))
	}
	item, ok := a.profiles["nexora-native:tenant_a"]
	if !ok {
		t.Fatal("tenant-scoped native storage key was not preserved")
	}
	if item.Name != "Platform Native" || item.PermissionProfile != "workspace_read" {
		t.Fatalf("native profile was not updated: %#v", item)
	}
}

func TestActivateSymlinkSwitchesImmutableEngine(t *testing.T) {
	root := t.TempDir()
	for _, version := range []string{"1.0.0", "1.1.0"} {
		dir := filepath.Join(root, version)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "engine"), []byte(version), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := activateSymlink(root, "1.0.0"); err != nil {
		t.Fatal(err)
	}
	if err := activateSymlink(root, "1.1.0"); err != nil {
		t.Fatal(err)
	}
	target, err := os.Readlink(filepath.Join(root, "current"))
	if err != nil {
		t.Fatal(err)
	}
	if target != filepath.Join("1.1.0", "engine") {
		t.Fatalf("current points to %q", target)
	}
}

func TestValidVersionRejectsPaths(t *testing.T) {
	for _, value := range []string{"18.12.6", "19.0.0-2"} {
		if !validVersion(value) {
			t.Fatalf("expected %q to be valid", value)
		}
	}
	for _, value := range []string{"", "../engine", "18/12/6", "latest"} {
		if validVersion(value) {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestNativeProfilesRemainTenantIsolated(t *testing.T) {
	a := newApp("test-secret", "", "http://127.0.0.1:8094")
	a.ensureNative("tenant_a")
	a.ensureNative("tenant_b")

	a.mu.RLock()
	_, firstOK := a.profileByID("nexora-native", "tenant_a")
	_, secondOK := a.profileByID("nexora-native", "tenant_b")
	count := len(a.profiles)
	a.mu.RUnlock()

	if !firstOK || !secondOK || count != 2 {
		t.Fatalf("expected isolated native profiles for two tenants, first=%v second=%v count=%d", firstOK, secondOK, count)
	}
}
