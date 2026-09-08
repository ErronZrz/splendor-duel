// Package security contains small, deployment-facing transport boundaries.
package security

import (
	"net/http"
	"net/url"
	"strings"
)

// AllowedOriginsEnv is a comma-separated list of browser Origins allowed to
// use cross-origin HTTP and WebSocket requests. Each entry must be an absolute
// http(s) origin without a path, query, fragment, or user info.
const AllowedOriginsEnv = "SPLENDOR_ALLOWED_ORIGINS"

// OriginPolicy permits exact configured origins. With no configured origins it
// permits only the request's own http(s) origin. Requests without Origin are
// non-browser requests and remain permitted.
type OriginPolicy struct {
	allowed map[string]struct{}
}

func NewOriginPolicy(configured string) OriginPolicy {
	allowed := make(map[string]struct{})
	for _, item := range strings.Split(configured, ",") {
		if origin, ok := normalizeOrigin(strings.TrimSpace(item)); ok {
			allowed[origin] = struct{}{}
		}
	}
	return OriginPolicy{allowed: allowed}
}

func normalizeOrigin(value string) (string, bool) {
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return "", false
	}
	return u.Scheme + "://" + u.Host, true
}

func (p OriginPolicy) Allows(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if _, ok := p.allowed[origin]; ok {
		return true
	}
	if len(p.allowed) != 0 {
		return false
	}
	return origin == requestOrigin(r)
}

func (p OriginPolicy) AllowedOrigin(r *http.Request) string {
	if p.Allows(r) && r.Header.Get("Origin") != "" {
		return r.Header.Get("Origin")
	}
	return ""
}

// ApplyCORS adds CORS response headers for an allowed browser request and
// reports whether the request is permitted. It never emits a wildcard origin.
func (p OriginPolicy) ApplyCORS(w http.ResponseWriter, r *http.Request) bool {
	if !p.Allows(r) {
		return false
	}
	if origin := p.AllowedOrigin(r); origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
	return true
}

func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}
