# Backend Service

This folder contains a FastAPI service that connects to the shared PostgreSQL database used by the annotation application.

## Prerequisites

- Python 3.10+
- Access to the PostgreSQL instance (`nardil_annotation` database)

## Setup

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows
# or
source .venv/bin/activate # macOS/Linux

pip install -r requirements.txt
```

### Environment

```bash
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=nardil_annotatiom
set DB_USER=postgres
set DB_PASSWORD=admin@77
set REDIS_URL=redis://localhost:6379/0
set JWT_SECRET_KEY=replace-this-secret
```

## Run the server

```bash
uvicorn app.main:app --reload
```

The API will be available at <http://127.0.0.1:8000>. View interactive docs at <http://127.0.0.1:8000/docs>.

### Realtime WebSocket

- Endpoint: `ws://localhost:8000/ws/projects/{project_id}?token=YOUR_JWT`
- Message types currently supported:
  - `presence:ping` – keep the connection alive.
  - `cursor:update` – broadcast `{x, y, color, tool}` to everyone in the same project room.
  - `annotation:create`, `annotation:update`, `annotation:delete` – send annotation payloads with optimistic `version` (ISO timestamp).
  - `annotation:list` – request current annotations for a `viewport_id`.
  - `selection:update` / `selection:clear` – broadcast current selection (annotation id) per user.
- Server emits:
  - `presence:join` / `presence:leave`
  - `cursor:update`
  - `annotation:created`, `annotation:updated`, `annotation:deleted`
  - `annotation:conflict` when an update/delete races with a newer version
  - `annotation:list` response containing `{viewport_id, annotations}` when requested
  - `selection:update`, `selection:clear` for active selection tracking

#### Quick WebSocket smoke test

```bash
cd backend
PROJECT_ID=... WS_TOKEN=... VIEWPORT_ID=... python scripts/ws_client.py
```

The script will connect, request `annotation:list`, then create/update/delete a demo annotation so you can watch the broadcast traffic in the console.

Redis is required for fan-out and presence tracking.	Start a local instance with Docker:

```bash
docker run -p 6379:6379 redis:7-alpine
```

### Database sanity check

Use the helper script to print tables:

```bash
python check_db.py
```


