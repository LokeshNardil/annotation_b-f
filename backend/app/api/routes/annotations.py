from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("", summary="List annotations")
def list_annotations(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    # TODO: replace with real ORM models
    query = """
        SELECT id, viewport_id, coordinates, label_id, text, annotation_type, status
        FROM annotation
        ORDER BY created_by, id
        LIMIT 100
    """
    try:
        result = db.execute(query)
    except Exception as exc:  # noqa: BLE001 - bubble up for visibility
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    annotations = []
    for row in result.mappings():
        annotations.append(dict(row))
    return annotations


