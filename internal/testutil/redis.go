package testutil

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofrs/flock"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

var loadEnvOnce sync.Once

func loadDotEnv() {
	loadEnvOnce.Do(func() {
		_ = godotenv.Overload()
	})
}

// redisAddr mirrors cmd/main defaultRedisAddr: unset → local Redis.
func redisAddr() string {
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		return "127.0.0.1:6379"
	}
	return addr
}

func isRedisURL(addr string) bool {
	return strings.Contains(addr, "://")
}

// acquireRedisIntegrationLock serializes Redis integration tests across packages (`go test ./...`
// runs multiple packages in parallel). Shared Redis (local DB 1 or Upstash) would otherwise race on
// FlushDB / lobby:* cleanup.
func acquireRedisIntegrationLock(tb testing.TB) {
	tb.Helper()
	path := filepath.Join(os.TempDir(), "dango-redis-integration-tests.lock")
	fl := flock.New(path)
	if err := fl.Lock(); err != nil {
		tb.Fatalf("redis integration lock: %v", err)
	}
	tb.Cleanup(func() {
		_ = fl.Unlock()
	})
}

// RedisClientForTests returns a client using REDIS_ADDR / REDIS_PASSWORD (same rules as the server).
// Plain TCP addresses use logical DB 1 so local dev DB 0 stays untouched.
// TLS URLs (e.g. Upstash rediss://) use the URL options only (typically DB 0).
func RedisClientForTests(tb testing.TB) *redis.Client {
	tb.Helper()
	acquireRedisIntegrationLock(tb)
	loadDotEnv()

	addr := redisAddr()
	var rdb *redis.Client
	if isRedisURL(addr) {
		opt, err := redis.ParseURL(addr)
		if err != nil {
			tb.Fatalf("parse REDIS_ADDR: %v", err)
		}
		rdb = redis.NewClient(opt)
	} else {
		rdb = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
			DB:       1,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		tb.Skipf("redis unavailable: %v — start local Redis, or set REDIS_ADDR (e.g. Upstash rediss://...)", err)
	}
	return rdb
}

// ResetTestRedis clears data used by integration tests. Local TCP: FlushDB on the test DB.
// Remote URL (Upstash): deletes keys matching lobby:* only so a shared instance is not fully wiped.
func ResetTestRedis(tb testing.TB, rdb *redis.Client) {
	tb.Helper()
	ctx := context.Background()
	addr := redisAddr()

	if !isRedisURL(addr) {
		if err := rdb.FlushDB(ctx).Err(); err != nil {
			tb.Fatalf("FlushDB: %v", err)
		}
		return
	}

	iter := rdb.Scan(ctx, 0, "lobby:*", 0).Iterator()
	for iter.Next(ctx) {
		if err := rdb.Del(ctx, iter.Val()).Err(); err != nil {
			tb.Fatalf("Del %q: %v", iter.Val(), err)
		}
	}
	if err := iter.Err(); err != nil {
		tb.Fatalf("scan lobby:*: %v", err)
	}
}
