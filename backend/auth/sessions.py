"""Session JWTs — one per authenticated Spotify user."""
import time
from typing import Optional

import jwt
from config import JWT_ALGORITHM, JWT_EXPIRES_MIN, JWT_SECRET


def create_session(account_id: str, display_name: str = "", extra: Optional[dict] = None) -> str:
    payload = {
        "sub": account_id,
        "display_name": display_name,
        "iat": time.time(),
        "exp": time.time() + JWT_EXPIRES_MIN * 60,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_session(token: Optional[str]) -> Optional[str]:
    """Return the account_id embedded in the token, or None if invalid."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def get_display_name(token: Optional[str]) -> Optional[str]:
    """Extract display_name from token without full verification."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("display_name")
    except jwt.PyJWTError:
        return None