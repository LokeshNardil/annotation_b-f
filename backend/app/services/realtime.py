from datetime import datetime, timezone
from typing import Any

import json

from app.core.config import settings
from app.core.redis import redis_client


def _presence_key(project_id: str) -> str:
    return f"presence:{project_id}"


def _cursor_key(project_id: str, user_id: str) -> str:
    return f"cursor:{project_id}:{user_id}"


def _selection_key(project_id: str) -> str:
    return f"selection:{project_id}"


async def set_presence(project_id: str, user_id: str, payload: dict[str, Any]) -> None:
    key = _presence_key(project_id)
    payload_with_meta = {
        "user_id": user_id,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    await redis_client.hset(key, user_id, json.dumps(payload_with_meta))
    await redis_client.expire(key, settings.websocket_presence_expiry_seconds)


async def clear_presence(project_id: str, user_id: str) -> None:
    key = _presence_key(project_id)
    await redis_client.hdel(key, user_id)


async def set_cursor(project_id: str, user_id: str, coordinates: dict[str, Any]) -> None:
    key = _cursor_key(project_id, user_id)
    payload = {
        "user_id": user_id,
        "x": coordinates.get("x"),
        "y": coordinates.get("y"),
        "color": coordinates.get("color"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis_client.set(key, json.dumps(payload))
    await redis_client.expire(key, settings.websocket_presence_expiry_seconds)


async def set_selection(project_id: str, user_id: str, annotation_id: str | None) -> None:
    key = _selection_key(project_id)
    payload = {
        "user_id": user_id,
        "annotation_id": annotation_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis_client.hset(key, user_id, json.dumps(payload))
    await redis_client.expire(key, settings.websocket_presence_expiry_seconds)


async def clear_selection(project_id: str, user_id: str) -> None:
    key = _selection_key(project_id)
    await redis_client.hdel(key, user_id)

