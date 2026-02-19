"""SPECTRA MCP client for communicating with Purple MCP server."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from models import ToolDefinition

logger = logging.getLogger("spectra")


class MCPClient:
    """Client for communicating with Purple MCP server via SSE or streamable-http."""

    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip("/")
        self.session_id: str | None = None
        self._request_id = 0
        self._tools_cache: list[ToolDefinition] = []
        self._tools_cache_time: float = 0
        self._tools_cache_ttl: float = 300  # 5 minutes

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
        return headers

    async def _parse_sse_response(self, response: httpx.Response) -> dict[str, Any]:
        content_type = response.headers.get("content-type", "")

        if "text/event-stream" in content_type:
            text = response.text
            result = None
            for line in text.split("\n"):
                if line.startswith("data: "):
                    data = line[6:]
                    if data.strip():
                        try:
                            parsed = json.loads(data)
                            if "result" in parsed or "error" in parsed:
                                result = parsed
                        except json.JSONDecodeError:
                            continue
            if result:
                return result
            return {"error": {"message": "No valid response in SSE stream"}}
        else:
            return response.json()

    async def initialize(self) -> dict[str, Any]:
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
        # Log the tool call with full arguments for debugging
        logger.info(f"MCP tool call: {tool_name}")
        logger.info(f"MCP tool arguments: {json.dumps(arguments, indent=2)}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
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

    async def discover_tools(self) -> list[ToolDefinition]:
        """Discover available tools from the MCP server with TTL-based caching."""
        now = time.time()
        if self._tools_cache and (now - self._tools_cache_time) < self._tools_cache_ttl:
            return self._tools_cache

        try:
            result = await self.list_tools()
            if "result" in result and "tools" in result["result"]:
                self._tools_cache = [
                    ToolDefinition(
                        name=t.get("name", ""),
                        description=t.get("description", ""),
                        input_schema=t.get("inputSchema", {}),
                    )
                    for t in result["result"]["tools"]
                ]
                self._tools_cache_time = now
                logger.info(f"Discovered {len(self._tools_cache)} MCP tools")
                return self._tools_cache
        except Exception as e:
            logger.warning(f"Tool discovery failed: {e}")
            if self._tools_cache:
                return self._tools_cache

        return []


def extract_mcp_result(result: dict[str, Any]) -> str:
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


# Global MCP client instance
_mcp_client: MCPClient | None = None


def get_mcp_client() -> MCPClient:
    """Get the global MCP client instance."""
    global _mcp_client
    if _mcp_client is None:
        from config import config
        _mcp_client = MCPClient(config.mcp_server_url)
    return _mcp_client


def reset_mcp_client(server_url: str) -> MCPClient:
    """Reset the global MCP client with a new server URL."""
    global _mcp_client
    _mcp_client = MCPClient(server_url)
    return _mcp_client
