package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestTaskFinishIsTenantScopedAndCancellationIsTerminal(t *testing.T) {
	a := newApp("secret", "", "http://localhost:8094")
	a.tasks = []task{{ID: "same", TenantID: "a", Status: "running"}, {ID: "same", TenantID: "b", Status: "running"}}
	a.finishTask("a", "same", "completed", "")
	if a.tasks[1].Status != "running" {
		t.Fatal("finishing task modified another tenant")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a.activeTasks["b:same"] = cancel
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks/same/cancel", nil)
	req.SetPathValue("id", "same")
	res := httptest.NewRecorder()
	a.cancelTask(res, req, claims{TenantID: "b"})
	if res.Code != 200 || ctx.Err() == nil {
		t.Fatalf("cancellation failed: %d", res.Code)
	}
	a.finishTask("b", "same", "failed", "stream closed")
	if a.tasks[1].Status != "cancelled" {
		t.Fatal("cancelled state overwritten")
	}
}

func TestRestartMarksRunningTasksInterruptedAndPreservesEvents(t *testing.T) {
	path := filepath.Join(t.TempDir(), "runtime.json")
	a := newApp("secret", path, "http://localhost:8094")
	a.tasks = []task{{ID: "one", TenantID: "a", Status: "running"}}
	a.recordTaskEvent("a", "one", "delta", `{"content":"real answer"}`)
	a.persistLocked()
	reloaded := newApp("secret", path, "http://localhost:8094")
	if reloaded.tasks[0].Status != "interrupted" || len(reloaded.tasks[0].Events) != 1 {
		t.Fatal("restart did not recover state and events")
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks/one", nil)
	req.SetPathValue("id", "one")
	res := httptest.NewRecorder()
	reloaded.getTask(res, req, claims{TenantID: "b"})
	if res.Code != 404 {
		t.Fatal("task detail leaked across tenants")
	}
}

func TestLegacySharedDeploymentFailsClosed(t *testing.T) {
	a := newApp("secret", "", "http://localhost:8094")
	res := httptest.NewRecorder()
	a.deployProfile(res, httptest.NewRequest(http.MethodPost, "/", nil), claims{TenantID: "a"})
	if res.Code != 503 || len(a.deployments) != 0 {
		t.Fatal("unsafe deployment was allowed")
	}
}

func TestStreamPersistsEventsAndErrorCannotBecomeSuccess(t *testing.T) {
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("event: delta\ndata: {\"content\":\"answer\"}\n\nevent: error\ndata: {\"code\":\"failed\"}\n\nevent: done\ndata: {}\n\n"))
	}))
	defer worker.Close()
	a := newApp("secret", "", worker.URL)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks/stream", bytes.NewBufferString(`{"input":"test","model_route":"test","task_id":"one"}`))
	res := httptest.NewRecorder()
	a.streamTask(res, req, claims{TenantID: "a"})
	if res.Code != 200 || len(a.tasks) != 1 || a.tasks[0].Status != "failed" || len(a.tasks[0].Events) != 3 {
		t.Fatalf("invalid stream state: %d %#v", res.Code, a.tasks)
	}
}

func TestHealthHTTP200IsNotEnough(t *testing.T) {
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"degraded","protocol_version":"nexora-runtime-v1"}`))
	}))
	defer worker.Close()
	a := newApp("secret", "", worker.URL)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/runtime-profiles/nexora-native/test", nil)
	req.SetPathValue("id", "nexora-native")
	res := httptest.NewRecorder()
	a.testProfile(res, req, claims{TenantID: "a"})
	if res.Code != 502 {
		t.Fatalf("degraded Runtime accepted as healthy: %d", res.Code)
	}
}
