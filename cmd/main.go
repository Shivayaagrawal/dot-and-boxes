package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	_ "net/http/pprof"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"

	"dango/internal/auth"
	"dango/internal/chat"
	"dango/internal/game"
	"dango/internal/infra"
	"dango/internal/lobby"
	"dango/internal/metrics"
	"dango/internal/stats"
	"dango/internal/user"
	"dango/internal/websocket"
)

type Config struct {
	DatabaseURL   string
	DBName        string
	DBPass        string
	DBUser        string
	DBType        string
	DBHost        string
	DBPort        string
	Port          string
	RedisPassword string
	RedisAddr     string
	ClientOrigin     string
	CORSAllowOrigins []string
}

type App struct {
	echo    *echo.Echo
	db      *pgxpool.Pool
	redis   *redis.Client
	logger  *slog.Logger
	metrics *metrics.MetricsCollector
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	// Overload applies every key from .env on top of the process environment (unlike Load, which
	// skips keys already set). That avoids stale DATABASE_URL / DATABASEHOST from an old shell.
	if err := godotenv.Overload(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env: %w", err)
	}

	cfg := loadConfig()

	// Setup logger
	logger := setupLogger()
	slog.SetDefault(logger)

	// Setup database
	db, err := setupDatabase(cfg)
	if err != nil {
		return fmt.Errorf("database setup failed: %w", err)
	}
	defer db.Close()

	// Setup Redis
	rdb, err := setupRedis(cfg)
	if err != nil {
		return fmt.Errorf("redis setup failed: %w", err)
	}

	// Create app
	app := &App{
		echo:   echo.New(),
		db:     db,
		redis:  rdb,
		logger: logger,
	}

	// Setup middleware
	app.setupMiddleware(cfg, logger)

	// Initialize services and routes
	if err := app.setupServices(cfg); err != nil {
		return fmt.Errorf("service setup failed: %w", err)
	}

	// Start pprof server
	if os.Getenv("LOG_LEVEL") == "debug" {
		slog.Info("Debug mode enabled, starting pprof")
		go startPprofServer()
	}

	// Start server
	slog.Info("Starting server", "port", cfg.Port)
	return app.echo.Start(fmt.Sprintf("0.0.0.0:%s", cfg.Port))
}

func parseCORSAllowOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CLIENT_ORIGIN"))
	if raw == "" {
		return []string{"http://localhost:5173"}
	}
	var out []string
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:5173"}
	}
	return out
}

func loadConfig() *Config {
	corsOrigins := parseCORSAllowOrigins()
	clientOrigin := corsOrigins[0]

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8484"
	}

	return &Config{
		DatabaseURL:      strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DBName:           os.Getenv("POSTGRES_DB"),
		DBPass:           os.Getenv("DATABASEPASSWORD"),
		DBUser:           os.Getenv("DATABASEUSER"),
		DBType:           os.Getenv("DATABASETYPE"),
		DBHost:           os.Getenv("DATABASEHOST"),
		DBPort:           os.Getenv("DATABASEPORT"),
		Port:             httpPort,
		RedisPassword:    os.Getenv("REDIS_PASSWORD"),
		RedisAddr:        defaultRedisAddr(os.Getenv("REDIS_ADDR")),
		ClientOrigin:     clientOrigin,
		CORSAllowOrigins: corsOrigins,
	}
}

func setupLogger() *slog.Logger {
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		logLevel = slog.LevelDebug
	}

	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	}))
}

// databaseConnString builds a libpq connection string for pgx. If DATABASE_URL is set on cfg,
// it is used (optional DATABASE_SSLMODE applies only when the URL has no sslmode query key).
func databaseConnString(cfg *Config) (connStr, logHost, logDB string, err error) {
	if cfg.DatabaseURL != "" {
		connStr = cfg.DatabaseURL
		if sslMode := strings.TrimSpace(os.Getenv("DATABASE_SSLMODE")); sslMode != "" {
			u, perr := url.Parse(connStr)
			if perr != nil {
				return "", "", "", fmt.Errorf("parse DATABASE_URL: %w", perr)
			}
			q := u.Query()
			if q.Get("sslmode") == "" {
				q.Set("sslmode", sslMode)
				u.RawQuery = q.Encode()
				connStr = u.String()
			}
		}
		u, perr := url.Parse(connStr)
		if perr != nil {
			return "", "", "", fmt.Errorf("parse DATABASE_URL: %w", perr)
		}
		return connStr, u.Hostname(), strings.TrimPrefix(u.Path, "/"), nil
	}

	sslMode := strings.TrimSpace(os.Getenv("DATABASE_SSLMODE"))
	if sslMode == "" {
		sslMode = "disable"
	}

	if cfg.DBHost == "" {
		return "", "", "", fmt.Errorf("database: set DATABASE_URL or DATABASEHOST and related vars")
	}

	hostport := cfg.DBHost
	if _, perr := netip.ParseAddr(cfg.DBHost); perr == nil {
		hostport = net.JoinHostPort(cfg.DBHost, cfg.DBPort)
	} else if cfg.DBPort != "" {
		hostport = net.JoinHostPort(cfg.DBHost, cfg.DBPort)
	}

	dbType := cfg.DBType
	if dbType == "" {
		dbType = "postgres"
	}

	u := &url.URL{
		Scheme: dbType,
		User:   url.UserPassword(cfg.DBUser, cfg.DBPass),
		Host:   hostport,
		Path:   "/" + strings.TrimPrefix(cfg.DBName, "/"),
	}
	q := u.Query()
	q.Set("sslmode", sslMode)
	u.RawQuery = q.Encode()
	return u.String(), cfg.DBHost, cfg.DBName, nil
}

func setupDatabase(cfg *Config) (*pgxpool.Pool, error) {
	connStr, logHost, logDB, err := databaseConnString(cfg)
	if err != nil {
		return nil, err
	}

	slog.Info("Connecting to database", "host", logHost, "database", logDB)

	db, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(context.Background()); err != nil {
		return nil, err
	}

	return db, nil
}

// defaultRedisAddr returns addr trimmed, or 127.0.0.1:6379 when unset (local dev).
// In Docker Compose, set REDIS_ADDR=redis:6379 (see compose.yaml environment).
func defaultRedisAddr(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return "127.0.0.1:6379"
	}
	return addr
}

func setupRedis(cfg *Config) (*redis.Client, error) {
	addr := cfg.RedisAddr
	logAddr := addr
	var rdb *redis.Client

	if strings.Contains(addr, "://") {
		opt, err := redis.ParseURL(addr)
		if err != nil {
			return nil, fmt.Errorf("parse REDIS_ADDR: %w", err)
		}
		rdb = redis.NewClient(opt)
		if u, err := url.Parse(addr); err == nil {
			logAddr = u.Redacted()
		}
	} else {
		rdb = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: cfg.RedisPassword,
			DB:       0,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis (%s): %w", logAddr, err)
	}
	slog.Info("Redis ready", "addr", logAddr)
	return rdb, nil
}

func (app *App) setupMiddleware(cfg *Config, logger *slog.Logger) {
	// Request logging
	app.echo.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogStatus:   true,
		LogURI:      true,
		LogError:    true,
		HandleError: true,
		LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {
			if v.Error == nil {
				logger.LogAttrs(context.Background(), slog.LevelInfo, "REQUEST",
					slog.String("uri", v.URI),
					slog.Int("status", v.Status),
				)
			} else {
				logger.LogAttrs(context.Background(), slog.LevelError, "REQUEST_ERROR",
					slog.String("uri", v.URI),
					slog.Int("status", v.Status),
					slog.String("err", v.Error.Error()),
				)
			}
			return nil
		},
	}))

	app.echo.Use(middleware.SecureWithConfig(middleware.SecureConfig{
		XSSProtection:         "1; mode=block",
		ContentTypeNosniff:    "nosniff",
		XFrameOptions:         "DENY",
		HSTSMaxAge:            300,
		HSTSExcludeSubdomains: false,
		HSTSPreloadEnabled:    false,
		ContentSecurityPolicy: "default-src 'self'; script-src 'self' https://analytics.ahrefs.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://analytics.ahrefs.com https://cloudflareinsights.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'",
		CSPReportOnly:         false,
		ReferrerPolicy:        "strict-origin-when-cross-origin",
	}))
	app.echo.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     cfg.CORSAllowOrigins,
		AllowMethods:     []string{echo.GET, echo.POST, echo.PUT, echo.DELETE, echo.OPTIONS},
		AllowHeaders:     []string{echo.HeaderContentType, echo.HeaderXCSRFToken, echo.HeaderAuthorization},
		ExposeHeaders:    []string{echo.HeaderXCSRFToken},
		AllowCredentials: true,
		MaxAge:           3600,
	}))

	// CSRF protection — Secure + SameSite=None only works over HTTPS; plain HTTP (local Docker) needs lax cookies
	csrfSecure := strings.HasPrefix(cfg.ClientOrigin, "https://")
	csrfSameSite := http.SameSiteLaxMode
	if csrfSecure {
		csrfSameSite = http.SameSiteNoneMode
	}
	app.echo.Use(middleware.CSRFWithConfig(middleware.CSRFConfig{
		TokenLookup:    "header:" + echo.HeaderXCSRFToken + ",form:_csrf",
		CookieName:     "_csrf",
		CookiePath:     "/",
		CookieSecure:   csrfSecure,
		CookieSameSite: csrfSameSite,
		CookieHTTPOnly: false,
	}))
}

func (app *App) setupServices(cfg *Config) error {
	// Initialize event bus
	eventBus := infra.NewRedisEventBus(app.redis)

	app.metrics = metrics.NewMetricsCollector(context.Background(), eventBus)
	// Initialize repositories
	userRepo := user.NewPgUserRepository(app.db)
	chatRepo := chat.NewPgChatRepository(app.db)
	gameRepo := game.NewPgGameRepository(app.db)
	lobbyRepo := infra.NewRedisLobbyRepository(app.redis)

	// Initialize services
	userService := user.NewUserService(userRepo)
	loginService := auth.NewLoginService(userRepo)
	chatService := chat.NewChatService(chatRepo, app.redis)
	botService := game.NewBotService(eventBus)
	timerService := game.NewGameTimerService(eventBus)
	gameService := game.NewGameService(gameRepo, eventBus, botService, timerService)
	lobbyService := lobby.NewLobbyService(lobbyRepo, eventBus)

	// Wire timer forfeit callback (avoids circular dependency)
	timerService.SetForfeitFunc(func(ctx context.Context, gameID, playerID int) error {
		_, err := gameService.ForfeitGame(ctx, gameID, playerID)
		return err
	})
	timerService.SetPassTurnFunc(func(ctx context.Context, gameID int) error {
		_, err := gameService.PassTurnOnTimeout(ctx, gameID)
		return err
	})

	// Start listening for connect/disconnect events for timer
	go timerService.ListenForConnectionEvents()

	// Initialize stats
	statsRepo := stats.NewPgStatsRepository(app.db)
	statsService := stats.NewStatsService(statsRepo)
	statsHandler := stats.NewStatsHandler(statsService)

	// Initialize handlers
	userHandler := user.NewUserHandler(userService)
	loginHandler := auth.NewLoginHandler(loginService, userService)
	chatHandler := chat.NewChatHandler(chatService)

	// Initialize WebSocket manager
	manager := websocket.NewManager(eventBus)
	gameHandler := game.NewGameHandler(gameService, timerService, manager)
	lobbyHandler := lobby.NewLobbyHandler(lobbyService, manager)

	// Start chat persistence worker (subscribes to EventBus independently)
	chatService.StartPersistenceWorker(eventBus)

	go manager.Run()

	// Setup routes
	app.setupRoutes(userHandler, loginHandler, chatHandler, gameHandler, lobbyHandler, statsHandler, manager)

	return nil
}

// newAuthRateLimiter creates rate limiting middleware for auth endpoints.
// rateInterval is the time between allowed requests; burst is the max burst size.
func newAuthRateLimiter(rateInterval time.Duration, burst int) echo.MiddlewareFunc {
	store := middleware.NewRateLimiterMemoryStoreWithConfig(
		middleware.RateLimiterMemoryStoreConfig{
			Rate:      rate.Every(rateInterval),
			Burst:     burst,
			ExpiresIn: 3 * time.Minute,
		},
	)
	return middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Store: store,
		IdentifierExtractor: func(ctx echo.Context) (string, error) {
			return ctx.RealIP(), nil
		},
		DenyHandler: func(context echo.Context, identifier string, err error) error {
			return context.JSON(http.StatusTooManyRequests, map[string]string{
				"message": "too many requests, please try again later",
			})
		},
	})
}

func (app *App) setupRoutes(
	userHandler *user.UserHandler,
	loginHandler *auth.LoginHandler,
	chatHandler *chat.ChatHandler,
	gameHandler *game.GameHandler,
	lobbyHandler *lobby.LobbyHandler,
	statsHandler *stats.StatsHandler,
	manager *websocket.Manager,
) {
	public := app.echo.Group("/api/v1")
	public.POST("/guest", loginHandler.GuestLogin, newAuthRateLimiter(6*time.Second, 5))

	public.GET("/stats/leaderboard", statsHandler.GetLeaderboard)

	public.GET("/ws", manager.ServeWs)

	public.GET("/users/:userId", userHandler.FindByID)

	public.GET("/lobbies", lobbyHandler.GetAllLobbies)
	public.POST("/lobbies", lobbyHandler.CreateLobby, newAuthRateLimiter(100*time.Millisecond, 10))
	public.POST("/lobbies/:lobbyId/join", lobbyHandler.JoinLobby)
	public.GET("/lobbies/:lobbyId", lobbyHandler.GetLobby)
	public.POST("/lobbies/:lobbyId/ready", lobbyHandler.ToggleReady)
	public.POST("/lobbies/:lobbyId/leave", lobbyHandler.LeaveLobby)
	public.DELETE("/lobbies/:lobbyId", lobbyHandler.DeleteLobby)

	public.POST("/logout", loginHandler.Logout)

	public.POST("/games", gameHandler.CreateGame)
	public.GET("/games/history", gameHandler.GetGameHistory)
	public.GET("/games/:gameId/state", gameHandler.GetGameState)
	public.POST("/games/:gameId/move", gameHandler.MakeMove, newAuthRateLimiter(100*time.Millisecond, 10))
	public.POST("/games/:gameId/forfeit", gameHandler.ForfeitGame, newAuthRateLimiter(100*time.Millisecond, 10))
	public.POST("/games/create-bot-game", gameHandler.CreateBotGame, newAuthRateLimiter(100*time.Millisecond, 10))
	public.GET("/games/:gameId/timer", gameHandler.GetTimerState)
	public.GET("/games/:gameId/events", gameHandler.GetGameEvents)

	chatRateLimiter := newAuthRateLimiter(2*time.Second, 10)
	public.GET("/chat", chatHandler.GetGlobalMessages, chatRateLimiter)
	public.GET("/games/:gameId/chat", chatHandler.GetAllGameMessage, chatRateLimiter)

	public.GET("/stats/users/:userId", statsHandler.GetUserStats)

}

func startPprofServer() {
	slog.Info("pprof server listening", "port", 6060)
	if err := http.ListenAndServe("127.0.0.1:6060", nil); err != nil {
		slog.Error("pprof server failed", "error", err)
	}
}

func (app *App) handleMetrics(c echo.Context) error {
	snapshot := app.metrics.GetMetrics().GetSnapshot()
	return c.JSON(http.StatusOK, snapshot)
}
