package main

import (
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	health(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 {
		t.Fatalf("got %d", w.Code)
	}
}
func TestContains(t *testing.T) {
	if !contains([]string{"a", "b"}, "b") || contains([]string{"a"}, "c") {
		t.Fatal("contains returned incorrect result")
	}
}
