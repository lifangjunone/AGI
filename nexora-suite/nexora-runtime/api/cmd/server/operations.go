package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

type taskEvent struct {
	Type       string          `json:"type"`
	Data       json.RawMessage `json:"data"`
	OccurredAt time.Time       `json:"occurred_at"`
}

func (a *app) getProfile(w http.ResponseWriter, r *http.Request, c claims) {
	a.ensureNative(c.TenantID)
	a.mu.RLock()
	item, ok := a.profileByID(r.PathValue("id"), c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 404, "not_found", "Runtime profile not found")
		return
	}
	write(w, 200, item)
}

func (a *app) getTask(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, item := range a.tasks {
		if item.ID == r.PathValue("id") && item.TenantID == c.TenantID {
			write(w, 200, item)
			return
		}
	}
	fail(w, 404, "not_found", "Task not found")
}

func (a *app) cancelTask(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i, item := range a.tasks {
		if item.ID != r.PathValue("id") || item.TenantID != c.TenantID {
			continue
		}
		cancel, ok := a.activeTasks[c.TenantID+":"+item.ID]
		if !ok || item.Status != "running" {
			fail(w, 409, "task_not_running", "Task cannot be cancelled in its current state")
			return
		}
		cancel()
		a.tasks[i].Status = "cancelled"
		a.tasks[i].FinishedAt = time.Now().UTC()
		a.tasks[i].Error = "Cancelled by user"
		a.persistLocked()
		write(w, 200, a.tasks[i])
		return
	}
	fail(w, 404, "not_found", "Task not found")
}

func (a *app) recordTaskEvent(tenantID, taskID, event, data string) {
	if !json.Valid([]byte(data)) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for i, item := range a.tasks {
		if item.ID == taskID && item.TenantID == tenantID {
			// Bound retained payload size. A complete trace store replaces this
			// development JSON state backend in the next migration.
			if len(item.Events) < 1000 && len(data) <= 64<<10 {
				a.tasks[i].Events = append(item.Events, taskEvent{Type: event, Data: json.RawMessage(data), OccurredAt: time.Now().UTC()})
			}
			return
		}
	}
}

func (a *app) listDeployments(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := []deploymentRecord{}
	for key, item := range a.deployments {
		if strings.HasSuffix(key, ":"+c.TenantID) {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	write(w, 200, map[string]any{"items": items, "total": len(items)})
}
