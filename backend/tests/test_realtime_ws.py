import pytest
from jose import jwt
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings

client = TestClient(app)


def make_token(sub: str, project_id: str = "demo-project", **extra):
    payload = {"sub": sub, "project_id": project_id}
    payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def attempt_ws(token: str) -> int:
    url = f"/ws/projects/demo-project?token={token}"
    try:
        with client.websocket_connect(url) as ws:
            ws.close()
            return 101  # if we reached here, connection succeeded
    except Exception:
        return 403


def test_ws_accepts_valid_token():
    token = make_token("test-user")
    result = attempt_ws(token)
    assert result == 101


def test_ws_rejects_invalid_signature():
    bad_token = jwt.encode({"sub": "bad"}, "wrong-secret", algorithm=settings.jwt_algorithm)
    result = attempt_ws(bad_token)
    assert result == 403


def test_ws_rejects_malformed_token():
    result = attempt_ws("not-a-jwt")
    assert result == 403
