"""Convert MCP tool definitions to provider-specific formats."""

from __future__ import annotations

from models import ToolDefinition


def mcp_to_openai(tools: list[ToolDefinition]) -> list[dict]:
    """Convert MCP tool definitions to OpenAI function calling format."""
    result = []
    for tool in tools:
        result.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema or {"type": "object", "properties": {}},
            },
        })
    return result


def mcp_to_anthropic(tools: list[ToolDefinition]) -> list[dict]:
    """Convert MCP tool definitions to Anthropic tool_use format."""
    result = []
    for tool in tools:
        result.append({
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema or {"type": "object", "properties": {}},
        })
    return result


def mcp_to_google(tools: list[ToolDefinition]) -> list[dict]:
    """Convert MCP tool definitions to Google Gemini functionDeclarations format."""
    result = []
    for tool in tools:
        params = dict(tool.input_schema) if tool.input_schema else {"type": "object", "properties": {}}
        # Google doesn't support additionalProperties in function declarations
        params.pop("additionalProperties", None)
        result.append({
            "name": tool.name,
            "description": tool.description,
            "parameters": params,
        })
    return result
