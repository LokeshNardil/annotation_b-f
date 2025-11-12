import asyncio
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import SessionLocal
from app.models.annotation import Annotation


class AnnotationNotFound(Exception):
    pass


class AnnotationConflict(Exception):
    def __init__(self, annotation: Annotation):
        self.annotation = annotation


def serialize_annotation(annotation: Annotation) -> dict[str, Any]:
    return {
        "id": str(annotation.id),
        "viewport_id": str(annotation.viewport_id) if annotation.viewport_id else None,
        "coordinates": annotation.coordinates or {},
        "label_id": str(annotation.label_id) if annotation.label_id else None,
        "text": annotation.text,
        "annotation_type": annotation.annotation_type,
        "status": annotation.status,
        "created_by": str(annotation.created_by) if annotation.created_by else None,
        "modified_by_user": str(annotation.modified_by_user) if annotation.modified_by_user else None,
        "created_at": annotation.created_at.isoformat() if annotation.created_at else None,
        "updated_at": annotation.updated_at.isoformat() if annotation.updated_at else None,
        "version": annotation.updated_at.isoformat() if annotation.updated_at else None,
    }


def _parse_uuid(value: Optional[str]) -> Optional[UUID]:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _create_annotation_sync(payload: dict[str, Any], user_id: UUID) -> Annotation:
    session = SessionLocal()
    try:
        annotation = Annotation(
            id=_parse_uuid(payload.get("id")) or uuid4(),
            viewport_id=_parse_uuid(payload["viewport_id"]),
            coordinates=payload.get("coordinates") or {},
            label_id=_parse_uuid(payload.get("label_id")),
            text=payload.get("text"),
            annotation_type=payload.get("annotation_type"),
            status=payload.get("status") or "active",
            created_by=user_id,
            modified_by_user=user_id,
        )
        session.add(annotation)
        session.commit()
        session.refresh(annotation)
        return annotation
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _update_annotation_sync(payload: dict[str, Any], user_id: UUID) -> Annotation:
    annotation_id = _parse_uuid(payload.get("id"))
    if not annotation_id:
        raise ValueError("Annotation id is required")

    expected_version = payload.get("version")

    session = SessionLocal()
    try:
        annotation = session.get(Annotation, annotation_id)
        if annotation is None:
            raise AnnotationNotFound()

        current_version = annotation.updated_at.isoformat() if annotation.updated_at else None
        if expected_version and current_version != expected_version:
            raise AnnotationConflict(annotation)

        if "coordinates" in payload:
            annotation.coordinates = payload["coordinates"]
        if "label_id" in payload:
            annotation.label_id = _parse_uuid(payload["label_id"])
        if "text" in payload:
            annotation.text = payload["text"]
        if "annotation_type" in payload:
            annotation.annotation_type = payload["annotation_type"]
        if "status" in payload:
            annotation.status = payload["status"]

        annotation.modified_by_user = user_id

        session.commit()
        session.refresh(annotation)
        return annotation
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _delete_annotation_sync(annotation_id: UUID, expected_version: Optional[str]) -> Annotation:
    session = SessionLocal()
    try:
        annotation = session.get(Annotation, annotation_id)
        if annotation is None:
            raise AnnotationNotFound()

        current_version = annotation.updated_at.isoformat() if annotation.updated_at else None
        if expected_version and current_version != expected_version:
            raise AnnotationConflict(annotation)

        session.delete(annotation)
        session.commit()
        return annotation
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


async def create_annotation(payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    annotation = await asyncio.to_thread(_create_annotation_sync, payload, _parse_uuid(user_id))
    return serialize_annotation(annotation)


async def update_annotation(payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    annotation = await asyncio.to_thread(_update_annotation_sync, payload, _parse_uuid(user_id))
    return serialize_annotation(annotation)


async def delete_annotation(annotation_id: str, expected_version: Optional[str]) -> dict[str, Any]:
    annotation = await asyncio.to_thread(_delete_annotation_sync, _parse_uuid(annotation_id), expected_version)
    return serialize_annotation(annotation)


def _list_annotations_sync(viewport_uuid: UUID) -> list[Annotation]:
    session = SessionLocal()
    try:
        stmt = (
            select(Annotation)
            .where(Annotation.viewport_id == viewport_uuid)
            .order_by(Annotation.created_at)
        )
        result = session.execute(stmt)
        return [row[0] for row in result]
    finally:
        session.close()


async def list_annotations(viewport_id: str) -> list[dict[str, Any]]:
    annotations = await asyncio.to_thread(_list_annotations_sync, _parse_uuid(viewport_id))
    return [serialize_annotation(ann) for ann in annotations]

