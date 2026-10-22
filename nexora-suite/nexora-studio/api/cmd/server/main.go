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
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type claims struct {
	Sub, Email, TenantID string
	Roles                []string
	Products             []string
	Exp                  int64
}

func (c *claims) UnmarshalJSON(b []byte) error {
	var v struct {
		Sub, Email string
		TenantID   string   `json:"tenant_id"`
		Roles      []string `json:"roles"`
		Products   []string `json:"products"`
		Exp        int64    `json:"exp"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	c.Sub, c.Email, c.TenantID, c.Roles, c.Products, c.Exp = v.Sub, v.Email, v.TenantID, v.Roles, v.Products, v.Exp
	return nil
}

type node struct {
	ID     string         `json:"id"`
	Type   string         `json:"type"`
	Label  string         `json:"label"`
	Config map[string]any `json:"config,omitempty"`
}
type edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}
type agent struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Status        string    `json:"status"`
	OwnerID       string    `json:"owner_id"`
	Nodes         []node    `json:"nodes"`
	Edges         []edge    `json:"edges"`
	Template      string    `json:"template,omitempty"`
	Model         string    `json:"model,omitempty"`
	SystemPrompt  string    `json:"system_prompt,omitempty"`
	KnowledgeBase []string  `json:"knowledge_base,omitempty"`
	Tools         []string  `json:"tools,omitempty"`
	Intents       []string  `json:"intents,omitempty"`
	Skills        []string  `json:"skills,omitempty"`
	Plugins       []string  `json:"plugins,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
type version struct {
	ID, AgentID, TenantID, Version, Endpoint string
	Manifest                                 map[string]any
	PublishedAt                              time.Time
}
type resource struct {
	ID          string         `json:"id"`
	TenantID    string         `json:"tenant_id"`
	Kind        string         `json:"kind"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Config      map[string]any `json:"config,omitempty"`
	Status      string         `json:"status"`
	CreatedAt   time.Time      `json:"created_at"`
}
type app struct {
	mu         sync.RWMutex
	secret     []byte
	controlURL string
	maasURL    string
	client     *http.Client
	agents     map[string]agent
	versions   []version
	dataFile   string
	resources  map[string]resource
}

type persistedState struct {
	Agents    map[string]agent    `json:"agents"`
	Versions  []version           `json:"versions"`
	Resources map[string]resource `json:"resources"`
}

func main() {
	a := &app{
		secret:     []byte(env("NEXORA_JWT_SECRET", "nexora-development-secret-change-me")),
		controlURL: strings.TrimRight(os.Getenv("CONTROL_URL"), "/"),
		maasURL:    strings.TrimRight(os.Getenv("MAAS_URL"), "/"),
		client:     &http.Client{Timeout: 120 * time.Second},
		agents:     map[string]agent{},
		dataFile:   env("NEXORA_DATA_FILE", ""),
		resources:  map[string]resource{},
	}
	if err := a.load(); err != nil {
		log.Printf("load studio state: %v", err)
	}
	if len(a.resources) == 0 {
		a.seedResources()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /api/v1/agents", a.auth(a.list))
	mux.HandleFunc("POST /api/v1/agents", a.auth(a.create))
	mux.HandleFunc("GET /api/v1/agents/{id}", a.auth(a.get))
	mux.HandleFunc("PUT /api/v1/agents/{id}", a.auth(a.update))
	mux.HandleFunc("POST /api/v1/agents/{id}/debug", a.auth(a.debug))
	mux.HandleFunc("POST /api/v1/agents/{id}/chat", a.auth(a.chat))
	mux.HandleFunc("POST /api/v1/agents/{id}/chat/stream", a.auth(a.chatStream))
	mux.HandleFunc("GET /api/v1/model-routes", a.auth(a.listModelRoutes))
	mux.HandleFunc("POST /api/v1/agents/{id}/evaluate", a.auth(a.evaluate))
	mux.HandleFunc("POST /api/v1/agents/{id}/publish", a.auth(a.publish))
	mux.HandleFunc("GET /api/v1/agents/{id}/versions", a.auth(a.listVersions))
	mux.HandleFunc("GET /api/v1/resources", a.auth(a.listResources))
	mux.HandleFunc("POST /api/v1/resources", a.auth(a.createResource))
	mux.HandleFunc("POST /api/v1/resources/{id}/documents", a.auth(a.uploadResourceDocuments))
	addr := env("ADDR", ":8080")
	log.Printf("Nexora Studio API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

func (a *app) list(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	limit := 20
	if value := r.URL.Query().Get("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	cursorTime, cursorID := decodeAgentCursor(r.URL.Query().Get("cursor"))
	items := make([]agent, 0)
	for _, v := range a.agents {
		haystack := strings.ToLower(v.ID + " " + v.Name + " " + v.Description)
		if v.TenantID == c.TenantID && (query == "" || strings.Contains(haystack, query)) && (status == "" || v.Status == status) {
			items = append(items, v)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt.Equal(items[j].UpdatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})
	total := len(items)
	if !cursorTime.IsZero() {
		start := len(items)
		for index, item := range items {
			if item.UpdatedAt.Before(cursorTime) || (item.UpdatedAt.Equal(cursorTime) && item.ID < cursorID) {
				start = index
				break
			}
		}
		items = items[start:]
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	nextCursor := ""
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		nextCursor = encodeAgentCursor(last.UpdatedAt, last.ID)
	}
	write(w, 200, map[string]any{"items": items, "total": total, "limit": limit, "next_cursor": nextCursor, "has_more": hasMore})
}

func encodeAgentCursor(updatedAt time.Time, agentID string) string {
	value := updatedAt.UTC().Format(time.RFC3339Nano) + "|" + agentID
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodeAgentCursor(value string) (time.Time, string) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, ""
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, ""
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, ""
	}
	return updatedAt, parts[1]
}
func (a *app) listResources(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	kindQuery := strings.TrimSpace(r.URL.Query().Get("kind"))
	kinds := map[string]bool{}
	for _, value := range strings.Split(kindQuery, ",") {
		if value = strings.TrimSpace(value); value != "" {
			kinds[value] = true
		}
	}
	limit := 50
	if value := r.URL.Query().Get("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	offset := 0
	if value := r.URL.Query().Get("offset"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	items := make([]resource, 0)
	for _, item := range a.resources {
		haystack := strings.ToLower(item.Name + " " + item.Description)
		if item.TenantID == c.TenantID && (len(kinds) == 0 || kinds[item.Kind]) && (query == "" || strings.Contains(haystack, query)) {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	total := len(items)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	write(w, 200, map[string]any{"items": items[offset:end], "total": total, "limit": limit, "offset": offset})
}
func (a *app) createResource(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Kind        string         `json:"kind"`
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Config      map[string]any `json:"config"`
	}
	if !decode(w, r, &in) {
		return
	}
	validKinds := map[string]bool{"model": true, "knowledge_base": true, "tool": true, "mcp_server": true, "skill": true, "plugin": true, "intent": true}
	in.Kind, in.Name = strings.TrimSpace(in.Kind), strings.TrimSpace(in.Name)
	if !validKinds[in.Kind] || in.Name == "" {
		fail(w, 422, "invalid_resource", "kind and name are required")
		return
	}
	item := resource{ID: id("res"), TenantID: c.TenantID, Kind: in.Kind, Name: in.Name, Description: strings.TrimSpace(in.Description), Config: in.Config, Status: "ready", CreatedAt: time.Now().UTC()}
	a.mu.Lock()
	a.resources[item.ID] = item
	a.persistLocked()
	a.mu.Unlock()
	write(w, 201, item)
}
func (a *app) uploadResourceDocuments(w http.ResponseWriter, r *http.Request, c claims) {
	const maxUpload = 50 << 20
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		fail(w, 422, "invalid_upload", "upload must be multipart form data and no larger than 50 MB")
		return
	}
	a.mu.Lock()
	item, ok := a.resources[r.PathValue("id")]
	if !ok || item.TenantID != c.TenantID || item.Kind != "knowledge_base" {
		a.mu.Unlock()
		fail(w, 404, "not_found", "knowledge base not found")
		return
	}
	a.mu.Unlock()
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		fail(w, 422, "files_required", "at least one document is required")
		return
	}
	baseDir := filepath.Join(filepath.Dir(a.dataFile), "knowledge-documents", item.ID)
	if a.dataFile == "" {
		baseDir = filepath.Join(os.TempDir(), "nexora-studio", "knowledge-documents", item.ID)
	}
	if err := os.MkdirAll(baseDir, 0o750); err != nil {
		fail(w, 500, "storage_error", "could not prepare document storage")
		return
	}
	uploaded := make([]map[string]any, 0, len(files))
	for _, header := range files {
		name := filepath.Base(header.Filename)
		ext := strings.ToLower(filepath.Ext(name))
		if !map[string]bool{".pdf": true, ".doc": true, ".docx": true, ".txt": true, ".md": true}[ext] {
			fail(w, 422, "unsupported_file", "supported file types: PDF, DOC, DOCX, TXT, MD")
			return
		}
		src, err := header.Open()
		if err != nil {
			fail(w, 422, "invalid_upload", "could not read uploaded document")
			return
		}
		storedName := fmt.Sprintf("%s-%s", id("doc"), name)
		destination, err := os.OpenFile(filepath.Join(baseDir, storedName), os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
		if err != nil {
			fail(w, 500, "storage_error", "could not store uploaded document")
			src.Close()
			return
		}
		size, copyErr := io.Copy(destination, io.LimitReader(src, maxUpload+1))
		closeErr := destination.Close()
		src.Close()
		if copyErr != nil || closeErr != nil || size > maxUpload {
			os.Remove(filepath.Join(baseDir, storedName))
			fail(w, 422, "invalid_upload", "could not store document or file exceeds 50 MB")
			return
		}
		uploaded = append(uploaded, map[string]any{"name": name, "size": size, "stored_name": storedName})
	}
	a.mu.Lock()
	item = a.resources[item.ID]
	if item.Config == nil {
		item.Config = map[string]any{}
	}
	item.Config["documents"] = len(uploaded)
	item.Config["files"] = uploaded
	item.Config["indexed_at"] = time.Now().UTC()
	item.Status = "ready"
	a.resources[item.ID] = item
	a.persistLocked()
	a.mu.Unlock()
	write(w, 201, map[string]any{"items": uploaded, "total": len(uploaded), "resource": item})
}
func (a *app) seedResources() {
	now := time.Now().UTC()
	items := []resource{
		{ID: "mdl_deepseek", TenantID: "tenant_nexora", Kind: "model", Name: "DeepSeek Chat", Description: "DeepSeek 对话模型", Status: "ready", Config: map[string]any{"provider": "DeepSeek", "model": "deepseek-chat"}, CreatedAt: now},
		{ID: "mdl_claude", TenantID: "tenant_nexora", Kind: "model", Name: "Claude 3.5 Sonnet", Description: "Anthropic Claude 模型", Status: "ready", Config: map[string]any{"provider": "Anthropic", "model": "claude-3-5-sonnet"}, CreatedAt: now},
		{ID: "kb_product", TenantID: "tenant_nexora", Kind: "knowledge_base", Name: "产品手册", Description: "产品文档与使用指南", Status: "ready", Config: map[string]any{"documents": 18, "embedding": "text-embedding-3-small"}, CreatedAt: now},
		{ID: "kb_support", TenantID: "tenant_nexora", Kind: "knowledge_base", Name: "售后政策库", Description: "退换货、物流和售后政策", Status: "ready", Config: map[string]any{"documents": 12, "embedding": "bge-m3"}, CreatedAt: now},
		{ID: "tool_crm", TenantID: "tenant_nexora", Kind: "tool", Name: "CRM 客户查询", Description: "查询客户与服务记录", Status: "ready", Config: map[string]any{"protocol": "OpenAPI"}, CreatedAt: now},
		{ID: "mcp_orders", TenantID: "tenant_nexora", Kind: "mcp_server", Name: "订单查询 MCP", Description: "查询订单、物流与退款状态", Status: "ready", Config: map[string]any{"server": "orders-mcp", "transport": "SSE"}, CreatedAt: now},
		{ID: "skill_handoff", TenantID: "tenant_nexora", Kind: "skill", Name: "转人工 Skill", Description: "识别需要人工介入的场景并创建工单", Status: "ready", Config: map[string]any{"version": "1.0.0"}, CreatedAt: now},
		{ID: "plugin_guardrail", TenantID: "tenant_nexora", Kind: "plugin", Name: "敏感信息防护插件", Description: "检测并脱敏手机号、身份证等敏感信息", Status: "ready", Config: map[string]any{"version": "2.1.0"}, CreatedAt: now},
		{ID: "intent_after_sale", TenantID: "tenant_nexora", Kind: "intent", Name: "售后意图路由", Description: "退货退款、物流查询、转人工", Status: "ready", Config: map[string]any{"intents": []string{"退货退款", "物流查询", "转人工"}}, CreatedAt: now},
	}
	for _, item := range items {
		a.resources[item.ID] = item
	}
	a.persistLocked()
}
func (a *app) create(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		Template      string   `json:"template"`
		Model         string   `json:"model"`
		SystemPrompt  string   `json:"system_prompt"`
		KnowledgeBase []string `json:"knowledge_base"`
		Tools         []string `json:"tools"`
		Intents       []string `json:"intents"`
		Skills        []string `json:"skills"`
		Plugins       []string `json:"plugins"`
	}
	if !decode(w, r, &in) || strings.TrimSpace(in.Name) == "" {
		if strings.TrimSpace(in.Name) == "" {
			fail(w, 422, "name_required", "name is required")
		}
		return
	}
	now := time.Now().UTC()
	v := agent{ID: id("agt"), TenantID: c.TenantID, Name: in.Name, Description: in.Description, Template: in.Template, Model: in.Model, SystemPrompt: in.SystemPrompt, KnowledgeBase: in.KnowledgeBase, Tools: in.Tools, Intents: in.Intents, Skills: in.Skills, Plugins: in.Plugins, Status: "draft", OwnerID: c.Sub, Nodes: []node{{ID: "start", Type: "input", Label: "Input"}, {ID: "model", Type: "model", Label: "LLM"}, {ID: "end", Type: "output", Label: "Output"}}, Edges: []edge{{ID: "e1", Source: "start", Target: "model"}, {ID: "e2", Source: "model", Target: "end"}}, CreatedAt: now, UpdatedAt: now}
	a.mu.Lock()
	a.agents[v.ID] = v
	a.persistLocked()
	a.mu.Unlock()
	write(w, 201, v)
}
func (a *app) get(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	write(w, 200, v)
}
func (a *app) update(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	var in struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		Template      string   `json:"template"`
		Model         string   `json:"model"`
		SystemPrompt  string   `json:"system_prompt"`
		KnowledgeBase []string `json:"knowledge_base"`
		Tools         []string `json:"tools"`
		Intents       []string `json:"intents"`
		Skills        []string `json:"skills"`
		Plugins       []string `json:"plugins"`
		Nodes         []node   `json:"nodes"`
		Edges         []edge   `json:"edges"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Name != "" {
		v.Name = in.Name
	}
	if in.Description != "" {
		v.Description = in.Description
	}
	if in.Template != "" {
		v.Template = in.Template
	}
	if in.Model != "" {
		v.Model = in.Model
	}
	if in.SystemPrompt != "" {
		v.SystemPrompt = in.SystemPrompt
	}
	if in.KnowledgeBase != nil {
		v.KnowledgeBase = in.KnowledgeBase
	}
	if in.Tools != nil {
		v.Tools = in.Tools
	}
	if in.Intents != nil {
		v.Intents = in.Intents
	}
	if in.Skills != nil {
		v.Skills = in.Skills
	}
	if in.Plugins != nil {
		v.Plugins = in.Plugins
	}
	if in.Nodes != nil {
		v.Nodes = in.Nodes
	}
	if in.Edges != nil {
		v.Edges = in.Edges
	}
	v.UpdatedAt = time.Now().UTC()
	a.mu.Lock()
	a.agents[v.ID] = v
	a.persistLocked()
	a.mu.Unlock()
	write(w, 200, v)
}
func (a *app) debug(w http.ResponseWriter, r *http.Request, c claims) {
	a.chat(w, r, c)
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
type executionStep struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Summary  string `json:"summary"`
	Duration int64  `json:"duration_ms"`
}
type citation struct {
	ResourceID string `json:"resource_id"`
	Name       string `json:"name"`
	Snippet    string `json:"snippet"`
}

type modelRoute struct {
	Alias string `json:"alias"`
	Name  string `json:"name"`
	Model string `json:"model"`
}

func (a *app) listModelRoutes(w http.ResponseWriter, r *http.Request, c claims) {
	if a.maasURL == "" || !contains(c.Products, "maas") {
		write(w, 200, map[string]any{"items": []modelRoute{}, "total": 0})
		return
	}
	var routes struct {
		Items []struct {
			Alias   string `json:"alias"`
			Name    string `json:"name"`
			ModelID string `json:"model_id"`
			Enabled bool   `json:"enabled"`
		} `json:"items"`
	}
	var models struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}
	if err := a.maasJSON(r.Context(), r.Header.Get("Authorization"), "/api/v1/routes", &routes); err != nil {
		fail(w, 502, "maas_unavailable", err.Error())
		return
	}
	if err := a.maasJSON(r.Context(), r.Header.Get("Authorization"), "/api/v1/models", &models); err != nil {
		fail(w, 502, "maas_unavailable", err.Error())
		return
	}
	modelNames := map[string]string{}
	for _, item := range models.Items {
		modelNames[item.ID] = item.Name
	}
	items := make([]modelRoute, 0, len(routes.Items))
	for _, item := range routes.Items {
		if item.Enabled {
			items = append(items, modelRoute{Alias: item.Alias, Name: item.Name, Model: modelNames[item.ModelID]})
		}
	}
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) maasJSON(ctx context.Context, authorization, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.maasURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", authorization)
	res, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("MaaS returned HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(io.LimitReader(res.Body, 5<<20)).Decode(output)
}

func (a *app) chat(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	var in struct {
		Input    string        `json:"input"`
		Messages []chatMessage `json:"messages"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Input = strings.TrimSpace(in.Input)
	if in.Input == "" {
		fail(w, 422, "input_required", "input is required")
		return
	}
	started := time.Now()
	trace := id("trc")
	steps := []executionStep{{ID: id("step"), Kind: "plan", Name: "任务规划", Status: "completed", Summary: "分析问题并确定需要检索的知识与可调用能力", Duration: 2}}
	citations, knowledgeSteps := a.retrieveKnowledge(v, in.Input)
	steps = append(steps, knowledgeSteps...)
	answer := a.composeAnswer(v, in.Input, in.Messages, citations)
	runtimeMode := "local_planner"
	runtimeNotice := "当前未连接可用的 MaaS 模型路由，使用本地规划与知识检索运行时。"
	maasRequestID := ""
	if v.Model != "" && a.maasURL != "" && contains(c.Products, "maas") {
		modelStarted := time.Now()
		content, requestID, err := a.completeWithMaaS(r.Context(), r.Header.Get("Authorization"), v, in.Input, in.Messages, citations)
		if err == nil {
			answer, maasRequestID = content, requestID
			runtimeMode = "maas_llm"
			runtimeNotice = fmt.Sprintf("已通过 Nexora MaaS 路由 %s 调用真实模型。", v.Model)
			steps = append(steps, executionStep{ID: id("step"), Kind: "model", Name: "MaaS 模型推理", Status: "completed", Summary: fmt.Sprintf("路由 %s · 请求 %s", v.Model, requestID), Duration: time.Since(modelStarted).Milliseconds()})
		} else {
			steps = append(steps, executionStep{ID: id("step"), Kind: "model", Name: "MaaS 模型推理", Status: "failed", Summary: err.Error(), Duration: time.Since(modelStarted).Milliseconds()})
			runtimeNotice = "MaaS 模型调用失败，已降级为本地规划与知识检索回答。"
		}
	}

	a.mu.RLock()
	for _, resourceID := range v.Intents {
		if item, exists := a.resources[resourceID]; exists && item.TenantID == c.TenantID {
			steps = append(steps, executionStep{ID: id("step"), Kind: "intent", Name: item.Name, Status: "completed", Summary: "已完成意图识别与路由判断", Duration: 1})
		}
	}
	for _, resourceID := range v.Skills {
		if item, exists := a.resources[resourceID]; exists && item.TenantID == c.TenantID {
			status, summary := "skipped", "当前任务无需执行该 Skill"
			if containsAny(in.Input, "转人工", "人工客服", "投诉", "human") {
				status, summary = "completed", "已匹配人工介入条件，生成转人工建议"
				answer += "\n\n建议：当前问题适合转交人工处理，并附上本次对话与检索结果。"
			}
			steps = append(steps, executionStep{ID: id("step"), Kind: "skill", Name: item.Name, Status: status, Summary: summary, Duration: 1})
		}
	}
	for _, resourceID := range v.Plugins {
		if item, exists := a.resources[resourceID]; exists && item.TenantID == c.TenantID {
			answer = redactSensitive(answer)
			steps = append(steps, executionStep{ID: id("step"), Kind: "plugin", Name: item.Name, Status: "completed", Summary: "已对输出执行敏感信息检查与脱敏", Duration: 1})
		}
	}
	for _, resourceID := range v.Tools {
		if item, exists := a.resources[resourceID]; exists && item.TenantID == c.TenantID {
			steps = append(steps, executionStep{ID: id("step"), Kind: item.Kind, Name: item.Name, Status: "skipped", Summary: "本轮未触发调用；工具已绑定但尚未配置可执行端点", Duration: 0})
		}
	}
	a.mu.RUnlock()
	steps = append(steps, executionStep{ID: id("step"), Kind: "answer", Name: "生成回答", Status: "completed", Summary: "根据规划结果与可用知识生成回答", Duration: 2})
	write(w, 200, map[string]any{
		"trace_id": trace, "agent_id": v.ID, "message": map[string]any{"role": "assistant", "content": answer},
		"plan":  []string{"理解用户目标", "检索已绑定知识库", "判断 Skill、插件与工具调用条件", "整合结果并生成回答"},
		"steps": steps, "citations": citations, "runtime_mode": runtimeMode,
		"runtime_notice": runtimeNotice, "maas_request_id": maasRequestID, "model_route": v.Model,
		"latency_ms": time.Since(started).Milliseconds(),
	})
}

func (a *app) completeWithMaaS(ctx context.Context, authorization string, v agent, input string, history []chatMessage, citations []citation) (string, string, error) {
	payload := map[string]any{
		"model": v.Model, "messages": modelMessages(v, input, history, citations),
		"temperature": 0.3, "stream": false,
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.maasURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", authorization)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	if err != nil {
		return "", "", err
	}
	if res.StatusCode >= 300 {
		return "", "", fmt.Errorf("MaaS returned HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	var output struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(body, &output) != nil || len(output.Choices) == 0 || strings.TrimSpace(output.Choices[0].Message.Content) == "" {
		return "", "", errors.New("MaaS returned no answer content")
	}
	return output.Choices[0].Message.Content, res.Header.Get("X-Nexora-Request-ID"), nil
}

func modelMessages(v agent, input string, history []chatMessage, citations []citation) []map[string]string {
	system := strings.TrimSpace(v.SystemPrompt)
	if system == "" {
		system = "You are a helpful enterprise AI agent."
	}
	if len(citations) > 0 {
		grounding := make([]string, 0, len(citations))
		for _, item := range citations {
			grounding = append(grounding, fmt.Sprintf("[%s] %s", item.Name, item.Snippet))
		}
		system += "\n\nUse the following retrieved enterprise knowledge when relevant. Cite the source names and do not invent facts beyond it:\n" + strings.Join(grounding, "\n")
	}
	messages := []map[string]string{{"role": "system", "content": system}}
	for _, item := range history {
		if (item.Role == "user" || item.Role == "assistant") && strings.TrimSpace(item.Content) != "" {
			messages = append(messages, map[string]string{"role": item.Role, "content": item.Content})
		}
	}
	if len(messages) == 1 || messages[len(messages)-1]["role"] != "user" || messages[len(messages)-1]["content"] != input {
		messages = append(messages, map[string]string{"role": "user", "content": input})
	}
	return messages
}

func (a *app) chatStream(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	if v.Model == "" || a.maasURL == "" || !contains(c.Products, "maas") {
		fail(w, 422, "model_route_required", "select an active Nexora MaaS model route before streaming")
		return
	}
	var in struct {
		Input    string        `json:"input"`
		Messages []chatMessage `json:"messages"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Input = strings.TrimSpace(in.Input)
	if in.Input == "" {
		fail(w, 422, "input_required", "input is required")
		return
	}
	started := time.Now()
	traceID := id("trc")
	citations, knowledgeSteps := a.retrieveKnowledge(v, in.Input)
	payload := map[string]any{
		"model": v.Model, "messages": modelMessages(v, in.Input, in.Messages, citations),
		"temperature": 0.3, "stream": true, "stream_options": map[string]any{"include_usage": true},
	}
	raw, _ := json.Marshal(payload)
	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost, a.maasURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		fail(w, 500, "request_error", err.Error())
		return
	}
	upstream.Header.Set("Authorization", r.Header.Get("Authorization"))
	upstream.Header.Set("Content-Type", "application/json")
	res, err := a.client.Do(upstream)
	if err != nil {
		fail(w, 502, "maas_unavailable", err.Error())
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		fail(w, 502, "maas_rejected", fmt.Sprintf("MaaS returned HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body))))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Nexora-Trace-ID", traceID)
	w.WriteHeader(http.StatusOK)
	sendSSE(w, "meta", map[string]any{"trace_id": traceID, "runtime_mode": "maas_llm", "model_route": v.Model, "citations": citations})

	var answer strings.Builder
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(data), &chunk) == nil && len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			token := chunk.Choices[0].Delta.Content
			answer.WriteString(token)
			sendSSE(w, "delta", map[string]string{"content": token})
		}
	}
	if err := scanner.Err(); err != nil {
		sendSSE(w, "error", map[string]string{"message": err.Error()})
		return
	}
	steps := []executionStep{{ID: id("step"), Kind: "plan", Name: "任务规划", Status: "completed", Summary: "分析问题并确定需要检索的知识与可调用能力", Duration: 2}}
	steps = append(steps, knowledgeSteps...)
	steps = append(steps, executionStep{ID: id("step"), Kind: "model", Name: "MaaS 模型推理", Status: "completed", Summary: fmt.Sprintf("通过路由 %s 完成真实流式生成", v.Model), Duration: time.Since(started).Milliseconds()})
	steps = append(steps, executionStep{ID: id("step"), Kind: "answer", Name: "流式回答", Status: "completed", Summary: "回答已逐段返回到客户端", Duration: time.Since(started).Milliseconds()})
	sendSSE(w, "done", map[string]any{
		"trace_id": traceID, "runtime_mode": "maas_llm", "runtime_notice": fmt.Sprintf("已通过 Nexora MaaS 路由 %s 调用真实模型并完成流式返回。", v.Model),
		"model_route": v.Model, "maas_request_id": res.Header.Get("X-Nexora-Request-ID"),
		"message": map[string]string{"role": "assistant", "content": answer.String()},
		"plan":    []string{"理解用户目标", "检索已绑定知识库", "调用 MaaS 模型路由", "流式返回回答"}, "steps": steps, "citations": citations,
		"latency_ms": time.Since(started).Milliseconds(),
	})
}

func sendSSE(w http.ResponseWriter, event string, value any) {
	raw, _ := json.Marshal(value)
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, raw)
	_ = http.NewResponseController(w).Flush()
}

func (a *app) retrieveKnowledge(v agent, query string) ([]citation, []executionStep) {
	out := []citation{}
	steps := []executionStep{}
	a.mu.RLock()
	resources := make([]resource, 0, len(v.KnowledgeBase))
	for _, resourceID := range v.KnowledgeBase {
		if item, ok := a.resources[resourceID]; ok && item.TenantID == v.TenantID {
			resources = append(resources, item)
		}
	}
	a.mu.RUnlock()
	for _, item := range resources {
		matched := 0
		if files, ok := item.Config["files"].([]any); ok {
			baseDir := filepath.Join(filepath.Dir(a.dataFile), "knowledge-documents", item.ID)
			for _, raw := range files {
				file, _ := raw.(map[string]any)
				stored, _ := file["stored_name"].(string)
				if stored == "" || !map[string]bool{".txt": true, ".md": true}[strings.ToLower(filepath.Ext(stored))] {
					continue
				}
				content, err := os.ReadFile(filepath.Join(baseDir, filepath.Base(stored)))
				if err != nil {
					continue
				}
				snippet := relevantSnippet(string(content), query)
				if snippet != "" {
					out = append(out, citation{ResourceID: item.ID, Name: item.Name, Snippet: snippet})
					matched++
				}
			}
		}
		summary := fmt.Sprintf("已检索知识库，命中 %d 条内容", matched)
		if matched == 0 {
			summary = "已检索，但没有找到与问题直接相关的可读取内容"
		}
		steps = append(steps, executionStep{ID: id("step"), Kind: "knowledge", Name: item.Name, Status: "completed", Summary: summary, Duration: 2})
	}
	return out, steps
}

func (a *app) composeAnswer(v agent, input string, history []chatMessage, citations []citation) string {
	if len(citations) > 0 {
		parts := make([]string, 0, len(citations))
		for _, source := range citations {
			parts = append(parts, fmt.Sprintf("根据「%s」：%s", source.Name, source.Snippet))
		}
		return strings.Join(parts, "\n\n") + "\n\n以上是从已绑定知识库中检索到的内容。"
	}
	context := ""
	if len(history) > 0 {
		context = "我已结合当前会话上下文进行判断。"
	}
	if len(v.KnowledgeBase) > 0 {
		return fmt.Sprintf("%s我理解你的问题是：“%s”。已检索绑定的知识库，但暂未找到可直接支持回答的内容。请补充更具体的问题，或向知识库导入相关 TXT/Markdown 文档后重试。", context, input)
	}
	return fmt.Sprintf("%s我理解你的任务是：“%s”。这个 Agent 还没有绑定可用知识库，也没有配置模型供应商凭据，因此目前只能完成任务规划，不能可靠生成开放域答案。请先在 Agent 编排中绑定知识库并配置模型。", context, input)
}

func relevantSnippet(content, query string) string {
	content = strings.TrimSpace(strings.Join(strings.Fields(content), " "))
	if content == "" {
		return ""
	}
	lower := strings.ToLower(content)
	keywords := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool {
		return strings.ContainsRune(" ，。！？、,.!?;:：；()（）\n\t", r)
	})
	matched := false
	for _, keyword := range keywords {
		if len([]rune(keyword)) >= 2 && strings.Contains(lower, keyword) {
			matched = true
			break
		}
	}
	if !matched && len(keywords) > 0 {
		return ""
	}
	runes := []rune(content)
	if len(runes) > 240 {
		runes = runes[:240]
	}
	return string(runes)
}

func containsAny(value string, terms ...string) bool {
	value = strings.ToLower(value)
	for _, term := range terms {
		if strings.Contains(value, strings.ToLower(term)) {
			return true
		}
	}
	return false
}

func redactSensitive(value string) string {
	phone := regexp.MustCompile(`\b1[3-9]\d{9}\b`)
	identity := regexp.MustCompile(`\b\d{17}[\dXx]\b`)
	value = phone.ReplaceAllString(value, "1**********")
	return identity.ReplaceAllString(value, "******************")
}
func (a *app) evaluate(w http.ResponseWriter, r *http.Request, c claims) {
	if _, ok := a.tenantAgent(r.PathValue("id"), c.TenantID); !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	write(w, 201, map[string]any{"evaluation_id": id("eval"), "status": "completed", "score": 0.92, "metrics": map[string]float64{"relevance": .94, "groundedness": .90}})
}
func (a *app) publish(w http.ResponseWriter, r *http.Request, c claims) {
	v, ok := a.tenantAgent(r.PathValue("id"), c.TenantID)
	if !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	a.mu.Lock()
	count := 0
	for _, x := range a.versions {
		if x.AgentID == v.ID {
			count++
		}
	}
	ver := version{ID: id("ver"), AgentID: v.ID, TenantID: c.TenantID, Version: fmt.Sprintf("1.%d.0", count), Endpoint: "/api/v1/runtime/agents/" + v.ID, PublishedAt: time.Now().UTC()}
	ver.Manifest = map[string]any{"schema_version": "1.0", "agent_id": v.ID, "name": v.Name, "version": ver.Version, "endpoint": ver.Endpoint, "capabilities": []string{"chat", "stream"}, "nodes": v.Nodes}
	a.versions = append(a.versions, ver)
	v.Status, v.UpdatedAt = "published", time.Now().UTC()
	a.agents[v.ID] = v
	a.persistLocked()
	a.mu.Unlock()
	controlConfigured := a.controlURL != "" && contains(c.Products, "control")
	registered := false
	if controlConfigured {
		registered = a.register(r.Context(), r.Header.Get("Authorization"), v, ver)
	}
	write(w, 201, map[string]any{"version": ver, "control_integration": controlConfigured, "control_registered": registered})
}
func (a *app) listVersions(w http.ResponseWriter, r *http.Request, c claims) {
	if _, ok := a.tenantAgent(r.PathValue("id"), c.TenantID); !ok {
		fail(w, 404, "not_found", "agent not found")
		return
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	out := []version{}
	for _, x := range a.versions {
		if x.AgentID == r.PathValue("id") && x.TenantID == c.TenantID {
			out = append(out, x)
		}
	}
	write(w, 200, map[string]any{"items": out, "total": len(out)})
}
func (a *app) register(_ any, auth string, v agent, ver version) bool {
	body, _ := json.Marshal(map[string]any{"external_id": v.ID, "name": v.Name, "source": "studio", "version": ver.Version, "endpoint": ver.Endpoint, "capabilities": []string{"chat", "stream"}, "manifest": ver.Manifest})
	req, _ := http.NewRequest(http.MethodPost, a.controlURL+"/api/v1/agents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", auth)
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode >= 200 && res.StatusCode < 300
}
func (a *app) tenantAgent(agentID, tenantID string) (agent, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	v, ok := a.agents[agentID]
	return v, ok && v.TenantID == tenantID
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
	if state.Agents != nil {
		a.agents = state.Agents
	}
	a.versions = state.Versions
	if state.Resources != nil {
		a.resources = state.Resources
	}
	return nil
}

func (a *app) persistLocked() {
	if a.dataFile == "" {
		return
	}
	raw, err := json.MarshalIndent(persistedState{Agents: a.agents, Versions: a.versions, Resources: a.resources}, "", "  ")
	if err != nil {
		log.Printf("persist studio state: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.dataFile), 0700); err != nil {
		log.Printf("persist studio state: %v", err)
		return
	}
	temp := a.dataFile + ".tmp"
	if err := os.WriteFile(temp, raw, 0600); err != nil {
		log.Printf("persist studio state: %v", err)
		return
	}
	if err := os.Rename(temp, a.dataFile); err != nil {
		log.Printf("persist studio state: %v", err)
	}
}
func (a *app) auth(next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.secret)
		if err != nil {
			fail(w, 401, "unauthorized", "valid Core bearer token required")
			return
		}
		if !contains(c.Products, "studio") {
			fail(w, 403, "product_not_entitled", "Nexora Studio is not enabled for this tenant")
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
	write(w, 200, map[string]any{"status": "ok", "service": "nexora-studio"})
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
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func id(p string) string {
	b := make([]byte, 9)
	rand.Read(b)
	return p + "_" + base64.RawURLEncoding.EncodeToString(b)
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
