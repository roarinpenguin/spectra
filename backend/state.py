"""SPECTRA investigation state persistence for conversation context."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger("spectra")

# Default state directory
STATE_DIR = os.getenv("STATE_DIR", "/app/config/state")
STATE_TTL = 1800  # 30 minutes


class InvestigationState:
    """Persistent state for an investigation conversation.

    Stores context across queries in a conversation:
    - Entities mentioned (endpoints, alerts, CVEs)
    - Tools called and results received
    - Timeline of actions

    Auto-expires after 30 minutes of inactivity.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.entities: dict[str, list[str]] = {
            "endpoints": [],
            "alerts": [],
            "vulnerabilities": [],
            "ips": [],
            "users": [],
        }
        self.tools_called: list[dict[str, Any]] = []
        self.context_notes: list[str] = []
        self.created_at: float = time.time()
        self.last_accessed: float = time.time()

    def is_expired(self) -> bool:
        """Check if this state has expired."""
        return (time.time() - self.last_accessed) > STATE_TTL

    def touch(self):
        """Update last accessed time."""
        self.last_accessed = time.time()

    def add_entity(self, entity_type: str, value: str):
        """Track a mentioned entity."""
        if entity_type in self.entities and value not in self.entities[entity_type]:
            self.entities[entity_type].append(value)

    def add_tool_call(self, tool_name: str, arguments: dict[str, Any], summary: str = ""):
        """Record a tool call."""
        self.tools_called.append({
            "tool": tool_name,
            "arguments": arguments,
            "summary": summary,
            "timestamp": time.time(),
        })

    def add_context(self, note: str):
        """Add a context note for follow-up queries."""
        self.context_notes.append(note)

    def get_context_summary(self) -> str:
        """Generate a context summary for the LLM."""
        parts = []

        if any(self.entities[k] for k in self.entities):
            parts.append("Previously mentioned entities:")
            for entity_type, values in self.entities.items():
                if values:
                    parts.append(f"  {entity_type}: {', '.join(values[-5:])}")

        if self.tools_called:
            recent = self.tools_called[-5:]
            parts.append(f"Recent tool calls ({len(self.tools_called)} total):")
            for tc in recent:
                parts.append(f"  - {tc['tool']}({json.dumps(tc['arguments'])[:100]})")

        if self.context_notes:
            parts.append("Context notes:")
            for note in self.context_notes[-3:]:
                parts.append(f"  - {note}")

        return "\n".join(parts) if parts else ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "entities": self.entities,
            "tools_called": self.tools_called,
            "context_notes": self.context_notes,
            "created_at": self.created_at,
            "last_accessed": self.last_accessed,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> InvestigationState:
        state = cls(data["session_id"])
        state.entities = data.get("entities", state.entities)
        state.tools_called = data.get("tools_called", [])
        state.context_notes = data.get("context_notes", [])
        state.created_at = data.get("created_at", time.time())
        state.last_accessed = data.get("last_accessed", time.time())
        return state


class StateStore:
    """File-backed store for investigation states."""

    def __init__(self, state_dir: str = STATE_DIR):
        self.state_dir = state_dir
        self._cache: dict[str, InvestigationState] = {}

    def _ensure_dir(self):
        os.makedirs(self.state_dir, exist_ok=True)

    def _state_path(self, session_id: str) -> str:
        # Sanitize session_id for filesystem safety
        safe_id = "".join(c for c in session_id if c.isalnum() or c in "-_")
        return os.path.join(self.state_dir, f"{safe_id}.json")

    def get(self, session_id: str) -> InvestigationState | None:
        """Get state for a session, returning None if expired or not found."""
        # Check cache first
        if session_id in self._cache:
            state = self._cache[session_id]
            if state.is_expired():
                self.delete(session_id)
                return None
            state.touch()
            return state

        # Try loading from disk
        path = self._state_path(session_id)
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                state = InvestigationState.from_dict(data)
                if state.is_expired():
                    self.delete(session_id)
                    return None
                state.touch()
                self._cache[session_id] = state
                return state
            except Exception as e:
                logger.warning(f"Failed to load state {session_id}: {e}")

        return None

    def create(self, session_id: str) -> InvestigationState:
        """Create a new state for a session."""
        state = InvestigationState(session_id)
        self._cache[session_id] = state
        self._persist(state)
        return state

    def get_or_create(self, session_id: str) -> InvestigationState:
        """Get existing state or create new one."""
        existing = self.get(session_id)
        if existing:
            return existing
        return self.create(session_id)

    def save(self, state: InvestigationState):
        """Save state to disk."""
        self._cache[state.session_id] = state
        self._persist(state)

    def delete(self, session_id: str):
        """Delete a session state."""
        self._cache.pop(session_id, None)
        path = self._state_path(session_id)
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                logger.warning(f"Failed to delete state file: {e}")

    def cleanup_expired(self):
        """Remove all expired states."""
        expired = [sid for sid, s in self._cache.items() if s.is_expired()]
        for sid in expired:
            self.delete(sid)

    def _persist(self, state: InvestigationState):
        """Write state to disk."""
        try:
            self._ensure_dir()
            path = self._state_path(state.session_id)
            with open(path, "w") as f:
                json.dump(state.to_dict(), f)
        except Exception as e:
            logger.warning(f"Failed to persist state {state.session_id}: {e}")


# Global state store instance
state_store = StateStore()
