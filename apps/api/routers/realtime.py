"""Ocean Pulse REST snapshot and browser-native SSE stream."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from data_sources.live_fusion import get_live_fusion_service

router = APIRouter()


@router.get("/snapshot", summary="Get the current time-aware operational picture")
def get_realtime_snapshot():
    return get_live_fusion_service().snapshot()


@router.get("/stream", summary="Stream Ocean Pulse updates using Server-Sent Events")
async def stream_realtime(request: Request):
    service = get_live_fusion_service()

    async def events():
        yield "retry: 3000\n\n"
        while not await request.is_disconnected():
            payload = json.dumps(service.snapshot(), separators=(",", ":"))
            yield f"event: ocean-pulse\ndata: {payload}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
