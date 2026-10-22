package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type app struct {
	mu            sync.RWMutex
	secret        []byte
	products      []string
	users         map[string]user
	organizations map[string]organization
	roles         map[string]role
	audits        []audit
	dataFile      string
}

type user struct {
	ID             string    `json:"id"`
	Email          string    `json:"email"`
	Password       string    `json:"-"`
	TenantID       string    `json:"tenant_id"`
	Name           string    `json:"name"`
	Roles          []string  `json:"roles"`
	OrganizationID string    `json:"organization_id"`
	Status         string    `json:"status"`
	Locale         string    `json:"locale"`
	CreatedAt      time.Time `json:"created_at"`
	LastActiveAt   time.Time `json:"last_active_at,omitempty"`
}

type organization struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ParentID    string    `json:"parent_id,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type role struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Permissions []string  `json:"permissions"`
	System      bool      `json:"system"`
	CreatedAt   time.Time `json:"created_at"`
}

type persistedState struct {
	Users         map[string]user         `json:"users"`
	Organizations map[string]organization `json:"organizations"`
	Roles         map[string]role         `json:"roles"`
	Audits        []audit                 `json:"audits"`
}

type claims struct {
	Sub      string   `json:"sub"`
	Email    string   `json:"email"`
	TenantID string   `json:"tenant_id"`
	Roles    []string `json:"roles"`
	Products []string `json:"products"`
	Exp      int64    `json:"exp"`
}

type audit struct {
	ID         string         `json:"id"`
	TenantID   string         `json:"tenant_id"`
	ActorID    string         `json:"actor_id"`
	Action     string         `json:"action"`
	Resource   string         `json:"resource"`
	OccurredAt time.Time      `json:"occurred_at"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

func main() {
	secret := env("NEXORA_JWT_SECRET", "nexora-development-secret-change-me")
	adminPassword := env("NEXORA_ADMIN_PASSWORD", "Nexora123!")
	a := newApp(secret, adminPassword, env("NEXORA_DATA_FILE", ""))
	mux := http.NewServeMux()
	a.routes(mux)
	addr := env("ADDR", ":8080")
	log.Printf("Nexora Core API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, cors(requestID(mux))))
}

func newApp(secret, adminPassword, dataFile string) *app {
	now := time.Now().UTC()
	a := &app{
		secret:   []byte(secret),
		products: enabledProducts(env("NEXORA_PRODUCTS", "studio,control,maas")),
		dataFile: dataFile,
		users: map[string]user{
			"admin@nexora.local": {ID: "usr_admin", Email: "admin@nexora.local", Password: adminPassword, TenantID: "tenant_nexora", Name: "Nexora Admin", Roles: []string{"owner"}, OrganizationID: "org_platform", Status: "active", Locale: "zh-CN", CreatedAt: now, LastActiveAt: now},
		},
		organizations: map[string]organization{
			"org_platform": {ID: "org_platform", TenantID: "tenant_nexora", Name: "平台工程部", Description: "负责 Nexora 平台建设与运营", CreatedAt: now},
			"org_ai":       {ID: "org_ai", TenantID: "tenant_nexora", Name: "AI 应用团队", Description: "负责企业智能体设计与交付", CreatedAt: now},
		},
		roles: map[string]role{
			"owner":     {ID: "owner", TenantID: "tenant_nexora", Name: "Owner", Description: "租户所有者，拥有全部管理权限", Permissions: permissionCatalog(), System: true, CreatedAt: now},
			"admin":     {ID: "admin", TenantID: "tenant_nexora", Name: "Administrator", Description: "管理成员、角色和产品配置", Permissions: []string{"organization.read", "organization.write", "member.read", "member.write", "role.read", "role.write", "audit.read", "product.access"}, System: true, CreatedAt: now},
			"developer": {ID: "developer", TenantID: "tenant_nexora", Name: "Developer", Description: "开发、调试和发布 Agent", Permissions: []string{"organization.read", "member.read", "role.read", "product.access", "agent.build", "agent.publish"}, System: true, CreatedAt: now},
			"auditor":   {ID: "auditor", TenantID: "tenant_nexora", Name: "Auditor", Description: "只读查看治理配置与审计事件", Permissions: []string{"organization.read", "member.read", "role.read", "audit.read", "product.access"}, System: true, CreatedAt: now},
		},
	}
	if err := a.load(); err != nil {
		log.Printf("load core state: %v", err)
	}
	// The deployment password remains authoritative so persisted demo state cannot lock out the operator.
	admin := a.users["admin@nexora.local"]
	admin.Password = adminPassword
	a.users["admin@nexora.local"] = admin
	return a
}

func (a *app) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /.well-known/openid-configuration", a.discovery)
	mux.HandleFunc("POST /api/v1/auth/login", a.login)
	mux.HandleFunc("POST /api/v1/auth/refresh", a.withAuth(a.refresh))
	mux.HandleFunc("POST /api/v1/auth/introspect", a.introspect)
	mux.HandleFunc("GET /api/v1/me", a.withAuth(a.me))
	mux.HandleFunc("GET /api/v1/tenants/current", a.withAuth(a.tenant))
	mux.HandleFunc("GET /api/v1/products", a.withAuth(a.listProducts))
	mux.HandleFunc("GET /api/v1/audit-events", a.withAuth(a.listAudits))
	mux.HandleFunc("POST /api/v1/audit-events", a.withAuth(a.createAudit))
	mux.HandleFunc("GET /api/v1/organizations", a.withPermission("organization.read", a.listOrganizations))
	mux.HandleFunc("POST /api/v1/organizations", a.withPermission("organization.write", a.createOrganization))
	mux.HandleFunc("PATCH /api/v1/organizations/{id}", a.withPermission("organization.write", a.updateOrganization))
	mux.HandleFunc("DELETE /api/v1/organizations/{id}", a.withPermission("organization.write", a.deleteOrganization))
	mux.HandleFunc("GET /api/v1/members", a.withPermission("member.read", a.listMembers))
	mux.HandleFunc("POST /api/v1/members", a.withPermission("member.write", a.createMember))
	mux.HandleFunc("PATCH /api/v1/members/{id}", a.withPermission("member.write", a.updateMember))
	mux.HandleFunc("DELETE /api/v1/members/{id}", a.withPermission("member.write", a.deleteMember))
	mux.HandleFunc("GET /api/v1/roles", a.withPermission("role.read", a.listRoles))
	mux.HandleFunc("POST /api/v1/roles", a.withPermission("role.write", a.createRole))
	mux.HandleFunc("PATCH /api/v1/roles/{id}", a.withPermission("role.write", a.updateRole))
	mux.HandleFunc("DELETE /api/v1/roles/{id}", a.withPermission("role.write", a.deleteRole))
	mux.HandleFunc("GET /api/v1/permissions", a.withPermission("role.read", a.listPermissions))
}

func permissionCatalog() []string {
	return []string{"organization.read", "organization.write", "member.read", "member.write", "role.read", "role.write", "audit.read", "product.access", "agent.build", "agent.publish", "agent.govern", "model.manage", "model.invoke"}
}

func (a *app) hasPermission(c claims, permission string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, roleID := range c.Roles {
		if roleID == "owner" {
			return true
		}
		if value, ok := a.roles[roleID]; ok {
			for _, allowed := range value.Permissions {
				if allowed == permission {
					return true
				}
			}
		}
	}
	return false
}

func (a *app) withPermission(permission string, next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return a.withAuth(func(w http.ResponseWriter, r *http.Request, c claims) {
		if !a.hasPermission(c, permission) {
			errorJSON(w, http.StatusForbidden, "forbidden", "permission "+permission+" is required")
			return
		}
		next(w, r, c)
	})
}

func (a *app) listOrganizations(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]organization, 0)
	memberCounts := map[string]int{}
	for _, item := range a.users {
		if item.TenantID == c.TenantID {
			memberCounts[item.OrganizationID]++
		}
	}
	for _, item := range a.organizations {
		if item.TenantID == c.TenantID {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{"id": item.ID, "tenant_id": item.TenantID, "name": item.Name, "description": item.Description, "parent_id": item.ParentID, "created_at": item.CreatedAt, "member_count": memberCounts[item.ID]})
	}
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
}

func (a *app) createOrganization(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ParentID    string `json:"parent_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		errorJSON(w, 400, "validation_error", "organization name is required")
		return
	}
	item := organization{ID: id("org"), TenantID: c.TenantID, Name: in.Name, Description: strings.TrimSpace(in.Description), ParentID: in.ParentID, CreatedAt: time.Now().UTC()}
	a.mu.Lock()
	for _, existing := range a.organizations {
		if existing.TenantID == c.TenantID && strings.EqualFold(existing.Name, item.Name) {
			a.mu.Unlock()
			errorJSON(w, 409, "organization_exists", "an organization with this name already exists")
			return
		}
	}
	a.organizations[item.ID] = item
	a.auditLocked(c, "organization.created", "organization:"+item.ID, map[string]any{"name": item.Name})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 201, item)
}

func (a *app) updateOrganization(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ParentID    string `json:"parent_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	key := r.PathValue("id")
	a.mu.Lock()
	item, ok := a.organizations[key]
	if !ok || item.TenantID != c.TenantID {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "organization not found")
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	item.Description, item.ParentID = strings.TrimSpace(in.Description), in.ParentID
	a.organizations[key] = item
	a.auditLocked(c, "organization.updated", "organization:"+key, map[string]any{"name": item.Name})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 200, item)
}

func (a *app) deleteOrganization(w http.ResponseWriter, r *http.Request, c claims) {
	key := r.PathValue("id")
	a.mu.Lock()
	item, ok := a.organizations[key]
	if !ok || item.TenantID != c.TenantID {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "organization not found")
		return
	}
	for _, member := range a.users {
		if member.TenantID == c.TenantID && member.OrganizationID == key {
			a.mu.Unlock()
			errorJSON(w, 409, "organization_not_empty", "move or remove organization members first")
			return
		}
	}
	delete(a.organizations, key)
	a.auditLocked(c, "organization.deleted", "organization:"+key, map[string]any{"name": item.Name})
	a.persistLocked()
	a.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listMembers(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]user, 0)
	for _, item := range a.users {
		if item.TenantID == c.TenantID {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	writeJSON(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) createMember(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name           string   `json:"name"`
		Email          string   `json:"email"`
		OrganizationID string   `json:"organization_id"`
		Locale         string   `json:"locale"`
		Roles          []string `json:"roles"`
	}
	if !decode(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if strings.TrimSpace(in.Name) == "" || email == "" || !strings.Contains(email, "@") {
		errorJSON(w, 400, "validation_error", "valid name and email are required")
		return
	}
	if len(in.Roles) == 0 {
		in.Roles = []string{"developer"}
	}
	now := time.Now().UTC()
	item := user{ID: id("usr"), Email: email, TenantID: c.TenantID, Name: strings.TrimSpace(in.Name), Roles: in.Roles, OrganizationID: in.OrganizationID, Status: "invited", Locale: in.Locale, CreatedAt: now}
	if item.Locale == "" {
		item.Locale = "zh-CN"
	}
	a.mu.Lock()
	if _, exists := a.users[email]; exists {
		a.mu.Unlock()
		errorJSON(w, 409, "email_exists", "a member with this email already exists")
		return
	}
	if _, ok := a.organizations[item.OrganizationID]; !ok {
		a.mu.Unlock()
		errorJSON(w, 400, "invalid_organization", "organization does not exist")
		return
	}
	for _, roleID := range item.Roles {
		if _, ok := a.roles[roleID]; !ok {
			a.mu.Unlock()
			errorJSON(w, 400, "invalid_role", "role "+roleID+" does not exist")
			return
		}
	}
	a.users[email] = item
	a.auditLocked(c, "member.invited", "user:"+item.ID, map[string]any{"email": item.Email, "roles": item.Roles})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 201, item)
}

func (a *app) updateMember(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name           string   `json:"name"`
		OrganizationID string   `json:"organization_id"`
		Status         string   `json:"status"`
		Roles          []string `json:"roles"`
	}
	if !decode(w, r, &in) {
		return
	}
	key := r.PathValue("id")
	a.mu.Lock()
	var email string
	var item user
	for candidateEmail, candidate := range a.users {
		if candidate.ID == key && candidate.TenantID == c.TenantID {
			email, item = candidateEmail, candidate
			break
		}
	}
	if email == "" {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "member not found")
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	if in.OrganizationID != "" {
		if _, ok := a.organizations[in.OrganizationID]; !ok {
			a.mu.Unlock()
			errorJSON(w, 400, "invalid_organization", "organization does not exist")
			return
		}
		item.OrganizationID = in.OrganizationID
	}
	if len(in.Roles) > 0 {
		for _, roleID := range in.Roles {
			if _, ok := a.roles[roleID]; !ok {
				a.mu.Unlock()
				errorJSON(w, 400, "invalid_role", "role "+roleID+" does not exist")
				return
			}
		}
		item.Roles = in.Roles
	}
	if in.Status == "active" || in.Status == "suspended" || in.Status == "invited" {
		item.Status = in.Status
	}
	a.users[email] = item
	a.auditLocked(c, "member.updated", "user:"+item.ID, map[string]any{"email": item.Email, "roles": item.Roles, "status": item.Status})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 200, item)
}

func (a *app) deleteMember(w http.ResponseWriter, r *http.Request, c claims) {
	key := r.PathValue("id")
	if key == c.Sub {
		errorJSON(w, 409, "cannot_delete_self", "you cannot remove your own account")
		return
	}
	a.mu.Lock()
	var email string
	var item user
	for candidateEmail, candidate := range a.users {
		if candidate.ID == key && candidate.TenantID == c.TenantID {
			email, item = candidateEmail, candidate
			break
		}
	}
	if email == "" {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "member not found")
		return
	}
	delete(a.users, email)
	a.auditLocked(c, "member.removed", "user:"+item.ID, map[string]any{"email": item.Email})
	a.persistLocked()
	a.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listRoles(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	items := make([]role, 0)
	memberCounts := map[string]int{}
	for _, member := range a.users {
		if member.TenantID == c.TenantID {
			for _, roleID := range member.Roles {
				memberCounts[roleID]++
			}
		}
	}
	for _, item := range a.roles {
		if item.TenantID == c.TenantID {
			items = append(items, item)
		}
	}
	a.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{"id": item.ID, "tenant_id": item.TenantID, "name": item.Name, "description": item.Description, "permissions": item.Permissions, "system": item.System, "created_at": item.CreatedAt, "member_count": memberCounts[item.ID]})
	}
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
}

func (a *app) createRole(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		errorJSON(w, 400, "validation_error", "role name is required")
		return
	}
	item := role{ID: id("role"), TenantID: c.TenantID, Name: strings.TrimSpace(in.Name), Description: strings.TrimSpace(in.Description), Permissions: validPermissions(in.Permissions), CreatedAt: time.Now().UTC()}
	a.mu.Lock()
	for _, existing := range a.roles {
		if existing.TenantID == c.TenantID && strings.EqualFold(existing.Name, item.Name) {
			a.mu.Unlock()
			errorJSON(w, 409, "role_exists", "a role with this name already exists")
			return
		}
	}
	a.roles[item.ID] = item
	a.auditLocked(c, "role.created", "role:"+item.ID, map[string]any{"name": item.Name, "permissions": item.Permissions})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 201, item)
}

func (a *app) updateRole(w http.ResponseWriter, r *http.Request, c claims) {
	var in struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if !decode(w, r, &in) {
		return
	}
	key := r.PathValue("id")
	a.mu.Lock()
	item, ok := a.roles[key]
	if !ok || item.TenantID != c.TenantID {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "role not found")
		return
	}
	if item.ID == "owner" {
		a.mu.Unlock()
		errorJSON(w, 409, "immutable_role", "owner role cannot be modified")
		return
	}
	if strings.TrimSpace(in.Name) != "" {
		item.Name = strings.TrimSpace(in.Name)
	}
	item.Description, item.Permissions = strings.TrimSpace(in.Description), validPermissions(in.Permissions)
	a.roles[key] = item
	a.auditLocked(c, "role.updated", "role:"+key, map[string]any{"name": item.Name, "permissions": item.Permissions})
	a.persistLocked()
	a.mu.Unlock()
	writeJSON(w, 200, item)
}

func (a *app) deleteRole(w http.ResponseWriter, r *http.Request, c claims) {
	key := r.PathValue("id")
	a.mu.Lock()
	item, ok := a.roles[key]
	if !ok || item.TenantID != c.TenantID {
		a.mu.Unlock()
		errorJSON(w, 404, "not_found", "role not found")
		return
	}
	if item.System {
		a.mu.Unlock()
		errorJSON(w, 409, "system_role", "system roles cannot be deleted")
		return
	}
	for _, member := range a.users {
		for _, roleID := range member.Roles {
			if member.TenantID == c.TenantID && roleID == key {
				a.mu.Unlock()
				errorJSON(w, 409, "role_in_use", "remove this role from members first")
				return
			}
		}
	}
	delete(a.roles, key)
	a.auditLocked(c, "role.deleted", "role:"+key, map[string]any{"name": item.Name})
	a.persistLocked()
	a.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listPermissions(w http.ResponseWriter, _ *http.Request, _ claims) {
	writeJSON(w, 200, map[string]any{"items": permissionCatalog(), "total": len(permissionCatalog())})
}

func validPermissions(values []string) []string {
	allowed := map[string]bool{}
	for _, value := range permissionCatalog() {
		allowed[value] = true
	}
	result, seen := make([]string, 0), map[string]bool{}
	for _, value := range values {
		if allowed[value] && !seen[value] {
			result = append(result, value)
			seen[value] = true
		}
	}
	return result
}

func (a *app) auditLocked(c claims, action, resource string, metadata map[string]any) {
	a.audits = append(a.audits, audit{ID: id("aud"), TenantID: c.TenantID, ActorID: c.Sub, Action: action, Resource: resource, Metadata: metadata, OccurredAt: time.Now().UTC()})
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
	if state.Users != nil {
		a.users = state.Users
	}
	if state.Organizations != nil {
		a.organizations = state.Organizations
	}
	if state.Roles != nil {
		a.roles = state.Roles
	}
	a.audits = state.Audits
	return nil
}

func (a *app) persistLocked() {
	if a.dataFile == "" {
		return
	}
	state := persistedState{Users: a.users, Organizations: a.organizations, Roles: a.roles, Audits: a.audits}
	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		log.Printf("persist core state: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.dataFile), 0700); err != nil {
		log.Printf("persist core state: %v", err)
		return
	}
	temp := a.dataFile + ".tmp"
	if err := os.WriteFile(temp, raw, 0600); err != nil {
		log.Printf("persist core state: %v", err)
		return
	}
	if err := os.Rename(temp, a.dataFile); err != nil {
		log.Printf("persist core state: %v", err)
	}
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !decode(w, r, &in) {
		return
	}
	a.mu.RLock()
	u, ok := a.users[strings.ToLower(in.Email)]
	a.mu.RUnlock()
	if !ok || !hmac.Equal([]byte(u.Password), []byte(in.Password)) {
		errorJSON(w, http.StatusUnauthorized, "invalid_credentials", "email or password is invalid")
		return
	}
	c := claims{Sub: u.ID, Email: u.Email, TenantID: u.TenantID, Roles: u.Roles, Products: a.products, Exp: time.Now().Add(time.Hour).Unix()}
	token, err := a.sign(c)
	if err != nil {
		errorJSON(w, 500, "token_error", err.Error())
		return
	}
	a.appendAudit(audit{ID: id("aud"), TenantID: u.TenantID, ActorID: u.ID, Action: "auth.login", Resource: "session", OccurredAt: time.Now().UTC()})
	writeJSON(w, 200, map[string]any{"access_token": token, "token_type": "Bearer", "expires_in": 3600, "user": u, "products": a.products})
}

func (a *app) refresh(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	var current user
	found := false
	for _, item := range a.users {
		if item.ID == c.Sub && item.TenantID == c.TenantID && item.Status == "active" {
			current, found = item, true
			break
		}
	}
	products := append([]string(nil), a.products...)
	a.mu.RUnlock()
	if !found {
		errorJSON(w, http.StatusUnauthorized, "session_invalid", "the session user is no longer active")
		return
	}
	next := claims{Sub: current.ID, Email: current.Email, TenantID: current.TenantID, Roles: current.Roles, Products: products, Exp: time.Now().Add(time.Hour).Unix()}
	token, err := a.sign(next)
	if err != nil {
		errorJSON(w, 500, "token_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"access_token": token, "token_type": "Bearer", "expires_in": 3600, "products": products})
}

func (a *app) introspect(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	c, err := a.verify(in.Token)
	if err != nil {
		writeJSON(w, 200, map[string]any{"active": false})
		return
	}
	writeJSON(w, 200, map[string]any{"active": true, "sub": c.Sub, "email": c.Email, "tenant_id": c.TenantID, "roles": c.Roles, "products": c.Products, "exp": c.Exp})
}

func (a *app) me(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, u := range a.users {
		if u.ID == c.Sub {
			writeJSON(w, 200, u)
			return
		}
	}
	errorJSON(w, 404, "not_found", "user not found")
}

func (a *app) tenant(w http.ResponseWriter, _ *http.Request, c claims) {
	writeJSON(w, 200, map[string]any{"id": c.TenantID, "name": "Nexora Demo", "slug": "nexora", "products": c.Products, "locales": []string{"zh-CN", "en-US"}})
}

func (a *app) listProducts(w http.ResponseWriter, _ *http.Request, c claims) {
	urls := map[string]string{
		"studio":  env("STUDIO_PUBLIC_URL", "http://localhost:3001"),
		"control": env("CONTROL_PUBLIC_URL", "http://localhost:3002"),
		"maas":    env("MAAS_PUBLIC_URL", "http://localhost:3003"),
	}
	items := make([]map[string]any, 0, len(c.Products))
	for _, product := range c.Products {
		items = append(items, map[string]any{"id": product, "enabled": true, "url": urls[product]})
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": len(items)})
}

func (a *app) listAudits(w http.ResponseWriter, _ *http.Request, c claims) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	out := make([]audit, 0)
	for i := len(a.audits) - 1; i >= 0; i-- {
		if a.audits[i].TenantID == c.TenantID {
			out = append(out, a.audits[i])
		}
	}
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
}

func (a *app) createAudit(w http.ResponseWriter, r *http.Request, c claims) {
	var in audit
	if !decode(w, r, &in) {
		return
	}
	in.ID, in.TenantID, in.ActorID, in.OccurredAt = id("aud"), c.TenantID, c.Sub, time.Now().UTC()
	a.appendAudit(in)
	writeJSON(w, 201, in)
}

func (a *app) appendAudit(v audit) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.audits = append(a.audits, v)
}

func (a *app) discovery(w http.ResponseWriter, r *http.Request) {
	base := "http://" + r.Host
	writeJSON(w, 200, map[string]any{"issuer": base, "token_endpoint": base + "/api/v1/auth/login", "introspection_endpoint": base + "/api/v1/auth/introspect", "scopes_supported": []string{"openid", "profile", "email"}, "claims_supported": []string{"sub", "email", "tenant_id", "roles"}})
}

func (a *app) sign(c claims) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	raw, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(raw)
	unsigned := header + "." + payload
	mac := hmac.New(sha256.New, a.secret)
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (a *app) verify(token string) (claims, error) {
	var c claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return c, fmt.Errorf("malformed token")
	}
	mac := hmac.New(sha256.New, a.secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return c, fmt.Errorf("invalid signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(raw, &c) != nil || c.Exp <= time.Now().Unix() {
		return c, fmt.Errorf("expired or invalid token")
	}
	return c, nil
}

func (a *app) withAuth(next func(http.ResponseWriter, *http.Request, claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		c, err := a.verify(token)
		if err != nil {
			errorJSON(w, 401, "unauthorized", "valid bearer token required")
			return
		}
		next(w, r, c)
	}
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"status": "ok", "service": "nexora-core", "time": time.Now().UTC()})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
		errorJSON(w, 400, "invalid_json", err.Error())
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func errorJSON(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
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

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func id(prefix string) string {
	var b [10]byte
	_, _ = rand.Read(b[:])
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(b[:])
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func enabledProducts(value string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, 3)
	for _, item := range strings.Split(value, ",") {
		item = strings.ToLower(strings.TrimSpace(item))
		if (item == "studio" || item == "control" || item == "maas") && !seen[item] {
			result = append(result, item)
			seen[item] = true
		}
	}
	return result
}
