import asyncio
import json
import os
import sys
import uuid
from datetime import datetime

import websockets


PROJECT_ID = os.environ.get("PROJECT_ID")
TOKEN = os.environ.get("WS_TOKEN")
VIEWPORT_ID = os.environ.get("VIEWPORT_ID")
BASE_URL = os.environ.get("WS_BASE_URL", "ws://localhost:8000")

if not PROJECT_ID or not TOKEN:
    print("Please set PROJECT_ID and WS_TOKEN environment variables.")
    sys.exit(1)


async def run_demo():
    url = f"{BASE_URL.rstrip('/')}/ws/projects/{PROJECT_ID}?token={TOKEN}"
    async with websockets.connect(url) as ws:
        print(f"Connected to {url}")

        async def receiver():
            async for message in ws:
                payload = json.loads(message)
                event_type = payload.get("type")
                print(f"<-- {event_type}: {json.dumps(payload, indent=2)}")

        receiver_task = asyncio.create_task(receiver())

        async def send(event_type: str, payload: dict):
            message = {"type": event_type, "payload": payload}
            print(f"--> {event_type}: {json.dumps(payload)}")
            await ws.send(json.dumps(message))

        await send("presence:ping", {})
        await send("cursor:update", {"x": 100, "y": 150, "color": "#ff0000"})

        if VIEWPORT_ID:
            await send("annotation:list", {"viewport_id": VIEWPORT_ID})

            annotation_id = str(uuid.uuid4())
            payload = {
                "id": annotation_id,
                "viewport_id": VIEWPORT_ID,
                "coordinates": {"x": 100, "y": 120, "w": 240, "h": 80},
                "annotation_type": "Demo",
                "text": f"Created at {datetime.utcnow().isoformat()}",
            }
            await send("annotation:create", payload)

            update_payload = {
                "id": annotation_id,
                "viewport_id": VIEWPORT_ID,
                "coordinates": {"x": 110, "y": 140, "w": 240, "h": 80},
            }
            await send("annotation:update", update_payload)

            await send("annotation:delete", {"id": annotation_id})

        await asyncio.sleep(2)
        receiver_task.cancel()
        try:
            await receiver_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    asyncio.run(run_demo())

