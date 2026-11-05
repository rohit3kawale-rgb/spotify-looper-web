"""Central configuration for the Spotify Looper web app."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Persistent data directory ─────────────────────────────────────────────
# Fly.io mounts a persistent volume at /data; fall back to a local dir.
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    DATA_DIR = BASE_DIR / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Spotify OAuth (PKCE) ────────────────────────────────────────────────
SPOTIFY_CLIENT_ID = os.environ.get(
    "SPOTIFY_CLIENT_ID"
)  # No default — must be set via env var for security
if not SPOTIFY_CLIENT_ID:
    import warnings
    warnings.warn("SPOTIFY_CLIENT_ID not set, using hardcoded dev value")
    SPOTIFY_CLIENT_ID = "9a6f10a547204621b452aa9d90c23efe"

SPOTIFY_REDIRECT_URI = os.environ.get(
    "SPOTIFY_REDIRECT_URI",
    f"http://127.0.0.1:{int(os.environ.get('PORT', '8000'))}/auth/callback",
)
if not os.environ.get("SPOTIFY_REDIRECT_URI"):
    import warnings
    warnings.warn(
        "SPOTIFY_REDIRECT_URI not set; falling back to localhost. "
        "Set it to the deployed URL in production."
    )

SCOPES = (
    "user-read-playback-state user-modify-playback-state "
    "user-read-currently-playing user-read-private"
)
AUTH_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"

# Legacy single-user token file (migrated on first run).
TOKEN_FILE = Path(os.environ.get("TOKEN_FILE", str(Path.home() / ".spotify_looper_token.json")))

# ── Persistence ─────────────────────────────────────────────────────────
TOKENS_FILE = DATA_DIR / "tokens.json"      # account_id -> token dict
PRESETS_FILE = DATA_DIR / "presets.json"    # account_id -> [preset, ...]
LOOP_STATE_FILE = DATA_DIR / "loop_state.json"  # account_id -> loop state

# ── Session JWT ─────────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    _SECRET_FILE = DATA_DIR / "jwt_secret"
    if _SECRET_FILE.exists():
        JWT_SECRET = _SECRET_FILE.read_text().strip()
    else:
        JWT_SECRET = secrets.token_urlsafe(48)
        _SECRET_FILE.write_text(JWT_SECRET)
        try:
            import stat
            os.chmod(_SECRET_FILE, stat.S_IRUSR | stat.S_IWUSR)
        except Exception:
            pass

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MIN = int(os.environ.get("JWT_EXPIRES_MIN", "43200"))  # 30 days

# ── Server / runtime ────────────────────────────────────────────────────
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
FRONTEND_DIR = BASE_DIR / "backend" / "static"
LOOP_POLL_MS = int(os.environ.get("LOOP_POLL_MS", "200"))
USER_ACTION_GRACE_MS = int(os.environ.get("USER_ACTION_GRACE_MS", "500"))

# ── CORS ──────────────────────────────────────────────────────────────────
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    f"http://127.0.0.1:5173,http://127.0.0.1:3000,http://localhost:5173,http://localhost:3000,"
    f"http://127.0.0.1:5176,http://localhost:5176,http://127.0.0.1:5179,http://localhost:5179"
)

def cors_origins_list() -> list[str]:
    return [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]