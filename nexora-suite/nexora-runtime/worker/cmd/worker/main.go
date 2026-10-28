package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	omprpc "github.com/can1357/oh-my-pi/sdk/go/omp-rpc"
)

type taskRequest struct {
	ProtocolVersion   string           `json:"protocol_version"`
	TaskID            string           `json:"task_id"`
	TenantID          string           `json:"tenant_id"`
	AgentID           string           `json:"agent_id"`
	Input             string           `json:"input"`
	Messages          []map[string]any `json:"messages"`
	ModelRoute        string           `json:"model_route"`
	SystemPrompt      string           `json:"system_prompt"`
	Resources         map[string]any   `json:"resources"`
	Limits            map[string]int   `json:"limits"`
	PermissionProfile string           `json:"permission_profile"`
}

type worker struct {
	maasURL       string
	ompBinary     string
	workspaceRoot string
	toolDialect   string
	contextWindow int
	maxTokens     int
	engineVersion string
}

func main() {
	w := &worker{
		maasURL:       strings.TrimRight(env("MAAS_URL", "http://127.0.0.1:8083"), "/"),
		ompBinary:     env("OMP_BINARY", "omp"),
		workspaceRoot: env("NATIVE_WORKSPACE_ROOT", filepath.Join(os.TempDir(), "nexora-native")),
		toolDialect:   env("NATIVE_TOOL_DIALECT", "qwen3"),
		contextWindow: envInt("NATIVE_MODEL_CONTEXT_WINDOW", 4096),
		maxTokens:     envInt("NATIVE_MODEL_MAX_TOKENS", 2048),
		engineVersion: env("NATIVE_ENGINE_VERSION", "managed"),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", w.health)
	mux.HandleFunc("POST /v1/tasks/stream", w.stream)
	addr := env("ADDR", ":8094")
	log.Printf("Nexora Native AgentLoop gateway listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (w *worker) stream(response http.ResponseWriter, request *http.Request) {
	var input taskRequest
	if err := json.NewDecoder(http.MaxBytesReader(response, request.Body, 2<<20)).Decode(&input); err != nil {
		fail(response, 400, "invalid_json", err.Error())
		return
	}
	if input.ProtocolVersion != "" && input.ProtocolVersion != "nexora-runtime-v1" {
		fail(response, 422, "protocol_unsupported", "Native Runtime supports nexora-runtime-v1")
		return
	}
	if strings.TrimSpace(input.Input) == "" || strings.TrimSpace(input.ModelRoute) == "" {
		fail(response, 422, "task_invalid", "input and model_route are required")
		return
	}
	if input.PermissionProfile != "" && input.PermissionProfile != "tools_only" && input.PermissionProfile != "workspace_read" {
		fail(response, 403, "approval_unavailable", "Write, shell and device operations require an isolated approval-enabled runtime")
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer "))
	if token == "" {
		fail(response, 401, "authorization_required", "a Core bearer token is required for the MaaS route")
		return
	}

	maxSteps := bounded(input.Limits["max_steps"], 1, 100, 20)
	timeoutSeconds := bounded(input.Limits["timeout_seconds"], 10, 3600, 300)
	ctx, cancel := context.WithTimeout(request.Context(), time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	taskDir, agentDir, err := w.prepareTask(input, token)
	if err != nil {
		fail(response, 500, "runtime_prepare_failed", err.Error())
		return
	}
	defer os.RemoveAll(filepath.Dir(taskDir))

	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	emitter := &sseEmitter{w: response}
	emitter.send("meta", map[string]any{
		"task_id": input.TaskID, "runtime_mode": "nexora_native", "runtime_protocol": "nexora-runtime-v1",
		"engine": "native-agentloop", "engine_version": w.engineVersion, "model_route": input.ModelRoute,
		"max_steps": maxSteps, "permission_profile": permissionProfile(input.PermissionProfile),
	})
	emitter.send("progress", map[string]any{"stage": "bootstrap", "label": "正在启动隔离的 Native Agent Loop", "status": "running"})

	args := []string{
		"--mode", "rpc", "--no-session", "--no-ui", "--no-title", "--no-lsp",
		"--cwd", taskDir, "--model", "nexora/" + input.ModelRoute,
		"--system-prompt", nativeSystemPrompt(input),
		"--tools", strings.Join(allowedTools(input), ","),
		"--approval-mode", approvalMode(input.PermissionProfile),
	}
	cmd := exec.Command(w.ompBinary, args...)
	cmd.Dir = taskDir
	cmd.Env = append(safeEnvironment(),
		"PI_CODING_AGENT_DIR="+agentDir,
		"PI_DIALECT="+w.toolDialect,
	)
	cmd.Stderr = &redactingLogWriter{prefix: "omp: "}

	client, err := omprpc.Start(ctx, cmd)
	if err != nil {
		emitter.send("error", map[string]string{"code": "engine_start_failed", "message": publicError(err)})
		return
	}
	defer client.Close()
	emitter.send("progress", map[string]any{
		"stage": "bootstrap", "label": "Native Agent Loop 已就绪", "status": "completed",
		"detail": fmt.Sprintf("Native AgentLoop RPC v%d", client.ProtocolVersion()),
	})

	resultCh := make(chan promptResult, 1)
	go func() {
		turn, promptErr := client.PromptAndWait(ctx, omprpc.PromptCommand{Message: promptWithHistory(input)}, time.Duration(timeoutSeconds)*time.Second)
		resultCh <- promptResult{turn: turn, err: promptErr}
	}()

	started := time.Now()
	answer, reasoning := strings.Builder{}, strings.Builder{}
	steps := make([]map[string]any, 0)
	toolSteps := 0
	limited := false

	for {
		select {
		case <-ctx.Done():
			_ = client.Abort(context.Background())
			emitter.send("error", map[string]string{"code": "task_timeout", "message": "Native Agent Loop exceeded its task timeout"})
			return
		case frame, ok := <-client.Frames():
			if !ok {
				select {
				case result := <-resultCh:
					w.finish(emitter, input, result, answer.String(), reasoning.String(), steps, started, limited)
				default:
					emitter.send("error", map[string]string{"code": "engine_stopped", "message": publicError(client.Err())})
				}
				return
			}
			switch event := frame.Value.(type) {
			case omprpc.MessageUpdateEvent:
				switch delta := event.AssistantMessageEvent.Value.(type) {
				case omprpc.AssistantTextDeltaEvent:
					answer.WriteString(delta.Delta)
					emitter.send("delta", map[string]string{"content": delta.Delta})
				case omprpc.AssistantThinkingDeltaEvent:
					reasoning.WriteString(delta.Delta)
					emitter.send("reasoning", map[string]string{"content": delta.Delta})
				}
			case omprpc.ToolExecutionStartEvent:
				toolSteps++
				if toolSteps > maxSteps {
					limited = true
					_ = client.Abort(context.Background())
					emitter.send("progress", map[string]any{"stage": "guard", "label": "已达到最大工具步数", "status": "failed"})
					continue
				}
				steps = append(steps, map[string]any{
					"id": event.ToolCallID, "kind": "tool", "name": event.ToolName,
					"status": "running", "started_at": time.Now().UTC(),
				})
				emitter.send("tool_start", map[string]any{
					"tool_call_id": event.ToolCallID, "tool_name": event.ToolName,
					"args": rawValue(event.Args), "intent": event.Intent, "step": toolSteps,
				})
			case omprpc.ToolExecutionUpdateEvent:
				emitter.send("tool_update", map[string]any{
					"tool_call_id": event.ToolCallID, "tool_name": event.ToolName,
					"partial_result": rawValue(event.PartialResult),
				})
			case omprpc.ToolStreamUpdateEvent:
				emitter.send("tool_update", map[string]any{
					"tool_call_id": event.ToolCallID, "tool_name": event.ToolName,
					"partial_result": rawValue(event.Update),
				})
			case omprpc.ToolExecutionEndEvent:
				updateStep(steps, event.ToolCallID, event.IsError)
				emitter.send("tool_end", map[string]any{
					"tool_call_id": event.ToolCallID, "tool_name": event.ToolName,
					"result": rawValue(event.Result), "is_error": boolValue(event.IsError),
				})
			case omprpc.AutoCompactionStartEvent:
				emitter.send("progress", map[string]any{"stage": "compact", "label": "正在压缩长上下文", "status": "running"})
			case omprpc.AutoCompactionEndEvent:
				emitter.send("progress", map[string]any{"stage": "compact", "label": "上下文压缩完成", "status": "completed"})
			case omprpc.AutoRetryStartEvent:
				emitter.send("progress", map[string]any{"stage": "retry", "label": "模型调用重试中", "status": "running"})
			case omprpc.UnknownNotification:
				if event.Err != nil {
					log.Printf("omp protocol notification ignored: %v", event.Err)
				}
			}
		case result := <-resultCh:
			w.finish(emitter, input, result, answer.String(), reasoning.String(), steps, started, limited)
			return
		}
	}
}

type promptResult struct {
	turn omprpc.PromptTurn
	err  error
}

func (w *worker) finish(emitter *sseEmitter, input taskRequest, result promptResult, answer, reasoning string, steps []map[string]any, started time.Time, limited bool) {
	if result.err != nil {
		code := "agent_loop_failed"
		if limited {
			code = "max_steps_exceeded"
		}
		emitter.send("error", map[string]string{"code": code, "message": publicError(result.err)})
		return
	}
	if result.turn.Result != nil && result.turn.Result.Status != omprpc.PromptStatusCompleted {
		message := string(result.turn.Result.Status)
		if result.turn.Result.Error != nil {
			message = result.turn.Result.Error.Message
		}
		emitter.send("error", map[string]string{"code": "agent_loop_incomplete", "message": message})
		return
	}
	if answer == "" && result.turn.AssistantText != nil {
		answer = *result.turn.AssistantText
	}
	emitter.send("done", map[string]any{
		"task_id": input.TaskID, "runtime_mode": "nexora_native",
		"engine": "native-agentloop", "engine_version": w.engineVersion,
		"runtime_notice": "任务由隔离的 Native AgentLoop 执行；模型请求经 Nexora MaaS 路由。",
		"message":        map[string]string{"role": "assistant", "content": answer},
		"reasoning":      reasoning, "steps": steps, "tool_steps": len(steps),
		"duration_ms": time.Since(started).Milliseconds(), "citations": []any{},
	})
}

func (w *worker) prepareTask(input taskRequest, token string) (string, string, error) {
	if err := os.MkdirAll(w.workspaceRoot, 0700); err != nil {
		return "", "", err
	}
	root, err := os.MkdirTemp(w.workspaceRoot, sanitize(input.TaskID)+"-")
	if err != nil {
		return "", "", err
	}
	taskDir := filepath.Join(root, "workspace")
	agentDir := filepath.Join(root, "engine")
	if err := os.MkdirAll(taskDir, 0700); err != nil {
		os.RemoveAll(root)
		return "", "", err
	}
	if err := os.MkdirAll(agentDir, 0700); err != nil {
		os.RemoveAll(root)
		return "", "", err
	}
	models := fmt.Sprintf(
		"providers:\n  nexora:\n    baseUrl: %s\n    api: openai-completions\n    apiKey: %s\n    models:\n      - id: %s\n        name: %s\n        reasoning: true\n        contextWindow: %d\n        maxTokens: %d\n",
		yamlString(w.maasURL+"/v1"), yamlString(token), yamlString(input.ModelRoute), yamlString(input.ModelRoute),
		w.contextWindow, w.maxTokens,
	)
	if err := os.WriteFile(filepath.Join(agentDir, "models.yml"), []byte(models), 0600); err != nil {
		os.RemoveAll(root)
		return "", "", err
	}
	return taskDir, agentDir, nil
}

func allowedTools(input taskRequest) []string {
	switch permissionProfile(input.PermissionProfile) {
	case "workspace_write":
		return []string{"read", "grep", "glob", "edit", "write", "ast_edit", "todo"}
	case "device_control":
		return []string{"read", "grep", "glob", "edit", "write", "ast_edit", "bash", "todo"}
	case "workspace_read":
		return []string{"read", "grep", "glob", "todo"}
	default:
		return []string{"read", "grep", "glob", "todo"}
	}
}

func approvalMode(profile string) string {
	switch permissionProfile(profile) {
	case "workspace_write":
		return "write"
	default:
		return "always-ask"
	}
}

func permissionProfile(value string) string {
	switch value {
	case "workspace_read", "workspace_write", "device_control", "tools_only":
		return value
	default:
		return "tools_only"
	}
}

func promptWithHistory(input taskRequest) string {
	var history strings.Builder
	for _, item := range input.Messages {
		role, _ := item["role"].(string)
		content, _ := item["content"].(string)
		content = strings.TrimSpace(content)
		if content != "" && (role == "user" || role == "assistant") {
			fmt.Fprintf(&history, "%s: %s\n", role, content)
		}
	}
	if history.Len() == 0 {
		return input.Input
	}
	return "Conversation context:\n" + history.String() + "\nCurrent task:\n" + input.Input
}

func nativeSystemPrompt(input taskRequest) string {
	system := strings.TrimSpace(input.SystemPrompt)
	if system == "" {
		system = "You are an autonomous enterprise agent."
	}
	system += fmt.Sprintf(
		"\n\nYou run inside Nexora Native Runtime using the oh-my-pi Agent Loop. Plan dynamically, use tools when evidence is required, observe every result, and stop only when the task is complete. Permission profile: %s. Never attempt to escape the assigned workspace.",
		permissionProfile(input.PermissionProfile),
	)
	if len(input.Resources) > 0 {
		raw, _ := json.Marshal(input.Resources)
		system += "\nNexora capability bindings: " + string(raw)
	}
	return system
}

type sseEmitter struct {
	mu sync.Mutex
	w  http.ResponseWriter
}

func (s *sseEmitter) send(event string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, _ := json.Marshal(value)
	_, _ = fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, raw)
	if flusher, ok := s.w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *worker) health(response http.ResponseWriter, _ *http.Request) {
	path, err := exec.LookPath(w.ompBinary)
	status := "ok"
	if err != nil {
		status, path = "degraded", w.ompBinary
	}
	write(response, 200, map[string]any{
		"service": "nexora-native-runtime", "status": status, "protocol_version": "nexora-runtime-v1",
		"engine": "native-agentloop", "engine_version": w.engineVersion, "engine_binary": path,
		"tool_dialect": w.toolDialect, "model_context_window": w.contextWindow, "model_max_tokens": w.maxTokens,
	})
}

type redactingLogWriter struct{ prefix string }

func (w *redactingLogWriter) Write(p []byte) (int, error) {
	if text := strings.TrimSpace(string(p)); text != "" {
		log.Printf("%s%s", w.prefix, redact(text))
	}
	return len(p), nil
}

func safeEnvironment() []string {
	allowed := map[string]bool{
		"PATH": true, "LANG": true, "LC_ALL": true, "TZ": true,
		"SSL_CERT_FILE": true, "SSL_CERT_DIR": true,
	}
	var out []string
	for _, pair := range os.Environ() {
		key, _, _ := strings.Cut(pair, "=")
		if allowed[key] {
			out = append(out, pair)
		}
	}
	return out
}

func rawValue(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return string(raw)
	}
	return value
}

func updateStep(steps []map[string]any, id string, isError *bool) {
	for i := len(steps) - 1; i >= 0; i-- {
		if steps[i]["id"] == id {
			steps[i]["status"] = "completed"
			if boolValue(isError) {
				steps[i]["status"] = "failed"
			}
			steps[i]["finished_at"] = time.Now().UTC()
			return
		}
	}
}

func boolValue(value *bool) bool { return value != nil && *value }

func yamlString(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func sanitize(value string) string {
	var out strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' {
			out.WriteRune(r)
		}
	}
	if out.Len() == 0 {
		return "task"
	}
	return out.String()
}

func bounded(value, min, max, fallback int) int {
	if value < min || value > max {
		return fallback
	}
	return value
}

func publicError(err error) string {
	if err == nil {
		return "unknown runtime error"
	}
	return redact(err.Error())
}

func redact(value string) string {
	for _, marker := range []string{"Bearer ", "apiKey:", "api_key="} {
		searchFrom := 0
		for {
			relative := strings.Index(value[searchFrom:], marker)
			if relative < 0 {
				break
			}
			index := searchFrom + relative
			start, end := index+len(marker), index+len(marker)
			for end < len(value) && value[end] != ' ' && value[end] != '\n' &&
				value[end] != '"' && value[end] != '\'' {
				end++
			}
			value = value[:start] + "[REDACTED]" + value[end:]
			searchFrom = start + len("[REDACTED]")
		}
	}
	return value
}

func fail(w http.ResponseWriter, status int, code, message string) {
	write(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}
