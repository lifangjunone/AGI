package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func token(secret string, products []string) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	raw, _ := json.Marshal(claims{Sub: "usr_admin", TenantID: "tenant_nexora", Products: products, Exp: time.Now().Add(time.Hour).Unix()})
	payload := base64.RawURLEncoding.EncodeToString(raw)
	unsigned := header + "." + payload
	a := newApp(secret, "")
	mac := hmacForTest(a.signingKey, unsigned)
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac)
}

func hmacForTest(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	health(w, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestCredentialEncryption(t *testing.T) {
	a := newApp("test-secret", "")
	encrypted, err := a.encrypt("sk-real-secret")
	if err != nil || strings.Contains(encrypted, "sk-real-secret") {
		t.Fatalf("credential was not encrypted: %v", err)
	}
	decrypted, err := a.decrypt(encrypted)
	if err != nil || decrypted != "sk-real-secret" {
		t.Fatalf("credential round trip failed: %q %v", decrypted, err)
	}
}

func TestEncryptedCredentialPersistsAcrossRestartWithoutAPIDisclosure(t *testing.T) {
	dataFile := filepath.Join(t.TempDir(), "maas-state.json")
	a := newApp("test-secret", dataFile)
	encrypted, err := a.encrypt("sk-persisted-secret")
	if err != nil {
		t.Fatal(err)
	}
	a.providers["provider"] = provider{
		ID: "provider", TenantID: "tenant_nexora", Name: "Internal",
		Kind: "openai-compatible", BaseURL: "http://models.internal/v1",
		EncryptedAPIKey: encrypted, KeyHint: "sk-…cret", Status: "active",
	}
	a.mu.Lock()
	a.persistLocked()
	a.mu.Unlock()

	restored := newApp("test-secret", dataFile)
	key, err := restored.decrypt(restored.providers["provider"].EncryptedAPIKey)
	if err != nil || key != "sk-persisted-secret" {
		t.Fatalf("credential did not survive restart: %q %v", key, err)
	}

	raw, err := os.ReadFile(dataFile)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("sk-persisted-secret")) {
		t.Fatal("state file contains plaintext credential")
	}
}

func TestProviderModelRouteLifecycleAndEntitlement(t *testing.T) {
	const secret = "test-secret"
	a := newApp(secret, "")
	mux := http.NewServeMux()
	a.routesFor(mux)
	handler := cors(mux)
	accessToken := token(secret, []string{"maas"})
	call := func(method, path string, body any, bearer string) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Authorization", "Bearer "+bearer)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}

	denied := call(http.MethodGet, "/api/v1/providers", nil, token(secret, []string{"studio"}))
	if denied.Code != http.StatusForbidden {
		t.Fatalf("expected product entitlement rejection, got %d", denied.Code)
	}

	createdProvider := call(http.MethodPost, "/api/v1/providers", map[string]any{
		"name": "Internal Gateway", "kind": "openai-compatible", "base_url": "http://models.internal/v1", "api_key": "sk-secret",
	}, accessToken)
	if createdProvider.Code != http.StatusCreated || strings.Contains(createdProvider.Body.String(), "sk-secret") {
		t.Fatalf("provider create failed or leaked secret: %d %s", createdProvider.Code, createdProvider.Body.String())
	}
	var p provider
	_ = json.Unmarshal(createdProvider.Body.Bytes(), &p)

	createdModel := call(http.MethodPost, "/api/v1/models", map[string]any{
		"name": "Reasoning Pro", "provider_id": p.ID, "upstream_model": "reasoning-pro", "context_window": 128000,
	}, accessToken)
	if createdModel.Code != http.StatusCreated {
		t.Fatalf("model create failed: %d %s", createdModel.Code, createdModel.Body.String())
	}
	var m model
	_ = json.Unmarshal(createdModel.Body.Bytes(), &m)

	createdRoute := call(http.MethodPost, "/api/v1/routes", map[string]any{
		"name": "Agent default", "alias": "agent-default", "model_id": m.ID,
	}, accessToken)
	if createdRoute.Code != http.StatusCreated {
		t.Fatalf("route create failed: %d %s", createdRoute.Code, createdRoute.Body.String())
	}
}

func TestPrivateProviderDiscoveryAndBatchImport(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("X-API-Key") != "private-secret" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		write(w, 200, map[string]any{"data": []map[string]any{
			{"id": "Qwen/Qwen3-32B", "owned_by": "private"},
			{"id": "Qwen/Qwen3-Embedding-4B", "owned_by": "private"},
		}})
	}))
	defer upstream.Close()

	const secret = "test-secret"
	a := newApp(secret, "")
	mux := http.NewServeMux()
	a.routesFor(mux)
	accessToken := token(secret, []string{"maas"})
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}

	created := call(http.MethodPost, "/api/v1/providers", map[string]any{
		"name": "Private Qwen", "kind": "vllm", "base_url": upstream.URL + "/v1",
		"auth_type": "header", "header_name": "X-API-Key", "api_key": "private-secret",
	})
	if created.Code != http.StatusCreated {
		t.Fatalf("provider create failed: %d %s", created.Code, created.Body.String())
	}
	var p provider
	_ = json.Unmarshal(created.Body.Bytes(), &p)
	discovered := call(http.MethodGet, "/api/v1/providers/"+p.ID+"/models", nil)
	if discovered.Code != http.StatusOK || !strings.Contains(discovered.Body.String(), "Qwen3-32B") {
		t.Fatalf("model discovery failed: %d %s", discovered.Code, discovered.Body.String())
	}
	imported := call(http.MethodPost, "/api/v1/models/import", map[string]any{
		"provider_id": p.ID, "model_ids": []string{"Qwen/Qwen3-32B", "Qwen/Qwen3-Embedding-4B"},
	})
	if imported.Code != http.StatusCreated || !strings.Contains(imported.Body.String(), `"total":2`) {
		t.Fatalf("batch import failed: %d %s", imported.Code, imported.Body.String())
	}
}

func TestProviderUpdateSupportsAuthKindAndDoesNotLeakSecret(t *testing.T) {
	const secret = "test-secret"
	a := newApp(secret, "")
	mux := http.NewServeMux()
	a.routesFor(mux)
	accessToken := token(secret, []string{"maas"})
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}

	created := call(http.MethodPost, "/api/v1/providers", map[string]any{
		"name": "Qwen CPU", "kind": "openai-compatible", "base_url": "http://models.internal/v1",
		"auth_type": "bearer", "api_key": "sk-original",
	})
	if created.Code != http.StatusCreated {
		t.Fatalf("provider create failed: %d %s", created.Code, created.Body.String())
	}
	var p provider
	_ = json.Unmarshal(created.Body.Bytes(), &p)

	updated := call(http.MethodPatch, "/api/v1/providers/"+p.ID, map[string]any{
		"name": "Private Qwen CPU", "kind": "vllm", "base_url": "http://qwen.internal/v1",
		"auth_type": "header", "header_name": "X-API-Key", "api_key": "sk-updated", "status": "disabled",
	})
	if updated.Code != http.StatusOK {
		t.Fatalf("provider update failed: %d %s", updated.Code, updated.Body.String())
	}
	if strings.Contains(updated.Body.String(), "sk-updated") {
		t.Fatalf("provider update leaked secret: %s", updated.Body.String())
	}
	var out provider
	_ = json.Unmarshal(updated.Body.Bytes(), &out)
	if out.Name != "Private Qwen CPU" || out.Kind != "vllm" || out.AuthType != "header" || out.HeaderName != "X-API-Key" || out.Status != "disabled" {
		t.Fatalf("provider update did not persist management fields: %+v", out)
	}
}
