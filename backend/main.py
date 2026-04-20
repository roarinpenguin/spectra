"""SPECTRA Backend - FastAPI server entrypoint (v1.1)."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from routes import router

app = FastAPI(
    title="SPECTRA Backend",
    description="Security Posture Exploration & Correlated Threat Response Assistant",
    version="1.1.0",
)


class NoStoreAPIMiddleware(BaseHTTPMiddleware):
    """Forbid intermediary caching of any /api/* response.

    Defense in depth: SPECTRA's API responses can include user-specific
    data (logs, metrics, MCP results). We never want a corporate proxy
    or shared cache to retain them.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, private")
            response.headers.setdefault("Pragma", "no-cache")
        return response


app.add_middleware(NoStoreAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Spectra-Session-Id"],
    expose_headers=["X-Spectra-Session-Id"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
