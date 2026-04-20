"""SPECTRA static catalogs, logging setup, and one-shot legacy loaders.

As of v1.1, SPECTRA is multi-tenant: per-user state lives in the browser's
localStorage and is sent on every request. The mutable runtime singleton
that existed in v1.0 has been removed. What remains here is:

- The static `PROVIDER_MODELS` catalog (returned by /api/settings/models).
- The `LogBuffer` for in-memory log streaming with secret redaction.
- One-shot legacy loaders used by /api/legacy/bootstrap to migrate
  pre-v1.1 single-tenant config files into the first browser that asks.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections import deque
from typing import Any

# ---------------------------------------------------------------------------
# Static LLM catalog (returned by /api/settings/models, never mutated)
# ---------------------------------------------------------------------------

PROVIDER_MODELS: dict[str, list[str]] = {
    "anthropic": ["claude-opus-4.6", "claude-sonnet-4.5", "claude-sonnet-4"],
    "openai": ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano"],
    "google": ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
}


# ---------------------------------------------------------------------------
# Secret redaction for the log buffer
# ---------------------------------------------------------------------------

# Field names that should never appear unredacted in logs (case-insensitive)
_SECRET_KEYS = ("api_key", "api_token", "apikey", "apitoken", "authorization", "x-api-key", "bearer")

# Patterns: "api_key": "value", api_key=value, Authorization: Bearer xxx
_SECRET_PATTERNS = [
    re.compile(rf'("?{k}"?\s*[:=]\s*"?)([^"\s,}}]+)', re.IGNORECASE) for k in _SECRET_KEYS
] + [
    re.compile(r'(Bearer\s+)([A-Za-z0-9._\-]+)', re.IGNORECASE),
]


def redact_secrets(text: str) -> str:
    """Best-effort redaction of API keys / tokens from a log line."""
    if not text:
        return text
    out = text
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub(r"\1***REDACTED***", out)
    return out


# ---------------------------------------------------------------------------
# In-memory log buffer (used by /api/logs)
# ---------------------------------------------------------------------------

class LogBuffer(logging.Handler):
    """Circular buffer of recent log entries with secret redaction."""

    def __init__(self, max_entries: int = 500):
        super().__init__()
        self.entries: deque[str] = deque(maxlen=max_entries)
        self.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self.entries.append(redact_secrets(msg))
        except Exception:
            pass

    def get_logs(self) -> list[str]:
        return list(self.entries)


log_buffer = LogBuffer()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spectra")
logger.addHandler(log_buffer)
logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Legacy file paths (only consumed by /api/legacy/bootstrap)
# ---------------------------------------------------------------------------

LEGACY_DIR = os.getenv("LEGACY_CONFIG_DIR", "/app/config")
LEGACY_SETTINGS_FILE = os.path.join(LEGACY_DIR, "settings.json")
LEGACY_DESTINATIONS_FILE = os.path.join(LEGACY_DIR, "destinations.json")
LEGACY_INVESTIGATIONS_FILE = os.path.join(LEGACY_DIR, "investigations.json")

# Default ON; set SPECTRA_LEGACY_BOOTSTRAP=0 to disable on a hardened deployment
LEGACY_BOOTSTRAP_ENABLED = os.getenv("SPECTRA_LEGACY_BOOTSTRAP", "1") not in ("0", "false", "False")


def _read_json(path: str) -> Any | None:
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to read legacy file {path}: {e}")
    return None


def load_legacy_bootstrap() -> dict[str, Any]:
    """Return any pre-v1.1 config that exists on disk, in the wire format
    the frontend expects to seed an empty localStorage with.

    Returns an empty dict if disabled or nothing is present.
    """
    if not LEGACY_BOOTSTRAP_ENABLED:
        return {}

    settings = _read_json(LEGACY_SETTINGS_FILE) or {}
    destinations_dict = _read_json(LEGACY_DESTINATIONS_FILE) or {}
    investigations_dict = _read_json(LEGACY_INVESTIGATIONS_FILE) or {}

    # Convert {id: dest} → [dest, ...] for the frontend
    destinations = list(destinations_dict.values()) if isinstance(destinations_dict, dict) else []
    investigations = list(investigations_dict.values()) if isinstance(investigations_dict, dict) else []

    payload: dict[str, Any] = {}
    if destinations:
        payload["destinations"] = destinations
    if investigations:
        payload["investigations"] = investigations
    if settings:
        payload["llm"] = {
            "provider": settings.get("llm_provider", "openai"),
            "model": settings.get("llm_model", ""),
            "api_key": settings.get("llm_api_key", ""),
        }
    return payload


# ---------------------------------------------------------------------------
# Backward-compat aliases (so any stray import of `config` doesn't crash)
# ---------------------------------------------------------------------------

# Some legacy code may still `from config import config`; provide a stub
# that exposes only the static catalog. Mutating attributes raises.
class _StaticConfigStub:
    """Read-only shim retained for backward compatibility."""

    @property
    def provider_models(self) -> dict[str, list[str]]:
        return PROVIDER_MODELS

    def __setattr__(self, name: str, value: Any) -> None:
        raise RuntimeError(
            "AppConfig is removed in v1.1; configuration is now per-request. "
            "Build a RequestConfig from the request body instead."
        )


config = _StaticConfigStub()
