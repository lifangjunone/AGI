package nexora

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

type AgentManifest struct {
	SchemaVersion string         `json:"schema_version"`
	AgentID       string         `json:"agent_id"`
	Name          string         `json:"name"`
	Version       string         `json:"version"`
	Endpoint      string         `json:"endpoint"`
	Capabilities  []string       `json:"capabilities"`
	ExecutionType string         `json:"execution_type,omitempty"`
	Runtime       *RuntimeConfig `json:"runtime,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type RuntimeConfig struct {
	RuntimeID         string `json:"runtime_id,omitempty"`
	DeploymentMode    string `json:"deployment_mode,omitempty"`
	Endpoint          string `json:"endpoint,omitempty"`
	CredentialRef     string `json:"credential_ref,omitempty"`
	PermissionProfile string `json:"permission_profile,omitempty"`
	MaxSteps          int    `json:"max_steps,omitempty"`
	TimeoutSeconds    int    `json:"timeout_seconds,omitempty"`
}

func (c Client) RegisterAgent(ctx context.Context, manifest AgentManifest) (map[string]any, error) {
	payload := map[string]any{
		"external_id": manifest.AgentID, "name": manifest.Name, "source": "external",
		"version": manifest.Version, "endpoint": manifest.Endpoint,
		"capabilities": manifest.Capabilities, "manifest": manifest,
	}
	return c.do(ctx, http.MethodPost, "/api/v1/agents", payload)
}

func (c Client) Invoke(ctx context.Context, agentID, input string) (map[string]any, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/gateway/agents/"+agentID+"/invoke", map[string]string{"input": input})
}

func (c Client) RuntimeTask(ctx context.Context, taskID string) (map[string]any, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/tasks/"+url.PathEscape(taskID), nil)
}

func (c Client) CancelRuntimeTask(ctx context.Context, taskID string) (map[string]any, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/tasks/"+url.PathEscape(taskID)+"/cancel", nil)
}

func (c Client) do(ctx context.Context, method, path string, body any) (map[string]any, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	if res.StatusCode >= 300 {
		return out, fmt.Errorf("nexora: HTTP %d", res.StatusCode)
	}
	return out, nil
}
