"""Spotify Web API client with rate-limit backoff and 401 retry."""
import asyncio
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx
import requests

API_BASE = "https://api.spotify.com/v1"


@dataclass
class PlaybackInfo:
    is_playing: bool
    progress_ms: int
    item: Optional[Dict[str, Any]] = None
    device: Optional[Dict[str, Any]] = None
    context_uri: Optional[str] = None
    repeat_state: str = "off"
    shuffle: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to camelCase for frontend compatibility."""
        return {
            "isPlaying": self.is_playing,
            "progressMs": self.progress_ms,
            "item": self.item,
            "device": self.device,
            "contextUri": self.context_uri,
            "repeatState": self.repeat_state,
            "shuffle": self.shuffle,
        }


class SpotifyAPI:
    """Spotify Web API client with exponential backoff for rate limits."""

    def __init__(self, token_getter: Callable[[], Optional[str]]):
        self.token_getter = token_getter
        self._client = httpx.AsyncClient(timeout=30.0)

    def _headers(self) -> Dict[str, str]:
        token = self.token_getter()
        if not token:
            raise RuntimeError("No valid token — user not authenticated")
        return {"Authorization": f"Bearer {token}"}

    async def _req(self, method: str, endpoint: str, **kwargs):
        url = f"{API_BASE}{endpoint}"
        headers = self._headers()
        if "headers" in kwargs:
            headers.update(kwargs.pop("headers"))

        try:
            resp = await self._client.request(method, url, headers=headers, **kwargs)
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error contacting Spotify: {e}") from e

        # 401: token expired — refresh and retry with a fresh header.
        if resp.status_code == 401:
            headers = self._headers()
            resp = await self._client.request(method, url, headers=headers, **kwargs)

        # 429: rate limited — honour Retry-After then retry once.
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "1"))
            await asyncio.sleep(min(retry_after, 60))
            resp = await self._client.request(method, url, headers=headers, **kwargs)

        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            # Convert to requests.HTTPError for compatibility with existing callers
            raise requests.HTTPError(str(e), response=e.response) from e

        return resp

    # ── playback ─────────────────────────────────────────────────────────

    async def get_playback(self) -> Optional[PlaybackInfo]:
        resp = await self._req("GET", "/me/player")
        if resp.status_code == 204:
            return None
        data = resp.json()
        return PlaybackInfo(
            is_playing=data.get("is_playing", False),
            progress_ms=data.get("progress_ms", 0),
            item=data.get("item") or None,
            device=data.get("device") or None,
            context_uri=(data.get("context") or {}).get("uri"),
            repeat_state=data.get("repeat_state", "off"),
            shuffle=data.get("shuffle_state", False),
        )

    async def get_devices(self) -> List[Dict[str, Any]]:
        resp = await self._req("GET", "/me/player/devices")
        return resp.json().get("devices", [])

    async def get_currently_playing(self) -> Optional[Dict[str, Any]]:
        resp = await self._req("GET", "/me/player/currently-playing")
        if resp.status_code == 204:
            return None
        return resp.json()

    async def start_playback(
        self,
        device_id: Optional[str] = None,
        uris: Optional[List[str]] = None,
        context_uri: Optional[str] = None,
        position_ms: int = 0,
    ) -> None:
        body: Dict[str, Any] = {}
        if context_uri:
            body["context_uri"] = context_uri
        if uris:
            body["uris"] = uris
        if position_ms:
            body["position_ms"] = position_ms
        params = {"device_id": device_id} if device_id else {}
        await self._req("PUT", "/me/player/play", params=params, json=body or None)

    async def pause_playback(self, device_id: Optional[str] = None) -> None:
        params = {"device_id": device_id} if device_id else {}
        await self._req("PUT", "/me/player/pause", params=params)

    async def seek(self, position_ms: int, device_id: Optional[str] = None) -> None:
        params = {"position_ms": position_ms}
        if device_id:
            params["device_id"] = device_id
        await self._req("PUT", "/me/player/seek", params=params)

    async def set_volume(self, percent: int, device_id: Optional[str] = None) -> None:
        params = {"volume_percent": max(0, min(100, percent))}
        if device_id:
            params["device_id"] = device_id
        await self._req("PUT", "/me/player/volume", params=params)

    async def transfer_playback(self, device_id: str, force_play: bool = False) -> None:
        await self._req("PUT", "/me/player", json={"device_ids": [device_id], "play": force_play})

    async def set_repeat(self, state: str, device_id: Optional[str] = None) -> None:
        params = {"state": state}
        if device_id:
            params["device_id"] = device_id
        await self._req("PUT", "/me/player/repeat", params=params)

    async def set_shuffle(self, shuffle: bool, device_id: Optional[str] = None) -> None:
        params = {"state": "on" if shuffle else "off"}
        if device_id:
            params["device_id"] = device_id
        await self._req("PUT", "/me/player/shuffle", params=params)

    async def skip_next(self, device_id: Optional[str] = None) -> None:
        params = {"device_id": device_id} if device_id else {}
        await self._req("POST", "/me/player/next", params=params)

    async def skip_previous(self, device_id: Optional[str] = None) -> None:
        params = {"device_id": device_id} if device_id else {}
        await self._req("POST", "/me/player/previous", params=params)

    # ── catalog ──────────────────────────────────────────────────────────

    async def search(self, query: str, type: str = "track", limit: int = 20) -> List[Dict[str, Any]]:
        # Spotify's search endpoint rejects limit > 10 for tracks; clamp to 10.
        params = {"q": query, "type": type, "limit": max(1, min(limit, 10))}
        resp = await self._req("GET", "/search", params=params)
        # Use explicit mapping for known types instead of naive pluralization
        type_key_map = {"track": "tracks", "album": "albums", "playlist": "playlists", "artist": "artists"}
        key = type_key_map.get(type, f"{type}s")
        return resp.json().get(key, {}).get("items", [])

    async def get_track(self, track_id: str) -> Optional[Dict[str, Any]]:
        resp = await self._req("GET", f"/tracks/{track_id}")
        return resp.json()

    async def get_user_profile(self) -> Optional[Dict[str, Any]]:
        resp = await self._req("GET", "/me")
        return resp.json()
