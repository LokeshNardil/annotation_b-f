import json
from typing import Any

import redis.asyncio as redis

from app.core.config import settings


async def _can_connect(client) -> bool:
    try:
        await client.ping()
        return True
    except Exception:
        return False


def _create_redis_client():
    import asyncio

    try:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            if loop.run_until_complete(_can_connect(client)):
                return client
        finally:
            asyncio.set_event_loop(None)
            loop.close()
    except Exception:
        pass

    try:
        import fakeredis.aioredis as fakeredis

        fallback_client = fakeredis.FakeRedis(decode_responses=True)
        return fallback_client
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Unable to initialize Redis client and fakeredis fallback failed") from exc


redis_client = _create_redis_client()


async def publish(channel: str, message: dict[str, Any]) -> None:
    await redis_client.publish(channel, json.dumps(message))


async def set_hash(key: str, mapping: dict[str, Any], expiry_seconds: int | None = None) -> None:
    await redis_client.hset(key, mapping=mapping)
    if expiry_seconds:
        await redis_client.expire(key, expiry_seconds)


async def delete(key: str) -> None:
    await redis_client.delete(key)


def pubsub():
    return redis_client.pubsub()

