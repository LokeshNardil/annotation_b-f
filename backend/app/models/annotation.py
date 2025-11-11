from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base


class Annotation(Base):
    __tablename__ = "annotation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    viewport_id = Column(UUID(as_uuid=True), nullable=False)
    coordinates = Column(JSONB, nullable=False, default=dict)
    label_id = Column(UUID(as_uuid=True), nullable=True)
    text = Column(Text, nullable=True)
    annotation_type = Column(String, nullable=True)
    modified_by_user = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

