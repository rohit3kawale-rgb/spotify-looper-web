"""WebSocket message handlers and message types for the looper stream."""
import asyncio
import json
import logging
from typing import Any, Dict, Optional

from auth.sessions import verify_session
from auth.token_store import get_token
from auth.oauth import refresh_token
from config import LOOP_POLL_MS
from spotify.client import SpotifyAPI
from spotify.loop_modes import BUILTIN_MODES, LoopState, LoopAction

# Active user engine sessions (account_id -> dict state)
USER_LOOP_STATES: Dict[str, dict] = {}


def get_user_loop_state(account_id: str) -> dict:
    if account_id not in USER_LOOP_STATES:
        USER_LOOP_STATES[account_id] = {
            "loop_start_ms": None,
            "loop_end_ms": None,
            "mode": "Forward",
            "direction": 1,
            "is_enabled": False,
        }
    return USER_LOOP_STATES[account_id]


def _make_token_getter(account_id: str):
    """Build a refresh-aware token getter (mirrors app._token_getter_factory).

    The raw stored access_token is stale the moment it expires, and the
    SpotifyAPI 401-retry path re-sends the same stale token, so every WS
    playback call would silently fail after ~1 hour. This getter refreshes
    via the PKCE refresh_token before handing the token over.
    """
    import time

    def getter() -> str:
        token_data = get_token(account_id)
        if not token_data:
            raise RuntimeError("No Spotify token for account")
        if token_data.get("expires_at", 0) > time.time() + 60:
            return token_data["access_token"]
        refresh_tok = token_data.get("refresh_token")
        client_id = token_data.get("client_id")
        code_verifier = token_data.get("code_verifier")
        if refresh_tok:
            new_token = refresh_token(refresh_tok, client_id, code_verifier)
            if new_token:
                return new_token
        raise RuntimeError("Spotify token expired and refresh failed")

    return getter


def get_spotify_token_for_account(account_id: str) -> Optional[str]:
    """Raw stored access token (no refresh) — kept for backward compat."""
    token_data = get_token(account_id)
    if not token_data:
        return None
    return token_data.get("access_token")


async def handle_connect(ws, token: str, room_id: Optional[str] = None):
    """Per-connection initialization and background loop.

    Args:
        ws: WebSocket connection
        token: JWT session token
        room_id: Optional room ID to join (creates new room if None)
    """
    account_id = verify_session(token)
    if not account_id:
        await ws.close(code=1008, reason="invalid_session")
        return

    from ws.manager import manager

    # Get display name from token
    try:
        import jwt
        from config import JWT_SECRET, JWT_ALGORITHM
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        display_name = payload.get("display_name", account_id[:12])
    except Exception as e:
        logging.getLogger(__name__).debug(f"JWT decode error: {e}")
        display_name = account_id[:12]

    # Connect to room or personal
    if room_id:
        try:
            await manager.connect_room(account_id, display_name, ws, room_id)
        except ValueError as e:
            await ws.close(code=1008, reason=str(e))
            return
    else:
        # Create a personal room for this user
        room_id, _ = await manager.connect_room(account_id, display_name, ws, None)

    # Send initial room state
    room_state = manager.get_room_state(room_id)
    await ws.send_text(json.dumps({
        "type": "room_state",
        "data": room_state
    }))

    # Get user's loop state
    lstate = get_user_loop_state(account_id)
    await ws.send_text(json.dumps({
        "type": "loop_state",
        "data": lstate
    }))

    async def ticker():
        while manager.has_room_connections(room_id):
            try:
                api = SpotifyAPI(_make_token_getter(account_id))
                playback = await api.get_playback()
                if playback:
                    # Transform track to match REST /api/loop/state format
                    track = None
                    if playback.item:
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
                    pb_dict = {
                        "is_playing": playback.is_playing,
                        "progress_ms": playback.progress_ms,
                        "item": track,
                        "device": playback.device,
                        "context_uri": playback.context_uri,
                        "repeat_state": playback.repeat_state,
                        "shuffle": playback.shuffle,
                    }

                    # Only the room owner broadcasts playback state to prevent
                    # race condition where multiple users' tickers each broadcast
                    # their own account_id, causing UI flicker between different
                    # users' tracks/progress. All users receive the single primary
                    # playback stream.
                    room = manager.get_room(room_id)
                    is_owner = room is not None and account_id == room.owner_id
                    if is_owner:
                        # Send to room (single primary user broadcasts)
                        await manager.broadcast_room(room_id, {
                            "type": "playback",
                            "data": pb_dict,
                            "account_id": account_id,
                        })

                    # Check loop mode logic if active
                    if lstate["is_enabled"] and lstate["loop_start_ms"] is not None and lstate["loop_end_ms"] is not None:
                        mode_obj = BUILTIN_MODES.get(lstate["mode"], BUILTIN_MODES["Forward"])
                        loop_st = LoopState(
                            loop_start_ms=lstate["loop_start_ms"],
                            loop_end_ms=lstate["loop_end_ms"],
                            progress_ms=playback.progress_ms,
                            direction=lstate["direction"],
                            is_playing=playback.is_playing,
                        )
                        action: LoopAction = mode_obj.update(loop_st)
                        if action.new_direction is not None:
                            lstate["direction"] = action.new_direction

                        if action.seek_to_ms is not None:
                            await api.seek(action.seek_to_ms)

                        if action.should_pause:
                            await api.pause_playback()

                        # Broadcast updated loop state to room
                        await manager.broadcast_room(room_id, {
                            "type": "loop_state",
                            "data": lstate,
                            "account_id": account_id,
                        })
            except Exception as e:
                logging.getLogger(__name__).debug(f"Ticker error: {e}")
            await asyncio.sleep(LOOP_POLL_MS / 1000)

    ticker_task = asyncio.create_task(ticker())

    try:
        while True:
            text = await ws.receive_text()
            msg = json.loads(text)
            msg_type = msg.get("type")
            data = msg.get("data", {})

            if msg_type == "set_loop":
                lstate["loop_start_ms"] = data.get("start_ms")
                lstate["loop_end_ms"] = data.get("end_ms")
                lstate["is_enabled"] = True

                # Update room loop state
                manager.update_room_loop_state(room_id, lstate)
                await manager.broadcast_room(room_id, {
                    "type": "loop_state",
                    "data": lstate,
                    "account_id": account_id,
                })

            elif msg_type == "set_mode":
                lstate["mode"] = data.get("mode", "Forward")
                manager.update_room_loop_state(room_id, lstate)
                await manager.broadcast_room(room_id, {
                    "type": "loop_state",
                    "data": lstate,
                    "account_id": account_id,
                })

            elif msg_type == "clear_loop":
                lstate["loop_start_ms"] = None
                lstate["loop_end_ms"] = None
                lstate["is_enabled"] = False
                lstate["direction"] = 1
                manager.update_room_loop_state(room_id, lstate)
                await manager.broadcast_room(room_id, {
                    "type": "loop_state",
                    "data": lstate,
                    "account_id": account_id,
                })

            elif msg_type == "get_loop_state":
                await ws.send_text(json.dumps({
                    "type": "loop_state",
                    "data": lstate,
                    "account_id": account_id,
                }))

            elif msg_type == "control":
                # Playback control: play, pause, seek, volume, next, previous
                api = SpotifyAPI(_make_token_getter(account_id))
                action = data.get("action")
                if action == "play":
                    await api.start_playback(device_id=data.get("device_id"))
                elif action == "pause":
                    await api.pause_playback(device_id=data.get("device_id"))
                elif action == "seek":
                    await api.seek(data.get("position_ms", 0), device_id=data.get("device_id"))
                elif action == "volume":
                    await api.set_volume(data.get("percent", 50), device_id=data.get("device_id"))
                elif action == "next":
                    await api.skip_next(device_id=data.get("device_id"))
                elif action == "previous":
                    await api.skip_previous(device_id=data.get("device_id"))

            elif msg_type == "get_room_info":
                await ws.send_text(json.dumps({
                    "type": "room_info",
                    "data": manager.get_room_state(room_id),
                }))

            elif msg_type == "create_room":
                # Already handled by connection, but allow creating new room
                new_room = manager.create_room(account_id, data.get("name", "Loop Room"))
                await ws.send_text(json.dumps({
                    "type": "room_created",
                    "data": {
                        "room_id": new_room.room_id,
                        "name": new_room.name,
                    }
                }))

            elif msg_type == "list_rooms":
                await ws.send_text(json.dumps({
                    "type": "rooms_list",
                    "data": manager.list_public_rooms(),
                }))

    except Exception as e:
        logging.getLogger(__name__).debug(f"WS handler error: {e}")
    finally:
        ticker_task.cancel()
        try:
            await ticker_task
        except asyncio.CancelledError:
            pass
        manager.disconnect(ws)


# Keep old signature for backward compatibility
async def handle_personal_connect(ws, token: str):
    """Legacy handler for personal connections."""
    await handle_connect(ws, token, room_id=None)