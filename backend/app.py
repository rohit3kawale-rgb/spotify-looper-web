"""Main FastAPI application for the Spotify Looper web service.

Endpoints support per-account authentication (JWT) and expose the Spotify
API through a REST interface. WebSockets are exposed for real-time
playback and loop state updates.
"""
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, WebSocket, status, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_DIR, HOST, PORT, SPOTIFY_CLIENT_ID, cors_origins_list
from auth.sessions import create_session
from auth.token_store import get_token, save_token, pop_legacy, _load
from auth.oauth import build_auth_url, exchange_code, refresh_token, _validate_state
from spotify.client import SpotifyAPI
from spotify import loop_modes, presets as presets_svc
from ws.handlers import handle_connect

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Spotify Looper API", lifespan=lifespan)

# ── CORS ──────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list(),
    allow_credentials=cors_origins_list() != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Auth helpers ─────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer()

def get_account_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    from auth.sessions import verify_session
    account_id = verify_session(credentials.credentials)
    if not account_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return account_id

def _token_getter_factory(account_id: str) -> callable:
    def token_getter() -> str:
        import time
        token_data = get_token(account_id)
        if not token_data:
            # Peek at legacy token without removing it, so it can be recovered if refresh fails
            data = _load()
            legacy = data.get("__legacy__")
            if legacy:
                token_data = legacy
                # Remove the legacy entry after consuming it
                pop_legacy()
        if not token_data:
            raise RuntimeError("No valid Spotify token")

        # Check if token is expired (with 60s margin)
        expires_at = token_data.get("expires_at", 0)
        if expires_at > time.time() + 60:
            return token_data["access_token"]

        # Token expired — try to refresh
        refresh_tok = token_data.get("refresh_token")
        client_id = token_data.get("client_id")
        code_verifier = token_data.get("code_verifier")
        if refresh_tok:
            from auth.oauth import refresh_token as oauth_refresh
            new_token = oauth_refresh(refresh_tok, client_id, code_verifier)
            if new_token:
                return new_token

        raise RuntimeError("Spotify token expired and refresh failed")
    return token_getter


async def _spotify_call(account_id: str, fn, *, return_none_on_404: bool = False):
    """Execute a Spotify API call, translating 'no token' to 401 and 204 to None."""
    from fastapi import HTTPException, status
    import requests
    api = SpotifyAPI(_token_getter_factory(account_id))
    try:
        return await fn(api)
    except RuntimeError as e:
        if "No valid Spotify token" in str(e):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Spotify token — re-authenticate")
        raise
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 204:
            return None
        if e.response is not None and e.response.status_code == 404 and return_none_on_404:
            return None
        raise


# ── API endpoint implementations ───────────────────────────────────────────────

@app.get("/api/me")
async def get_me(account_id: str = Depends(get_account_id)):
    """Return the authenticated Spotify account profile."""
    try:
        api = SpotifyAPI(_token_getter_factory(account_id))
        profile = await api.get_user_profile()
        return profile
    except RuntimeError as e:
        if "No valid Spotify token" in str(e):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Spotify token — re-authenticate")
        raise

@app.get("/api/playback")
async def get_playback(account_id: str = Depends(get_account_id)):
    async def _do(api):
        playback = await api.get_playback()
        return playback.__dict__ if playback else {}
    return await _spotify_call(account_id, _do)

@app.put("/api/playback/play")
async def start_playback(body: dict = Body(default={}), account_id: str = Depends(get_account_id)):
    api = SpotifyAPI(_token_getter_factory(account_id))
    try:
        await api.start_playback(
            device_id=body.get("device_id"),
            uris=body.get("uris"),
            context_uri=body.get("context_uri"),
            position_ms=body.get("position_ms", 0)
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Spotify API error: {str(e)}")
    return {"ok": True}

@app.put("/api/playback/pause")
async def pause_playback(body: dict = Body(default={}), account_id: str = Depends(get_account_id)):
    api = SpotifyAPI(_token_getter_factory(account_id))
    await api.pause_playback(device_id=body.get("device_id"))
    return {"ok": True}

@app.put("/api/playback/seek")
async def seek_playback(body: dict, account_id: str = Depends(get_account_id)):
    position_ms = body.get("position_ms", 0)
    api = SpotifyAPI(_token_getter_factory(account_id))
    await api.seek(position_ms, device_id=body.get("device_id"))
    return {"ok": True}

@app.put("/api/playback/volume")
async def set_volume(body: dict, account_id: str = Depends(get_account_id)):
    percent = body.get("percent", 50)
    api = SpotifyAPI(_token_getter_factory(account_id))
    await api.set_volume(percent, device_id=body.get("device_id"))
    return {"ok": True}

@app.put("/api/playback/transfer")
async def transfer_playback(body: dict, account_id: str = Depends(get_account_id)):
    import requests
    device_id = body.get("device_id")
    force_play = body.get("force_play", False)
    if not device_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required")
    api = SpotifyAPI(_token_getter_factory(account_id))
    try:
        await api.transfer_playback(device_id, force_play=force_play)
    except requests.HTTPError as e:
        if e.response is not None:
            if e.response.status_code == 404:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
            if e.response.status_code == 403:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot transfer to this device (may require Premium)")
            if e.response.status_code == 400:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid device_id")
        raise
    return {"ok": True}

@app.get("/api/devices")
async def get_devices(account_id: str = Depends(get_account_id)):
    async def _do(api):
        devices = await api.get_devices()
        return {"devices": devices}
    return await _spotify_call(account_id, _do)

@app.get("/api/search")
async def search(q: str, type: str = "track", limit: int = 20, account_id: str = Depends(get_account_id)):
    async def _do(api):
        tracks = await api.search(q, type, limit)
        return {"tracks": tracks}
    return await _spotify_call(account_id, _do)

@app.get("/api/loop/modes")
def list_loop_modes():
    return list(loop_modes.BUILTIN_MODES.keys())

@app.get("/api/presets")
async def list_presets(account_id: str = Depends(get_account_id)):
    return {"presets": [p.__dict__ for p in presets_svc.list_presets(account_id)]}

@app.post("/api/presets")
async def add_preset(body: dict, account_id: str = Depends(get_account_id)):
    """Save a preset. Required fields (track_uri, track_name, artist, start_ms,
    end_ms) are filled in from the current playback/loop state when omitted,
    so the frontend can send just {"name": "..."}."""
    from ws.handlers import get_user_loop_state
    lstate = get_user_loop_state(account_id)
    try:
        api = SpotifyAPI(_token_getter_factory(account_id))
        playback = await api.get_playback()
    except Exception:
        playback = None

    track = playback.item if playback and playback.item else None
    track_uri = body.get("track_uri") or (track.get("uri") if track else "")
    track_name = body.get("track_name") or (track.get("name") if track else "")
    artist = body.get("artist") or (
        ", ".join(a.get("name", "") for a in track.get("artists", [])) if track else ""
    )
    start_ms = body.get("start_ms", lstate.get("loop_start_ms") or 0)
    end_ms = body.get("end_ms", lstate.get("loop_end_ms") or 0)
    mode = body.get("mode", lstate.get("mode", "Forward"))

    preset = presets_svc.LoopPreset(
        name=body.get("name", "Untitled"),
        track_uri=track_uri,
        track_name=track_name,
        artist=artist,
        start_ms=start_ms,
        end_ms=end_ms,
        mode=mode,
    )
    presets_svc.add_preset(account_id, preset)
    return {"ok": True, "preset": preset.__dict__}

@app.delete("/api/presets/{index}")
async def remove_preset(index: int, account_id: str = Depends(get_account_id)):
    presets_svc.remove_preset(account_id, index)
    return {"ok": True}

@app.get("/api/auth/url")
def auth_url(client_id: str = SPOTIFY_CLIENT_ID):
    """Build the Spotify authorize URL plus PKCE verifier for the frontend."""
    url, verifier, state_token = build_auth_url(client_id)
    # state_token is the JWT containing {verifier, state}. The frontend
    # passes it back in the callback to avoid any shared server state.
    return {"auth_url": url, "verifier": verifier, "state": state_token}

@app.get("/api/auth/callback")
async def auth_callback_get(code: str, state: str = None):
    """Spotify redirects here with a GET. Hand off to the SPA's /auth/callback route."""
    from fastapi.responses import RedirectResponse
    url = f"/auth/callback?code={code}"
    if state:
        url += f"&state={state}"
    return RedirectResponse(url, status_code=302)


@app.post("/api/auth/callback")
async def auth_callback(body: dict):
    code = body.get("code")
    state = body.get("state")
    # The state parameter is a JWT containing the PKCE verifier, issued by
    # build_auth_url. This eliminates the need for shared in-memory or
    # file-backed state — the verifier travels with the callback, solving
    # the ephemeral Fly.io machine problem and the mobile sessionStorage
    # clearing problem simultaneously.
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter")
    try:
        token = exchange_code(code, state=state)
    except ValueError as e:
        # Spotify rejected the code (expired/revoked/invalid) — surface it
        # as a clean 400 instead of letting it become a 500.
        raise HTTPException(status_code=400, detail=str(e))
    temp_getter = SpotifyAPI(lambda: token["access_token"])
    profile = await temp_getter.get_user_profile()
    actual_account_id = profile.get("id") or token.get("account_id") or "default_user"
    display_name = profile.get("display_name", actual_account_id[:12])
    save_token(actual_account_id, token)
    session_token = create_session(actual_account_id, display_name=display_name)
    return {"connected": True, "session_token": session_token, "profile": profile}

# ── Loop state / control REST endpoints ──────────────────────────────────────
# The frontend drives most actions over WebSocket, but also polls these for
# initial load and preset application.

def _loop_state_for(account_id: str) -> dict:
    from ws.handlers import get_user_loop_state
    return get_user_loop_state(account_id)


@app.get("/api/loop/state")
async def loop_state(account_id: str = Depends(get_account_id)):
    """Return current loop state + active track for this account.

    Restores persisted loop state from disk first so the segment / mode /
    direction survive process restarts and page refreshes.
    """
    lstate = _loop_state_for(account_id)
    async def _do(api):
        playback = await api.get_playback()
        track = None
        if playback and playback.item:
            track = {
                "id": playback.item.get("id", ""),
                "name": playback.item.get("name", ""),
                "artists": [a.get("name", "") for a in playback.item.get("artists", [])],
                "album": (playback.item.get("album") or {}).get("name", ""),
                "albumArtUrl": ((playback.item.get("album") or {}).get("images") or [{}])[0].get("url", ""),
                "duration_ms": playback.item.get("duration_ms", 0),
                "uri": playback.item.get("uri", ""),
                "previewUrl": playback.item.get("preview_url"),
            }
        return {
            "currentTrack": track,
            "positionMs": playback.progress_ms if playback else 0,
            "segmentStartMs": lstate.get("loop_start_ms") or 0,
            "segmentEndMs": lstate.get("loop_end_ms") or 0,
            "mode": lstate.get("mode", "Forward"),
            "status": "playing" if (playback and playback.is_playing) else "stopped",
        }
    return await _spotify_call(account_id, _do)


@app.post("/api/loop/control")
async def loop_control(body: dict, account_id: str = Depends(get_account_id)):
    """Play/pause/seek/volume/next/previous/set_mode."""
    api = SpotifyAPI(_token_getter_factory(account_id))
    action = body.get("action")
    device_id = body.get("device_id")

    valid_actions = {"play", "pause", "seek", "volume", "next", "previous", "transfer", "set_mode", "clear_loop"}
    if action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}. Valid actions: {', '.join(sorted(valid_actions))}")

    try:
        if action == "play":
            await api.start_playback(
                device_id=device_id,
                uris=body.get("uris"),
                context_uri=body.get("context_uri"),
                position_ms=body.get("position_ms", 0),
            )
        elif action == "pause":
            await api.pause_playback(device_id=device_id)
        elif action == "seek":
            position_ms = body.get("position_ms")
            if position_ms is None:
                raise HTTPException(status_code=400, detail="position_ms required for seek")
            await api.seek(position_ms, device_id=device_id)
        elif action == "volume":
            percent = body.get("percent")
            if percent is None:
                raise HTTPException(status_code=400, detail="percent required for volume")
            await api.set_volume(percent, device_id=device_id)
        elif action == "next":
            await api.skip_next(device_id=device_id)
        elif action == "previous":
            await api.skip_previous(device_id=device_id)
        elif action == "transfer":
            target = device_id or body.get("target_device_id")
            if not target:
                raise HTTPException(status_code=400, detail="device_id required for transfer")
            await api.transfer_playback(target, force_play=body.get("force_play", False))
        elif action == "set_mode":
            from ws.handlers import get_user_loop_state, _save_loop_state
            lstate = get_user_loop_state(account_id)
            lstate["mode"] = body.get("mode", "Forward")
            _save_loop_state(account_id, lstate)
        elif action == "clear_loop":
            from ws.handlers import get_user_loop_state, _save_loop_state
            lstate = get_user_loop_state(account_id)
            lstate["loop_start_ms"] = None
            lstate["loop_end_ms"] = None
            lstate["direction"] = 1
            lstate["is_enabled"] = False
            _save_loop_state(account_id, lstate)
    except RuntimeError as e:
        # Token issues
        if "No valid Spotify token" in str(e) or "expired" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
        raise
    except Exception as e:
        # Spotify API errors (403, 404, 5xx, etc.)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Spotify API error: {e}")

    return {"ok": True}


@app.post("/api/loop/segment")
async def loop_segment(body: dict, account_id: str = Depends(get_account_id)):
    """Set loop segment boundaries."""
    from ws.handlers import get_user_loop_state, _save_loop_state
    lstate = get_user_loop_state(account_id)
    lstate["loop_start_ms"] = body.get("start_ms")
    lstate["loop_end_ms"] = body.get("end_ms")
    lstate["is_enabled"] = True
    _save_loop_state(account_id, lstate)
    return {"ok": True}


@app.post("/api/loop/state")
async def save_loop_state(body: dict, account_id: str = Depends(get_account_id)):
    """Persist loop state (segment + mode + direction) to disk."""
    from ws.handlers import get_user_loop_state, _save_loop_state
    lstate = get_user_loop_state(account_id)
    if "loop_start_ms" in body:
        lstate["loop_start_ms"] = body["loop_start_ms"]
    if "loop_end_ms" in body:
        lstate["loop_end_ms"] = body["loop_end_ms"]
    if "mode" in body:
        lstate["mode"] = body["mode"]
    if "direction" in body:
        lstate["direction"] = body["direction"]
    if "is_enabled" in body:
        lstate["is_enabled"] = bool(body["is_enabled"])
    _save_loop_state(account_id, lstate)
    return {"ok": True}


@app.post("/api/loop/iteration")
async def loop_iteration(account_id: str = Depends(get_account_id)):
    """Advance loop iteration (ping-pong direction flip)."""
    from ws.handlers import get_user_loop_state
    lstate = get_user_loop_state(account_id)
    lstate["direction"] = -lstate.get("direction", 1)
    return {"ok": True}


@app.post("/api/preset/load")
async def preset_load(body: dict, account_id: str = Depends(get_account_id)):
    """Load a saved preset by index — sets segment + mode + starts playback."""
    preset_id = body.get("preset_id", body.get("presetId"))
    try:
        idx = int(preset_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid preset id")
    try:
        preset = presets_svc.get_preset(account_id, idx)
    except IndexError:
        raise HTTPException(status_code=404, detail="Preset not found")
    api = SpotifyAPI(_token_getter_factory(account_id))
    from ws.handlers import get_user_loop_state as _get_user_loop_state
    lstate = _get_user_loop_state(account_id)
    lstate["loop_start_ms"] = preset.start_ms
    lstate["loop_end_ms"] = preset.end_ms
    lstate["mode"] = preset.mode
    lstate["is_enabled"] = True
    if preset.track_uri:
        try:
            await api.start_playback(uris=[preset.track_uri], position_ms=preset.start_ms)
        except Exception:
            pass
    return {
        "ok": True,
        "preset": {
            "id": idx,
            "name": preset.name,
            "config": {
                "track_name": preset.track_name,
                "artist": preset.artist,
                "segment_start_ms": preset.start_ms,
                "segment_end_ms": preset.end_ms,
                "mode": preset.mode,
            },
        },
    }


@app.get("/api/auth/status")
async def auth_status(account_id: str = Depends(get_account_id)):
    """Check whether the session is still valid and return the profile."""
    async def _do(api):
        profile = await api.get_user_profile()
        return {"connected": True, "user": profile}
    return await _spotify_call(account_id, _do)


@app.post("/api/auth/logout")
async def logout(account_id: str = Depends(get_account_id)):
    """Drop the Spotify token for this account.

    Sessions are stateless JWTs, so the token itself simply expires (30d);
    the Spotify access/refresh tokens are what actually get revoked here.
    """
    from auth.token_store import delete_token
    delete_token(account_id)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Room REST endpoints ──────────────────────────────────────────────────────────────

@app.get("/api/rooms")
async def list_rooms(account_id: str = Depends(get_account_id)):
    """List public rooms."""
    from ws.manager import manager
    return {"rooms": manager.list_public_rooms()}

@app.post("/api/rooms")
async def create_room(name: str = "Loop Room", account_id: str = Depends(get_account_id)):
    """Create a new shareable room."""
    from ws.manager import manager
    room = manager.create_room(account_id, name)
    return {
        "room_id": room.room_id,
        "name": room.name,
        "share_url": f"/room/{room.room_id}",
    }

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str, account_id: str = Depends(get_account_id)):
    """Get room details."""
    from ws.manager import manager
    room_state = manager.get_room_state(room_id)
    if not room_state:
        raise HTTPException(status_code=404, detail="Room not found")
    return room_state

@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: str, account_id: str = Depends(get_account_id)):
    """Delete a room (only owner)."""
    from ws.manager import manager
    room = manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.owner_id != account_id:
        raise HTTPException(status_code=403, detail="Only room owner can delete")
    manager.delete_room(room_id)
    return {"ok": True}

# ── WebSocket endpoint ───────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token") or websocket.query_params.get("access_token")
    room_id = websocket.query_params.get("room_id")
    await handle_connect(websocket, token, room_id)

# ── Static frontend serving (if built) ───────────────────────────────────────────────
# Mount static assets first — highest priority
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

# SPA fallback for any other path (excluding API/WebSocket)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/") or full_path == "ws":
        raise HTTPException(status_code=404)
    target = FRONTEND_DIR / full_path
    if target.is_file():
        return FileResponse(target)
    return FileResponse(FRONTEND_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
