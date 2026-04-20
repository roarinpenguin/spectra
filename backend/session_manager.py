"""SPECTRA per-session manager for multi-tenant horizontal scalability.

This module enables SPECTRA to serve many independent browser sessions
concurrently from a single backend instance. The frontend owns all
configuration in localStorage and sends it on every request; the backend
caches one MCPClient per session purely as a connection-reuse optimization,
with TTL-based eviction so stale sessions don't leak memory.

Design goals:
- Backend is functionally stateless (any worker can serve any request).
- One MCPClient per session_id keeps the JSON-RPC session alive with
  Purple MCP, avoiding a new initialize/handshake per call.
- A per-session asyncio.Lock serializes initialize/tool-call sequences
  on the same MCPClient.
- A global semaphore caps total outbound concurrency to protect Purple MCP.
- Idle sessions evicted after SESSION_TTL seconds.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from mcp_client import MCPClient

logger = logging.getLogger("spectra")

# Tunables (env-configurable)
SESSION_TTL = int(os.getenv("SPECTRA_SESSION_TTL", "1800"))  # 30 min idle eviction
MAX_SESSIONS = int(os.getenv("SPECTRA_MAX_SESSIONS", "200"))
MAX_CONCURRENT_MCP = int(os.getenv("SPECTRA_MAX_CONCURRENT_MCP", "50"))


@dataclass
class RequestConfig:
    """Per-request configuration carried in each API call.

    Replaces the former global AppConfig singleton. All values originate
    from the browser's localStorage and travel inside the request body.
    """

    mcp_server_url: str
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_model: str = ""

    @classmethod
    def from_payload(cls, payload: Optional[dict]) -> "RequestConfig":
        """Build a RequestConfig from a wire `session_config` payload.

        Tolerates partial / missing fields so callers that only need the
        MCP URL (e.g. /api/tools) don't have to provide LLM credentials.
        """
        payload = payload or {}
        llm = payload.get("llm") or {}
        return cls(
            mcp_server_url=(payload.get("mcp_server_url") or "").rstrip("/"),
            llm_provider=llm.get("provider") or "openai",
            llm_api_key=llm.get("api_key") or "",
            llm_model=llm.get("model") or "",
        )


@dataclass
class _SessionEntry:
    """Internal cache entry for a single session."""

    session_id: str
    mcp_url: str
    client: MCPClient
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.last_used = time.time()

    def is_expired(self, ttl: int = SESSION_TTL) -> bool:
        return (time.time() - self.last_used) > ttl


class SessionManager:
    """In-memory cache of MCPClient instances keyed by browser session id.

    Concurrency model:
    - `_global_lock` protects the dict during create / evict.
    - Each entry has its own `lock` to serialize MCP calls per session.
    - `_semaphore` caps total concurrent outbound MCP calls process-wide.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _SessionEntry] = {}
        self._global_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_MCP)
        self._last_cleanup: float = 0.0

    async def get_client(self, session_id: str, mcp_url: str) -> tuple[MCPClient, asyncio.Lock]:
        """Return a cached MCPClient for (session_id, mcp_url).

        - Reuses an existing client if the URL matches.
        - Replaces the client if the URL changed (user switched console).
        - Creates a fresh client if no entry exists.

        Returns the client AND its per-session lock so the caller can
        serialize sequential calls (initialize + tool/call) on the same
        Purple MCP session.
        """
        if not session_id:
            raise ValueError("session_id is required")
        if not mcp_url:
            raise ValueError("mcp_url is required")

        normalized_url = mcp_url.rstrip("/")
        await self._maybe_cleanup()

        async with self._global_lock:
            entry = self._sessions.get(session_id)
            if entry is None or entry.mcp_url != normalized_url:
                # Evict the oldest session if at capacity
                if len(self._sessions) >= MAX_SESSIONS and session_id not in self._sessions:
                    self._evict_oldest_locked()
                entry = _SessionEntry(
                    session_id=session_id,
                    mcp_url=normalized_url,
                    client=MCPClient(normalized_url),
                )
                self._sessions[session_id] = entry
                logger.info(f"Session {session_id[:8]}… new MCP client → {normalized_url}")
            entry.touch()
            return entry.client, entry.lock

    @property
    def semaphore(self) -> asyncio.Semaphore:
        """Process-wide semaphore protecting Purple MCP from overload."""
        return self._semaphore

    def stats(self) -> dict:
        """Return cache statistics (for /api/health)."""
        now = time.time()
        return {
            "active_sessions": len(self._sessions),
            "max_sessions": MAX_SESSIONS,
            "max_concurrent_mcp": MAX_CONCURRENT_MCP,
            "session_ttl_seconds": SESSION_TTL,
            "oldest_session_age_seconds": (
                int(now - min((e.last_used for e in self._sessions.values()), default=now))
                if self._sessions else 0
            ),
        }

    def drop(self, session_id: str) -> bool:
        """Forcibly drop a session (e.g. on explicit logout)."""
        return self._sessions.pop(session_id, None) is not None

    def _evict_oldest_locked(self) -> None:
        """Evict the LRU session. Caller must hold _global_lock."""
        if not self._sessions:
            return
        oldest_id = min(self._sessions, key=lambda sid: self._sessions[sid].last_used)
        del self._sessions[oldest_id]
        logger.info(f"Evicted LRU session {oldest_id[:8]}… (capacity reached)")

    async def _maybe_cleanup(self) -> None:
        """Lazily evict expired sessions every 60s."""
        now = time.time()
        if now - self._last_cleanup < 60:
            return
        self._last_cleanup = now
        async with self._global_lock:
            expired = [sid for sid, e in self._sessions.items() if e.is_expired()]
            for sid in expired:
                del self._sessions[sid]
            if expired:
                logger.info(f"Evicted {len(expired)} expired session(s)")


# Module-level singleton (one cache per backend worker)
session_manager = SessionManager()
