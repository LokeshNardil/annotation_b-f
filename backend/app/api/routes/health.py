from fastapi import APIRouter

from app.db.session import engine

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Health check")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/db", summary="Database connectivity check")
def db_health_check() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute("SELECT 1")
    return {"status": "ok"}


