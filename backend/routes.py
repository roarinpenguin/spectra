"""SPECTRA FastAPI route handlers (v1.1 — multi-tenant).

In v1.1 SPECTRA became horizontally scalable and multi-user. The browser
owns all configuration and investigation library data in localStorage and
forwards it on every request via the `session_config` body field plus an
`X-Spectra-Session-Id` header. The backend is functionally stateless,
keeping only a per-session MCPClient cache as a connection-reuse
optimization (see `session_manager.py`).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Request

from agents.orchestrator import Orchestrator
from config import (
    PROVIDER_MODELS,
    LEGACY_BOOTSTRAP_ENABLED,
    load_legacy_bootstrap,
    log_buffer,
    logger,
)
from llm_providers import friendly_network_error
from mcp_client import extract_mcp_result
from metrics import Timer, metrics
from models import (
    McpHealthRequest,
    ModelRefreshRequest,
    QueryRequest,
    SessionConfigPayload,
    ToolRequest,
)
from session_manager import RequestConfig, session_manager
from streaming import AgentStream, create_streaming_response, wants_streaming

router = APIRouter()

# Single orchestrator instance — agents are stateless, safe to share
orchestrator = Orchestrator()

# Tool category mapping for UI display
TOOL_CATEGORY_MAP = {
    "purple_ai": ("Purple AI", "brain", "#8B5CF6"),
    "powerquery": ("Data Lake", "database", "#3B82F6"),
    "get_timestamp_range": ("Data Lake", "clock", "#3B82F6"),
    "iso_to_unix_timestamp": ("Data Lake", "clock", "#3B82F6"),
    "get_alert": ("Alerts", "alert-triangle", "#F59E0B"),
    "list_alerts": ("Alerts", "alert-triangle", "#F59E0B"),
    "search_alerts": ("Alerts", "search", "#F59E0B"),
    "get_alert_notes": ("Alerts", "file-text", "#F59E0B"),
    "get_alert_history": ("Alerts", "history", "#F59E0B"),
    "get_vulnerability": ("Vulnerabilities", "shield-off", "#EF4444"),
    "list_vulnerabilities": ("Vulnerabilities", "shield-off", "#EF4444"),
    "search_vulnerabilities": ("Vulnerabilities", "search", "#EF4444"),
    "get_vulnerability_notes": ("Vulnerabilities", "file-text", "#EF4444"),
    "get_vulnerability_history": ("Vulnerabilities", "history", "#EF4444"),
    "get_misconfiguration": ("Misconfigurations", "settings", "#10B981"),
    "list_misconfigurations": ("Misconfigurations", "settings", "#10B981"),
    "search_misconfigurations": ("Misconfigurations", "search", "#10B981"),
    "get_misconfiguration_notes": ("Misconfigurations", "file-text", "#10B981"),
    "get_misconfiguration_history": ("Misconfigurations", "history", "#10B981"),
    "get_inventory_item": ("Inventory", "server", "#6366F1"),
    "list_inventory_items": ("Inventory", "server", "#6366F1"),
    "search_inventory_items": ("Inventory", "search", "#6366F1"),
}


SESSION_HEADER = "X-Spectra-Session-Id"


def _require_session(session_id: Optional[str]) -> str:
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required header: {SESSION_HEADER}",
        )
    return session_id


def _build_request_config(payload: Optional[SessionConfigPayload]) -> RequestConfig:
    """Convert a wire payload into a RequestConfig, with helpful errors."""
    if payload is None:
        raise HTTPException(
            status_code=400,
            detail="Request body must include 'session_config'",
        )
    if not payload.mcp_server_url:
        raise HTTPException(
            status_code=400,
            detail="session_config.mcp_server_url is required (configure a console first)",
        )
    return RequestConfig.from_payload(payload.model_dump())


# ---------------------------------------------------------------------------
# Health & static catalogs
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check() -> dict[str, Any]:
    return {"status": "healthy", "version": "1.1.0", **session_manager.stats()}


@router.get("/api/settings/models")
async def get_available_models() -> dict[str, Any]:
    """Static LLM model catalog — safe to cache on the client."""
    return {
        "status": "success",
        "models": PROVIDER_MODELS,
        "all_providers": list(PROVIDER_MODELS.keys()),
    }


# ---------------------------------------------------------------------------
# Live model discovery per API key
# ---------------------------------------------------------------------------
# Each helper returns a list[str] of model IDs usable for chat completion
# with the supplied key. The helpers:
#   - make a single outbound call
#   - never log or persist the api_key
#   - raise HTTPException with the provider's error surfaced to the UI

_MODEL_DISCOVERY_TIMEOUT = 15.0


async def _list_openai_models(api_key: str) -> list[str]:
    async with httpx.AsyncClient(timeout=_MODEL_DISCOVERY_TIMEOUT) as client:
        r = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=_extract_err(r, "OpenAI"))
    data = r.json().get("data", [])
    # Only surface chat-capable families; exclude embeddings / tts / whisper / image.
    def _is_chat(mid: str) -> bool:
        mid = mid.lower()
        if any(skip in mid for skip in ("embedding", "whisper", "tts", "audio", "dall-e", "davinci", "babbage", "moderation", "image")):
            return False
        return mid.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-"))
    ids = sorted({m["id"] for m in data if isinstance(m, dict) and _is_chat(m.get("id", ""))})
    return ids


async def _list_anthropic_models(api_key: str) -> list[str]:
    async with httpx.AsyncClient(timeout=_MODEL_DISCOVERY_TIMEOUT) as client:
        r = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=_extract_err(r, "Anthropic"))
    data = r.json().get("data", [])
    ids = sorted({m["id"] for m in data if isinstance(m, dict) and m.get("id")}, reverse=True)
    return ids


async def _list_google_models(api_key: str) -> list[str]:
    # Google's list-models is a public endpoint keyed by query param.
    async with httpx.AsyncClient(timeout=_MODEL_DISCOVERY_TIMEOUT) as client:
        r = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=_extract_err(r, "Google"))
    data = r.json().get("models", [])
    ids: list[str] = []
    for m in data:
        if not isinstance(m, dict):
            continue
        # Only models that support text generation (exclude embedding/TTS/vision-only).
        methods = m.get("supportedGenerationMethods") or []
        if "generateContent" not in methods:
            continue
        name = m.get("name", "")
        # API returns "models/<id>"; strip the prefix.
        ids.append(name.split("/", 1)[1] if name.startswith("models/") else name)
    return sorted(set(ids), reverse=True)


def _extract_err(r: httpx.Response, provider: str) -> str:
    try:
        body = r.json()
        err = body.get("error")
        if isinstance(err, dict):
            return f"{provider}: {err.get('message') or err.get('type') or r.text[:200]}"
        if isinstance(err, str):
            return f"{provider}: {err}"
    except Exception:
        pass
    return f"{provider} returned HTTP {r.status_code}: {r.text[:200]}"


_MODEL_FETCHERS = {
    "openai": _list_openai_models,
    "anthropic": _list_anthropic_models,
    "google": _list_google_models,
}


@router.post("/api/settings/models/refresh")
async def refresh_models(request: ModelRefreshRequest) -> dict[str, Any]:
    """Ask the provider for models actually available to this API key.

    Stateless: the key is used once and discarded. Response shape mirrors
    the static catalog so the frontend can drop it into the same
    `availableModels` map.
    """
    provider = request.provider.lower().strip()
    if provider not in _MODEL_FETCHERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    if not request.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    try:
        models = await _MODEL_FETCHERS[provider](request.api_key)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"{provider} list-models timed out")
    except Exception as e:
        # Never include the api_key in the error payload.
        raise HTTPException(status_code=502, detail=f"{provider} list-models failed: {e}")

    if not models:
        raise HTTPException(status_code=404, detail=f"{provider} returned no chat-capable models for this key")

    return {"status": "success", "provider": provider, "models": models}


@router.post("/api/mcp-health")
async def mcp_health_check(request: McpHealthRequest, x_spectra_session_id: Optional[str] = Header(None)) -> dict[str, Any]:
    """Probe the MCP server defined in `session_config.mcp_server_url`.

    Uses the caller's session_id (if provided) so the per-session MCPClient
    cache stays coherent with what the browser thinks is "active".
    """
    cfg = _build_request_config(request.session_config)
    mcp_url = cfg.mcp_server_url

    result: dict[str, Any] = {
        "status": "unhealthy",
        "mcp_server": mcp_url,
        "server_name": None,
        "console_url": None,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{mcp_url}/health")
            if response.status_code != 200:
                result["error"] = f"Status {response.status_code}"
                return result

            result["status"] = "healthy"

            # Best-effort server identity via initialize (only if we have a session id)
            if x_spectra_session_id:
                try:
                    mcp_client, lock = await session_manager.get_client(x_spectra_session_id, mcp_url)
                    async with lock, session_manager.semaphore:
                        init_result = await mcp_client.initialize()
                    if "result" in init_result:
                        server_info = init_result["result"].get("serverInfo", {})
                        result["server_name"] = server_info.get("name", "Purple MCP")
                        instructions = init_result["result"].get("instructions", "")
                        if "sentinelone" in instructions.lower():
                            url_match = re.search(r"https://[^\s]+\.sentinelone\.net", instructions)
                            if url_match:
                                result["console_url"] = url_match.group(0)
                except Exception as e:
                    logger.debug(f"MCP identity probe failed: {e}")

            return result
    except Exception as e:
        result["error"] = str(e)
        return result


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@router.post("/api/tools")
async def list_tools(request: McpHealthRequest, x_spectra_session_id: Optional[str] = Header(None)) -> dict[str, Any]:
    """List MCP tools available on the caller's chosen MCP server."""
    sid = _require_session(x_spectra_session_id)
    cfg = _build_request_config(request.session_config)
    try:
        mcp_client, lock = await session_manager.get_client(sid, cfg.mcp_server_url)
        async with lock, session_manager.semaphore:
            result = await mcp_client.list_tools()
        if "result" in result and "tools" in result["result"]:
            tools = []
            for tool in result["result"]["tools"]:
                name = tool.get("name", "")
                cat_info = TOOL_CATEGORY_MAP.get(name, ("Other", "box", "#6B7280"))
                tools.append({
                    "name": name,
                    "category": cat_info[0],
                    "icon": cat_info[1],
                    "color": cat_info[2],
                    "description": tool.get("description", "")[:200],
                })
            return {"tools": tools}
        return {"tools": [], "error": result.get("error", "Unknown error")}
    except Exception as e:
        return {"tools": [], "error": str(e)}


@router.post("/api/tool")
async def execute_tool(request: ToolRequest, x_spectra_session_id: Optional[str] = Header(None)) -> dict[str, Any]:
    """Execute a single MCP tool call (used by the legacy direct-call UI)."""
    sid = _require_session(x_spectra_session_id)
    cfg = _build_request_config(request.session_config)
    try:
        mcp_client, lock = await session_manager.get_client(sid, cfg.mcp_server_url)
        async with lock, session_manager.semaphore:
            result = await mcp_client.call_tool(request.tool_name, request.arguments)

        if "error" in result:
            error_msg = result["error"].get("message", "MCP error") if isinstance(result["error"], dict) else str(result["error"])
            raise HTTPException(status_code=500, detail=error_msg)

        content = extract_mcp_result(result)
        if content:
            return {"status": "success", "result": content}
        return {"status": "error", "result": "No response from tool"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Query (main agentic endpoint)
# ---------------------------------------------------------------------------

@router.post("/api/query")
async def execute_query(request: QueryRequest, raw_request: Request, x_spectra_session_id: Optional[str] = Header(None)):
    """Execute a natural-language query through the multi-agent orchestrator.

    Supports SSE streaming when Accept: text/event-stream is present.
    """
    sid = _require_session(x_spectra_session_id)
    cfg = _build_request_config(request.session_config)

    accept = raw_request.headers.get("accept", "")

    if wants_streaming(accept):
        stream = AgentStream()

        async def _run():
            try:
                stream.emit("connecting_mcp", {"url": cfg.mcp_server_url})
                mcp_client, lock = await session_manager.get_client(sid, cfg.mcp_server_url)
                stream.emit("orchestrator_start", {"status": "running"})
                async with lock, session_manager.semaphore:
                    with Timer():
                        outcome = await orchestrator.process(
                            query=request.query,
                            conversation_history=request.conversation_history,
                            config=cfg,
                            mcp_client=mcp_client,
                            stream=stream,
                        )
                metrics.record_routing(outcome.get("agent", "unknown"), is_multi_agent="+" in outcome.get("agent", ""))
                # Include thought_process metadata so the UI can replace the
                # live timeline with the canonical post-run view.
                stream.emit("thought_process", outcome.get("thought_process", {}))
                stream.result("success", outcome["result"])
            except Exception as e:
                logger.error(f"Streaming query error: {e}")
                stream.error(friendly_network_error(e, provider=cfg.llm_provider))

        asyncio.ensure_future(_run())
        return create_streaming_response(stream)

    # Standard JSON response
    try:
        mcp_client, lock = await session_manager.get_client(sid, cfg.mcp_server_url)
        async with lock, session_manager.semaphore:
            with Timer():
                outcome = await orchestrator.process(
                    query=request.query,
                    conversation_history=request.conversation_history,
                    config=cfg,
                    mcp_client=mcp_client,
                )
        return {
            "status": "success",
            "result": outcome["result"],
            "agent": outcome.get("agent", "general"),
            "tools_used": outcome.get("tools_used", []),
            "thought_process": outcome.get("thought_process"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=friendly_network_error(e, provider=cfg.llm_provider))


@router.get("/api/agents")
async def list_agents() -> dict[str, Any]:
    """List all registered specialist agents (static metadata, no MCP call)."""
    return {"status": "success", "agents": orchestrator.get_agent_descriptions()}


@router.post("/api/purple-ai")
async def purple_ai_query(request: QueryRequest, x_spectra_session_id: Optional[str] = Header(None)) -> dict[str, Any]:
    """Direct Purple AI threat-hunting query."""
    sid = _require_session(x_spectra_session_id)
    cfg = _build_request_config(request.session_config)
    try:
        mcp_client, lock = await session_manager.get_client(sid, cfg.mcp_server_url)
        async with lock, session_manager.semaphore:
            result = await mcp_client.call_tool("purple_ai", {"query": request.query})

        if "error" in result:
            error_msg = result["error"].get("message", "MCP error") if isinstance(result["error"], dict) else str(result["error"])
            raise HTTPException(status_code=500, detail=error_msg)

        content = extract_mcp_result(result)
        if not content:
            return {"status": "error", "result": "No response from Purple AI"}
        return {"status": "success", "result": content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.get("/api/categories")
async def get_categories() -> dict[str, Any]:
    categories = [
        {"id": "purple_ai", "name": "Purple AI", "icon": "brain", "color": "#8B5CF6"},
        {"id": "data_lake", "name": "Data Lake", "icon": "database", "color": "#3B82F6"},
        {"id": "alerts", "name": "Alerts", "icon": "alert-triangle", "color": "#F59E0B"},
        {"id": "vulnerabilities", "name": "Vulnerabilities", "icon": "shield-off", "color": "#EF4444"},
        {"id": "misconfigurations", "name": "Misconfigurations", "icon": "settings", "color": "#10B981"},
        {"id": "inventory", "name": "Inventory", "icon": "server", "color": "#6366F1"},
    ]
    return {"categories": categories}


# ---------------------------------------------------------------------------
# Logs (memory buffer + docker socket)
# ---------------------------------------------------------------------------

@router.get("/api/logs")
async def get_logs(container: str = "backend", lines: int = 100) -> dict[str, Any]:
    result: dict[str, Any] = {}

    if container in ("backend", "all"):
        backend_logs = log_buffer.get_logs()[-lines:]
        result["backend"] = {
            "container": "spectra-backend",
            "logs": backend_logs,
            "source": "memory_buffer",
        }

    if container in ("frontend", "all"):
        try:
            async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds="/var/run/docker.sock")) as client:
                response = await client.get(
                    f"http://localhost/containers/spectra-frontend/logs?stdout=true&stderr=true&tail={lines}",
                    timeout=5.0,
                )
                if response.status_code == 200:
                    raw_logs = response.content
                    log_lines: list[str] = []
                    i = 0
                    while i < len(raw_logs):
                        if i + 8 <= len(raw_logs):
                            size = int.from_bytes(raw_logs[i + 4:i + 8], "big")
                            if i + 8 + size <= len(raw_logs):
                                line = raw_logs[i + 8:i + 8 + size].decode("utf-8", errors="replace").strip()
                                if line:
                                    log_lines.append(line)
                            i += 8 + size
                        else:
                            break
                    result["frontend"] = {
                        "container": "spectra-frontend",
                        "logs": log_lines[-lines:] if log_lines else ["No logs available"],
                        "source": "docker_api",
                    }
                else:
                    result["frontend"] = {
                        "container": "spectra-frontend",
                        "logs": [f"Docker API returned status {response.status_code}"],
                        "source": "error",
                    }
        except Exception as e:
            result["frontend"] = {
                "container": "spectra-frontend",
                "logs": [f"Error fetching logs: {str(e)}"],
                "source": "error",
            }

    return {"status": "success", "logs": result}


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@router.get("/api/metrics")
async def get_metrics() -> dict[str, Any]:
    """Process-wide agent / tool / orchestrator metrics."""
    return {
        "status": "success",
        "metrics": metrics.get_metrics(),
        "sessions": session_manager.stats(),
    }


# ---------------------------------------------------------------------------
# Legacy bootstrap (one-shot migration from v1.0 → v1.1)
# ---------------------------------------------------------------------------

@router.get("/api/legacy/bootstrap")
async def legacy_bootstrap() -> dict[str, Any]:
    """Return any v1.0 settings/destinations/investigations files still on disk.

    The frontend calls this exactly once on first load (when localStorage is
    empty) so users upgrading from v1.0 don't lose their config. Disable
    permanently with `SPECTRA_LEGACY_BOOTSTRAP=0`.
    """
    if not LEGACY_BOOTSTRAP_ENABLED:
        return {"status": "disabled", "data": {}}
    return {"status": "success", "data": load_legacy_bootstrap()}
