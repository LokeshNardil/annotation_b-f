import asyncio
import contextlib
import os
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.auth import decode_token
from app.core.redis import pubsub, publish
from app.services import annotation_service
from app.services.annotation_service import AnnotationConflict, AnnotationNotFound
from app.services.realtime import clear_presence, clear_selection, set_cursor, set_presence, set_selection

router = APIRouter(prefix="/ws", tags=["realtime"])
ALLOW_INSECURE_WS = os.getenv("ALLOW_INSECURE_WS_TOKENS", "0") == "1"


async def _redis_to_websocket(websocket: WebSocket, channel: str) -> None:
    subscriber = pubsub()
    await subscriber.subscribe(channel)
    try:
        async for message in subscriber.listen():
            if message["type"] != "message":
                continue
            await websocket.send_text(message["data"])
    finally:
        await subscriber.unsubscribe(channel)
        await subscriber.close()


def _extract_identity(claims: dict[str, Any]) -> tuple[str, str]:
    user_id = str(
        claims.get("sub")
        or claims.get("user_id")
        or claims.get("id")
        or claims.get("uid")
    )
    if not user_id:
        raise ValueError("Token missing user identifier")
    username = str(claims.get("name") or claims.get("username") or user_id)
    return user_id, username


@router.websocket("/projects/{project_id}")
async def project_channel(websocket: WebSocket, project_id: str, token: str | None = None):
    # Temporary dev bypass: accept tokens if decode() fails.
    user_id = None
    username = None

    if token:
        try:
            claims = decode_token(token)
            user_id, username = _extract_identity(claims)
            print("[Realtime][WS] decoded token", {"user_id": user_id, "project_id": project_id})
        except Exception as exc:  # noqa: BLE001
            print("[Realtime][WS] token decode failed", exc)
            if ALLOW_INSECURE_WS:
                from jose import jwt as jose_jwt

                try:
                    claims = jose_jwt.get_unverified_claims(token)
                    user_id = str(
                        claims.get("sub")
                        or claims.get("user_id")
                        or claims.get("id")
                        or claims.get("uid")
                    )
                    if user_id:
                        username = str(claims.get("name") or claims.get("username") or user_id)
                        print("[Realtime][WS] DEV bypass accepted", {"user_id": user_id, "project_id": project_id})
                except Exception as inner:  # noqa: BLE001
                    print("[Realtime][WS] dev bypass failed", inner)
                    user_id = None
            else:
                user_id = None

    if not user_id:
        print("[Realtime][WS] closing - missing or invalid token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    channel_name = f"projects:{project_id}:broadcast"

    await set_presence(project_id, user_id, {"username": username})
    await publish(
        channel_name,
        {
            "type": "presence:join",
            "project_id": project_id,
            "user": {"id": user_id, "name": username},
        },
    )

    listener_task = asyncio.create_task(_redis_to_websocket(websocket, channel_name))

    try:
        while True:
            message = await websocket.receive_json()
            event_type = message.get("type")
            payload = message.get("payload", {})

            if event_type == "presence:ping":
                await set_presence(project_id, user_id, {"username": username})
            elif event_type == "cursor:update":
                coordinates = {
                    "x": payload.get("x"),
                    "y": payload.get("y"),
                    "color": payload.get("color"),
                    "tool": payload.get("tool"),
                }
                await set_cursor(project_id, user_id, coordinates)
                await publish(
                    channel_name,
                    {
                        "type": "cursor:update",
                        "project_id": project_id,
                        "user": {"id": user_id, "name": username},
                        "payload": coordinates,
                    },
                )
            elif event_type == "annotation:create":
                try:
                    annotation = await annotation_service.create_annotation(payload, user_id)
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:create", "message": str(exc)}
                    )
                    continue

                message = {
                    "type": "annotation:created",
                    "project_id": project_id,
                    "annotation": annotation,
                }
                await publish(channel_name, message)
                await websocket.send_json({"type": "ack", "event": "annotation:create", "annotation": annotation})
            elif event_type == "annotation:update":
                try:
                    annotation = await annotation_service.update_annotation(payload, user_id)
                except AnnotationConflict as conflict:
                    await websocket.send_json(
                        {
                            "type": "annotation:conflict",
                            "event": "annotation:update",
                            "annotation": annotation_service.serialize_annotation(conflict.annotation),
                        }
                    )
                    continue
                except AnnotationNotFound:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "event": "annotation:update",
                            "message": "Annotation not found",
                        }
                    )
                    continue
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:update", "message": str(exc)}
                    )
                    continue

                message = {
                    "type": "annotation:updated",
                    "project_id": project_id,
                    "annotation": annotation,
                }
                await publish(channel_name, message)
                await websocket.send_json({"type": "ack", "event": "annotation:update", "annotation": annotation})
            elif event_type == "annotation:delete":
                annotation_id = payload.get("id")
                version = payload.get("version")
                if not annotation_id:
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:delete", "message": "Annotation id is required"}
                    )
                    continue
                try:
                    annotation = await annotation_service.delete_annotation(annotation_id, version)
                except AnnotationConflict as conflict:
                    await websocket.send_json(
                        {
                            "type": "annotation:conflict",
                            "event": "annotation:delete",
                            "annotation": annotation_service.serialize_annotation(conflict.annotation),
                        }
                    )
                    continue
                except AnnotationNotFound:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "event": "annotation:delete",
                            "message": "Annotation not found",
                        }
                    )
                    continue
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:delete", "message": str(exc)}
                    )
                    continue

                message = {
                    "type": "annotation:deleted",
                    "project_id": project_id,
                    "annotation": annotation,
                }
                await publish(channel_name, message)
                await websocket.send_json({"type": "ack", "event": "annotation:delete", "annotation": annotation})
            elif event_type == "selection:update":
                annotation_id = payload.get("annotation_id") or payload.get("id")
                if not annotation_id:
                    await websocket.send_json(
                        {"type": "error", "event": "selection:update", "message": "annotation_id is required"}
                    )
                    continue

                await set_selection(project_id, user_id, annotation_id)
                await publish(
                    channel_name,
                    {
                        "type": "selection:update",
                        "project_id": project_id,
                        "selection_id": annotation_id,
                        "user": {"id": user_id, "name": username},
                    },
                )
            elif event_type == "selection:clear":
                await clear_selection(project_id, user_id)
                await publish(
                    channel_name,
                    {
                        "type": "selection:clear",
                        "project_id": project_id,
                        "user": {"id": user_id, "name": username},
                    },
                )
            elif event_type == "annotation:list":
                viewport_id = payload.get("viewport_id")
                if not viewport_id:
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:list", "message": "viewport_id is required"}
                    )
                    continue
                try:
                    annotations = await annotation_service.list_annotations(viewport_id)
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json(
                        {"type": "error", "event": "annotation:list", "message": str(exc)}
                    )
                    continue

                await websocket.send_json(
                    {
                        "type": "annotation:list",
                        "project_id": project_id,
                        "viewport_id": viewport_id,
                        "annotations": annotations,
                    }
                )
            else:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"Unsupported event type: {event_type}",
                    }
                )
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        with contextlib.suppress(Exception):
            await listener_task
        await clear_presence(project_id, user_id)
        await publish(
            channel_name,
            {
                "type": "presence:leave",
                "project_id": project_id,
                "user": {"id": user_id, "name": username},
            },
        )

