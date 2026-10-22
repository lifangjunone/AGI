package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	health(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestTokenRoundTrip(t *testing.T) {
	a := &app{secret: []byte("test-secret")}
	want := claims{Sub: "u1", TenantID: "t1", Exp: 4102444800}
	token, err := a.sign(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := a.verify(token)
	if err != nil || got.Sub != want.Sub || got.TenantID != want.TenantID {
		t.Fatalf("unexpected claims: %#v, %v", got, err)
	}
}

func TestEnabledProducts(t *testing.T) {
	got := enabledProducts(" studio,control,maas,studio,unknown ")
	if len(got) != 3 || got[0] != "studio" || got[1] != "control" || got[2] != "maas" {
		t.Fatalf("unexpected products: %#v", got)
	}
}

func TestRefreshAddsCurrentProductEntitlements(t *testing.T) {
	a := newApp("test-secret", "secret", "")
	a.products = []string{"studio", "control", "maas"}
	mux := http.NewServeMux()
	a.routes(mux)
	oldToken, err := a.sign(claims{
		Sub: "usr_admin", Email: "admin@nexora.local", TenantID: "tenant_nexora",
		Roles: []string{"owner"}, Products: []string{"studio", "control"}, Exp: 4102444800,
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
	request.Header.Set("Authorization", "Bearer "+oldToken)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("refresh failed: %d %s", response.Code, response.Body.String())
	}
	var body struct {
		AccessToken string   `json:"access_token"`
		Products    []string `json:"products"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &body)
	if len(body.Products) != 3 || body.Products[2] != "maas" {
		t.Fatalf("refresh did not add current entitlements: %#v", body.Products)
	}
	refreshed, err := a.verify(body.AccessToken)
	if err != nil || len(refreshed.Products) != 3 || refreshed.Products[2] != "maas" {
		t.Fatalf("refreshed token has stale entitlements: %#v, %v", refreshed.Products, err)
	}
}

func TestOrganizationMemberAndRoleAPIs(t *testing.T) {
	a := newApp("test-secret", "secret", "")
	mux := http.NewServeMux()
	a.routes(mux)
	handler := cors(requestID(mux))
	admin := claims{Sub: "usr_admin", Email: "admin@nexora.local", TenantID: "tenant_nexora", Roles: []string{"owner"}, Products: []string{"studio"}, Exp: 4102444800}
	token, err := a.sign(admin)
	if err != nil {
		t.Fatal(err)
	}

	call := func(method, path string, body any) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		request := httptest.NewRequest(method, path, bytes.NewReader(raw))
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	orgResponse := call(http.MethodPost, "/api/v1/organizations", map[string]any{"name": "安全治理部", "description": "治理企业 Agent"})
	if orgResponse.Code != http.StatusCreated {
		t.Fatalf("create organization: %d %s", orgResponse.Code, orgResponse.Body.String())
	}
	var org organization
	_ = json.Unmarshal(orgResponse.Body.Bytes(), &org)

	memberResponse := call(http.MethodPost, "/api/v1/members", map[string]any{
		"name": "Security Admin", "email": "security@nexora.local", "organization_id": org.ID, "roles": []string{"auditor"},
	})
	if memberResponse.Code != http.StatusCreated {
		t.Fatalf("create member: %d %s", memberResponse.Code, memberResponse.Body.String())
	}

	roleResponse := call(http.MethodPost, "/api/v1/roles", map[string]any{
		"name": "Agent Operator", "description": "Publishes agents", "permissions": []string{"product.access", "agent.publish", "not.allowed"},
	})
	if roleResponse.Code != http.StatusCreated {
		t.Fatalf("create role: %d %s", roleResponse.Code, roleResponse.Body.String())
	}
	var createdRole role
	_ = json.Unmarshal(roleResponse.Body.Bytes(), &createdRole)
	if len(createdRole.Permissions) != 2 {
		t.Fatalf("permissions were not filtered: %#v", createdRole.Permissions)
	}

	auditResponse := call(http.MethodGet, "/api/v1/audit-events", nil)
	if auditResponse.Code != http.StatusOK || !bytes.Contains(auditResponse.Body.Bytes(), []byte("member.invited")) {
		t.Fatalf("audit trail missing: %d %s", auditResponse.Code, auditResponse.Body.String())
	}
}

func TestPermissionDenied(t *testing.T) {
	a := newApp("test-secret", "secret", "")
	mux := http.NewServeMux()
	a.routes(mux)
	token, _ := a.sign(claims{Sub: "u1", TenantID: "tenant_nexora", Roles: []string{"auditor"}, Exp: 4102444800})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/members", bytes.NewBufferString(`{"name":"x"}`))
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}
