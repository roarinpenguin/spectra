"""SPECTRA SSE streaming for real-time agent progress."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncGenerator

from starlette.responses import StreamingResponse

logger = logging.getLogger("spectra")


class StreamEvent:
    """An SSE event to send to the client."""

    def __init__(self, event_type: str, data: dict[str, Any]):
        self.event_type = event_type
        self.data = data
        self.timestamp = time.time()

    def to_sse(self) -> str:
        """Format as Server-Sent Event."""
        payload = json.dumps(self.data)
        return f"event: {self.event_type}\ndata: {payload}\n\n"


class AgentStream:
    """Manages a stream of events from agent execution.

    Used by the orchestrator and agents to push real-time progress
    events to the client via SSE.
    """

    def __init__(self):
        self._queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
        self._closed = False

    def emit(self, event_type: str, data: dict[str, Any]):
        """Emit an event to the stream."""
        if not self._closed:
            self._queue.put_nowait(StreamEvent(event_type, data))

    def agent_start(self, agent_name: str):
        """Emit agent start event."""
        self.emit("agent_start", {"agent": agent_name, "status": "starting"})

    def tool_call(self, agent_name: str, tool_name: str):
        """Emit tool call event."""
        self.emit("tool_call", {
            "agent": agent_name,
            "tool": tool_name,
            "status": "calling",
        })

    def tool_result(self, agent_name: str, tool_name: str):
        """Emit tool result event."""
        self.emit("tool_result", {
            "agent": agent_name,
            "tool": tool_name,
            "status": "complete",
        })

    def agent_complete(self, agent_name: str):
        """Emit agent complete event."""
        self.emit("agent_complete", {"agent": agent_name, "status": "complete"})

    def result(self, status: str, content: str):
        """Emit final result event and close the stream."""
        self.emit("result", {"status": status, "result": content})
        self.close()

    def error(self, message: str):
        """Emit error event and close the stream."""
        self.emit("error", {"status": "error", "message": message})
        self.close()

    def close(self):
        """Close the stream."""
        if not self._closed:
            self._closed = True
            self._queue.put_nowait(None)  # Sentinel to stop iteration

    async def events(self) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE-formatted events."""
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event.to_sse()


def create_streaming_response(stream: AgentStream) -> StreamingResponse:
    """Create a FastAPI StreamingResponse from an AgentStream."""
    return StreamingResponse(
        stream.events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


def wants_streaming(accept_header: str | None) -> bool:
    """Check if the client wants SSE streaming."""
    if not accept_header:
        return False
    return "text/event-stream" in accept_header
