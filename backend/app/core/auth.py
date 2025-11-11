from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def decode_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    return payload


def create_access_token(
    subject: str,
    *,
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[dict[str, Any]] = None,
) -> str:
    to_encode: dict[str, Any] = {"sub": subject}
    if additional_claims:
        to_encode.update(additional_claims)

    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(hours=8))
    to_encode["exp"] = int(expire.timestamp())
    to_encode["iat"] = int(now.timestamp())

    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt

