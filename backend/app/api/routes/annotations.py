from typing import Any, Literal
import csv
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db


class OcrAnnotationPayload(BaseModel):
    id: str
    x: float
    y: float
    width: float = Field(..., alias="w")
    height: float = Field(..., alias="h")
    text: str
    label: str | None = None
    confidence: float | None = None

    class Config:
        populate_by_name = True


class SaveOcrAnnotationsRequest(BaseModel):
    relative_csv_path: str = Field(..., description="Path relative to the annotation assets root")
    annotations: list[OcrAnnotationPayload]


class BoundingBoxAnnotationPayload(BaseModel):
    id: str
    label: str | None = None
    class_id: str | None = None
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    confidence: float | None = None

    class Config:
        populate_by_name = True
        extra = "allow"


class SaveBoundingBoxAnnotationsRequest(BaseModel):
    relative_csv_path: str = Field(..., description="Path relative to the annotation assets root")
    annotations: list[BoundingBoxAnnotationPayload]


router = APIRouter(prefix="/annotations", tags=["annotations"])

logger = logging.getLogger(__name__)

MODEL_LABELS = ["T1", "T2", "S15", "VerticalBars", "HorizontalBars", "T3", "T4", "S20", "S25"]
PROFILE_LABELS = [
    "Column Schedule",
    "Column Section",
    "Wall Schedule",
    "Beam Schedule",
    "Slab Schedule",
    "Foundation Schedule",
    "Detail Section",
    "Elevation",
    "Plan View",
]

MODEL_LABEL_TO_CLASS_ID = {label: str(index) for index, label in enumerate(MODEL_LABELS, start=1)}
PROFILE_LABEL_TO_CLASS_ID = {label: str(index) for index, label in enumerate(PROFILE_LABELS, start=1)}


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


@router.post("/ocr/save", summary="Persist OCR annotations to CSV")
def save_ocr_annotations(payload: SaveOcrAnnotationsRequest) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[3].parent
    base_dir = (project_root / "inkwell-annotator").resolve()
    target_path = (base_dir / payload.relative_csv_path).resolve()

    try:
        target_path.relative_to(base_dir)
    except ValueError as exc:  # noqa: BLE001 - safeguard against path traversal
        raise HTTPException(status_code=400, detail="Invalid CSV path") from exc

    target_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["x", "y", "width", "height", "text", "label", "confidence"]

    try:
        with target_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()
            for annotation in payload.annotations:
                writer.writerow(
                    {
                        "x": annotation.x,
                        "y": annotation.y,
                        "width": annotation.width,
                        "height": annotation.height,
                        "text": annotation.text,
                        "label": annotation.label or "",
                        "confidence": annotation.confidence if annotation.confidence is not None else "",
                    }
                )
        logger.info(
            "Wrote %s OCR annotations to %s",
            len(payload.annotations),
            target_path,
        )
    except OSError as exc:  # noqa: BLE001 - return HTTP error for IO issues
        logger.exception("Failed to persist OCR annotations to %s", target_path)
        raise HTTPException(status_code=500, detail=f"Failed to write CSV: {exc}") from exc

    return {
        "status": "ok",
        "rows": len(payload.annotations),
        "csv_path": str(target_path),
    }


def _resolve_class_id(category: Literal["model", "profile"], annotation: BoundingBoxAnnotationPayload) -> str:
    if annotation.class_id:
        return str(annotation.class_id)

    label = annotation.label or ""
    lookup = MODEL_LABEL_TO_CLASS_ID if category == "model" else PROFILE_LABEL_TO_CLASS_ID
    if label in lookup:
        return lookup[label]

    # Fallback to label itself when unknown
    return label or ""


@router.post("/{category}/save", summary="Persist model/profile annotations to CSV")
def save_bounding_box_annotations(
    category: Literal["model", "profile"],
    payload: SaveBoundingBoxAnnotationsRequest,
) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[3].parent
    base_dir = (project_root / "inkwell-annotator").resolve()
    target_path = (base_dir / payload.relative_csv_path).resolve()

    try:
        target_path.relative_to(base_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid CSV path") from exc

    target_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["class_id", "x_min", "y_min", "x_max", "y_max", "confidence"]

    try:
        with target_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()
            for annotation in payload.annotations:
                class_id = _resolve_class_id(category, annotation)
                writer.writerow(
                    {
                        "class_id": class_id,
                        "x_min": annotation.x_min,
                        "y_min": annotation.y_min,
                        "x_max": annotation.x_max,
                        "y_max": annotation.y_max,
                        "confidence": annotation.confidence if annotation.confidence is not None else 1,
                    }
                )
        logger.info(
            "Wrote %s %s annotations to %s",
            len(payload.annotations),
            category.upper(),
            target_path,
        )
    except OSError as exc:
        logger.exception("Failed to persist %s annotations to %s", category, target_path)
        raise HTTPException(status_code=500, detail=f"Failed to write CSV: {exc}") from exc

    return {
        "status": "ok",
        "rows": len(payload.annotations),
        "csv_path": str(target_path),
    }

