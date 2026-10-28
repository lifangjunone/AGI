package adapters_test

import (
	"context"
	"io"
	"testing"

	"github.com/nexora-suite/nexora-runtime/adapters"
	"github.com/nexora-suite/nexora-runtime/adapters/registry"
)

func TestEveryRegisteredAdapterBuildsProtocolRequests(t *testing.T) {
	r := registry.New()
	if len(r.Descriptors()) != 10 {
		t.Fatalf("expected 10 adapters, got %d", len(r.Descriptors()))
	}
	for _, descriptor := range r.Descriptors() {
		adapter, ok := r.Get(descriptor.ID)
		if !ok {
			t.Fatalf("adapter %s is not addressable", descriptor.ID)
		}
		profile := adapters.Profile{Endpoint: "https://runtime.example.com"}
		health, err := adapter.HealthRequest(context.Background(), profile)
		if err != nil || health.URL.Path != "/healthz" {
			t.Fatalf("%s health request: %v %#v", descriptor.ID, err, health)
		}
		task, err := adapter.TaskRequest(context.Background(), profile, adapters.Task{TaskID: "task_1", Input: "hello"})
		if err != nil || task.URL.Path != "/v1/tasks/stream" {
			t.Fatalf("%s task request: %v %#v", descriptor.ID, err, task)
		}
		raw, _ := io.ReadAll(task.Body)
		if len(raw) == 0 || task.Header.Get("Accept") != "text/event-stream" {
			t.Fatalf("%s did not build a streaming protocol request", descriptor.ID)
		}
	}
}

func TestProtocolBridgeRejectsInvalidEndpoint(t *testing.T) {
	adapter, _ := registry.New().Get("codex")
	if err := adapter.Validate(adapters.Profile{Endpoint: "file:///tmp/runtime"}); err == nil {
		t.Fatal("expected invalid endpoint to be rejected")
	}
}
