package cookies

import (
	"net/http"
	"os"
	"strings"
)

// SessionAttrs matches CSRF behavior in cmd/main.go: HTTPS gets Secure + SameSite=None; HTTP uses Lax.
func SessionAttrs() (secure bool, sameSite http.SameSite) {
	origin := os.Getenv("CLIENT_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	if strings.HasPrefix(origin, "https://") {
		return true, http.SameSiteNoneMode
	}
	return false, http.SameSiteLaxMode
}
