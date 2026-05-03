package auth

import (
	"dango/internal/auth/token"
	dnbCookies "dango/internal/cookies"
	"dango/internal/httpsession"
	"dango/internal/user"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

type LoginHandler struct {
	loginService *LoginService
	userService  *user.UserService
	logger       *slog.Logger
}

func NewLoginHandler(loginService *LoginService, userService *user.UserService) *LoginHandler {
	return &LoginHandler{
		loginService: loginService,
		userService:  userService,
		logger:       slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}
}

func (h *LoginHandler) Login(c echo.Context) error {
	username := c.FormValue("username")
	password := c.FormValue("password")

	if username == "" || password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password are required")
	}
	if len(username) > 100 || len(password) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "input exceeds maximum length")
	}

	ctx := c.Request().Context()

	user, err := h.loginService.Login(ctx, username, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid username or password")
	}

	sessionToken, err := token.GenerateToken(user.UserID, user.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate session token")
	}

	cookie := new(http.Cookie)
	cookie.Name = "DnB-Session"
	cookie.Value = sessionToken
	cookie.HttpOnly = true
	cookie.Expires = time.Now().Add(24 * time.Hour)
	cookie.Path = "/"
	secure, sameSite := dnbCookies.SessionAttrs()
	cookie.Secure = secure
	cookie.SameSite = sameSite
	c.SetCookie(cookie)

	return c.JSON(http.StatusOK, user)
}
func (h *LoginHandler) GuestLogin(c echo.Context) error {
	ctx := c.Request().Context()

	var body struct {
		Username string `json:"username"`
	}
	if c.Request().ContentLength > 0 {
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
		}
	}

	guest, err := h.userService.CreateGuestUser(ctx, body.Username)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "username") || strings.Contains(msg, "taken") ||
			strings.Contains(msg, "between") || strings.Contains(msg, "letters") {
			return echo.NewHTTPError(http.StatusBadRequest, msg)
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not create guest: "+msg)
	}

	sessionToken, err := token.GenerateToken(guest.UserID, guest.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate session token")
	}

	cookie := new(http.Cookie)
	cookie.Name = "DnB-Session"
	cookie.Value = sessionToken
	cookie.HttpOnly = true
	cookie.Expires = time.Now().Add(24 * time.Hour)
	cookie.Path = "/"
	secure, sameSite := dnbCookies.SessionAttrs()
	cookie.Secure = secure
	cookie.SameSite = sameSite
	c.SetCookie(cookie)

	h.logger.Info("Guest user created", "userID", guest.UserID, "username", guest.Username)

	return c.JSON(http.StatusOK, guest)
}

// WsBridgeToken returns the current session JWT for WebSocket connections that target the API
// host directly (cross-origin). The browser cannot send HttpOnly cookies to another origin; the
// client passes this value as the `token` query parameter on /api/v1/ws. Requires a valid session.
func (h *LoginHandler) WsBridgeToken(c echo.Context) error {
	if _, err := httpsession.SessionJWT(c); err != nil {
		return err
	}
	ck, err := c.Cookie("DnB-Session")
	if err != nil || ck.Value == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing session")
	}
	return c.JSON(http.StatusOK, map[string]string{"token": ck.Value})
}

func (h *LoginHandler) Logout(c echo.Context) error {
	cookie := new(http.Cookie)
	cookie.Name = "DnB-Session"
	cookie.Value = ""
	cookie.Path = "/"
	cookie.HttpOnly = true
	cookie.MaxAge = -1 // Expire immediately
	secure, sameSite := dnbCookies.SessionAttrs()
	cookie.Secure = secure
	cookie.SameSite = sameSite

	c.SetCookie(cookie)

	return c.NoContent(http.StatusOK)
}
