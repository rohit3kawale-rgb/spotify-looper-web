"""WebSocket connection manager with per-room broadcast and shareable rooms.

Rooms can be created by users and shared via link. Each room tracks connected
users and broadcasts playback/loop state to all members.
"""
import asyncio
import json
import secrets
from typing import Dict, Set, Optional
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import WebSocket


@dataclass
class UserPresence:
    """User presence info in a room."""
    account_id: str
    display_name: str
    avatar_url: str = ""
    joined_at: datetime = field(default_factory=datetime.utcnow)
    is_active: bool = True


@dataclass
class Room:
    """A shareable loop room."""
    room_id: str
    owner_id: str
    name: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    users: Dict[str, UserPresence] = field(default_factory=dict)  # account_id -> presence
    loop_state: dict = field(default_factory=dict)  # shared loop state
    is_public: bool = True


class ConnectionManager:
    def __init__(self):
        # account_id -> set of websockets (for personal messages)
        self._personal_rooms: Dict[str, Set[WebSocket]] = {}
        # room_id -> set of websockets (for room broadcasts)
        self._rooms: Dict[str, Dict[str, WebSocket]] = {}  # room_id -> {account_id: ws}
        # room metadata
        self._room_meta: Dict[str, Room] = {}
        # websocket -> (account_id, room_id) mapping
        self._connections: Dict[WebSocket, tuple[str, Optional[str]]] = {}

    def _get_room(self, room_id: str) -> Optional[Room]:
        return self._room_meta.get(room_id)

    def create_room(self, owner_id: str, name: str = "Loop Room") -> Room:
        """Create a new shareable room."""
        room_id = secrets.token_urlsafe(12)
        room = Room(
            room_id=room_id,
            owner_id=owner_id,
            name=name,
        )
        room.users[owner_id] = UserPresence(
            account_id=owner_id,
            display_name=owner_id[:12],
        )
        self._room_meta[room_id] = room
        self._rooms[room_id] = {}
        return room

    def get_room(self, room_id: str) -> Optional[Room]:
        return self._room_meta.get(room_id)

    def delete_room(self, room_id: str) -> bool:
        """Delete a room if the caller is the owner."""
        room = self._room_meta.get(room_id)
        if room:
            # Disconnect all users in the room
            for ws in list(self._rooms.get(room_id, {}).values()):
                ws.close()
            del self._rooms[room_id]
            del self._room_meta[room_id]
            return True
        return False

    def list_public_rooms(self) -> list[dict]:
        """List public rooms for discovery."""
        return [
            {
                "room_id": room.room_id,
                "name": room.name,
                "owner_id": room.owner_id,
                "user_count": len(room.users),
                "created_at": room.created_at.isoformat(),
            }
            for room in self._room_meta.values()
            if room.is_public
        ]

    async def connect_personal(self, account_id: str, websocket: WebSocket) -> None:
        """Connect for personal (non-room) messages."""
        await websocket.accept()
        self._personal_rooms.setdefault(account_id, set()).add(websocket)
        self._connections[websocket] = (account_id, None)

    async def connect_room(
        self,
        account_id: str,
        display_name: str,
        websocket: WebSocket,
        room_id: Optional[str] = None,
    ) -> tuple[str, bool]:
        """Connect to a room. If room_id is None, create a new room."""
        await websocket.accept()

        if room_id is None:
            # Create new room
            room = self.create_room(account_id, name=f"{display_name}'s Room")
            room_id = room.room_id
            is_new = True
        else:
            room = self._room_meta.get(room_id)
            if not room:
                raise ValueError(f"Room {room_id} not found")
            is_new = False

        # Add user to room
        room.users[account_id] = UserPresence(
            account_id=account_id,
            display_name=display_name,
        )
        self._rooms[room_id][account_id] = websocket
        self._connections[websocket] = (account_id, room_id)

        # Notify room of new user
        await self._broadcast_room(
            room_id,
            {
                "type": "user_joined",
                "data": {
                    "account_id": account_id,
                    "display_name": display_name,
                    "users": self._room_users_list(room_id),
                }
            },
            exclude=account_id
        )

        return room_id, is_new

    def disconnect(self, websocket: WebSocket) -> None:
        """Disconnect a websocket from personal and/or room."""
        conn = self._connections.pop(websocket, None)
        if not conn:
            return

        account_id, room_id = conn

        # Remove from personal room
        personal = self._personal_rooms.get(account_id)
        if personal:
            personal.discard(websocket)
            if not personal:
                self._personal_rooms.pop(account_id, None)

        # Remove from room
        if room_id and room_id in self._rooms:
            room = self._room_meta.get(room_id)
            if room:
                room.users.pop(account_id, None)
                # Notify room of user left
                asyncio.create_task(self._broadcast_room(
                    room_id,
                    {
                        "type": "user_left",
                        "data": {
                            "account_id": account_id,
                            "users": self._room_users_list(room_id),
                        }
                    }
                ))
                # Clean up empty rooms (unless owner)
                if not room.users and room.owner_id != account_id:
                    self.delete_room(room_id)

            self._rooms[room_id].pop(account_id, None)
            if not self._rooms[room_id]:
                self._rooms.pop(room_id, None)

    def _room_users_list(self, room_id: str) -> list[dict]:
        room = self._room_meta.get(room_id)
        if not room:
            return []
        return [
            {
                "account_id": p.account_id,
                "display_name": p.display_name,
                "avatar_url": p.avatar_url,
                "joined_at": p.joined_at.isoformat(),
            }
            for p in room.users.values()
        ]

    async def send_personal(self, account_id: str, message: dict) -> None:
        """Send to all personal connections for an account."""
        room = self._personal_rooms.get(account_id, set())
        dead = []
        for ws in room:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def _broadcast_room(self, room_id: str, message: dict, exclude: Optional[str] = None) -> None:
        """Broadcast to all connections in a room."""
        room_ws = self._rooms.get(room_id, {})
        dead = []
        for acc_id, ws in room_ws.items():
            if exclude and acc_id == exclude:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append((acc_id, ws))
        for acc_id, ws in dead:
            self.disconnect(ws)

    async def broadcast_room(self, room_id: str, message: dict) -> None:
        """Public broadcast to room (includes sender)."""
        await self._broadcast_room(room_id, message)

    async def broadcast_room_others(self, room_id: str, message: dict, sender: str) -> None:
        """Broadcast to room excluding sender."""
        await self._broadcast_room(room_id, message, exclude=sender)

    def has_personal_connections(self, account_id: str) -> bool:
        return bool(self._personal_rooms.get(account_id))

    def has_room_connections(self, room_id: str) -> bool:
        return bool(self._rooms.get(room_id))

    def get_room_state(self, room_id: str) -> dict:
        room = self._room_meta.get(room_id)
        if not room:
            return {}
        return {
            "room_id": room.room_id,
            "name": room.name,
            "owner_id": room.owner_id,
            "users": self._room_users_list(room_id),
            "loop_state": room.loop_state,
        }

    def update_room_loop_state(self, room_id: str, loop_state: dict) -> None:
        room = self._room_meta.get(room_id)
        if room:
            room.loop_state = loop_state


manager = ConnectionManager()