package main

import (
	"bufio"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type claims struct {
	Sub      string   `json:"sub"`
	Email    string   `json:"email"`
	TenantID string   `json:"tenant_id"`
	Roles    []string `json:"roles"`
	Products []string `json:"products"`
	Exp      int64    `json:"exp"`
}

type provider struct {
	ID              string    `json:"id"`
	TenantID        string    `json:"tenant_id"`
	Name            string    `json:"name"`
	Kind            string    `json:"kind"`
	BaseURL         string    `json:"base_url"`
	EncryptedAPIKey string    `json:"encrypted_api_key,omitempty"`
	KeyHint         string    `json:"key_hint"`
	AuthType        string    `json:"auth_type,omitempty"`
	HeaderName      string    `json:"header_name,omitempty"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type model struct {
	ID                 string    `json:"id"`
	TenantID           string    `json:"tenant_id"`
	ProviderID         string    `json:"provider_id"`
	Name               string    `json:"name"`
	UpstreamModel      string    `json:"upstream_model"`
	Modality           string    `json:"modality"`
	ContextWindow      int       `json:"context_window"`
	InputPricePerMTok  float64   `json:"input_price_per_mtok"`
	OutputPricePerMTok float64   `json:"output_price_per_mtok"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type route struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Name      string    `json:"name"`
	Alias     string    `json:"alias"`
	ModelID   string    `json:"model_id"`
	Strategy  string    `json:"strategy"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type invocation struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	RouteID      string    `json:"route_id"`
	ModelID      string    `json:"model_id"`
	ProviderID   string    `json:"provider_id"`
	CallerID     string    `json:"caller_id"`
	RequestID    string    `json:"request_id"`
	Status       string    `json:"status"`
	LatencyMS    int       `json:"latency_ms"`
	InputTokens  int       `json:"input_tokens"`
	OutputTokens int       `json:"output_tokens"`
	CostUSD      float64   `json:"cost_usd"`
	ErrorCode    string    `json:"error_code,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type persistedState struct {
	Providers   map[string]provider `json:"providers"`
	Models      map[string]model    `json:"models"`
	Routes      map[string]route    `json:"routes"`
	Invocations []invocation        `json:"invocations"`
}

func (p provider) MarshalJSON() ([]byte, error) {
	type publicProvider provider
	return json.Marshal(publicProvider(p))
}

type app struct {
	mu            sync.RWMutex
	signingKey    []byte
	encryptionKey []byte
	providers     map[string]provider
	models        map[string]model
	routes        map[string]route
	invocations   []invocation
	dataFile      string
	client        *http.Client
}

func main() {
	secret := env("NEXORA_JWT_SECRET", "nexora-development-secret-change-me")
	a := newApp(secret, env("NEXORA_DATA_FILE", ""))
	mux := http.NewServeMux()
	a.routesFor(mux)
	addr := env("ADDR", ":8080")
	log.Printf("Nexora MaaS API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, cors(requestID(mux))))
}

func newApp(secret, dataFile string) *app {
	sum := sha256.Sum256([]byte("nexora-maas-credentials:" + secret))
	a := &app{
		signingKey:    []byte(secret),
		encryptionKey: sum[:],
		providers:     map[string]provider{},
		models:        map[string]model{},
		routes:        map[string]route{},
		invocations:   []invocation{},
		dataFile:      dataFile,
		client:        &http.Client{Timeout: 90 * time.Second},
	}
	if err := a.load(); err != nil {
		log.Printf("load maas state: %v", err)
	}
	return a
}

func (a *app) routesFor(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /api/v1/providers", a.auth(a.listProviders))
	mux.HandleFunc("POST /api/v1/providers", a.auth(a.createProvider))
	mux.HandleFunc("PATCH /api/v1/providers/{id}", a.auth(a.updateProvider))
	mux.HandleFunc("DELETE /api/v1/providers/{id}", a.auth(a.deleteProvider))
	mux.HandleFunc("POST /api/v1/providers/{id}/test", a.auth(a.testProvider))
	mux.HandleFunc("GET /api/v1/providers/{id}/models", a.auth(a.discoverProviderModels))
	mux.HandleFunc("GET /api/v1/models", a.auth(a.listModels))
	mux.HandleFunc("POST /api/v1/models", a.auth(a.createModel))
	mux.HandleFunc("POST /api/v1/models/import", a.auth(a.importModels))
	mux.HandleFunc("PATCH /api/v1/models/{id}", a.auth(a.updateModel))
	mux.HandleFunc("DELETE /api/v1/models/{id}", a.auth(a.deleteModel))
	mux.HandleFunc("GET /api/v1/routes", a.auth(a.listRoutes))
	mux.HandleFunc("POST /api/v1/routes", a.auth(a.createRoute))
	mux.HandleFunc("PATCH /api/v1/routes/{id}", a.auth(a.updateRoute))
	mux.HandleFunc("DELETE /api/v1/routes/{id}", a.auth(a.deleteRoute))
	mux.HandleFunc("GET /api/v1/invocations", a.auth(a.listInvocations))
	mux.HandleFunc("GET /api/v1/summary", a.auth(a.summary))
	mux.HandleFunc("POST /v1/chat/completions", a.auth(a.chatCompletions))
}

func (a *app) listProviders(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]provider, 0)
	for _, item := range a.providers {
		if item.TenantID == c.TenantID {
			item.EncryptedAPIKey = ""
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) createProvider(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name       string `json:"name"`
		Kind       string `json:"kind"`
		BaseURL    string `json:"base_url"`
		APIKey     string `json:"api_key"`
		AuthType   string `json:"auth_type"`
		HeaderName string `json:"header_name"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name, in.Kind, in.BaseURL = strings.TrimSpace(in.Name), strings.ToLower(strings.TrimSpace(in.Kind)), strings.TrimRight(strings.TrimSpace(in.BaseURL), "/")
	if in.Name == "" || in.Kind == "" || in.BaseURL == "" {
		fail(w, 422, "validation_error", "name, kind and base_url are required")
		return
	}
	encrypted, err := a.encrypt(strings.TrimSpace(in.APIKey))
	if err != nil {
		fail(w, 500, "credential_encryption_failed", "credential could not be encrypted")
		return
	}
	now := time.Now().UTC()
	authType := strings.ToLower(strings.TrimSpace(in.AuthType))
	if authType == "" {
		authType = "bearer"
	}
	if authType != "bearer" && authType != "header" && authType != "none" {
		fail(w, 422, "validation_error", "auth_type must be bearer, header or none")
		return
	}
	headerName := strings.TrimSpace(in.HeaderName)
	if authType == "header" && headerName == "" {
		fail(w, 422, "validation_error", "header_name is required for custom header authentication")
		return
	}
	item := provider{ID: id("prv"), TenantID: c.TenantID, Name: in.Name, Kind: in.Kind, BaseURL: in.BaseURL, EncryptedAPIKey: encrypted, KeyHint: mask(in.APIKey), AuthType: authType, HeaderName: headerName, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.mu.Lock()
	a.providers[item.ID] = item
	a.persistLocked()
	a.mu.Unlock()
	item.EncryptedAPIKey = ""
	write(w, 201, item)
}

func (a *app) updateProvider(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.providers[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "provider not found")
		return
	}
	var in struct {
		Name       string `json:"name"`
		Kind       string `json:"kind"`
		BaseURL    string `json:"base_url"`
		APIKey     string `json:"api_key"`
		AuthType   string `json:"auth_type"`
		HeaderName string `json:"header_name"`
		Status     string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	if strings.TrimSpace(in.Kind) != "" {
		item.Kind = strings.ToLower(strings.TrimSpace(in.Kind))
	}
	if strings.TrimSpace(in.BaseURL) != "" {
		item.BaseURL = strings.TrimRight(strings.TrimSpace(in.BaseURL), "/")
	}
	if strings.TrimSpace(in.AuthType) != "" {
		authType := strings.ToLower(strings.TrimSpace(in.AuthType))
		if authType != "bearer" && authType != "header" && authType != "none" {
			fail(w, 422, "validation_error", "auth_type must be bearer, header or none")
			return
		}
		item.AuthType = authType
	}
	if in.HeaderName != "" || item.AuthType == "header" {
		item.HeaderName = strings.TrimSpace(in.HeaderName)
	}
	if item.AuthType == "header" && item.HeaderName == "" {
		fail(w, 422, "validation_error", "header_name is required for custom header authentication")
		return
	}
	if item.AuthType != "header" {
		item.HeaderName = ""
	}
	if in.Status == "active" || in.Status == "disabled" {
		item.Status = in.Status
	}
	if strings.TrimSpace(in.APIKey) != "" {
		encrypted, err := a.encrypt(strings.TrimSpace(in.APIKey))
		if err != nil {
			fail(w, 500, "credential_encryption_failed", "credential could not be encrypted")
			return
		}
		item.EncryptedAPIKey, item.KeyHint = encrypted, mask(in.APIKey)
	}
	item.UpdatedAt = time.Now().UTC()
	a.providers[item.ID] = item
	a.persistLocked()
	item.EncryptedAPIKey = ""
	write(w, 200, item)
}

func (a *app) deleteProvider(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.providers[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "provider not found")
		return
	}
	for _, m := range a.models {
		if m.TenantID == c.TenantID && m.ProviderID == item.ID {
			fail(w, 409, "provider_in_use", "delete or move the provider's models first")
			return
		}
	}
	delete(a.providers, item.ID)
	a.persistLocked()
	w.WriteHeader(204)
}

func (a *app) testProvider(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	item, ok := a.providers[r.PathValue("id")]
	a.mu.RUnlock()
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "provider not found")
		return
	}
	key, _ := a.decrypt(item.EncryptedAPIKey)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, item.BaseURL+"/models", nil)
	if err != nil {
		fail(w, 422, "invalid_endpoint", err.Error())
		return
	}
	applyProviderAuth(req, item, key)
	start := time.Now()
	res, err := a.client.Do(req)
	if err != nil {
		fail(w, 502, "provider_unreachable", err.Error())
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		fail(w, 502, "provider_rejected", fmt.Sprintf("provider returned HTTP %d", res.StatusCode))
		return
	}
	write(w, 200, map[string]any{"healthy": true, "latency_ms": time.Since(start).Milliseconds(), "checked_at": time.Now().UTC()})
}

func applyProviderAuth(req *http.Request, item provider, key string) {
	if key == "" || item.AuthType == "none" {
		return
	}
	if item.AuthType == "header" && item.HeaderName != "" {
		req.Header.Set(item.HeaderName, key)
		return
	}
	req.Header.Set("Authorization", "Bearer "+key)
}

func (a *app) discoverProviderModels(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	item, ok := a.providers[r.PathValue("id")]
	a.mu.RUnlock()
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "provider not found")
		return
	}
	key, err := a.decrypt(item.EncryptedAPIKey)
	if err != nil {
		fail(w, 500, "credential_unavailable", "provider credential could not be decrypted")
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, item.BaseURL+"/models", nil)
	if err != nil {
		fail(w, 422, "invalid_endpoint", err.Error())
		return
	}
	applyProviderAuth(req, item, key)
	res, err := a.client.Do(req)
	if err != nil {
		fail(w, 502, "provider_unreachable", err.Error())
		return
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 10<<20))
	if err != nil {
		fail(w, 502, "invalid_provider_response", "provider model catalog could not be read")
		return
	}
	if res.StatusCode >= 300 {
		fail(w, 502, "provider_rejected", fmt.Sprintf("provider returned HTTP %d", res.StatusCode))
		return
	}
	var catalog struct {
		Data []struct {
			ID      string `json:"id"`
			OwnedBy string `json:"owned_by"`
		} `json:"data"`
		Models []struct {
			Name  string `json:"name"`
			Model string `json:"model"`
		} `json:"models"`
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		fail(w, 502, "invalid_provider_response", "provider model catalog is not valid JSON")
		return
	}
	type discovered struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		OwnedBy string `json:"owned_by,omitempty"`
	}
	items := make([]discovered, 0, len(catalog.Data)+len(catalog.Models))
	seen := map[string]bool{}
	for _, entry := range catalog.Data {
		if entry.ID != "" && !seen[entry.ID] {
			items = append(items, discovered{ID: entry.ID, Name: entry.ID, OwnedBy: entry.OwnedBy})
			seen[entry.ID] = true
		}
	}
	for _, entry := range catalog.Models {
		modelID := entry.Model
		if modelID == "" {
			modelID = entry.Name
		}
		if modelID != "" && !seen[modelID] {
			items = append(items, discovered{ID: modelID, Name: modelID})
			seen[modelID] = true
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	write(w, 200, map[string]any{"items": items, "total": len(items), "provider_id": item.ID})
}

func (a *app) importModels(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		ProviderID    string   `json:"provider_id"`
		ModelIDs      []string `json:"model_ids"`
		ContextWindow int      `json:"context_window"`
	}
	if !decode(w, r, &in) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	p, ok := a.providers[in.ProviderID]
	if !ok || p.TenantID != c.TenantID {
		fail(w, 422, "invalid_provider", "provider does not exist")
		return
	}
	if len(in.ModelIDs) == 0 {
		fail(w, 422, "validation_error", "select at least one upstream model")
		return
	}
	if in.ContextWindow <= 0 {
		in.ContextWindow = 32768
	}
	imported := make([]model, 0, len(in.ModelIDs))
	for _, upstreamID := range in.ModelIDs {
		upstreamID = strings.TrimSpace(upstreamID)
		if upstreamID == "" {
			continue
		}
		exists := false
		for _, existing := range a.models {
			if existing.TenantID == c.TenantID && existing.ProviderID == in.ProviderID && existing.UpstreamModel == upstreamID {
				exists = true
				break
			}
		}
		if exists {
			continue
		}
		now := time.Now().UTC()
		item := model{ID: id("mdl"), TenantID: c.TenantID, ProviderID: in.ProviderID, Name: upstreamID, UpstreamModel: upstreamID, Modality: "text", ContextWindow: in.ContextWindow, Status: "active", CreatedAt: now, UpdatedAt: now}
		a.models[item.ID] = item
		imported = append(imported, item)
	}
	a.persistLocked()
	write(w, 201, map[string]any{"items": imported, "total": len(imported)})
}

func (a *app) listModels(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]model, 0)
	for _, item := range a.models {
		if item.TenantID == c.TenantID {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) createModel(w http.ResponseWriter, r *http.Request, c claims) {
	var in model
	if !decode(w, r, &in) {
		return
	}
	in.Name, in.UpstreamModel = strings.TrimSpace(in.Name), strings.TrimSpace(in.UpstreamModel)
	if in.Name == "" || in.UpstreamModel == "" || in.ProviderID == "" {
		fail(w, 422, "validation_error", "name, upstream_model and provider_id are required")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	p, ok := a.providers[in.ProviderID]
	if !ok || p.TenantID != c.TenantID {
		fail(w, 422, "invalid_provider", "provider does not exist")
		return
	}
	now := time.Now().UTC()
	in.ID, in.TenantID, in.CreatedAt, in.UpdatedAt = id("mdl"), c.TenantID, now, now
	if in.Modality == "" {
		in.Modality = "text"
	}
	in.Status = "active"
	a.models[in.ID] = in
	a.persistLocked()
	write(w, 201, in)
}

func (a *app) updateModel(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.models[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "model not found")
		return
	}
	var in model
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	if in.Status == "active" || in.Status == "disabled" {
		item.Status = in.Status
	}
	if in.ContextWindow > 0 {
		item.ContextWindow = in.ContextWindow
	}
	item.InputPricePerMTok, item.OutputPricePerMTok, item.UpdatedAt = in.InputPricePerMTok, in.OutputPricePerMTok, time.Now().UTC()
	a.models[item.ID] = item
	a.persistLocked()
	write(w, 200, item)
}

func (a *app) deleteModel(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.models[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "model not found")
		return
	}
	for _, rt := range a.routes {
		if rt.TenantID == c.TenantID && rt.ModelID == item.ID {
			fail(w, 409, "model_in_use", "delete or update routes using this model first")
			return
		}
	}
	delete(a.models, item.ID)
	a.persistLocked()
	w.WriteHeader(204)
}

func (a *app) listRoutes(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]route, 0)
	for _, item := range a.routes {
		if item.TenantID == c.TenantID {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) createRoute(w http.ResponseWriter, r *http.Request, c claims) {
	var in route
	if !decode(w, r, &in) {
		return
	}
	in.Name, in.Alias = strings.TrimSpace(in.Name), strings.TrimSpace(in.Alias)
	if in.Name == "" || in.Alias == "" || in.ModelID == "" {
		fail(w, 422, "validation_error", "name, alias and model_id are required")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	m, ok := a.models[in.ModelID]
	if !ok || m.TenantID != c.TenantID {
		fail(w, 422, "invalid_model", "model does not exist")
		return
	}
	for _, existing := range a.routes {
		if existing.TenantID == c.TenantID && existing.Alias == in.Alias {
			fail(w, 409, "alias_exists", "route alias already exists")
			return
		}
	}
	now := time.Now().UTC()
	in.ID, in.TenantID, in.CreatedAt, in.UpdatedAt = id("rte"), c.TenantID, now, now
	if in.Strategy == "" {
		in.Strategy = "primary"
	}
	in.Enabled = true
	a.routes[in.ID] = in
	a.persistLocked()
	write(w, 201, in)
}

func (a *app) updateRoute(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.routes[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "route not found")
		return
	}
	var in route
	if !decode(w, r, &in) {
		return
	}
	if in.ModelID != "" {
		m, exists := a.models[in.ModelID]
		if !exists || m.TenantID != c.TenantID {
			fail(w, 422, "invalid_model", "model does not exist")
			return
		}
		item.ModelID = in.ModelID
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	item.Enabled, item.UpdatedAt = in.Enabled, time.Now().UTC()
	a.routes[item.ID] = item
	a.persistLocked()
	write(w, 200, item)
}

func (a *app) deleteRoute(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	item, ok := a.routes[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID {
		fail(w, 404, "not_found", "route not found")
		return
	}
	delete(a.routes, item.ID)
	a.persistLocked()
	w.WriteHeader(204)
}

func (a *app) listInvocations(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]invocation, 0)
	for i := len(a.invocations) - 1; i >= 0 && len(items) < 200; i-- {
		if a.invocations[i].TenantID == c.TenantID {
			items = append(items, a.invocations[i])
		}
	}
	a.mu.RUnlock()
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) summary(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var providers, models, routes, calls, errorsCount, tokens int
	var cost float64
	for _, item := range a.providers {
		if item.TenantID == c.TenantID && item.Status == "active" {
			providers++
		}
	}
	for _, item := range a.models {
		if item.TenantID == c.TenantID && item.Status == "active" {
			models++
		}
	}
	for _, item := range a.routes {
		if item.TenantID == c.TenantID && item.Enabled {
			routes++
		}
	}
	for _, item := range a.invocations {
		if item.TenantID == c.TenantID {
			calls++
			tokens += item.InputTokens + item.OutputTokens
			cost += item.CostUSD
			if item.Status != "success" {
				errorsCount++
			}
		}
	}
	write(w, 200, map[string]any{"active_providers": providers, "active_models": models, "active_routes": routes, "calls": calls, "tokens": tokens, "cost_usd": cost, "errors": errorsCount})
}

func (a *app) chatCompletions(w http.ResponseWriter, r *http.Request, c claims) {
	start := time.Now()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
	if err != nil {
		fail(w, 400, "invalid_body", "request body could not be read")
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		fail(w, 400, "invalid_json", "request body must be valid JSON")
		return
	}
	alias, _ := payload["model"].(string)
	a.mu.RLock()
	var selectedRoute route
	for _, item := range a.routes {
		if item.TenantID == c.TenantID && item.Enabled && item.Alias == alias {
			selectedRoute = item
			break
		}
	}
	selectedModel, modelOK := a.models[selectedRoute.ModelID]
	selectedProvider, providerOK := a.providers[selectedModel.ProviderID]
	a.mu.RUnlock()
	if selectedRoute.ID == "" || !modelOK || !providerOK || selectedModel.Status != "active" || selectedProvider.Status != "active" {
		fail(w, 404, "route_unavailable", "no active route, model and provider match the requested model alias")
		return
	}
	payload["model"] = selectedModel.UpstreamModel
	upstreamBody, _ := json.Marshal(payload)
	upstreamReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, selectedProvider.BaseURL+"/chat/completions", bytes.NewReader(upstreamBody))
	if err != nil {
		fail(w, 422, "invalid_endpoint", err.Error())
		return
	}
	upstreamReq.Header.Set("Content-Type", "application/json")
	key, err := a.decrypt(selectedProvider.EncryptedAPIKey)
	if err != nil {
		fail(w, 500, "credential_unavailable", "provider credential could not be decrypted")
		return
	}
	applyProviderAuth(upstreamReq, selectedProvider, key)
	requestID := r.Header.Get("X-Request-ID")
	if requestID == "" {
		requestID = id("req")
	}
	upstreamReq.Header.Set("X-Request-ID", requestID)
	res, err := a.client.Do(upstreamReq)
	if err != nil {
		a.recordInvocation(c, selectedRoute, selectedModel, selectedProvider, requestID, "error", int(time.Since(start).Milliseconds()), 0, 0, "provider_unreachable")
		fail(w, 502, "provider_unreachable", err.Error())
		return
	}
	defer res.Body.Close()
	stream, _ := payload["stream"].(bool)
	if stream && res.StatusCode < 300 {
		contentType := res.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "text/event-stream"
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		w.Header().Set("X-Nexora-Request-ID", requestID)
		w.WriteHeader(res.StatusCode)
		inputTokens, outputTokens := 0, 0
		reader := bufio.NewReader(res.Body)
		for {
			line, readErr := reader.ReadString('\n')
			if line != "" {
				if strings.HasPrefix(line, "data:") {
					data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
					if data != "" && data != "[DONE]" {
						in, out := usage([]byte(data))
						if in > 0 {
							inputTokens = in
						}
						if out > 0 {
							outputTokens = out
						}
					}
				}
				if _, writeErr := io.WriteString(w, line); writeErr != nil {
					return
				}
				_ = http.NewResponseController(w).Flush()
			}
			if readErr != nil {
				if readErr == io.EOF {
					a.recordInvocation(c, selectedRoute, selectedModel, selectedProvider, requestID, "success", int(time.Since(start).Milliseconds()), inputTokens, outputTokens, "")
				}
				return
			}
		}
	}
	responseBody, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	if err != nil {
		a.recordInvocation(c, selectedRoute, selectedModel, selectedProvider, requestID, "error", int(time.Since(start).Milliseconds()), 0, 0, "invalid_provider_response")
		fail(w, 502, "invalid_provider_response", "provider response could not be read")
		return
	}
	inputTokens, outputTokens := usage(responseBody)
	status, errorCode := "success", ""
	if res.StatusCode >= 300 {
		status, errorCode = "error", fmt.Sprintf("provider_http_%d", res.StatusCode)
	}
	a.recordInvocation(c, selectedRoute, selectedModel, selectedProvider, requestID, status, int(time.Since(start).Milliseconds()), inputTokens, outputTokens, errorCode)
	w.Header().Set("Content-Type", res.Header.Get("Content-Type"))
	w.Header().Set("X-Nexora-Request-ID", requestID)
	w.WriteHeader(res.StatusCode)
	_, _ = w.Write(responseBody)
}

func (a *app) recordInvocation(c claims, rt route, m model, p provider, requestID, status string, latency, inputTokens, outputTokens int, errorCode string) {
	cost := float64(inputTokens)/1_000_000*m.InputPricePerMTok + float64(outputTokens)/1_000_000*m.OutputPricePerMTok
	item := invocation{ID: id("inv"), TenantID: c.TenantID, RouteID: rt.ID, ModelID: m.ID, ProviderID: p.ID, CallerID: c.Sub, RequestID: requestID, Status: status, LatencyMS: latency, InputTokens: inputTokens, OutputTokens: outputTokens, CostUSD: cost, ErrorCode: errorCode, CreatedAt: time.Now().UTC()}
	a.mu.Lock()
	a.invocations = append(a.invocations, item)
	if len(a.invocations) > 5000 {
		a.invocations = a.invocations[len(a.invocations)-5000:]
	}
	a.persistLocked()
	a.mu.Unlock()
}

func usage(raw []byte) (int, int) {
	var out struct {
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			InputTokens      int `json:"input_tokens"`
			OutputTokens     int `json:"output_tokens"`
		} `json:"usage"`
	}
	_ = json.Unmarshal(raw, &out)
	input, output := out.Usage.PromptTokens, out.Usage.CompletionTokens
	if input == 0 {
		input = out.Usage.InputTokens
	}
	if output == 0 {
		output = out.Usage.OutputTokens
	}
	return input, output
}

func (a *app) auth(next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			fail(w, 401, "unauthorized", "bearer token is required")
			return
		}
		c, err := a.verify(strings.TrimPrefix(header, "Bearer "))
		if err != nil || c.Exp < time.Now().Unix() || c.TenantID == "" {
			fail(w, 401, "unauthorized", "token is invalid or expired")
			return
		}
		if !contains(c.Products, "maas") {
			fail(w, 403, "product_not_entitled", "MaaS entitlement is required")
			return
		}
		next(w, r, c)
	}
}

func (a *app) verify(token string) (claims, error) {
	var c claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return c, errors.New("malformed token")
	}
	mac := hmac.New(sha256.New, a.signingKey)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return c, errors.New("invalid signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return c, err
	}
	return c, json.Unmarshal(raw, &c)
}

func (a *app) encrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	block, err := aes.NewCipher(a.encryptionKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(value), nil)), nil
}

func (a *app) decrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(a.encryptionKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(raw) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted credential")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
	return string(plain), err
}

func (a *app) load() error {
	if a.dataFile == "" {
		return nil
	}
	raw, err := os.ReadFile(a.dataFile)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var state persistedState
	if err := json.Unmarshal(raw, &state); err != nil {
		return err
	}
	if state.Providers != nil {
		a.providers = state.Providers
	}
	if state.Models != nil {
		a.models = state.Models
	}
	if state.Routes != nil {
		a.routes = state.Routes
	}
	a.invocations = state.Invocations
	return nil
}

func (a *app) persistLocked() {
	if a.dataFile == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.dataFile), 0o750); err != nil {
		log.Printf("create data directory: %v", err)
		return
	}
	raw, err := json.MarshalIndent(persistedState{Providers: a.providers, Models: a.models, Routes: a.routes, Invocations: a.invocations}, "", "  ")
	if err != nil {
		log.Printf("marshal state: %v", err)
		return
	}
	temp := a.dataFile + ".tmp"
	if err := os.WriteFile(temp, raw, 0o600); err != nil {
		log.Printf("write state: %v", err)
		return
	}
	if err := os.Rename(temp, a.dataFile); err != nil {
		log.Printf("replace state: %v", err)
	}
}

func health(w http.ResponseWriter, _ *http.Request) {
	write(w, 200, map[string]any{"status": "ok", "product": "nexora-maas", "time": time.Now().UTC()})
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 2<<20))
	if err := decoder.Decode(value); err != nil {
		fail(w, 400, "invalid_json", "request body must be valid JSON")
		return false
	}
	return true
}

func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func fail(w http.ResponseWriter, status int, code, message string) {
	write(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		value := r.Header.Get("X-Request-ID")
		if value == "" {
			value = id("req")
		}
		w.Header().Set("X-Request-ID", value)
		next.ServeHTTP(w, r)
	})
}

func id(prefix string) string {
	raw := make([]byte, 9)
	_, _ = rand.Read(raw)
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw)
}

func mask(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Not required"
	}
	if len(value) <= 8 {
		return "••••" + value[len(value)-2:]
	}
	return value[:3] + "••••••" + value[len(value)-4:]
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
