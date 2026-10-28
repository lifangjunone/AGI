package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const ProtocolVersion = "nexora-runtime-v1"

type Descriptor struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Vendor          string   `json:"vendor"`
	Category        string   `json:"category"`
	Protocol        string   `json:"protocol"`
	DeploymentModes []string `json:"deployment_modes"`
	Capabilities    []string `json:"capabilities"`
	BuiltIn         bool     `json:"built_in"`
	Status          string   `json:"status"`
	Integration     string   `json:"integration"`
}

type Profile struct {
	Endpoint      string
	CredentialRef string
}

type Task struct {
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

type Adapter interface {
	Descriptor() Descriptor
	Validate(Profile) error
	HealthRequest(context.Context, Profile) (*http.Request, error)
	TaskRequest(context.Context, Profile, Task) (*http.Request, error)
}

type ProtocolBridge struct {
	Info Descriptor
}

func (a ProtocolBridge) Descriptor() Descriptor {
	info := a.Info
	if info.Protocol == "" {
		info.Protocol = ProtocolVersion
	}
	if info.Status == "" {
		info.Status = "available"
	}
	if info.Integration == "" {
		info.Integration = "protocol_bridge"
	}
	return info
}

func (a ProtocolBridge) Validate(profile Profile) error {
	value, err := url.Parse(strings.TrimSpace(profile.Endpoint))
	if err != nil || (value.Scheme != "http" && value.Scheme != "https") || value.Host == "" {
		return fmt.Errorf("%s requires a valid HTTP(S) endpoint", a.Descriptor().Name)
	}
	return nil
}

func (a ProtocolBridge) HealthRequest(ctx context.Context, profile Profile) (*http.Request, error) {
	if err := a.Validate(profile); err != nil {
		return nil, err
	}
	return http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(profile.Endpoint, "/")+"/healthz", nil)
}

func (a ProtocolBridge) TaskRequest(ctx context.Context, profile Profile, task Task) (*http.Request, error) {
	if err := a.Validate(profile); err != nil {
		return nil, err
	}
	task.ProtocolVersion = ProtocolVersion
	raw, err := json.Marshal(task)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(profile.Endpoint, "/")+"/v1/tasks/stream", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if profile.CredentialRef != "" {
		req.Header.Set("X-Nexora-Credential-Ref", profile.CredentialRef)
	}
	return req, nil
}
