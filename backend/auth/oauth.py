"""PKCE OAuth flow for Spotify.

No client secret is required — users authenticate directly with Spotify,
which keeps per-user auth working without each user registering a app.
"""
import base64
import hashlib
import secrets
import urllib.parse
from typing import Optional, Tuple

import requests

from config import (
    AUTH_URL,
    JWT_SECRET,
    SCOPES,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_REDIRECT_URI,
    TOKEN_URL,
)


def generate_pkce_pair() -> Tuple[str, str]:
    """Generate a PKCE code verifier and its S256 code challenge.

    Returns (verifier, challenge).
    """
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def build_auth_url(client_id: Optional[str] = None) -> Tuple[str, str, str]:
    """Build the Spotify authorize URL plus the PKCE verifier.

    Returns (url, state). The verifier is embedded in a signed JWT payload
    that the frontend must pass back in the callback — this avoids any
    shared state between machines (critical for Fly.io's ephemeral VMs).
    """
    import jwt
    client_id = client_id or SPOTIFY_CLIENT_ID
    verifier, challenge = generate_pkce_pair()
    state = secrets.token_urlsafe(16)
    # Store verifier in a JWT claim so it's verified server-side and
    # survives cross-machine routing / VM restarts.
    token = jwt.encode(
        {"verifier": verifier, "state": state},
        JWT_SECRET,
        algorithm="HS256",
    )
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
    url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    return url, state, token


def exchange_code(code: str, state: str, client_id: Optional[str] = None) -> dict:
    """Exchange an authorization code for a token dict.

    Verifies the state parameter by decoding the JWT returned from
    build_auth_url — no file-backed state store needed.
    Raises ValueError with a descriptive message on failure.
    """
    import jwt
    client_id = client_id or SPOTIFY_CLIENT_ID

    # Decode the JWT to recover the verifier — this proves we generated
    # the auth URL and verifies the state matches.
    try:
        payload = jwt.decode(state, JWT_SECRET, algorithms=["HS256"])
        # The state parameter is also the JWT — extract the verifier.
        # If that fails, state might be a raw state string (legacy path).
        # Try the raw state lookup as fallback.
        code_verifier = payload.get("verifier")
        if not code_verifier:
            # Legacy: state is just a state string, verifier stored in JWT separately
            raise ValueError("Invalid or missing verifier in state token")
    except jwt.PyJWTError:
        # state is a raw value, not a JWT — this shouldn't happen with the
        # new flow but handle gracefully.
        raise ValueError("Invalid state parameter: unable to decode verifier")

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
    """Validate that the callback state matches the stored PKCE state."""
    if not stored_state or not callback_url_state:
        return False
    return stored_state == callback_url_state


def refresh_token(refresh_token: str, client_id: str, code_verifier: str) -> Optional[str]:
    """Refresh the Spotify access token."""
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
        updated = payload.copy()
        updated["refresh_token"] = refresh_token
        updated["client_id"] = client_id
        updated["code_verifier"] = code_verifier
        save_token(matched_account_id, updated)

    return payload.get("access_token")
