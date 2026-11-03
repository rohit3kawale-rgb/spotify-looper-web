# Spotify Looper Web Service

A real-time web interface for Spotify playback control with per-user authentication,
loop modes, presets, **shareable rooms**, and **WebSocket-driven sync** between the
backend API and frontend clients.

## Overview

This project provides a **React + FastAPI** architecture that mirrors the existing
desktop looper but exposes its features through a web UI. Key differentiators:

* **Per‑user auth** – each Spotify account stores its own tokens, presets, and loop
  preferences.
* **WebSocket backend** – playback updates and loop state are pushed live to all
  connected browsers without polling.
* **Shareable Rooms** – create rooms and share links for collaborative looping.
* **Multi-user Presence** – see who's in the room, real-time join/leave notifications.
* **Standard REST API** – for client‑side access to search, devices, and preset
  management.
* **Self‑contained OAuth PKCE** – no client secret required; users authenticate
  directly with Spotify.
* **Token Refresh** – automatic token refresh on expiry with 401 retry logic.
* **Production-ready** – Docker, gunicorn, health checks, and startup scripts.

> *This is the complementary web counterpart to the PySide6 desktop looper already
> present in the workspace.*

## Directory layout

```
spotify-looper-web/
├── backend/               # FastAPI Python service
│   ├── auth/              # PKCE OAuth & JWT sessions
│   ├── spotify/           # Spotify Web API client & loop‑mode engine
│   ├── ws/                # WebSocket manager & handlers (rooms, presence)
│   ├── app.py             # Main FastAPI entry point
│   ├── config.py          # Configuration
│   ├── requirements.txt   # Python dependencies
│   ├── .env.example       # Environment template
│   └── data/              # Runtime data (tokens, presets, JWT secret)
├── frontend/              # React + Vite application
│   ├── src/
│   │   ├── api/client.js  # API + WebSocket client
│   │   ├── components/    # React components
│   │   ├── store/         # Zustand state management
│   │   └── ...
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── scripts/               # Deployment & dev utilities
│   ├── dev.sh / dev.bat   # Development startup (both servers)
│   ├── prod.sh / prod.bat # Production build
│   └── ...
├── docker-compose.yml     # Docker Compose for production
├── Dockerfile             # Multi-stage Docker build
└── README.md              # This file
```

## Prerequisites

* Python ≥3.11 with **pip**
* Node ≥20 with **npm** (or **pnpm**)
* Spotify Developer account → create a new app with **Redirect URI**
  `http://localhost:8000/api/auth/callback` (or override via env var)

## Quick Start (Development)

### Option 1: One-command startup (recommended)

```bash
# Linux/macOS
cd spotify-looper-web
./scripts/dev.sh

# Windows
cd spotify-looper-web
scripts\dev.bat
```

This will:
1. Create Python venv and install dependencies
2. Install npm dependencies
3. Start backend on http://localhost:8000
4. Start frontend on http://localhost:5173

### Option 2: Manual startup

**Backend:**
```bash
cd spotify-looper-web/backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # Edit with your Spotify Client ID
python app.py
```

**Frontend (in separate terminal):**
```bash
cd spotify-looper-web/frontend
npm install
npm run dev
```

## Configuration

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | (required) | Spotify app Client ID |
| `SPOTIFY_REDIRECT_URI` | `http://localhost:8000/api/auth/callback` | OAuth redirect URI |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Port |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000,...` | Comma-separated allowed origins |
| `JWT_EXPIRES_MIN` | `43200` (30 days) | Session JWT lifetime |
| `LOOP_POLL_MS` | `200` | Playback polling interval |
| `USER_ACTION_GRACE_MS` | `500` | Grace period after user action |

### Spotify Developer Dashboard

1. Go to https://developer.spotify.com/dashboard/
2. Create an app (or use existing)
3. Add Redirect URI: `http://localhost:8000/api/auth/callback`
4. Copy Client ID to `.env`

## Features

### Authentication (PKCE OAuth)

- No client secret required — uses Proof Key for Code Exchange (PKCE)
- Per-user tokens stored in `backend/data/tokens.json`
- JWT sessions with configurable expiry
- Automatic token refresh on 401 responses

### Loop Modes

| Mode | Description |
|------|-------------|
| **Forward** | A → B → jump to A → repeat |
| **Ping-Pong** | A → B → reverse → A → forward → repeat |
| **Crossfade** | Seamless overlap jump from B back to A |

### Presets

- Save/load loop sections per track
- Stored per-user in `backend/data/presets.json`
- Includes track URI, name, artist, start/end positions, mode

### Rooms (NEW)

- **Create rooms** with custom names
- **Shareable links** — `/room/{room_id}` invites others
- **Real-time presence** — see who's connected
- **Synced loop state** — all room members share loop markers/mode
- **Join/leave notifications** — broadcast to room members

### WebSocket Protocol

Connect: `ws://localhost:8000/ws?token=<JWT>&room_id=<optional>`

**Message Types (Server → Client):**
```json
{ "type": "playback", "data": {...}, "account_id": "..." }
{ "type": "loop_state", "data": {...}, "account_id": "..." }
{ "type": "room_state", "data": { "room_id": "...", "users": [...], "loop_state": {...} } }
{ "type": "user_joined", "data": { "account_id": "...", "display_name": "...", "users": [...] } }
{ "type": "user_left", "data": { "account_id": "...", "users": [...] } }
{ "type": "rooms_list", "data": [...] }
{ "type": "room_created", "data": { "room_id": "...", "name": "..." } }
{ "type": "error", "data": { "error": "..." } }
```

**Message Types (Client → Server):**
```json
{ "type": "set_loop", "data": { "start_ms": 1000, "end_ms": 5000 } }
{ "type": "set_mode", "data": { "mode": "Ping-Pong" } }
{ "type": "clear_loop", "data": {} }
{ "type": "control", "data": { "action": "play|pause|seek|volume|next|previous", ... } }
{ "type": "get_loop_state", "data": {} }
{ "type": "get_room_info", "data": {} }
{ "type": "create_room", "data": { "name": "My Room" } }
{ "type": "list_rooms", "data": {} }
```

## API Reference

All REST endpoints require `Authorization: Bearer <JWT>` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Spotify account profile |
| GET | `/api/playback` | Current playback state |
| GET | `/api/devices` | Available playback devices |
| GET | `/api/search?q=...` | Search catalog |
| GET | `/api/loop/modes` | Built-in loop mode names |
| GET | `/api/presets` | User's saved loop presets |
| POST | `/api/presets` | Create a new preset |
| DELETE | `/api/presets/{index}` | Delete preset by index |
| GET | `/api/auth/url` | Build Spotify OAuth authorize URL + PKCE |
| POST | `/api/auth/callback` | Exchange code for tokens, issue session JWT |
| GET | `/api/rooms` | List public rooms |
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/{room_id}` | Get room details |
| DELETE | `/api/rooms/{room_id}` | Delete room (owner only) |
| GET | `/api/health` | Health check |
| WS | `/ws` | WebSocket endpoint |

## Production Deployment

### Docker (Recommended)

```bash
cd spotify-looper-web

# Set environment variables
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback
export CORS_ORIGINS=https://yourdomain.com

docker-compose up -d
```

### Manual Production Build

```bash
# Linux/macOS
./scripts/prod.sh

# Windows
scripts\prod.bat
```

Then run:
```bash
cd backend
source .venv/bin/activate
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Reverse Proxy (NGINX Example)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## Data Persistence

The following files are created in `backend/data/`:
- `tokens.json` — Per-account Spotify tokens (encrypted at rest recommended)
- `presets.json` — Per-account loop presets
- `jwt_secret` — JWT signing key (rotate by deleting)

Mount a volume in Docker: `- ./backend/data:/app/backend/data`

## Frontend Architecture

- **React 18** + **Vite** + **TypeScript-ready**
- **Tailwind CSS** with Spotify-themed design system
- **Zustand** for state management
- **Socket.io-client** for WebSocket communication
- **Framer Motion** for animations
- **Axios** for REST API calls

### Key Components

| Component | Purpose |
|-----------|---------|
| `AuthScreen` | PKCE OAuth login flow |
| `MainLayout` | App shell, WebSocket management |
| `TrackPanel` | Track info, progress, transport controls |
| `LoopPanel` | Loop markers (A/B), mode selector |
| `PresetsPanel` | Save/load/delete presets |
| `DevicesPanel` | Device selection/transfer |
| `SearchPanel` | Track/artist/album search |
| `RoomPanel` | Room create/join/leave, share links |
| `Sidebar` | Navigation |

## Integration with Desktop App

The web service shares the same core modules as the PySide6 desktop app:
- `src/auth.py` — PKCE OAuth flow
- `src/spotify_api.py` — Spotify API client
- `src/loop_mode.py` — Loop mode implementations
- `src/presets.py` — Preset data structures

To use the same tokens, ensure both apps use the same `SPOTIFY_CLIENT_ID` and
the legacy token file (`~/.spotify_looper_token.json`) will be migrated on first run.

## Troubleshooting

### "Invalid session" / 401 errors
- Check JWT secret hasn't changed (delete `backend/data/jwt_secret` to rotate)
- Verify token hasn't expired (30 days default)
- Ensure frontend sends `Authorization: Bearer <token>` header

### WebSocket connection fails
- Check CORS origins include your frontend URL
- Verify `token` query parameter is passed
- Check browser console for connection errors

### Spotify API errors
- Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` match dashboard
- Ensure scopes include: `user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private`

### Frontend build fails
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node version ≥20

## License

Proprietary – part of the OmniRoute ecosystem.

---

*If you need any of the desktop‑only PySide6 features (system tray, draggable
 timeline, etc.), consider running the desktop app alongside this web service.*

## Next Steps

1. Register a Spotify app (or reuse the existing client ID: `9a6f10a547204621b452aa9d90c23efe`)
2. Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` in `backend/.env`
3. Run `./scripts/dev.sh` (or `scripts\dev.bat` on Windows)
4. Open http://localhost:5173, authenticate, and start looping!
5. Create a room and share the link with friends for collaborative looping

**Creation time estimate:** ~30 min (setup) + ~10 min (Docker) = ~40 min total

**Effort level:** Medium – requires understanding of OAuth PKCE, WebSockets, and
React + FastAPI integration.