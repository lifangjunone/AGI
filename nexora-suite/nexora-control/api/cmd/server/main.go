package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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
type managedAgent struct {
	ID, ExternalID, TenantID, Name, Source, Version, Endpoint, Status string
	Capabilities                                                      []string
	OwnerID                                                           string
	Manifest                                                          map[string]any
	LastHeartbeat, CreatedAt, UpdatedAt                               time.Time
}
type credential struct {
	ID, AgentID, TenantID, Prefix, SecretHash, Status string
	CreatedAt, ExpiresAt                              time.Time
}
type policy struct {
	ID, TenantID, Name, Effect string
	AgentID, Environment       string
	AllowedCallers             []string
	RateLimitPerMinute         int
	Enabled                    bool
	CreatedAt                  time.Time
}
type trace struct {
	ID, TenantID, AgentID, Version, CallerID, Status, RequestID string
	LatencyMS, InputTokens, OutputTokens                        int
	CostUSD                                                     float64
	CreatedAt                                                   time.Time
}
type app struct {
	mu          sync.RWMutex
	secret      []byte
	agents      map[string]managedAgent
	credentials map[string]credential
	policies    map[string]policy
	traces      []trace
	idempotency map[string]bool
}

func main() {
	a := &app{secret: []byte(env("NEXORA_JWT_SECRET", "nexora-development-secret-change-me")), agents: map[string]managedAgent{}, credentials: map[string]credential{}, policies: map[string]policy{}, idempotency: map[string]bool{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /api/v1/agents", a.auth(a.listAgents))
	mux.HandleFunc("POST /api/v1/agents", a.auth(a.registerAgent))
	mux.HandleFunc("GET /api/v1/agents/{id}", a.auth(a.getAgent))
	mux.HandleFunc("POST /api/v1/agents/{id}/lifecycle", a.auth(a.lifecycle))
	mux.HandleFunc("POST /api/v1/agents/{id}/heartbeat", a.auth(a.heartbeat))
	mux.HandleFunc("POST /api/v1/agents/{id}/credentials", a.auth(a.issueCredential))
	mux.HandleFunc("DELETE /api/v1/credentials/{id}", a.auth(a.revokeCredential))
	mux.HandleFunc("GET /api/v1/policies", a.auth(a.listPolicies))
	mux.HandleFunc("POST /api/v1/policies", a.auth(a.createPolicy))
	mux.HandleFunc("GET /api/v1/traces", a.auth(a.listTraces))
	mux.HandleFunc("POST /api/v1/gateway/agents/{id}/invoke", a.auth(a.invoke))
	mux.HandleFunc("POST /api/v1/events", a.auth(a.consumeEvent))
	addr := env("ADDR", ":8080")
	log.Printf("Nexora Control API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

func (a *app) listAgents(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	items := []managedAgent{}
	for _, v := range a.agents {
		if v.TenantID == c.TenantID {
			items = append(items, v)
		}
	}
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}
func (a *app) registerAgent(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		ExternalID   string         `json:"external_id"`
		Name         string         `json:"name"`
		Source       string         `json:"source"`
		Version      string         `json:"version"`
		Endpoint     string         `json:"endpoint"`
		Capabilities []string       `json:"capabilities"`
		Manifest     map[string]any `json:"manifest"`
	}
	if !decode(w, r, &in) || in.Name == "" {
		if in.Name == "" {
			fail(w, 422, "name_required", "name is required")
		}
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for key, existing := range a.agents {
		if existing.TenantID == c.TenantID && existing.ExternalID != "" && existing.ExternalID == in.ExternalID {
			existing.Name, existing.Version, existing.Endpoint, existing.Capabilities, existing.Manifest, existing.UpdatedAt = in.Name, in.Version, in.Endpoint, in.Capabilities, in.Manifest, time.Now().UTC()
			a.agents[key] = existing
			write(w, 200, existing)
			return
		}
	}
	now := time.Now().UTC()
	v := managedAgent{ID: id("agent"), ExternalID: in.ExternalID, TenantID: c.TenantID, Name: in.Name, Source: defaultValue(in.Source, "external"), Version: in.Version, Endpoint: in.Endpoint, Status: "pending", Capabilities: in.Capabilities, OwnerID: c.Sub, Manifest: in.Manifest, CreatedAt: now, UpdatedAt: now}
	if v.Source == "studio" {
		v.Status = "published"
	}
	a.agents[v.ID] = v
	write(w, 201, v)
}
func (a *app) getAgent(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	write(w, 200, v)
}
func (a *app) lifecycle(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	var in struct{ Status string }
	if !decode(w, r, &in) {
		return
	}
	allowed := map[string]bool{"pending": true, "approved": true, "published": true, "disabled": true, "quarantined": true, "retired": true}
	if !allowed[in.Status] {
		fail(w, 422, "invalid_status", "unsupported lifecycle status")
		return
	}
	v.Status, v.UpdatedAt = in.Status, time.Now().UTC()
	a.mu.Lock()
	a.agents[v.ID] = v
	a.mu.Unlock()
	write(w, 200, v)
}
func (a *app) heartbeat(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	v.LastHeartbeat, v.UpdatedAt = time.Now().UTC(), time.Now().UTC()
	a.mu.Lock()
	a.agents[v.ID] = v
	a.mu.Unlock()
	write(w, 200, map[string]any{"agent_id": v.ID, "healthy": true, "received_at": v.LastHeartbeat})
}
func (a *app) issueCredential(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	raw := "nxa_" + random(24)
	sum := sha256.Sum256([]byte(raw))
	now := time.Now().UTC()
	cred := credential{ID: id("cred"), AgentID: v.ID, TenantID: c.TenantID, Prefix: raw[:12], SecretHash: hex.EncodeToString(sum[:]), Status: "active", CreatedAt: now, ExpiresAt: now.Add(90 * 24 * time.Hour)}
	a.mu.Lock()
	a.credentials[cred.ID] = cred
	a.mu.Unlock()
	write(w, 201, map[string]any{"credential": cred, "secret": raw, "warning": "This secret is shown only once."})
}
func (a *app) revokeCredential(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	v, ok := a.credentials[r.PathValue("id")]
	if !ok || v.TenantID != c.TenantID {
		fail(w, 404, "not_found", "credential not found")
		return
	}
	v.Status = "revoked"
	a.credentials[v.ID] = v
	w.WriteHeader(204)
}
func (a *app) listPolicies(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	items := []policy{}
	for _, v := range a.policies {
		if v.TenantID == c.TenantID {
			items = append(items, v)
		}
	}
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}
func (a *app) createPolicy(w http.ResponseWriter, r *http.Request, c claims) {
	var in policy
	if !decode(w, r, &in) || in.Name == "" {
		if in.Name == "" {
			fail(w, 422, "name_required", "name is required")
		}
		return
	}
	in.ID, in.TenantID, in.CreatedAt = id("pol"), c.TenantID, time.Now().UTC()
	if in.Effect == "" {
		in.Effect = "allow"
	}
	in.Enabled = true
	a.mu.Lock()
	a.policies[in.ID] = in
	a.mu.Unlock()
	write(w, 201, in)
}
func (a *app) invoke(w http.ResponseWriter, r *http.Request, c claims) {
	start := time.Now()
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	if v.Status != "published" && v.Status != "approved" {
		fail(w, 403, "policy_denied", "agent is not approved for invocation")
		return
	}
	var in struct{ Input string }
	if !decode(w, r, &in) {
		return
	}
	if denied := a.denied(v, c); denied != "" {
		fail(w, 403, "policy_denied", denied)
		return
	}
	t := trace{ID: id("trace"), TenantID: c.TenantID, AgentID: v.ID, Version: v.Version, CallerID: c.Sub, Status: "success", RequestID: requestID(r), LatencyMS: int(time.Since(start).Milliseconds()) + 18, InputTokens: len(strings.Fields(in.Input)), OutputTokens: 5, CostUSD: .00012, CreatedAt: time.Now().UTC()}
	a.mu.Lock()
	a.traces = append(a.traces, t)
	a.mu.Unlock()
	write(w, 200, map[string]any{"trace_id": t.ID, "request_id": t.RequestID, "output": "Nexora governed response: " + in.Input, "usage": map[string]int{"input_tokens": t.InputTokens, "output_tokens": t.OutputTokens}})
}
func (a *app) denied(v managedAgent, c claims) string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, p := range a.policies {
		if !p.Enabled || p.TenantID != c.TenantID || (p.AgentID != "" && p.AgentID != v.ID) {
			continue
		}
		if p.Effect == "deny" {
			return "request denied by " + p.Name
		}
		if len(p.AllowedCallers) > 0 && !contains(p.AllowedCallers, c.Sub) {
			return "caller is not allowed by " + p.Name
		}
	}
	return ""
}
func (a *app) listTraces(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	items := []trace{}
	for i := len(a.traces) - 1; i >= 0; i-- {
		if a.traces[i].TenantID == c.TenantID {
			items = append(items, a.traces[i])
		}
	}
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}
func (a *app) consumeEvent(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		EventID       string         `json:"event_id"`
		EventType     string         `json:"event_type"`
		SchemaVersion string         `json:"schema_version"`
		TenantID      string         `json:"tenant_id"`
		ResourceID    string         `json:"resource_id"`
		Data          map[string]any `json:"data"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.TenantID != c.TenantID || in.EventID == "" {
		fail(w, 422, "invalid_event", "event_id and matching tenant_id are required")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.idempotency[in.EventID] {
		write(w, 200, map[string]any{"accepted": true, "duplicate": true})
		return
	}
	a.idempotency[in.EventID] = true
	write(w, 202, map[string]any{"accepted": true, "duplicate": false})
}
func (a *app) tenantAgent(agentID, tenantID string) (managedAgent, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	v, ok := a.agents[agentID]
	return v, ok && v.TenantID == tenantID
}
func (a *app) auth(next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.secret)
		if err != nil {
			fail(w, 401, "unauthorized", "valid Core bearer token required")
			return
		}
		if !contains(c.Products, "control") {
			fail(w, 403, "product_not_entitled", "Nexora Control is not enabled for this tenant")
			return
		}
		next(w, r, c)
	}
}
func verify(token string, secret []byte) (claims, error) {
	var c claims
	p := strings.Split(token, ".")
	if len(p) != 3 {
		return c, fmt.Errorf("malformed token")
	}
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(p[0] + "." + p[1]))
	sig, err := base64.RawURLEncoding.DecodeString(p[2])
	if err != nil || !hmac.Equal(sig, m.Sum(nil)) {
		return c, fmt.Errorf("invalid token")
	}
	raw, _ := base64.RawURLEncoding.DecodeString(p[1])
	if json.Unmarshal(raw, &c) != nil || c.Exp <= time.Now().Unix() || c.TenantID == "" {
		return c, fmt.Errorf("expired token")
	}
	return c, nil
}
func health(w http.ResponseWriter, _ *http.Request) {
	write(w, 200, map[string]any{"status": "ok", "service": "nexora-control"})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(v); err != nil {
		fail(w, 400, "invalid_json", err.Error())
		return false
	}
	return true
}
func write(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, code int, reason, message string) {
	write(w, code, map[string]any{"error": map[string]string{"code": reason, "message": message}})
}
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func requestID(r *http.Request) string {
	if v := r.Header.Get("X-Request-ID"); v != "" {
		return v
	}
	return id("req")
}
func random(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
func id(p string) string { return p + "_" + random(9) }
func contains(items []string, value string) bool {
	for _, v := range items {
		if v == value {
			return true
		}
	}
	return false
}
func defaultValue(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
