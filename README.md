# DnBoxes (Dots and Boxes)

A full-stack, real-time implementation of the Dots and Boxes game. This project demonstrates backend game logic, real-time communication, and a modern frontend.

## Highlights

* Real-time multiplayer gameplay using WebSockets
* Server-authoritative game logic and move validation
* Interactive SVG-based UI in React
* Persistent game state and chat stored in a database
* Solo play against a bot

## Tech Stack

**Backend**
* Go (Echo framework)
* WebSockets for real-time gameplay and chat

**Frontend**
* React
* SVG-based board rendering
* Real-time updates via WebSockets

**Database**
* Postgres: persistent storage for users, game state, and chat history


**Infrastructure**
* Redis: in-memory Pub/Sub for events
* Docker: containerized environment
* Caddy: reverse proxy and HTTPS handling

## Setup & Run

> Prerequisites: Go (1.24+), Node.js (18+), npm

## Docker Setup (Recommended)

The **`frontend`** service runs **Vite inside Docker** with **`./web`** bind-mounted at `/app`. **http://localhost** (via Caddy → Vite on port **5173**) serves your **`web/src`** tree with hot reload—no `npm run build` step is required while you iterate.

The first start runs **`npm ci`** into a named Docker volume (`frontend_node_modules`) when `package-lock.json` changes; that can take a minute.

**Start the stack:**

```bash
# from project root
make docker-up
```

**Or manually:**

```bash
docker compose --env-file .env up -d --build
```

This stack also:

* Builds and runs the Go API server
* Starts Caddy, Redis, and Postgres

Access the UI at **http://localhost** or **http://localhost:8080** (use `:8080` if port 80 is taken). Caddy proxies `/api/v1/*` and WebSockets to the Go backend.

### Boot sequence (first paint)

The React app shows a short Pixi-based **loading console** (~5 seconds), then fades into the main UI. The router mounts behind that overlay; if you see a blank screen past ~10 seconds, open DevTools → Console for errors.

### “Old UI” on `127.0.0.1` but not `localhost` (or the opposite)

Browsers treat **`http://127.0.0.1`** and **`http://localhost`** as **different sites**, so they keep **separate caches** (and cookies/session). Use **one URL consistently**.

### Static production bundle (optional)

To verify a production build locally (`web/dist`) with nginx, use **`web/Dockerfile`** and **`web/default.conf`** outside this Compose flow, or run **`make web-dist`** and deploy the **`dist`** folder as you prefer.

### Docker Architecture

* **backend**: Go + Echo backend (serves API and WebSockets)
* **frontend**: Vite dev server (`Dockerfile.dev`), source mounted from `./web`
* **db**: Postgres container
* **caddy**: Caddy reverse proxy container
* **redis** Redis container


## Manual Setup (Needs updating)

### Backend

```bash
# clone repository

# install dependencies
go mod tidy

# run API server
go run ./cmd
```

The backend runs on `http://localhost:8484` and serves both the API and WebSocket connections.
### Frontend

Requires the API on **http://localhost:8484** (run the backend above, or expose backend from Compose — port **8484** is mapped in `compose.yaml`).

```bash
cd web
npm install
npm run dev
```

Then open **http://localhost:5173** (Vite). Requests to `/api` are proxied to `127.0.0.1:8484` by default (`vite.config.ts`).

## Testing

### Backend
Must have docker setup running, tests  need a running redis setup.

- `User` tests (needs updating will fail)
- `Game` tests
- `Infra` tests
- `Lobby` tests


```bash
go test ./internal/user
go test ./internal/game
go test ./internal/infra
go test ./internal/lobby
```




## Gameplay Overview

1. Users authenticate and join a global chat
2. Players create or join a game session or play against a bot
3. Each move selects a side of a square
4. The server validates moves and updates state
5. Completing a box awards a point and an extra turn

## What This Project Demonstrates

* Designing a turn-based multiplayer game
* Real-time synchronization across clients
* Managing shared state safely on the server
* Deploying full-stack applications with Docker and Caddy


## Status

Actively developed. Core gameplay and multiplayer features are complete.

