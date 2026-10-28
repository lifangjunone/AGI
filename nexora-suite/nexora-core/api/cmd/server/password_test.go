package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestPasswordHashPersistsWithoutEnvironmentReset(t *testing.T) {
	path := filepath.Join(t.TempDir(), "core.json")
	first := newApp("secret", "original-password", path)
	if first.users["admin@nexora.local"].Password != "" {
		t.Fatal("plaintext bootstrap password retained")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("original-password")) {
		t.Fatal("plaintext password persisted")
	}
	reloaded := newApp("secret", "replacement-password", path)
	call := func(password string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"Email": "admin@nexora.local", "Password": password})
		res := httptest.NewRecorder()
		reloaded.login(res, httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body)))
		return res
	}
	if got := call("original-password"); got.Code != 200 {
		t.Fatalf("original password failed after restart: %s", got.Body.String())
	}
	if got := call("replacement-password"); got.Code != 401 {
		t.Fatal("environment reset existing password")
	}
	if got := call(""); got.Code != 401 {
		t.Fatal("empty password accepted")
	}
	res := call("original-password")
	if bytes.Contains(res.Body.Bytes(), []byte("password_hash")) || bytes.Contains(res.Body.Bytes(), []byte("$2a$")) {
		t.Fatal("password hash exposed in login response")
	}
	item := reloaded.users["admin@nexora.local"]
	item.Status = "suspended"
	reloaded.users[item.Email] = item
	if got := call("original-password"); got.Code != 401 {
		t.Fatal("suspended account logged in")
	}
}
