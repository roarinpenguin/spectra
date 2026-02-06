"""SPECTRA Backend - FastAPI server that connects to MCP server."""

import json
import logging
import os
import subprocess
import uuid
from collections import deque
from datetime import datetime
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# In-memory log buffer for backend logs
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


# Configuration file path for persistence
CONFIG_FILE = os.getenv("CONFIG_FILE", "/app/config/settings.json")
INVESTIGATIONS_FILE = os.getenv("INVESTIGATIONS_FILE", "/app/config/investigations.json")


# Runtime configuration (can be updated via API)
class AppConfig:
    """Application configuration - persisted to file and can be updated at runtime via UI."""
    
    def __init__(self):
        # Provider-specific defaults
        self.provider_models = {
            "anthropic": ["claude-opus-4.6", "claude-sonnet-4.5", "claude-sonnet-4"],
            "openai": ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano"],
            "google": ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
        }
        
        # Try to load from file first, then fall back to env vars
        loaded = self._load_from_file()
        
        if loaded:
            self.mcp_server_url = loaded.get("mcp_server_url", os.getenv("MCP_SERVER_URL", "http://localhost:10000"))
            self.llm_provider = loaded.get("llm_provider", "openai")
            self.llm_api_key = loaded.get("llm_api_key", os.getenv("OPENAI_API_KEY", ""))
            self.llm_model = loaded.get("llm_model", "gpt-5.2")
        else:
            # Default to env vars
            self.mcp_server_url = os.getenv("MCP_SERVER_URL", "http://localhost:10000")
            self.llm_provider: Literal["anthropic", "openai", "google"] = "openai"
            self.llm_api_key = os.getenv("OPENAI_API_KEY", os.getenv("ANTHROPIC_API_KEY", ""))
            self.llm_model = os.getenv("LLM_MODEL", "gpt-5.2")
    
    def _load_from_file(self) -> dict[str, Any] | None:
        """Load configuration from persistent file."""
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, "r") as f:
                    return json.load(f)
        except Exception:
            pass
        return None
    
    def save_to_file(self) -> bool:
        """Save current configuration to persistent file."""
        try:
            # Ensure directory exists
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
        """Return config as dict (without exposing full API key)."""
        return {
            "mcp_server_url": self.mcp_server_url,
            "llm_provider": self.llm_provider,
            "llm_api_key_set": bool(self.llm_api_key),
            "llm_api_key_preview": self.llm_api_key[:8] + "..." if len(self.llm_api_key) > 8 else "",
            "llm_model": self.llm_model,
            "available_models": self.provider_models.get(self.llm_provider, []),
            "all_providers": list(self.provider_models.keys()),
        }


# Global config instance
config = AppConfig()

app = FastAPI(
    title="Purple MCP UI Backend",
    description="Backend API for Purple MCP Threat Analyst Interface",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationMessage(BaseModel):
    """A single message in the conversation history."""
    role: Literal["user", "assistant"] = Field(..., description="Message role")
    content: str = Field(..., description="Message content")


class QueryRequest(BaseModel):
    """Natural language query request."""

    query: str = Field(..., description="Natural language query for Purple AI")
    conversation_history: list[ConversationMessage] = Field(
        default_factory=list,
        description="Previous conversation messages for context"
    )


class ToolRequest(BaseModel):
    """MCP tool execution request."""

    tool_name: str = Field(..., description="Name of the MCP tool to execute")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Tool arguments")


class ConfigUpdateRequest(BaseModel):
    """Configuration update request."""

    mcp_server_url: str | None = Field(None, description="MCP server URL")
    llm_provider: Literal["anthropic", "openai", "google"] | None = Field(None, description="LLM provider")
    llm_api_key: str | None = Field(None, description="LLM API key")
    llm_model: str | None = Field(None, description="LLM model name")


class InvestigationMessage(BaseModel):
    """A message in an investigation."""
    id: int = Field(..., description="Message ID")
    content: str = Field(..., description="Message content")
    isUser: bool = Field(..., description="Whether message is from user")
    timestamp: str = Field(..., description="ISO timestamp")


class Investigation(BaseModel):
    """A saved investigation/chat session."""
    id: str = Field(..., description="Unique investigation ID")
    title: str = Field(..., description="Investigation title")
    description: str = Field(default="", description="Brief description")
    messages: list[InvestigationMessage] = Field(default_factory=list, description="Chat messages")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")


class SaveInvestigationRequest(BaseModel):
    """Request to save an investigation."""
    title: str = Field(..., description="Investigation title")
    description: str = Field(default="", description="Brief description")
    messages: list[InvestigationMessage] = Field(..., description="Chat messages to save")
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")
    investigation_id: str | None = Field(None, description="Existing ID to update, or None for new")


# Investigation storage helper functions
def _load_investigations() -> dict[str, Investigation]:
    """Load investigations from persistent file."""
    try:
        if os.path.exists(INVESTIGATIONS_FILE):
            with open(INVESTIGATIONS_FILE, "r") as f:
                data = json.load(f)
                return {k: Investigation(**v) for k, v in data.items()}
    except Exception as e:
        logger.warning(f"Failed to load investigations: {e}")
    return {}


def _save_investigations(investigations: dict[str, Investigation]) -> bool:
    """Save investigations to persistent file."""
    try:
        os.makedirs(os.path.dirname(INVESTIGATIONS_FILE), exist_ok=True)
        with open(INVESTIGATIONS_FILE, "w") as f:
            json.dump({k: v.model_dump() for k, v in investigations.items()}, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save investigations: {e}")
        return False


# MCP Client for communicating with the MCP server
class MCPClient:
    """Client for communicating with Purple MCP server via SSE or streamable-http."""

    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip("/")
        self.session_id: str | None = None
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _get_headers(self) -> dict[str, str]:
        """Get headers for MCP requests - supports both SSE and streamable-http."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
        return headers

    async def _parse_sse_response(self, response: httpx.Response) -> dict[str, Any]:
        """Parse SSE response and extract JSON-RPC result."""
        content_type = response.headers.get("content-type", "")
        
        if "text/event-stream" in content_type:
            # Parse SSE format
            text = response.text
            result = None
            for line in text.split("\n"):
                if line.startswith("data: "):
                    data = line[6:]  # Remove "data: " prefix
                    if data.strip():
                        try:
                            parsed = json.loads(data)
                            # Keep the last valid JSON-RPC response
                            if "result" in parsed or "error" in parsed:
                                result = parsed
                        except json.JSONDecodeError:
                            continue
            if result:
                return result
            return {"error": {"message": "No valid response in SSE stream"}}
        else:
            # Regular JSON response
            return response.json()

    async def initialize(self) -> dict[str, Any]:
        """Initialize MCP session."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "purple-mcp-ui", "version": "1.0.0"},
                },
            }
            response = await client.post(
                f"{self.server_url}/mcp",
                json=request,
                headers=self._get_headers(),
            )
            result = await self._parse_sse_response(response)
            if "result" in result:
                self.session_id = response.headers.get("mcp-session-id")
            return result

    async def _send_initialized(self) -> None:
        """Send initialized notification after successful init."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            notification = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
            }
            await client.post(
                f"{self.server_url}/mcp",
                json=notification,
                headers=self._get_headers(),
            )

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call an MCP tool."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            # First initialize if we don't have a session
            if not self.session_id:
                init_result = await self.initialize()
                if "error" in init_result:
                    return init_result
                await self._send_initialized()

            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments,
                },
            }

            response = await client.post(
                f"{self.server_url}/mcp",
                json=request,
                headers=self._get_headers(),
            )
            return await self._parse_sse_response(response)

    async def list_tools(self) -> dict[str, Any]:
        """List available MCP tools from the server."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            if not self.session_id:
                init_result = await self.initialize()
                if "error" in init_result:
                    return init_result
                await self._send_initialized()

            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/list",
                "params": {},
            }

            response = await client.post(
                f"{self.server_url}/mcp",
                json=request,
                headers=self._get_headers(),
            )
            return await self._parse_sse_response(response)


# Global MCP client instance
mcp_client = MCPClient(config.mcp_server_url)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/config")
async def get_config() -> dict[str, Any]:
    """Get current configuration including MCP server URL."""
    return {
        "mcp_server_url": config.mcp_server_url,
    }


@app.get("/api/mcp-health")
async def mcp_health_check() -> dict[str, Any]:
    """Check if MCP server is reachable and get server info."""
    result = {
        "status": "unhealthy",
        "mcp_server": config.mcp_server_url,
        "server_name": None,
        "console_url": None,
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Check health endpoint
            response = await client.get(f"{config.mcp_server_url}/health")
            if response.status_code != 200:
                result["error"] = f"Status {response.status_code}"
                return result
            
            result["status"] = "healthy"
            
            # Try to get server info via MCP initialize
            try:
                init_result = await mcp_client.initialize()
                if "result" in init_result:
                    server_info = init_result["result"].get("serverInfo", {})
                    result["server_name"] = server_info.get("name", "Purple MCP")
                    
                    # Try to extract console URL from server info or instructions
                    instructions = init_result["result"].get("instructions", "")
                    if "sentinelone" in instructions.lower():
                        # Parse console URL from instructions if present
                        import re
                        url_match = re.search(r'https://[^\s]+\.sentinelone\.net', instructions)
                        if url_match:
                            result["console_url"] = url_match.group(0)
            except Exception:
                pass  # Server info is optional
            
            return result
    except Exception as e:
        result["error"] = str(e)
        return result


@app.get("/api/tools")
async def list_tools() -> dict[str, Any]:
    """List available MCP tools from the server."""
    try:
        result = await mcp_client.list_tools()
        if "result" in result and "tools" in result["result"]:
            # Format tools for the UI
            tools = []
            category_map = {
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
            for tool in result["result"]["tools"]:
                name = tool.get("name", "")
                cat_info = category_map.get(name, ("Other", "box", "#6B7280"))
                tools.append({
                    "name": name,
                    "category": cat_info[0],
                    "icon": cat_info[1],
                    "color": cat_info[2],
                    "description": tool.get("description", "")[:200],  # Truncate long descriptions
                })
            return {"tools": tools}
        return {"tools": [], "error": result.get("error", "Unknown error")}
    except Exception as e:
        return {"tools": [], "error": str(e)}


def _extract_mcp_result(result: dict[str, Any]) -> str:
    """Extract text content from MCP response format."""
    if "result" in result:
        content = result["result"]
        if isinstance(content, dict) and "content" in content:
            texts = []
            for item in content.get("content", []):
                if item.get("type") == "text":
                    texts.append(item.get("text", ""))
            return "\n".join(texts)
        return str(content)
    return ""


def _detect_powerquery(text: str) -> str | None:
    """Detect if text contains a PowerQuery and extract it.
    
    PowerQueries typically look like:
    | filter( event.type == "IP Connect" AND ... )
    | group ConnectionCount = count() by dst.ip.address
    | sort - ConnectionCount
    | limit 1000
    """
    import re
    
    # Check if this looks like it contains a PowerQuery
    pq_indicators = ["| filter(", "| filter ", "| columns", "| sort", "| group", "| limit"]
    if not any(ind in text for ind in pq_indicators):
        return None
    
    # Try to extract multi-line PowerQuery (lines starting with |)
    lines = text.split("\n")
    pq_lines = []
    in_query = False
    
    for line in lines:
        stripped = line.strip()
        # Start of PowerQuery
        if stripped.startswith("| ") or stripped.startswith("|filter") or stripped.startswith("|group"):
            in_query = True
            pq_lines.append(stripped)
        elif in_query and stripped.startswith("|"):
            pq_lines.append(stripped)
        elif in_query and stripped == "":
            # Empty line might end the query
            continue
        elif in_query and not stripped.startswith("|"):
            # Non-pipe line ends the query
            break
    
    if pq_lines:
        return "\n".join(pq_lines)
    
    # Fallback: try regex for inline queries
    pattern = r'\| filter\([^)]+\)(?:\s*\|[^|]+)*'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(0).strip()
    
    return None


def _format_query_results(data: str, original_question: str) -> str:
    """Format raw query results into a more readable format."""
    # If it's JSON-like data, try to format it nicely
    if data.startswith("{") or data.startswith("["):
        try:
            parsed = json.loads(data)
            if isinstance(parsed, list):
                count = len(parsed)
                if count == 0:
                    return f"**No results found** for your query: *{original_question}*"
                
                # Format as a summary
                summary = f"**Found {count} result(s)** for: *{original_question}*\n\n"
                
                # Show first few items
                for i, item in enumerate(parsed[:10]):
                    if isinstance(item, dict):
                        # Extract key fields
                        summary += f"**{i+1}.** "
                        key_fields = []
                        for key in ["name", "title", "description", "severity", "status", "type", "id"]:
                            if key in item:
                                key_fields.append(f"{key}: {item[key]}")
                        summary += ", ".join(key_fields[:4]) + "\n"
                    else:
                        summary += f"- {item}\n"
                
                if count > 10:
                    summary += f"\n*... and {count - 10} more results*"
                
                return summary
        except json.JSONDecodeError:
            pass
    
    return data


def _detect_query_type(query: str) -> str:
    """Detect what type of data the user is asking about."""
    query_lower = query.lower()
    
    # Check for alerts-related keywords
    if any(word in query_lower for word in ["alert", "alerts", "incident", "incidents", "detection", "detections"]):
        return "alerts"
    
    # Check for vulnerability-related keywords
    if any(word in query_lower for word in ["vulnerability", "vulnerabilities", "cve", "cves", "patch", "exploit"]):
        return "vulnerabilities"
    
    # Check for misconfiguration-related keywords
    if any(word in query_lower for word in ["misconfiguration", "misconfig", "config", "compliance", "posture", "cloud security"]):
        return "misconfigurations"
    
    # Check for inventory-related keywords
    if any(word in query_lower for word in ["inventory", "asset", "assets", "endpoint", "endpoints", "server", "servers", "device", "devices"]):
        return "inventory"
    
    # Default to Purple AI for threat hunting
    return "purple_ai"


async def _call_anthropic(system_prompt: str, user_prompt: str) -> str:
    """Call Anthropic Claude API."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": config.llm_api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": config.llm_model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        
        if response.status_code == 200:
            result = response.json()
            if "content" in result and len(result["content"]) > 0:
                return result["content"][0].get("text", "No summary available")
        
        return f"Anthropic Error ({response.status_code}): {response.text[:200]}"


async def _call_openai_simple(system_prompt: str, user_prompt: str) -> str:
    """Call OpenAI API without function calling."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.llm_api_key}",
            },
            json={
                "model": config.llm_model,
                "max_completion_tokens": 4096,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
        
        if response.status_code == 200:
            result = response.json()
            if "choices" in result and len(result["choices"]) > 0:
                return result["choices"][0]["message"].get("content", "No summary available")
        
        return f"OpenAI Error ({response.status_code}): {response.text[:200]}"


# Define MCP tools as OpenAI function definitions
MCP_TOOLS_FOR_OPENAI = [
    {
        "type": "function",
        "function": {
            "name": "list_alerts",
            "description": "List security alerts from SentinelOne. Returns alerts with severity, status, threat info, and affected endpoints. Use this when user asks about alerts, incidents, detections, or threats.",
            "parameters": {
                "type": "object",
                "properties": {
                    "first": {"type": "integer", "description": "Number of alerts to return (default 25, max 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alert",
            "description": "Get detailed information about a specific alert by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "alert_id": {"type": "string", "description": "The alert ID to retrieve"},
                },
                "required": ["alert_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_vulnerabilities",
            "description": "List security vulnerabilities (CVEs) found on endpoints. Returns CVE IDs, severity scores, affected applications, and remediation status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "first": {"type": "integer", "description": "Number of vulnerabilities to return (default 25)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_misconfigurations",
            "description": "List cloud and Kubernetes security misconfigurations. Returns compliance issues, severity, and remediation guidance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "first": {"type": "integer", "description": "Number of misconfigurations to return (default 25)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_inventory_items",
            "description": "List assets from the unified asset inventory. Returns endpoints, users, applications, and their details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number of items to return (default 25)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "purple_ai",
            "description": """Ask SentinelOne Purple AI a cybersecurity question in NATURAL LANGUAGE. Purple AI searches the Data Lake and returns results directly - no other tools needed.

Purple AI can:
- Hunt for threats, investigate incidents, analyze telemetry
- Search process trees, file operations, network connections, registry changes
- Find IOCs, TTPs, lateral movement, persistence mechanisms
- Answer questions about specific endpoints, users, or time periods

TIME SPECIFICATIONS: Include time in your natural language query:
- "in the last 24 hours" (default if not specified)
- "in the last 72 hours" or "in the last week"
- "between 2026-01-23 09:40 and 10:10 UTC"

RESULT LIMITS: Default is 1000 events. To get more, add: "do not consider the 1000 events limit"

EXAMPLE QUERIES:
- "Show me all process activity on endpoint TheBorg-1AWC between 2026-01-23 09:40 and 10:10 UTC, do not consider the 1000 events limit"
- "Find all network connections from processes related to ransomware in the last 72 hours"
- "What files were modified by 9672B0.exe on TheBorg-1AWC?"

Just describe what you're looking for in plain English. Purple AI handles everything.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language security question including time range if needed"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "powerquery",
            "description": """Execute a PowerQuery directly against the SentinelOne Data Lake. Use this for HISTORICAL queries when you have a specific PowerQuery to run.

WHEN TO USE:
- When Purple AI generates a PowerQuery but fails to execute it
- When you need to query specific historical time ranges (e.g., Jan 23, 2026)
- When you have an exact PowerQuery from Purple AI or the user

PARAMETERS:
- query: The PowerQuery string (e.g., '| filter( event.type == "IP Connect" ) | group count() by dst.ip.address')
- start_datetime: ISO 8601 format with timezone (e.g., "2026-01-23T00:00:00Z")
- end_datetime: ISO 8601 format with timezone (e.g., "2026-01-23T23:59:59Z")

IMPORTANT: Always use ISO 8601 format with 'Z' suffix for UTC times.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The PowerQuery string to execute"},
                    "start_datetime": {"type": "string", "description": "Start time in ISO 8601 format (e.g., 2026-01-23T00:00:00Z)"},
                    "end_datetime": {"type": "string", "description": "End time in ISO 8601 format (e.g., 2026-01-23T23:59:59Z)"},
                },
                "required": ["query", "start_datetime", "end_datetime"],
            },
        },
    },
]

SYSTEM_PROMPT = """You are a SOC (Security Operations Center) analyst assistant powered by SentinelOne. You help security analysts investigate threats, triage alerts, and understand their security posture.

You have access to tools that query real SentinelOne data:
- list_alerts: Get security alerts and detections
- get_alert: Get details about a specific alert  
- list_vulnerabilities: Get CVEs and security vulnerabilities
- list_misconfigurations: Get cloud/K8s security misconfigurations  
- list_inventory_items: Get asset inventory (endpoints, users, apps)
- purple_ai: Ask Purple AI for threat hunting and telemetry analysis (NATURAL LANGUAGE)
- powerquery: Execute PowerQueries directly with specific time ranges (for HISTORICAL data)

TELEMETRY INVESTIGATION WORKFLOW:

1. FIRST: Try purple_ai with a natural language question
   - Include the time range in your question: "on January 23, 2026", "in the last week"
   - Be specific: endpoint names, process names, what you're looking for
   - Example: "Show me all outbound network connections from TheBorg-1AWC on January 23, 2026, grouped by destination IP"

2. IF Purple AI returns a PowerQuery but no results, OR if it fails:
   - Use the powerquery tool directly with the PowerQuery string
   - Specify exact ISO 8601 datetime range: start_datetime="2026-01-23T00:00:00Z", end_datetime="2026-01-23T23:59:59Z"

3. ALWAYS present results as formatted tables when you have structured data

EXAMPLE POWERQUERIES (for reference):
- Network connections by IP: | filter( event.type == "IP Connect" AND event.network.direction == "OUTGOING" AND endpoint.name contains:anycase("TheBorg-1AWC") ) | group ConnectionCount = count() by dst.ip.address | sort - ConnectionCount
- Process activity: | filter( endpoint.name contains:anycase("TheBorg-1AWC") AND event.type == "Process Creation" ) | columns endpoint.name, src.process.name, src.process.cmdline, src.process.user

BEHAVIOR RULES:
1. NEVER ask the user to choose options - ACT AUTONOMOUSLY
2. NEVER tell the user to run queries manually - YOU execute them
3. If purple_ai fails for historical queries, immediately try powerquery with the exact time range
4. ALWAYS execute the full investigation workflow without asking

Be concise but thorough. Act autonomously - execute queries, present results."""


async def _execute_mcp_tool(tool_name: str, arguments: dict) -> str:
    """Execute an MCP tool and return the result as a string.
    
    For purple_ai: Automatically detects and executes any PowerQuery returned,
    combining the explanation with actual query results.
    """
    try:
        result = await mcp_client.call_tool(tool_name, arguments)
        
        content = _extract_mcp_result(result)
        if not content:
            if "error" in result:
                return f"Error: {result['error']}"
            return "No data returned"
        
        # For purple_ai: auto-execute any PowerQuery in the response
        if tool_name == "purple_ai":
            powerquery_str = _detect_powerquery(content)
            if powerquery_str:
                # Execute the PowerQuery automatically with ISO 8601 datetime format
                from datetime import datetime, timedelta, timezone
                end_dt = datetime.now(timezone.utc)
                start_dt = end_dt - timedelta(days=14)  # 2 weeks back for historical queries
                
                start_datetime = start_dt.isoformat().replace("+00:00", "Z")
                end_datetime = end_dt.isoformat().replace("+00:00", "Z")
                
                try:
                    pq_result = await mcp_client.call_tool("powerquery", {
                        "query": powerquery_str,
                        "start_datetime": start_datetime,
                        "end_datetime": end_datetime,
                    })
                    pq_content = _extract_mcp_result(pq_result)
                    
                    if pq_content and "error" not in pq_result:
                        # Combine Purple AI explanation with query results
                        content = f"{content}\n\n---\n\n**Query Results:**\n\n{pq_content}"
                except Exception as e:
                    # If PowerQuery fails, still return Purple AI's response
                    content = f"{content}\n\n(Note: PowerQuery execution failed: {str(e)})"
        
        # Truncate if too long
        if len(content) > 50000:
            content = content[:50000] + "\n\n... [truncated]"
        return content
        
    except Exception as e:
        return f"Tool error: {str(e)}"


async def _run_openai_agent(user_query: str, conversation_history: list | None = None) -> str:
    """Run OpenAI with function calling in an agentic loop.
    
    Args:
        user_query: The current user question
        conversation_history: Previous messages for context (list of dicts with role/content)
    """
    if not config.llm_api_key:
        return "**⚠️ LLM not configured.** Please configure an OpenAI API key in Settings."
    
    # Build messages with conversation history for context
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add conversation history (previous messages) for context
    if conversation_history:
        for msg in conversation_history:
            # Convert Pydantic model to dict if needed
            if hasattr(msg, 'model_dump'):
                msg_dict = msg.model_dump()
            elif hasattr(msg, 'dict'):
                msg_dict = msg.dict()
            else:
                msg_dict = msg
            messages.append({"role": msg_dict["role"], "content": msg_dict["content"]})
    
    max_iterations = 10  # Prevent infinite loops
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        for iteration in range(max_iterations):
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {config.llm_api_key}",
                },
                json={
                    "model": config.llm_model,
                    "max_completion_tokens": 4096,
                    "messages": messages,
                    "tools": MCP_TOOLS_FOR_OPENAI,
                    "tool_choice": "auto",
                },
            )
            
            if response.status_code != 200:
                return f"OpenAI Error ({response.status_code}): {response.text[:500]}"
            
            result = response.json()
            choice = result.get("choices", [{}])[0]
            message = choice.get("message", {})
            finish_reason = choice.get("finish_reason")
            
            # Add assistant message to history
            messages.append(message)
            
            # If no tool calls, we're done
            if finish_reason == "stop" or not message.get("tool_calls"):
                return message.get("content", "No response generated")
            
            # Execute tool calls
            tool_calls = message.get("tool_calls", [])
            for tool_call in tool_calls:
                func = tool_call.get("function", {})
                tool_name = func.get("name", "")
                try:
                    arguments = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    arguments = {}
                
                # Execute the MCP tool
                tool_result = await _execute_mcp_tool(tool_name, arguments)
                
                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.get("id"),
                    "content": tool_result,
                })
    
    return "Max iterations reached. Please try a more specific query."


async def _call_google(system_prompt: str, user_prompt: str) -> str:
    """Call Google Gemini API."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{config.llm_model}:generateContent",
            headers={"Content-Type": "application/json"},
            params={"key": config.llm_api_key},
            json={
                "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
                "generationConfig": {"maxOutputTokens": 4096},
            },
        )
        
        if response.status_code == 200:
            result = response.json()
            if "candidates" in result and len(result["candidates"]) > 0:
                parts = result["candidates"][0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "No summary available")
        
        return f"Google Error ({response.status_code}): {response.text[:200]}"


async def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """Call the configured LLM provider."""
    if not config.llm_api_key:
        raise ValueError("LLM not configured")
    
    if config.llm_provider == "anthropic":
        return await _call_anthropic(system_prompt, user_prompt)
    elif config.llm_provider == "openai":
        return await _call_openai(system_prompt, user_prompt)
    elif config.llm_provider == "google":
        return await _call_google(system_prompt, user_prompt)
    else:
        raise ValueError(f"Unknown LLM provider: {config.llm_provider}")


async def _analyze_query_intent(user_question: str) -> dict[str, Any]:
    """Use LLM to analyze the user's question and determine which tools to call."""
    system_prompt = """You are a SOC analyst query planner. Analyze the user's security question and determine which SentinelOne tools to query.

Available tools:
- alerts: Security alerts and detections (has severity, status, endpoint info)
- vulnerabilities: CVEs and security vulnerabilities on endpoints
- misconfigurations: Cloud/Kubernetes security misconfigurations
- inventory: Asset inventory (endpoints, users, applications)
- purple_ai: Threat hunting with natural language, can generate PowerQueries for behavioral analysis

Respond ONLY with valid JSON in this exact format:
{
    "primary_tools": ["alerts", "inventory"],  // Tools to query first
    "needs_correlation": true,  // Whether to correlate data across tools
    "time_filter": "today",  // Time context: "today", "week", "month", or null
    "severity_filter": "critical",  // Severity filter: "critical", "high", "medium", "low", or null
    "limit": 10,  // Number of results to fetch
    "correlation_fields": ["endpoint", "hostname"],  // Fields to use for correlation
    "suggest_purple_ai": true  // Whether to suggest Purple AI follow-up queries
}"""

    user_prompt = f"User question: {user_question}"
    
    try:
        response = await _call_llm(system_prompt, user_prompt)
        # Extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    
    # Default fallback
    return {
        "primary_tools": ["alerts"],
        "needs_correlation": True,
        "time_filter": None,
        "severity_filter": None,
        "limit": 25,
        "correlation_fields": ["endpoint"],
        "suggest_purple_ai": True
    }


async def _gather_tool_data(tools: list[str], limit: int = 25) -> dict[str, str]:
    """Gather data from multiple MCP tools."""
    results = {}
    
    for tool in tools:
        try:
            if tool == "alerts":
                result = await mcp_client.call_tool("list_alerts", {"first": limit})
            elif tool == "vulnerabilities":
                result = await mcp_client.call_tool("list_vulnerabilities", {"first": limit})
            elif tool == "misconfigurations":
                result = await mcp_client.call_tool("list_misconfigurations", {"first": limit})
            elif tool == "inventory":
                result = await mcp_client.call_tool("list_inventory_items", {"limit": limit})
            else:
                continue
            
            content = _extract_mcp_result(result)
            if content:
                results[tool] = content
        except Exception as e:
            results[tool] = f"Error fetching {tool}: {str(e)}"
    
    return results


async def _generate_soc_triage_report(
    user_question: str,
    tool_data: dict[str, str],
    intent: dict[str, Any]
) -> str:
    """Generate a comprehensive SOC analyst triage report using LLM."""
    if not config.llm_api_key:
        return "**⚠️ LLM not configured.** Please configure an LLM provider in Settings.\n\n" + \
               "\n\n".join([f"**{k}:**\n```json\n{v[:1000]}...\n```" for k, v in tool_data.items()])
    
    # Combine all data
    combined_data = "\n\n".join([
        f"=== {tool.upper()} DATA ===\n{data}" 
        for tool, data in tool_data.items()
    ])
    
    # Truncate if too large
    if len(combined_data) > 80000:
        combined_data = combined_data[:80000] + "\n\n... [data truncated]"
    
    system_prompt = """You are an expert SOC (Security Operations Center) analyst performing initial triage and correlation. Your job is to:

1. **ANALYZE** the security data from multiple sources (alerts, vulnerabilities, misconfigurations, inventory)
2. **CORRELATE** findings across data sources - identify which assets appear in multiple contexts
3. **TRIAGE** by priority - focus on critical/high severity items first
4. **CONTEXTUALIZE** - explain the risk and potential impact for each finding
5. **RECOMMEND** immediate actions and follow-up investigations

Format your response as a professional SOC triage report with these sections:

## 🚨 Executive Summary
Brief overview answering the user's specific question

## 🔴 Critical Findings
Top priority items requiring immediate attention (if any)

## 📊 Detailed Analysis
- Breakdown by severity/category
- Asset correlation (which endpoints/users are affected)
- Vulnerability context if relevant
- Misconfiguration risks if relevant

## 🔗 Asset Context
Summary of affected assets from inventory data

## 🎯 Recommended Actions
Prioritized list of next steps

## 🔍 Suggested Threat Hunt Queries
Provide 2-3 natural language queries to send to Purple AI for deeper behavioral analysis of the affected assets. Format each as a quoted string the user can copy.

Be concise but thorough. Use tables where appropriate. Highlight critical items with emoji indicators."""

    user_prompt = f"""User Question: {user_question}

Analysis Intent:
- Primary focus: {', '.join(intent.get('primary_tools', []))}
- Correlation needed: {intent.get('needs_correlation', False)}
- Time filter: {intent.get('time_filter', 'not specified')}
- Severity filter: {intent.get('severity_filter', 'all')}

Security Data:
{combined_data}

Generate a comprehensive SOC triage report that directly answers the user's question and provides actionable insights."""

    try:
        return await _call_llm(system_prompt, user_prompt)
    except Exception as e:
        return f"**LLM Error:** {str(e)}\n\n**Raw data:**\n```\n{combined_data[:2000]}...\n```"


@app.post("/api/query")
async def execute_query(request: QueryRequest) -> dict[str, Any]:
    """Execute a natural language query using OpenAI with function calling.
    
    This endpoint implements an agentic workflow where:
    1. OpenAI receives the user's question + available MCP tools as functions
    2. OpenAI autonomously decides which tools to call
    3. Tools are executed and results fed back to OpenAI
    4. OpenAI generates a final natural language response
    
    This allows the LLM to reason about what data it needs and how to combine it.
    """
    try:
        # Use the agentic OpenAI approach with function calling
        if config.llm_provider == "openai":
            result = await _run_openai_agent(request.query, request.conversation_history)
            return {"status": "success", "result": result}
        else:
            # Fallback for other providers: use simple keyword routing
            query_type = _detect_query_type(request.query)
            
            if query_type == "alerts":
                tool_result = await mcp_client.call_tool("list_alerts", {"first": 25})
            elif query_type == "vulnerabilities":
                tool_result = await mcp_client.call_tool("list_vulnerabilities", {"first": 25})
            elif query_type == "misconfigurations":
                tool_result = await mcp_client.call_tool("list_misconfigurations", {"first": 25})
            elif query_type == "inventory":
                tool_result = await mcp_client.call_tool("list_inventory_items", {"limit": 25})
            else:
                # Use Purple AI
                tool_result = await mcp_client.call_tool("purple_ai", {"query": request.query})
            
            content = _extract_mcp_result(tool_result)
            if not content:
                return {"status": "error", "result": "No data returned"}
            
            # Summarize with LLM if available
            if config.llm_api_key:
                summary = await _call_llm(
                    "You are a SOC analyst. Summarize this security data concisely, highlighting key findings.",
                    f"User question: {request.query}\n\nData:\n{content[:50000]}"
                )
                return {"status": "success", "result": summary}
            
            return {"status": "success", "result": content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/purple-ai")
async def purple_ai_query(request: QueryRequest) -> dict[str, Any]:
    """Execute a Purple AI threat hunting query with optional PowerQuery execution.
    
    This endpoint is for direct threat hunting queries suggested by the SOC triage report.
    It calls Purple AI, auto-executes any returned PowerQueries, and summarizes results.
    """
    try:
        # Call Purple AI
        result = await mcp_client.call_tool("purple_ai", {"query": request.query})
        
        if "error" in result:
            error_msg = result["error"].get("message", "MCP error") if isinstance(result["error"], dict) else str(result["error"])
            raise HTTPException(status_code=500, detail=error_msg)
        
        content = _extract_mcp_result(result)
        
        if not content:
            return {"status": "error", "result": "No response from Purple AI"}
        
        # Check if Purple AI returned a PowerQuery - auto-execute it
        powerquery = _detect_powerquery(content)
        
        if powerquery:
            import time
            end_time = int(time.time() * 1000)
            start_time = end_time - (7 * 24 * 60 * 60 * 1000)  # 7 days
            
            pq_result = await mcp_client.call_tool("powerquery", {
                "query": powerquery,
                "start_time": start_time,
                "end_time": end_time,
            })
            
            if "error" not in pq_result:
                pq_content = _extract_mcp_result(pq_result)
                if pq_content and config.llm_api_key:
                    # Summarize with LLM
                    system_prompt = """You are a threat hunting analyst. Summarize the Purple AI response and query results in a clear, actionable format. Highlight any indicators of compromise, suspicious behaviors, or anomalies found."""
                    user_prompt = f"""User Query: {request.query}

Purple AI Response:
{content}

PowerQuery Results:
{pq_content}

Provide a concise threat hunting summary with key findings and recommended next steps."""
                    
                    try:
                        summary = await _call_llm(system_prompt, user_prompt)
                        return {"status": "success", "result": summary}
                    except Exception:
                        pass
                
                # Return raw if LLM fails
                return {
                    "status": "success",
                    "result": f"## Purple AI Response\n\n{content}\n\n---\n\n## Query Results\n\n```json\n{pq_content[:5000]}\n```"
                }
        
        return {"status": "success", "result": content}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tool")
async def execute_tool(request: ToolRequest) -> dict[str, Any]:
    """Execute any MCP tool by name."""
    try:
        result = await mcp_client.call_tool(request.tool_name, request.arguments)

        if "error" in result:
            error_msg = result["error"].get("message", "MCP error") if isinstance(result["error"], dict) else str(result["error"])
            raise HTTPException(status_code=500, detail=error_msg)

        content = _extract_mcp_result(result)
        if content:
            return {"status": "success", "result": content}

        return {"status": "error", "result": "No response from tool"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/categories")
async def get_categories() -> dict[str, Any]:
    """Get tool categories for navigation."""
    categories = [
        {"id": "purple_ai", "name": "Purple AI", "icon": "brain", "color": "#8B5CF6"},
        {"id": "data_lake", "name": "Data Lake", "icon": "database", "color": "#3B82F6"},
        {"id": "alerts", "name": "Alerts", "icon": "alert-triangle", "color": "#F59E0B"},
        {"id": "vulnerabilities", "name": "Vulnerabilities", "icon": "shield-off", "color": "#EF4444"},
        {"id": "misconfigurations", "name": "Misconfigurations", "icon": "settings", "color": "#10B981"},
        {"id": "inventory", "name": "Inventory", "icon": "server", "color": "#6366F1"},
    ]
    return {"categories": categories}


@app.get("/api/settings")
async def get_settings() -> dict[str, Any]:
    """Get current application settings."""
    return {"status": "success", "settings": config.to_dict()}


@app.post("/api/settings")
async def update_settings(request: ConfigUpdateRequest) -> dict[str, Any]:
    """Update application settings."""
    global mcp_client
    
    changes_made = []
    
    # Update MCP server URL
    if request.mcp_server_url is not None and request.mcp_server_url != config.mcp_server_url:
        config.mcp_server_url = request.mcp_server_url
        # Recreate MCP client with new URL
        mcp_client = MCPClient(config.mcp_server_url)
        changes_made.append("mcp_server_url")
    
    # Update LLM provider
    if request.llm_provider is not None and request.llm_provider != config.llm_provider:
        config.llm_provider = request.llm_provider
        # Set default model for new provider
        if config.llm_provider in config.provider_models:
            config.llm_model = config.provider_models[config.llm_provider][0]
        changes_made.append("llm_provider")
        changes_made.append("llm_model")
    
    # Update LLM API key
    if request.llm_api_key is not None:
        config.llm_api_key = request.llm_api_key
        changes_made.append("llm_api_key")
    
    # Update LLM model
    if request.llm_model is not None and request.llm_model != config.llm_model:
        config.llm_model = request.llm_model
        changes_made.append("llm_model")
    
    # Save to persistent file
    saved = False
    if changes_made:
        saved = config.save_to_file()
    
    return {
        "status": "success",
        "message": f"Updated: {', '.join(changes_made)}" + (" (saved)" if saved else "") if changes_made else "No changes",
        "settings": config.to_dict(),
    }


@app.get("/api/settings/models")
async def get_available_models() -> dict[str, Any]:
    """Get available models for all providers."""
    return {"status": "success", "models": config.provider_models}


# Logs endpoint for troubleshooting
@app.get("/api/logs")
async def get_logs(container: str = "backend", lines: int = 100) -> dict[str, Any]:
    """Get container logs for troubleshooting.
    
    Args:
        container: 'backend', 'frontend', or 'all'
        lines: Number of recent lines to return
    """
    result = {}
    
    if container in ("backend", "all"):
        # Get backend logs from in-memory buffer
        backend_logs = log_buffer.get_logs()[-lines:]
        result["backend"] = {
            "container": "spectra-backend",
            "logs": backend_logs,
            "source": "memory_buffer",
        }
    
    if container in ("frontend", "all"):
        # Try to get frontend logs via Docker API socket
        try:
            async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds="/var/run/docker.sock")) as client:
                # Get logs from Docker API
                response = await client.get(
                    f"http://localhost/containers/spectra-frontend/logs?stdout=true&stderr=true&tail={lines}",
                    timeout=5.0,
                )
                if response.status_code == 200:
                    # Docker logs have 8-byte header per line, strip it
                    raw_logs = response.content
                    log_lines = []
                    i = 0
                    while i < len(raw_logs):
                        if i + 8 <= len(raw_logs):
                            # Skip 8-byte header
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


# ============================================================================
# Investigation Library API Endpoints
# ============================================================================

@app.get("/api/investigations")
async def list_investigations() -> dict[str, Any]:
    """List all saved investigations."""
    investigations = _load_investigations()
    # Return as list sorted by updated_at (newest first)
    inv_list = sorted(
        [inv.model_dump() for inv in investigations.values()],
        key=lambda x: x["updated_at"],
        reverse=True
    )
    return {"status": "success", "investigations": inv_list, "count": len(inv_list)}


@app.get("/api/investigations/{investigation_id}")
async def get_investigation(investigation_id: str) -> dict[str, Any]:
    """Get a specific investigation by ID."""
    investigations = _load_investigations()
    if investigation_id not in investigations:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return {"status": "success", "investigation": investigations[investigation_id].model_dump()}


@app.post("/api/investigations")
async def save_investigation(request: SaveInvestigationRequest) -> dict[str, Any]:
    """Save a new investigation or update an existing one."""
    investigations = _load_investigations()
    now = datetime.utcnow().isoformat() + "Z"
    
    if request.investigation_id and request.investigation_id in investigations:
        # Update existing
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
        # Create new
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
    
    if _save_investigations(investigations):
        logger.info(f"Investigation {action}: {inv_id} - {request.title}")
        return {"status": "success", "message": f"Investigation {action}", "investigation": investigation.model_dump()}
    else:
        raise HTTPException(status_code=500, detail="Failed to save investigation")


@app.delete("/api/investigations/{investigation_id}")
async def delete_investigation(investigation_id: str) -> dict[str, Any]:
    """Delete an investigation."""
    investigations = _load_investigations()
    if investigation_id not in investigations:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    title = investigations[investigation_id].title
    del investigations[investigation_id]
    
    if _save_investigations(investigations):
        logger.info(f"Investigation deleted: {investigation_id} - {title}")
        return {"status": "success", "message": "Investigation deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete investigation")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
