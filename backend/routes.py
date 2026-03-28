"""SPECTRA FastAPI route handlers."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

import asyncio

import httpx
from fastapi import APIRouter, HTTPException, Request

from agents.orchestrator import Orchestrator
from config import config, load_destinations, load_investigations, log_buffer, logger, save_destinations, save_investigations
from mcp_client import extract_mcp_result, get_mcp_client, reset_mcp_client
from metrics import Timer, metrics
from models import (
    ConfigUpdateRequest,
    CreateDestinationRequest,
    Destination,
    Investigation,
    QueryRequest,
    SaveInvestigationRequest,
    ToolRequest,
    UpdateDestinationRequest,
)
from streaming import create_streaming_response, AgentStream, wants_streaming

router = APIRouter()

# Global orchestrator instance
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


# ---------------------------------------------------------------------------
# Health & Config
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@router.get("/api/config")
async def get_config() -> dict[str, Any]:
    return {"mcp_server_url": config.mcp_server_url}


@router.get("/api/mcp-health")
async def mcp_health_check() -> dict[str, Any]:
    result = {
        "status": "unhealthy",
        "mcp_server": config.mcp_server_url,
        "server_name": None,
        "console_url": None,
    }

    try:
        mcp_client = get_mcp_client()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{config.mcp_server_url}/health")
            if response.status_code != 200:
                result["error"] = f"Status {response.status_code}"
                return result

            result["status"] = "healthy"

            try:
                init_result = await mcp_client.initialize()
                if "result" in init_result:
                    server_info = init_result["result"].get("serverInfo", {})
                    result["server_name"] = server_info.get("name", "Purple MCP")

                    instructions = init_result["result"].get("instructions", "")
                    if "sentinelone" in instructions.lower():
                        url_match = re.search(r'https://[^\s]+\.sentinelone\.net', instructions)
                        if url_match:
                            result["console_url"] = url_match.group(0)
            except Exception:
                pass

            return result
    except Exception as e:
        result["error"] = str(e)
        return result


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@router.get("/api/tools")
async def list_tools() -> dict[str, Any]:
    try:
        mcp_client = get_mcp_client()
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
async def execute_tool(request: ToolRequest) -> dict[str, Any]:
    try:
        mcp_client = get_mcp_client()
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
async def execute_query(request: QueryRequest, raw_request: Request):
    """Execute a natural language query through the multi-agent orchestrator.

    The orchestrator classifies the query and routes it to the appropriate
    specialist agent (alert_triage, threat_hunt, vulnerability, etc.).
    All providers (OpenAI, Anthropic, Google) use real function calling.

    Supports SSE streaming when Accept: text/event-stream is sent.
    """
    accept = raw_request.headers.get("accept", "")

    if wants_streaming(accept):
        # SSE streaming mode
        stream = AgentStream()

        async def _run():
            try:
                mcp_client = get_mcp_client()
                stream.emit("orchestrator_start", {"status": "classifying"})
                with Timer() as timer:
                    outcome = await orchestrator.process(
                        query=request.query,
                        conversation_history=request.conversation_history,
                        config=config,
                        mcp_client=mcp_client,
                    )
                metrics.record_routing(outcome.get("agent", "unknown"), is_multi_agent="+" in outcome.get("agent", ""))
                stream.result("success", outcome["result"])
            except Exception as e:
                logger.error(f"Streaming query error: {e}")
                stream.error(str(e))

        asyncio.ensure_future(_run())
        return create_streaming_response(stream)

    # Standard JSON response mode
    try:
        mcp_client = get_mcp_client()
        with Timer() as timer:
            outcome = await orchestrator.process(
                query=request.query,
                conversation_history=request.conversation_history,
                config=config,
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
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/agents")
async def list_agents() -> dict[str, Any]:
    """List all registered specialist agents."""
    return {
        "status": "success",
        "agents": orchestrator.get_agent_descriptions(),
    }


@router.post("/api/purple-ai")
async def purple_ai_query(request: QueryRequest) -> dict[str, Any]:
    """Execute a Purple AI threat hunting query with optional PowerQuery execution."""
    try:
        mcp_client = get_mcp_client()
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
# Settings
# ---------------------------------------------------------------------------

@router.get("/api/settings")
async def get_settings() -> dict[str, Any]:
    return {"status": "success", "settings": config.to_dict()}


@router.post("/api/settings")
async def update_settings(request: ConfigUpdateRequest) -> dict[str, Any]:
    changes_made = []

    if request.mcp_server_url is not None and request.mcp_server_url != config.mcp_server_url:
        config.mcp_server_url = request.mcp_server_url
        reset_mcp_client(config.mcp_server_url)
        changes_made.append("mcp_server_url")

    if request.llm_provider is not None and request.llm_provider != config.llm_provider:
        config.llm_provider = request.llm_provider
        if config.llm_provider in config.provider_models:
            config.llm_model = config.provider_models[config.llm_provider][0]
        changes_made.append("llm_provider")
        changes_made.append("llm_model")

    if request.llm_api_key is not None:
        config.llm_api_key = request.llm_api_key
        changes_made.append("llm_api_key")

    if request.llm_model is not None and request.llm_model != config.llm_model:
        config.llm_model = request.llm_model
        changes_made.append("llm_model")

    saved = False
    if changes_made:
        saved = config.save_to_file()

    return {
        "status": "success",
        "message": f"Updated: {', '.join(changes_made)}" + (" (saved)" if saved else "") if changes_made else "No changes",
        "settings": config.to_dict(),
    }


@router.get("/api/settings/models")
async def get_available_models() -> dict[str, Any]:
    return {"status": "success", "models": config.provider_models}


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

@router.get("/api/logs")
async def get_logs(container: str = "backend", lines: int = 100) -> dict[str, Any]:
    result = {}

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
                    log_lines = []
                    i = 0
                    while i < len(raw_logs):
                        if i + 8 <= len(raw_logs):
                            size = int.from_bytes(raw_logs[i+4:i+8], 'big')
                            if i + 8 + size <= len(raw_logs):
                                line = raw_logs[i+8:i+8+size].decode('utf-8', errors='replace').strip()
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
# Investigations
# ---------------------------------------------------------------------------

@router.get("/api/investigations")
async def list_investigations() -> dict[str, Any]:
    investigations = load_investigations()
    inv_list = sorted(
        [inv.model_dump() for inv in investigations.values()],
        key=lambda x: x["updated_at"],
        reverse=True
    )
    return {"status": "success", "investigations": inv_list, "count": len(inv_list)}


@router.get("/api/investigations/{investigation_id}")
async def get_investigation(investigation_id: str) -> dict[str, Any]:
    investigations = load_investigations()
    if investigation_id not in investigations:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return {"status": "success", "investigation": investigations[investigation_id].model_dump()}


@router.post("/api/investigations")
async def save_investigation(request: SaveInvestigationRequest) -> dict[str, Any]:
    investigations = load_investigations()
    now = datetime.utcnow().isoformat() + "Z"

    if request.investigation_id and request.investigation_id in investigations:
        inv_id = request.investigation_id
        investigation = Investigation(
            id=inv_id,
            title=request.title,
            description=request.description,
            messages=request.messages,
            created_at=investigations[inv_id].created_at,
            updated_at=now,
            tags=request.tags,
        )
        action = "updated"
    else:
        inv_id = str(uuid.uuid4())[:8]
        investigation = Investigation(
            id=inv_id,
            title=request.title,
            description=request.description,
            messages=request.messages,
            created_at=now,
            updated_at=now,
            tags=request.tags,
        )
        action = "created"

    investigations[inv_id] = investigation

    if save_investigations(investigations):
        logger.info(f"Investigation {action}: {inv_id} - {request.title}")
        return {"status": "success", "message": f"Investigation {action}", "investigation": investigation.model_dump()}
    else:
        raise HTTPException(status_code=500, detail="Failed to save investigation")


@router.delete("/api/investigations/{investigation_id}")
async def delete_investigation(investigation_id: str) -> dict[str, Any]:
    investigations = load_investigations()
    if investigation_id not in investigations:
        raise HTTPException(status_code=404, detail="Investigation not found")

    title = investigations[investigation_id].title
    del investigations[investigation_id]

    if save_investigations(investigations):
        logger.info(f"Investigation deleted: {investigation_id} - {title}")
        return {"status": "success", "message": "Investigation deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete investigation")


# ---------------------------------------------------------------------------
# Destinations (Multi-Console)
# ---------------------------------------------------------------------------

@router.get("/api/destinations")
async def list_destinations() -> dict[str, Any]:
    """List all configured console destinations."""
    destinations = load_destinations()
    dest_list = sorted(
        [d.model_dump() for d in destinations.values()],
        key=lambda x: x["updated_at"],
        reverse=True,
    )
    # Mask API tokens in response
    for d in dest_list:
        if d.get("api_token"):
            d["api_token_preview"] = d["api_token"][:8] + "..." if len(d["api_token"]) > 8 else "****"
            d["api_token_set"] = True
        else:
            d["api_token_preview"] = ""
            d["api_token_set"] = False
        del d["api_token"]
    return {"status": "success", "destinations": dest_list, "count": len(dest_list)}


@router.get("/api/destinations/active")
async def get_active_destination() -> dict[str, Any]:
    """Get the currently active destination."""
    destinations = load_destinations()
    for d in destinations.values():
        if d.is_active:
            result = d.model_dump()
            # Mask token
            if result.get("api_token"):
                result["api_token_preview"] = result["api_token"][:8] + "..." if len(result["api_token"]) > 8 else "****"
                result["api_token_set"] = True
            else:
                result["api_token_preview"] = ""
                result["api_token_set"] = False
            del result["api_token"]
            return {"status": "success", "destination": result}
    return {"status": "success", "destination": None}


@router.post("/api/destinations")
async def create_destination(request: CreateDestinationRequest) -> dict[str, Any]:
    """Create a new console destination."""
    destinations = load_destinations()
    now = datetime.utcnow().isoformat() + "Z"
    dest_id = str(uuid.uuid4())[:8]

    # If this is the first destination, make it active
    is_first = len(destinations) == 0

    destination = Destination(
        id=dest_id,
        name=request.name,
        console_url=request.console_url,
        api_token=request.api_token,
        mcp_server_url=request.mcp_server_url,
        is_active=is_first,
        last_used=now if is_first else None,
        created_at=now,
        updated_at=now,
    )

    destinations[dest_id] = destination

    if save_destinations(destinations):
        logger.info(f"Destination created: {dest_id} - {request.name}")
        # If first destination, activate it (update MCP client)
        if is_first:
            config.mcp_server_url = request.mcp_server_url
            config.save_to_file()
            reset_mcp_client(request.mcp_server_url)
            logger.info(f"Auto-activated first destination: {request.name}")

        result = destination.model_dump()
        result["api_token_set"] = bool(result["api_token"])
        result["api_token_preview"] = result["api_token"][:8] + "..." if len(result["api_token"]) > 8 else ""
        del result["api_token"]
        return {"status": "success", "message": "Destination created", "destination": result}
    else:
        raise HTTPException(status_code=500, detail="Failed to save destination")


@router.put("/api/destinations/{dest_id}")
async def update_destination(dest_id: str, request: UpdateDestinationRequest) -> dict[str, Any]:
    """Update an existing destination."""
    destinations = load_destinations()
    if dest_id not in destinations:
        raise HTTPException(status_code=404, detail="Destination not found")

    dest = destinations[dest_id]
    now = datetime.utcnow().isoformat() + "Z"
    changes = []

    if request.name is not None and request.name != dest.name:
        dest.name = request.name
        changes.append("name")
    if request.console_url is not None and request.console_url != dest.console_url:
        dest.console_url = request.console_url
        changes.append("console_url")
    if request.api_token is not None and request.api_token != "":
        dest.api_token = request.api_token
        changes.append("api_token")
    if request.mcp_server_url is not None and request.mcp_server_url != dest.mcp_server_url:
        dest.mcp_server_url = request.mcp_server_url
        changes.append("mcp_server_url")
        # If this is the active destination, update the MCP client
        if dest.is_active:
            config.mcp_server_url = request.mcp_server_url
            config.save_to_file()
            reset_mcp_client(request.mcp_server_url)

    if changes:
        dest.updated_at = now
        destinations[dest_id] = dest
        if save_destinations(destinations):
            logger.info(f"Destination updated: {dest_id} - changed: {', '.join(changes)}")
            result = dest.model_dump()
            result["api_token_set"] = bool(result["api_token"])
            result["api_token_preview"] = result["api_token"][:8] + "..." if len(result["api_token"]) > 8 else ""
            del result["api_token"]
            return {"status": "success", "message": f"Updated: {', '.join(changes)}", "destination": result}
        else:
            raise HTTPException(status_code=500, detail="Failed to save destination")

    return {"status": "success", "message": "No changes"}


@router.delete("/api/destinations/{dest_id}")
async def delete_destination(dest_id: str) -> dict[str, Any]:
    """Delete a destination."""
    destinations = load_destinations()
    if dest_id not in destinations:
        raise HTTPException(status_code=404, detail="Destination not found")

    was_active = destinations[dest_id].is_active
    name = destinations[dest_id].name
    del destinations[dest_id]

    # If deleted destination was active, activate the most recently used one
    if was_active and destinations:
        remaining = sorted(
            destinations.values(),
            key=lambda d: d.last_used or d.created_at,
            reverse=True,
        )
        remaining[0].is_active = True
        remaining[0].last_used = datetime.utcnow().isoformat() + "Z"
        config.mcp_server_url = remaining[0].mcp_server_url
        config.save_to_file()
        reset_mcp_client(remaining[0].mcp_server_url)
        logger.info(f"Auto-activated destination: {remaining[0].name}")

    if save_destinations(destinations):
        logger.info(f"Destination deleted: {dest_id} - {name}")
        return {"status": "success", "message": "Destination deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete destination")


@router.post("/api/destinations/{dest_id}/activate")
async def activate_destination(dest_id: str) -> dict[str, Any]:
    """Set a destination as the active one and switch MCP connection."""
    destinations = load_destinations()
    if dest_id not in destinations:
        raise HTTPException(status_code=404, detail="Destination not found")

    now = datetime.utcnow().isoformat() + "Z"

    # Deactivate all, activate the selected one
    for d in destinations.values():
        d.is_active = False

    dest = destinations[dest_id]
    dest.is_active = True
    dest.last_used = now
    dest.updated_at = now
    destinations[dest_id] = dest

    if save_destinations(destinations):
        # Switch MCP client to this destination
        config.mcp_server_url = dest.mcp_server_url
        config.save_to_file()
        reset_mcp_client(dest.mcp_server_url)
        logger.info(f"Activated destination: {dest.name} ({dest.mcp_server_url})")

        result = dest.model_dump()
        result["api_token_set"] = bool(result["api_token"])
        result["api_token_preview"] = result["api_token"][:8] + "..." if len(result["api_token"]) > 8 else ""
        del result["api_token"]
        return {"status": "success", "message": f"Switched to {dest.name}", "destination": result}
    else:
        raise HTTPException(status_code=500, detail="Failed to save destination")


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@router.get("/api/metrics")
async def get_metrics() -> dict[str, Any]:
    """Get agent, tool, and orchestrator performance metrics."""
    return {"status": "success", "metrics": metrics.get_metrics()}
