from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import annotations, health, realtime, mock_auth

app = FastAPI(title="Inkwell Annotation Backend", version="0.1.0")

origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(annotations.router)
app.include_router(realtime.router)
app.include_router(mock_auth.router)


@app.get("/", summary="Service info")
def root() -> dict[str, str]:
    return {"message": "Annotation backend is running"}


