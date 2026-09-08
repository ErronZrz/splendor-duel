package security

import (
	"net/http/httptest"
	"testing"
)

func TestOriginPolicy(t *testing.T) {
	tests := []struct {
		name, configured, origin, host string
		want                           bool
	}{
		{"same origin by default", "", "http://game.example", "game.example", true},
		{"same origin https by default", "", "https://game.example", "game.example", false},
		{"configured exact origin", "https://app.example, http://localhost:5173", "https://app.example", "api.example", true},
		{"configured origin rejects different port", "https://app.example", "https://app.example:443", "api.example", false},
		{"configured origin rejects unlisted origin", "https://app.example", "https://evil.example", "api.example", false},
		{"no Origin non browser client", "https://app.example", "", "api.example", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "http://"+tc.host+"/", nil)
			r.Host = tc.host
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if got := NewOriginPolicy(tc.configured).Allows(r); got != tc.want {
				t.Fatalf("Allows() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestInvalidConfiguredOriginsAreNotWildcards(t *testing.T) {
	r := httptest.NewRequest("GET", "http://api.example/", nil)
	r.Host = "api.example"
	r.Header.Set("Origin", "https://evil.example")
	if NewOriginPolicy("*,https://app.example/path").Allows(r) {
		t.Fatal("invalid configured origins must not permit an arbitrary origin")
	}
}

func TestApplyCORSOnlyReflectsAllowedBrowserOrigins(t *testing.T) {
	policy := NewOriginPolicy("https://app.example")
	allowed := httptest.NewRequest("OPTIONS", "http://api.example/api/rooms", nil)
	allowed.Header.Set("Origin", "https://app.example")
	writer := httptest.NewRecorder()
	if !policy.ApplyCORS(writer, allowed) || writer.Header().Get("Access-Control-Allow-Origin") != "https://app.example" {
		t.Fatal("allowed origin was not reflected exactly")
	}

	denied := httptest.NewRequest("OPTIONS", "http://api.example/api/rooms", nil)
	denied.Header.Set("Origin", "https://evil.example")
	writer = httptest.NewRecorder()
	if policy.ApplyCORS(writer, denied) || writer.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("denied origin received CORS headers")
	}
}
