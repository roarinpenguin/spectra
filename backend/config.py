"""SPECTRA configuration management and logging setup."""

from __future__ import annotations

import json
import logging
import os
from collections import deque
from typing import Any, Literal


class LogBuffer(logging.Handler):
    """Circular buffer to store recent log entries."""

    def __init__(self, max_entries: int = 500):
        super().__init__()
        self.buffer = deque(maxlen=max_entries)
        self.setFormatter(logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%H:%M:%S'
        ))

    def emit(self, record):
        self.buffer.append(self.format(record))

    def get_logs(self) -> list[str]:
        return list(self.buffer)


# Setup logging with buffer
log_buffer = LogBuffer()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spectra")
logger.addHandler(log_buffer)
logger.setLevel(logging.INFO)

# Configuration file paths
CONFIG_FILE = os.getenv("CONFIG_FILE", "/app/config/settings.json")
INVESTIGATIONS_FILE = os.getenv("INVESTIGATIONS_FILE", "/app/config/investigations.json")


class AppConfig:
    """Application configuration - persisted to file and can be updated at runtime via UI."""

    def __init__(self):
        self.provider_models = {
            "anthropic": ["claude-opus-4.6", "claude-sonnet-4.5", "claude-sonnet-4"],
            "openai": ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano"],
            "google": ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
        }

        loaded = self._load_from_file()

        if loaded:
            self.mcp_server_url = loaded.get("mcp_server_url", os.getenv("MCP_SERVER_URL", "http://localhost:10000"))
            self.llm_provider = loaded.get("llm_provider", "openai")
            self.llm_api_key = loaded.get("llm_api_key", os.getenv("OPENAI_API_KEY", ""))
            self.llm_model = loaded.get("llm_model", "gpt-5.2")
        else:
            self.mcp_server_url = os.getenv("MCP_SERVER_URL", "http://localhost:10000")
            self.llm_provider: Literal["anthropic", "openai", "google"] = "openai"
            self.llm_api_key = os.getenv("OPENAI_API_KEY", os.getenv("ANTHROPIC_API_KEY", ""))
            self.llm_model = os.getenv("LLM_MODEL", "gpt-5.2")

    def _load_from_file(self) -> dict[str, Any] | None:
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, "r") as f:
                    return json.load(f)
        except Exception:
            pass
        return None

    def save_to_file(self) -> bool:
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            config_data = {
                "mcp_server_url": self.mcp_server_url,
                "llm_provider": self.llm_provider,
                "llm_api_key": self.llm_api_key,
                "llm_model": self.llm_model,
            }
            with open(CONFIG_FILE, "w") as f:
                json.dump(config_data, f, indent=2)
            return True
        except Exception:
            return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "mcp_server_url": self.mcp_server_url,
            "llm_provider": self.llm_provider,
            "llm_api_key_set": bool(self.llm_api_key),
            "llm_api_key_preview": self.llm_api_key[:8] + "..." if len(self.llm_api_key) > 8 else "",
            "llm_model": self.llm_model,
            "available_models": self.provider_models.get(self.llm_provider, []),
            "all_providers": list(self.provider_models.keys()),
        }


# Global config singleton
config = AppConfig()


def load_investigations():
    """Load investigations from persistent file."""
    from models import Investigation
    try:
        if os.path.exists(INVESTIGATIONS_FILE):
            with open(INVESTIGATIONS_FILE, "r") as f:
                data = json.load(f)
                return {k: Investigation(**v) for k, v in data.items()}
    except Exception as e:
        logger.warning(f"Failed to load investigations: {e}")
    return {}


def save_investigations(investigations) -> bool:
    """Save investigations to persistent file."""
    try:
        os.makedirs(os.path.dirname(INVESTIGATIONS_FILE), exist_ok=True)
        with open(INVESTIGATIONS_FILE, "w") as f:
            json.dump({k: v.model_dump() for k, v in investigations.items()}, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save investigations: {e}")
        return False
