"""Per-account Spotify token store.

Tokens are keyed by Spotify account id so each user keeps their own
playback identity, presets and devices. A legacy single-user token file
(``~/.spotify_looper_token.json``) is migrated automatically on first run.

SECURITY WARNING: Tokens are stored in plaintext. In production, use
encryption at rest (e.g., Fernet with a key from env/secrets manager).
"""
import json
import os
import time
from pathlib import Path
from typing import Optional

from config import TOKEN_FILE, TOKENS_FILE


def _load() -> dict:
    if TOKENS_FILE.exists():
        try:
            with open(TOKENS_FILE, 'r') as f:
                # Direct read without locking for Windows safety
                return json.loads(f.read())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save(data: dict) -> None:
    # Atomic write: write to temp file then rename
    temp_file = TOKENS_FILE.with_suffix('.tmp')
    try:
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, TOKENS_FILE)  # atomic on POSIX, replace on Windows
    except Exception:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)
        raise


def get_token(account_id: str) -> Optional[dict]:
    return _load().get(account_id)


def save_token(account_id: str, token: dict) -> dict:
    """Persist a token for an account, preserving refresh material."""
    data = _load()
    existing = data.get(account_id, {})
    # Preserve fields we may not have in the fresh payload.
    token.setdefault("client_id", existing.get("client_id") or token.get("client_id"))
    token.setdefault("code_verifier", existing.get("code_verifier") or token.get("code_verifier"))
    token["expires_at"] = time.time() + token.get("expires_in", 86400)
    data[account_id] = token
    _save(data)
    return token


def delete_token(account_id: str) -> None:
    data = _load()
    if account_id in data:
        del data[account_id]
        _save(data)


def all_tokens() -> dict:
    return _load()


def migrate_legacy() -> Optional[dict]:
    """Move a legacy single-user token into the per-account store.

    Returns the migrated token dict or None. The legacy entry is stored
    under a sentinel key and automatically cleaned up when `pop_legacy()`
    is called (typically during first successful token refresh).
    """
    if not TOKEN_FILE.exists():
        return None
    if _load():
        return None  # already migrated / in use
    try:
        legacy = json.loads(TOKEN_FILE.read_text())
    except Exception:
        return None
    if not legacy.get("access_token"):
        return None
    # Park under a sentinel key until the account id is known.
    data = _load()
    data["__legacy__"] = legacy
    _save(data)
    return legacy


def pop_legacy() -> Optional[dict]:
    """Return and remove the sentinel legacy entry, if present.

    Caller is responsible for resolving the account_id via /me
    and re-saving with the correct account_id key.
    """
    data = _load()
    legacy = data.pop("__legacy__", None)
    if legacy is not None:
        _save(data)
    return legacy