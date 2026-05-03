package httpsession

import (
	"net/http"
	"strings"

	"dango/internal/auth/token"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

// SessionJWT parses and validates the DnB-Session cookie JWT (same signing key as login).
func SessionJWT(c echo.Context) (*jwt.Token, error) {
	ck, err := c.Cookie("DnB-Session")
	if err != nil || ck.Value == "" {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "missing session")
	}
	tok, err := token.ParseSession(ck.Value)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired session")
	}
	if !tok.Valid {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "invalid session")
	}
	return tok, nil
}

// SessionJWTOptional returns the session JWT when the cookie is present and valid; otherwise nil.
func SessionJWTOptional(c echo.Context) *jwt.Token {
	ck, err := c.Cookie("DnB-Session")
	if err != nil || ck.Value == "" {
		return nil
	}
	tok, err := token.ParseSession(ck.Value)
	if err != nil || !tok.Valid {
		return nil
	}
	return tok
}

// SessionJWTForWebSocket validates the session from the DnB-Session cookie or from the `token`
// query parameter (same JWT). The query path supports browsers that connect WebSocket to a
// different host than the page (e.g. static frontend on Vercel, API on Render) where cookies
// are not sent cross-origin.
func SessionJWTForWebSocket(c echo.Context) (*jwt.Token, error) {
	if ck, err := c.Cookie("DnB-Session"); err == nil && ck.Value != "" {
		tok, err := token.ParseSession(ck.Value)
		if err == nil && tok.Valid {
			return tok, nil
		}
	}
	q := strings.TrimSpace(c.QueryParam("token"))
	if q == "" {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "missing session")
	}
	tok, err := token.ParseSession(q)
	if err != nil || !tok.Valid {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired session")
	}
	return tok, nil
}
