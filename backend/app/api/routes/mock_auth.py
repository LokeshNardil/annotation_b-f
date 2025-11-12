from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import logging
from fastapi import APIRouter, Depends, HTTPException, Response, status
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import create_access_token
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User


router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=255, description="Email or username")
    password: Optional[str] = Field(default=None, description="Password (ignored for demo login)")
    project_id: Optional[str] = Field(default=None, min_length=1, max_length=128)


class LoginUser(BaseModel):
    id: UUID
    email: Optional[str]
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]


class LoginResponse(BaseModel):
    token: str
    project_id: str
    user: LoginUser


class MockLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    project_id: Optional[str] = Field(default=None, min_length=1, max_length=128)


class MockLoginResponse(BaseModel):
    token: str
    project_id: str


class DevTokenRequest(BaseModel):
    username: str = Field(default="dev-user", min_length=1, max_length=64)
    project_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    name: Optional[str] = None
    email: Optional[str] = None


def _generate_token_for_user(user: User, project_id: str) -> str:
    display_name_parts = [part for part in [user.first_name, user.last_name] if part]
    display_name = " ".join(display_name_parts) if display_name_parts else user.username or user.email or str(user.id)

    return create_access_token(
        str(user.id),
        additional_claims={
            "project_id": project_id,
            "name": display_name,
            "email": user.email,
        },
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    project_id = payload.project_id or "demo-project"
    logger.debug("Login attempt identifier=%s project_id=%s", payload.identifier, project_id)

    user: Optional[User] = (
        db.query(User)
        .filter(
            or_(
                User.email.ilike(payload.identifier),
                User.username.ilike(payload.identifier),
            )
        )
        .first()
    )

    if not user or not user.is_active:
        logger.warning("Login failed: user not found or inactive for identifier=%s", payload.identifier)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = _generate_token_for_user(user, project_id)

    logger.debug("Login succeeded for user_id=%s", user.id)

    return LoginResponse(
        token=token,
        project_id=project_id,
        user=LoginUser(
            id=user.id,
            email=user.email,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
        ),
    )


@router.options("/login", include_in_schema=False)
def login_options() -> Response:
    """Handle CORS preflight by returning 200 OK."""
    return Response(status_code=status.HTTP_200_OK)


@router.post("/mock-login", response_model=MockLoginResponse)
def mock_login(payload: MockLoginRequest) -> MockLoginResponse:
    project_id = payload.project_id or "demo-project"
    issued_at = datetime.utcnow()
    expires_at = issued_at + timedelta(hours=8)

    token = jwt.encode(
        {
            "sub": payload.username,
            "iat": int(issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
            "project_id": project_id,
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    return MockLoginResponse(token=token, project_id=project_id)


@router.post("/dev-token", response_model=MockLoginResponse, include_in_schema=False)
def dev_token(payload: DevTokenRequest) -> MockLoginResponse:
    project_id = payload.project_id or "demo-project"
    claims = {
        "project_id": project_id,
        "name": payload.name or payload.username,
    }
    if payload.email:
        claims["email"] = payload.email

    token = create_access_token(payload.username, additional_claims=claims)

    return MockLoginResponse(token=token, project_id=project_id)
