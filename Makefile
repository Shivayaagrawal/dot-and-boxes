.PHONY: web-dist docker-up docker-down

# Production static bundle (optional): use when serving web/dist behind nginx instead of Vite.
web-dist:
	cd web && npm install && npm run build

# Compose runs Vite in Docker against mounted ./web/src (see Dockerfile.dev + compose.yaml).
docker-up:
	docker compose --env-file .env up -d --build

docker-down:
	docker compose --env-file .env down
