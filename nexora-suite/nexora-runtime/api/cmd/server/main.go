package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nexora-suite/nexora-runtime/adapters"
	"github.com/nexora-suite/nexora-runtime/adapters/registry"
)

type claims struct {
	Sub      string   `json:"sub"`
	Email    string   `json:"email"`
	TenantID string   `json:"tenant_id"`
	Roles    []string `json:"roles"`
	Products []string `json:"products"`
	Exp      int64    `json:"exp"`
}

type runtimeProfile struct {
	ID                string    `json:"id"`
	TenantID          string    `json:"tenant_id"`
	Name              string    `json:"name"`
	AdapterID         string    `json:"adapter_id"`
	Endpoint          string    `json:"endpoint"`
	DeploymentMode    string    `json:"deployment_mode"`
	CredentialRef     string    `json:"credential_ref,omitempty"`
	PermissionProfile string    `json:"permission_profile"`
	Status            string    `json:"status"`
	PackageID         string    `json:"package_id,omitempty"`
	DesiredVersion    string    `json:"desired_version,omitempty"`
	CurrentVersion    string    `json:"current_version,omitempty"`
	DeploymentStatus  string    `json:"deployment_status,omitempty"`
	PreviousVersion   string    `json:"previous_version,omitempty"`
	LastDeploymentAt  time.Time `json:"last_deployment_at,omitempty"`
	LastHeartbeatAt   time.Time `json:"last_heartbeat_at,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type releaseSource struct {
	Type       string `json:"type"`
	Repository string `json:"repository"`
	Product    string `json:"product"`
}

type runtimePackage struct {
	ID                string           `json:"id"`
	DisplayName       string           `json:"display_name"`
	Description       string           `json:"description"`
	Category          string           `json:"category"`
	Protocol          string           `json:"protocol"`
	Integration       string           `json:"integration"`
	DeploymentDrivers []string         `json:"deployment_drivers"`
	Capabilities      []string         `json:"capabilities"`
	PinnedVersions    []packageVersion `json:"pinned_versions,omitempty"`
	ReleaseSource     releaseSource    `json:"release_source"`
	ConfigSchema      map[string]any   `json:"config_schema"`
}

type packageVersion struct {
	Version     string    `json:"version"`
	Channel     string    `json:"channel"`
	PublishedAt time.Time `json:"published_at"`
	Commit      string    `json:"commit,omitempty"`
	Image       string    `json:"image,omitempty"`
	Digest      string    `json:"digest,omitempty"`
	Installed   bool      `json:"installed"`
	Verified    bool      `json:"verified"`
}

type deploymentRecord struct {
	ID              string    `json:"id"`
	ProfileID       string    `json:"profile_id"`
	PackageID       string    `json:"package_id"`
	Version         string    `json:"version"`
	PreviousVersion string    `json:"previous_version,omitempty"`
	Status          string    `json:"status"`
	Stage           string    `json:"stage"`
	Message         string    `json:"message,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type task struct {
	ID                string      `json:"id"`
	TenantID          string      `json:"tenant_id"`
	AgentID           string      `json:"agent_id"`
	ProfileID         string      `json:"profile_id"`
	Status            string      `json:"status"`
	Input             string      `json:"input"`
	ModelRoute        string      `json:"model_route"`
	TraceID           string      `json:"trace_id"`
	StartedAt         time.Time   `json:"started_at"`
	FinishedAt        time.Time   `json:"finished_at,omitempty"`
	LatencyMS         int64       `json:"latency_ms,omitempty"`
	Error             string      `json:"error,omitempty"`
	PermissionProfile string      `json:"permission_profile,omitempty"`
	EngineVersion     string      `json:"engine_version,omitempty"`
	Events            []taskEvent `json:"events,omitempty"`
}

type persistedState struct {
	Profiles    map[string]runtimeProfile   `json:"profiles"`
	Tasks       []task                      `json:"tasks"`
	Deployments map[string]deploymentRecord `json:"deployments,omitempty"`
}

type app struct {
	mu          sync.RWMutex
	secret      []byte
	dataFile    string
	workerURL   string
	client      *http.Client
	adapters    *registry.Registry
	profiles    map[string]runtimeProfile
	tasks       []task
	packages    map[string]runtimePackage
	deployments map[string]deploymentRecord
	engineRoot  string
	activeTasks map[string]context.CancelFunc
}

func main() {
	a := newApp(
		env("NEXORA_JWT_SECRET", "nexora-development-secret-change-me"),
		env("NEXORA_DATA_FILE", ""),
		env("NATIVE_WORKER_URL", "http://127.0.0.1:8094"),
	)
	mux := http.NewServeMux()
	a.routes(mux)
	addr := env("ADDR", ":8084")
	log.Printf("Nexora Runtime API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

func newApp(secret, dataFile, workerURL string) *app {
	a := &app{
		secret:      []byte(secret),
		dataFile:    dataFile,
		workerURL:   strings.TrimRight(workerURL, "/"),
		client:      &http.Client{Timeout: 120 * time.Second},
		profiles:    map[string]runtimeProfile{},
		tasks:       []task{},
		adapters:    registry.New(),
		packages:    map[string]runtimePackage{},
		deployments: map[string]deploymentRecord{},
		engineRoot:  env("NEXORA_ENGINE_ROOT", ""),
		activeTasks: map[string]context.CancelFunc{},
	}
	a.loadPackages(env("NEXORA_RUNTIME_PACKAGES", "packages"))
	if err := a.load(); err != nil {
		log.Printf("load runtime state: %v", err)
	}
	for i := range a.tasks {
		if a.tasks[i].Status == "running" {
			a.tasks[i].Status = "interrupted"
			a.tasks[i].Error = "Runtime control plane restarted; retry explicitly"
			a.tasks[i].FinishedAt = time.Now().UTC()
		}
	}
	for key, record := range a.deployments {
		if record.Status == "running" {
			record.Status, record.Stage, record.Message = "interrupted", "interrupted", "Deployment interrupted; inspect target before retrying"
			a.deployments[key] = record
		}
	}
	a.persistLocked()
	return a
}

func (a *app) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /api/v1/adapters", a.auth(a.listAdapters))
	mux.HandleFunc("GET /api/v1/runtime-packages", a.auth(a.listPackages))
	mux.HandleFunc("GET /api/v1/runtime-packages/{id}/versions", a.auth(a.listPackageVersions))
	mux.HandleFunc("GET /api/v1/runtime-profiles", a.auth(a.listProfiles))
	mux.HandleFunc("POST /api/v1/runtime-profiles", a.auth(a.createProfile))
	mux.HandleFunc("PATCH /api/v1/runtime-profiles/{id}", a.auth(a.updateProfile))
	mux.HandleFunc("POST /api/v1/runtime-profiles/{id}/heartbeat", a.auth(a.heartbeat))
	mux.HandleFunc("POST /api/v1/runtime-profiles/{id}/test", a.auth(a.testProfile))
	mux.HandleFunc("POST /api/v1/runtime-profiles/{id}/deploy", a.auth(a.deployProfile))
	mux.HandleFunc("GET /api/v1/runtime-profiles/{id}/deployment", a.auth(a.getDeployment))
	mux.HandleFunc("POST /api/v1/runtime-profiles/{id}/rollback", a.auth(a.rollbackProfile))
	mux.HandleFunc("GET /api/v1/tasks", a.auth(a.listTasks))
	mux.HandleFunc("POST /api/v1/tasks/stream", a.auth(a.streamTask))
	mux.HandleFunc("GET /api/v1/tasks/{id}", a.auth(a.getTask))
	mux.HandleFunc("POST /api/v1/tasks/{id}/cancel", a.auth(a.cancelTask))
	mux.HandleFunc("GET /api/v1/deployments", a.auth(a.listDeployments))
	mux.HandleFunc("GET /api/v1/runtime-profiles/{id}", a.auth(a.getProfile))
}

func (a *app) listAdapters(w http.ResponseWriter, _ *http.Request, _ claims) {
	items := a.adapters.Descriptors()
	write(w, 200, map[string]any{"items": items, "total": len(items), "protocol_version": adapters.ProtocolVersion})
}

func (a *app) loadPackages(directory string) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		log.Printf("load runtime packages from %s: %v", directory, err)
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		raw, readErr := os.ReadFile(filepath.Join(directory, entry.Name()))
		if readErr != nil {
			log.Printf("read runtime package %s: %v", entry.Name(), readErr)
			continue
		}
		var item runtimePackage
		if json.Unmarshal(raw, &item) != nil || item.ID == "" || item.Protocol == "" {
			log.Printf("ignore invalid runtime package %s", entry.Name())
			continue
		}
		a.packages[item.ID] = item
		if item.Protocol == adapters.ProtocolVersion && item.Integration == "protocol_bridge" {
			a.adapters.Register(adapters.ProtocolBridge{Info: adapters.Descriptor{
				ID: item.ID, Name: item.DisplayName, Protocol: item.Protocol,
				Capabilities: item.Capabilities, DeploymentModes: []string{"private_server"},
				Integration: "protocol_bridge", Status: "unverified",
			}})
		}
	}
}

func (a *app) listPackages(w http.ResponseWriter, _ *http.Request, _ claims) {
	items := make([]runtimePackage, 0, len(a.packages))
	for _, item := range a.packages {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].DisplayName < items[j].DisplayName })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) listPackageVersions(w http.ResponseWriter, r *http.Request, _ claims) {
	item, ok := a.packages[r.PathValue("id")]
	if !ok {
		fail(w, 404, "package_not_found", "runtime package not found")
		return
	}
	if item.ReleaseSource.Type != "github_stencil" {
		write(w, 200, map[string]any{"items": []packageVersion{}, "total": 0})
		return
	}
	discoveryContext, cancel := context.WithTimeout(r.Context(), 2500*time.Millisecond)
	defer cancel()
	versions, err := a.discoverVersions(discoveryContext, item)
	source := "upstream"
	if err != nil {
		versions = append([]packageVersion(nil), item.PinnedVersions...)
		source = "bundled_catalog"
	}
	for index := range versions {
		versions[index].Installed = a.versionInstalled(item.ID, versions[index].Version)
	}
	write(w, 200, map[string]any{"items": versions, "total": len(versions), "source": source, "deployment_enabled": false, "reason": "Verified image deployment driver is not configured"})
}

func (a *app) discoverVersions(ctx context.Context, item runtimePackage) ([]packageVersion, error) {
	url := "https://api.github.com/repos/" + item.ReleaseSource.Repository + "/releases?per_page=12"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Nexora-Runtime/1.0")
	res, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return nil, fmt.Errorf("release catalog returned HTTP %d", res.StatusCode)
	}
	var releases []struct {
		TagName     string    `json:"tag_name"`
		PublishedAt time.Time `json:"published_at"`
		Prerelease  bool      `json:"prerelease"`
		Draft       bool      `json:"draft"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&releases); err != nil {
		return nil, err
	}
	items := make([]packageVersion, 0, len(releases))
	for _, release := range releases {
		if release.Draft {
			continue
		}
		version := strings.TrimPrefix(release.TagName, "v")
		channel := "stable"
		if release.Prerelease {
			channel = "preview"
		}
		items = append(items, packageVersion{
			Version: version, Channel: channel, PublishedAt: release.PublishedAt,
			Installed: a.versionInstalled(item.ID, version),
		})
	}
	return items, nil
}

func (a *app) versionInstalled(packageID, version string) bool {
	if a.engineRoot == "" {
		return false
	}
	_, err := os.Stat(filepath.Join(a.engineRoot, packageID, version, "engine"))
	return err == nil
}

func (a *app) listProfiles(w http.ResponseWriter, r *http.Request, c claims) {
	a.ensureNative(c.TenantID)
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	a.mu.RLock()
	items := make([]runtimeProfile, 0)
	for _, item := range a.profiles {
		if item.TenantID == c.TenantID && (query == "" || strings.Contains(strings.ToLower(item.Name+" "+item.AdapterID), query)) {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) ensureNative(tenantID string) {
	key := "nexora-native:" + tenantID
	a.mu.Lock()
	defer a.mu.Unlock()
	if existing, exists := a.profiles[key]; exists {
		changed := false
		if existing.PackageID == "" {
			existing.PackageID = "native-agentloop"
			changed = true
		}
		if existing.Name == "Nexora Native Runtime" {
			existing.Name = "Native AgentLoop"
			changed = true
		}
		if existing.CurrentVersion == "" {
			existing.CurrentVersion = env("NATIVE_ENGINE_VERSION", "18.12.6")
			existing.DesiredVersion = existing.CurrentVersion
			existing.DeploymentStatus = "ready"
			changed = true
		}
		if changed {
			existing.UpdatedAt = time.Now().UTC()
			a.profiles[key] = existing
			a.persistLocked()
		}
		return
	}
	now := time.Now().UTC()
	version := env("NATIVE_ENGINE_VERSION", "18.12.6")
	a.profiles[key] = runtimeProfile{ID: "nexora-native", TenantID: tenantID, Name: "Native AgentLoop", AdapterID: "native", Endpoint: a.workerURL, DeploymentMode: "managed", PermissionProfile: "tools_only", Status: "unverified", PackageID: "native-agentloop", CurrentVersion: version, DesiredVersion: version, DeploymentStatus: "unverified", CreatedAt: now, UpdatedAt: now}
	a.persistLocked()
}

func (a *app) createProfile(w http.ResponseWriter, r *http.Request, c claims) {
	var in runtimeProfile
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	selectedAdapter, adapterOK := a.adapters.Get(in.AdapterID)
	if in.Name == "" || !adapterOK {
		fail(w, 422, "invalid_profile", "name and a supported adapter_id are required")
		return
	}
	if err := selectedAdapter.Validate(adapters.Profile{Endpoint: in.Endpoint, CredentialRef: in.CredentialRef}); err != nil {
		fail(w, 422, "invalid_profile", err.Error())
		return
	}
	now := time.Now().UTC()
	in.ID = id("rtp")
	in.TenantID = c.TenantID
	// Lifecycle and deployment facts are server-owned, never client assertions.
	in.PackageID, in.CurrentVersion, in.DesiredVersion, in.PreviousVersion = "", "", "", ""
	in.DeploymentStatus = ""
	in.LastDeploymentAt, in.LastHeartbeatAt = time.Time{}, time.Time{}
	in.Status = "pending"
	if in.PermissionProfile == "" {
		in.PermissionProfile = "tools_only"
	}
	if in.PermissionProfile != "tools_only" && in.PermissionProfile != "workspace_read" {
		fail(w, 422, "unsupported_permission", "Only read-only permissions are currently supported")
		return
	}
	in.CreatedAt, in.UpdatedAt = now, now
	a.mu.Lock()
	a.profiles[in.ID] = in
	a.persistLocked()
	a.mu.Unlock()
	write(w, 201, in)
}

func (a *app) updateProfile(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	storageKey, current, ok := a.profileEntryByID(r.PathValue("id"), c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	var in runtimeProfile
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		current.Name = strings.TrimSpace(in.Name)
	}
	if in.AdapterID != "" {
		if _, ok := a.adapters.Get(in.AdapterID); !ok {
			fail(w, 422, "invalid_adapter", "adapter_id is not supported")
			return
		}
		current.AdapterID = in.AdapterID
	}
	if in.Endpoint != "" {
		current.Endpoint = strings.TrimRight(strings.TrimSpace(in.Endpoint), "/")
	}
	if in.DeploymentMode != "" {
		current.DeploymentMode = in.DeploymentMode
	}
	if in.PermissionProfile != "" {
		if in.PermissionProfile != "tools_only" && in.PermissionProfile != "workspace_read" {
			fail(w, 422, "unsupported_permission", "Only read-only permissions are currently supported")
			return
		}
		current.PermissionProfile = in.PermissionProfile
	}
	selectedAdapter, _ := a.adapters.Get(current.AdapterID)
	if err := selectedAdapter.Validate(adapters.Profile{Endpoint: current.Endpoint, CredentialRef: current.CredentialRef}); err != nil {
		fail(w, 422, "invalid_profile", err.Error())
		return
	}
	current.UpdatedAt = time.Now().UTC()
	a.mu.Lock()
	a.profiles[storageKey] = current
	a.persistLocked()
	a.mu.Unlock()
	write(w, 200, current)
}

func (a *app) heartbeat(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	storageKey, item, ok := a.profileEntryByID(r.PathValue("id"), c.TenantID)
	if !ok {
		a.mu.Unlock()
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	item.Status = "healthy"
	item.LastHeartbeatAt = time.Now().UTC()
	item.UpdatedAt = item.LastHeartbeatAt
	a.profiles[storageKey] = item
	a.persistLocked()
	a.mu.Unlock()
	write(w, 200, item)
}

func (a *app) testProfile(w http.ResponseWriter, r *http.Request, c claims) {
	a.ensureNative(c.TenantID)
	a.mu.RLock()
	item, ok := a.profileByID(r.PathValue("id"), c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	selectedAdapter, ok := a.adapters.Get(item.AdapterID)
	if !ok {
		fail(w, 422, "adapter_unavailable", "runtime adapter is not installed")
		return
	}
	start := time.Now()
	req, err := selectedAdapter.HealthRequest(r.Context(), adapters.Profile{Endpoint: item.Endpoint, CredentialRef: item.CredentialRef})
	if err != nil {
		fail(w, 422, "invalid_profile", err.Error())
		return
	}
	res, err := a.client.Do(req)
	if err != nil || res.StatusCode >= 300 {
		message := "runtime is unreachable"
		if err != nil {
			message = err.Error()
		}
		fail(w, 502, "runtime_unavailable", message)
		return
	}
	defer res.Body.Close()
	var result struct {
		Status   string `json:"status"`
		Protocol string `json:"protocol_version"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&result) != nil || result.Status != "ok" || result.Protocol != adapters.ProtocolVersion {
		fail(w, 502, "runtime_health_invalid", "Runtime health must report status ok and nexora-runtime-v1")
		return
	}
	a.mu.Lock()
	storageKey, current, exists := a.profileEntryByID(item.ID, c.TenantID)
	if exists {
		current.Status = "healthy"
		current.LastHeartbeatAt = time.Now().UTC()
		a.profiles[storageKey] = current
		a.persistLocked()
	}
	a.mu.Unlock()
	write(w, 200, map[string]any{"ok": true, "latency_ms": time.Since(start).Milliseconds(), "protocol_version": "nexora-runtime-v1"})
}

func (a *app) listTasks(w http.ResponseWriter, r *http.Request, c claims) {
	limit := 50
	if value, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && value > 0 && value <= 200 {
		limit = value
	}
	a.mu.RLock()
	items := make([]task, 0, limit)
	for i := len(a.tasks) - 1; i >= 0 && len(items) < limit; i-- {
		if a.tasks[i].TenantID == c.TenantID {
			item := a.tasks[i]
			item.Events = nil // event payloads belong to the detail API, not lists
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) streamTask(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		ProtocolVersion   string           `json:"protocol_version"`
		TaskID            string           `json:"task_id"`
		AgentID           string           `json:"agent_id"`
		RuntimeID         string           `json:"runtime_id"`
		Input             string           `json:"input"`
		Messages          []map[string]any `json:"messages"`
		ModelRoute        string           `json:"model_route"`
		SystemPrompt      string           `json:"system_prompt"`
		Resources         map[string]any   `json:"resources"`
		Limits            map[string]int   `json:"limits"`
		PermissionProfile string           `json:"permission_profile"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Input) == "" {
		fail(w, 422, "input_required", "input is required")
		return
	}
	a.ensureNative(c.TenantID)
	a.mu.RLock()
	profile, ok := a.profileByID(in.RuntimeID, c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 422, "runtime_profile_not_found", "select an available Runtime profile")
		return
	}
	if in.PermissionProfile == "" {
		in.PermissionProfile = profile.PermissionProfile
	}
	if in.PermissionProfile != "tools_only" && in.PermissionProfile != "workspace_read" {
		fail(w, 403, "approval_required", "Write and device operations are disabled until isolated execution and approval are configured")
		return
	}
	if !validEndpoint(profile.Endpoint) {
		fail(w, 422, "runtime_endpoint_required", "runtime profile has no valid endpoint")
		return
	}
	if profile.AdapterID != "native" {
		fail(w, 503, "runtime_service_identity_required", "External execution requires a scoped service credential; Core user bearer tokens are never forwarded to external runtimes")
		return
	}
	if in.TaskID == "" {
		in.TaskID = id("task")
	}
	traceID := id("trc")
	started := time.Now().UTC()
	record := task{ID: in.TaskID, TenantID: c.TenantID, AgentID: in.AgentID, ProfileID: profile.ID, Status: "running", Input: in.Input, ModelRoute: in.ModelRoute, TraceID: traceID, StartedAt: started, PermissionProfile: in.PermissionProfile, EngineVersion: profile.CurrentVersion}

	timeout := in.Limits["timeout_seconds"]
	if timeout < 10 || timeout > 3600 {
		timeout = 300
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	key := c.TenantID + ":" + in.TaskID
	a.mu.Lock()
	for _, previous := range a.tasks {
		if previous.ID == in.TaskID && previous.TenantID == c.TenantID {
			a.mu.Unlock()
			fail(w, 409, "task_exists", "Task ID already exists; use a new task ID for retries")
			return
		}
	}
	a.tasks = append(a.tasks, record)
	a.activeTasks[key] = cancel
	a.persistLocked()
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.activeTasks, key)
		a.mu.Unlock()
	}()
	selectedAdapter, ok := a.adapters.Get(profile.AdapterID)
	if !ok {
		a.finishTask(c.TenantID, in.TaskID, "failed", "runtime adapter is not installed")
		fail(w, 422, "adapter_unavailable", "runtime adapter is not installed")
		return
	}
	req, err := selectedAdapter.TaskRequest(ctx, adapters.Profile{
		Endpoint: profile.Endpoint, CredentialRef: profile.CredentialRef,
	}, adapters.Task{
		TaskID: in.TaskID, TenantID: c.TenantID, AgentID: in.AgentID, Input: in.Input,
		Messages: in.Messages, ModelRoute: in.ModelRoute, SystemPrompt: in.SystemPrompt,
		Resources: in.Resources, Limits: in.Limits, PermissionProfile: in.PermissionProfile,
	})
	if err != nil {
		a.finishTask(c.TenantID, in.TaskID, "failed", err.Error())
		fail(w, 502, "runtime_unavailable", err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", r.Header.Get("Authorization"))
	req.Header.Set("X-Nexora-Trace-ID", traceID)
	res, err := a.client.Do(req)
	if err != nil {
		a.finishTask(c.TenantID, in.TaskID, "failed", err.Error())
		fail(w, 502, "runtime_unavailable", err.Error())
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		message := fmt.Sprintf("runtime returned HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
		a.finishTask(c.TenantID, in.TaskID, "failed", message)
		fail(w, 502, "runtime_rejected", message)
		return
	}
	if !strings.Contains(res.Header.Get("Content-Type"), "text/event-stream") {
		a.finishTask(c.TenantID, in.TaskID, "failed", "runtime must return text/event-stream")
		fail(w, 502, "runtime_protocol_error", "runtime must return text/event-stream")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Nexora-Task-ID", in.TaskID)
	w.Header().Set("X-Nexora-Trace-ID", traceID)
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	reader := bufio.NewReader(res.Body)
	completed := false
	failed := false
	eventName := ""
	for {
		line, readErr := reader.ReadBytes('\n')
		if len(line) > 0 {
			if bytes.HasPrefix(line, []byte("event:")) {
				eventName = strings.TrimSpace(strings.TrimPrefix(string(line), "event:"))
			}
			if bytes.HasPrefix(line, []byte("data:")) {
				payload := strings.TrimSpace(strings.TrimPrefix(string(line), "data:"))
				a.recordTaskEvent(c.TenantID, in.TaskID, eventName, payload)
				if eventName == "done" && json.Valid([]byte(payload)) {
					completed = true
				}
			}
			if eventName == "error" {
				failed = true
			}
			_, _ = w.Write(line)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				a.finishTask(c.TenantID, in.TaskID, "failed", readErr.Error())
			}
			break
		}
	}
	if failed {
		a.finishTask(c.TenantID, in.TaskID, "failed", "Runtime returned an error; inspect task events")
	} else if completed {
		a.finishTask(c.TenantID, in.TaskID, "completed", "")
	} else {
		a.finishTask(c.TenantID, in.TaskID, "failed", "runtime stream ended before task completion")
	}
}

func (a *app) profileByID(profileID, tenantID string) (runtimeProfile, bool) {
	_, item, ok := a.profileEntryByID(profileID, tenantID)
	return item, ok
}

// profileEntryByID also returns the internal storage key. The built-in profile
// is keyed by tenant even though its public ID is always "nexora-native".
func (a *app) profileEntryByID(profileID, tenantID string) (string, runtimeProfile, bool) {
	if profileID == "" {
		profileID = "nexora-native"
	}
	if item, ok := a.profiles[profileID]; ok && item.TenantID == tenantID {
		return profileID, item, true
	}
	for key, item := range a.profiles {
		if item.ID == profileID && item.TenantID == tenantID {
			return key, item, true
		}
	}
	return "", runtimeProfile{}, false
}

func (a *app) appendTask(item task) {
	a.mu.Lock()
	a.tasks = append(a.tasks, item)
	if len(a.tasks) > 2000 {
		a.tasks = a.tasks[len(a.tasks)-2000:]
	}
	a.persistLocked()
	a.mu.Unlock()
}

func (a *app) finishTask(tenantID, taskID, status, message string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for index := len(a.tasks) - 1; index >= 0; index-- {
		if a.tasks[index].ID == taskID && a.tasks[index].TenantID == tenantID {
			if a.tasks[index].Status == "cancelled" {
				return
			}
			a.tasks[index].Status = status
			a.tasks[index].FinishedAt = time.Now().UTC()
			a.tasks[index].LatencyMS = time.Since(a.tasks[index].StartedAt).Milliseconds()
			a.tasks[index].Error = message
			break
		}
	}
	a.persistLocked()
}

func (a *app) load() error {
	if a.dataFile == "" {
		return nil
	}
	raw, err := os.ReadFile(a.dataFile)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var state persistedState
	if err := json.Unmarshal(raw, &state); err != nil {
		return err
	}
	if state.Profiles != nil {
		a.profiles = state.Profiles
	}
	a.tasks = state.Tasks
	if state.Deployments != nil {
		a.deployments = state.Deployments
	}
	return nil
}

func (a *app) persistLocked() {
	if a.dataFile == "" {
		return
	}
	raw, err := json.MarshalIndent(persistedState{Profiles: a.profiles, Tasks: a.tasks, Deployments: a.deployments}, "", "  ")
	if err != nil {
		log.Printf("persist runtime state: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.dataFile), 0o700); err != nil {
		log.Printf("persist runtime state: %v", err)
		return
	}
	temp := a.dataFile + ".tmp"
	if err := os.WriteFile(temp, raw, 0o600); err != nil {
		log.Printf("persist runtime state: %v", err)
		return
	}
	if err := os.Rename(temp, a.dataFile); err != nil {
		log.Printf("persist runtime state: %v", err)
	}
}

func (a *app) auth(next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.secret)
		if err != nil {
			fail(w, 401, "unauthorized", "valid Core bearer token required")
			return
		}
		if !contains(c.Products, "runtime") {
			fail(w, 403, "product_not_entitled", "Nexora Runtime is not enabled for this tenant")
			return
		}
		next(w, r, c)
	}
}

func verify(token string, secret []byte) (claims, error) {
	var c claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return c, fmt.Errorf("malformed token")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return c, fmt.Errorf("invalid token")
	}
	raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
	if json.Unmarshal(raw, &c) != nil || c.Exp <= time.Now().Unix() || c.TenantID == "" {
		return c, fmt.Errorf("expired token")
	}
	return c, nil
}

func validEndpoint(value string) bool {
	return strings.HasPrefix(strings.TrimSpace(value), "http://") || strings.HasPrefix(strings.TrimSpace(value), "https://")
}

func id(prefix string) string {
	raw := make([]byte, 8)
	_, _ = rand.Read(raw)
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(target); err != nil {
		fail(w, 400, "invalid_json", err.Error())
		return false
	}
	return true
}

func health(w http.ResponseWriter, _ *http.Request) {
	write(w, 200, map[string]any{"service": "nexora-runtime", "status": "ok", "protocol_version": "nexora-runtime-v1"})
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
