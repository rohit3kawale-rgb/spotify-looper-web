"""PKCE OAuth flow for Spotify.

No client secret is required — users authenticate directly with Spotify,
which keeps per-user auth working without each user registering a app.
"""
import base64
import hashlib
import secrets
import urllib.parse
from typing import Dict, Optional, Tuple

import requests

from config import (
    AUTH_URL,
    DATA_DIR,
    SCOPES,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_REDIRECT_URI,
    TOKEN_URL,
)

# Persist OAuth state to a file rather than in-memory so that Gunicorn workers
# (which each have their own module-level state) share the same store. Without
# this, build_auth_url on worker A stores the verifier but exchange_code on
# worker B sees an empty store and rejects the callback with 400.
_OAUTH_STATE_FILE = DATA_DIR / "oauth_states.json"


def _load_state_store() -> Dict[str, str]:
    if not _OAUTH_STATE_FILE.exists():
        return {}
    try:
        import json
        return json.loads(_OAUTH_STATE_FILE.read_text())
    except Exception:
        return {}


def _save_state_store(data: Dict[str, str]) -> None:
    import json
    temp = _OAUTH_STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(data))
    temp.replace(_OAUTH_STATE_FILE)


def generate_pkce_pair() -> Tuple[str, str]:
    """Generate a PKCE code verifier and its S256 code challenge.

    Returns (verifier, challenge). The verifier is a high-entropy random
    string; the challenge is the base64url-encoded SHA-256 digest of the
    verifier (no padding), which is what Spotify compares against.
    """
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def build_auth_url(client_id: Optional[str] = None) -> Tuple[str, str, str]:
    """Build the Spotify authorize URL plus the PKCE verifier.

    Returns (url, code_verifier, state).
    The generated state is stored in the file-backed OAuth state store
    so it can be validated during the token exchange callback, even when
    the callback hits a different Gunicorn worker.
    """
    client_id = client_id or SPOTIFY_CLIENT_ID
    verifier, challenge = generate_pkce_pair()
    state = secrets.token_urlsafe(16)
    store = _load_state_store()
    store[state] = verifier
    _save_state_store(store)
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": SCOPES,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "show_dialog": "false",
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}", verifier, state


def exchange_code(code: str, code_verifier: str, state: Optional[str] = None, client_id: Optional[str] = None) -> dict:
    """Exchange an authorization code for a token dict.

    Validates the state parameter to prevent CSRF attacks. Raises ValueError
    with a descriptive message on failure so the caller can translate it into
    a clean HTTP response instead of a 500. If state is provided, it is
    validated against the stored state from build_auth_url generation.
    """
    client_id = client_id or SPOTIFY_CLIENT_ID

    # Validate state parameter against stored state from build_auth_url
    if state is not None:
        store = _load_state_store()
        stored_verifier = store.pop(state, None)
        _save_state_store(store)
        if stored_verifier is None:
            raise ValueError("Invalid state parameter: state not found or already used")
        # Also verify that the code_verifier matches what was stored
        if stored_verifier != code_verifier:
            raise ValueError("Invalid state parameter: code_verifier mismatch")
    # If state is None, proceed without state validation — the route handler
    # is responsible for ensuring state was checked against the session store.

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
            "client_id": client_id,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code != 200:
        try:
            err = resp.json()
            detail = f"{err.get('error', 'unknown')}: {err.get('error_description', '')}".strip()
        except Exception:
            detail = resp.text[:200] or f"HTTP {resp.status_code}"
        raise ValueError(f"Spotify token exchange failed ({resp.status_code}): {detail}")
    data = resp.json()
    data["client_id"] = client_id
    data["code_verifier"] = code_verifier
    return data


def _validate_state(stored_state: str, callback_url_state: Optional[str]) -> bool:
    """Validate that the callback state matches the stored PKCE state.

    Prevents CSRF attacks where an attacker tricks a user into visiting a
    malicious auth URL and then uses the authorization code to hijack the
    user's session since the backend doesn't verify state matches.
    """
    if not stored_state:
        return False
    if not callback_url_state:
        return False
    return stored_state == callback_url_state


def refresh_token(refresh_token: str, client_id: str, code_verifier: str) -> Optional[str]:
    """Refresh the access token; returns new token or None.

    Accepts the refresh_token, client_id, and code_verifier directly
    instead of reading from stored token data.
    """
    from auth.token_store import save_token, _load

    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "code_verifier": code_verifier,
    }
    resp = requests.post(
        TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code != 200:
        return None
    payload = resp.json()
    payload["refresh_token"] = refresh_token

    # Update stored token so subsequent calls use fresh access_token and expires_at.
    # Find the account that matches this refresh_token/client_id/code_verifier.
    tokens_data = _load()
    matched_account_id = None
    for acc_id, token_data in tokens_data.items():
        if (
            token_data.get("refresh_token") == refresh_token
            and token_data.get("client_id") == client_id
            and token_data.get("code_verifier") == code_verifier
        ):
            matched_account_id = acc_id
            break

    if matched_account_id:
        updated_token = payload.copy()
        updated_token["refresh_token"] = refresh_token
        updated_token["client_id"] = client_id
        updated_token["code_verifier"] = code_verifier
        save_token(matched_account_id, updated_token)

    return payload.get("access_token")
