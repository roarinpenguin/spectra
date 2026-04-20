"""SPECTRA Pydantic models (v1.1 — multi-tenant)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Per-request session config (browser-supplied, never persisted)
# ---------------------------------------------------------------------------

class LLMConfigPayload(BaseModel):
    """LLM configuration sent inline by the browser on each query."""
    provider: str = Field(default="openai", description="openai | anthropic | google")
    model: str = Field(default="", description="Model identifier")
    api_key: str = Field(default="", description="LLM API key")


class SessionConfigPayload(BaseModel):
    """Per-request session configuration carried in the request body.

    The browser sends this on every endpoint that needs to talk to MCP
    or an LLM. The backend never persists it.
    """
    mcp_server_url: str = Field(default="", description="Purple MCP server URL")
    llm: LLMConfigPayload = Field(default_factory=LLMConfigPayload)


# ---------------------------------------------------------------------------
# Conversation / query models
# ---------------------------------------------------------------------------

class ConversationMessage(BaseModel):
    """A single message in conversation history."""
    role: str
    content: str


class QueryRequest(BaseModel):
    """A natural-language query from the frontend."""
    query: str
    conversation_history: Optional[list[ConversationMessage]] = None
    session_config: Optional[SessionConfigPayload] = None


class ToolRequest(BaseModel):
    """A direct MCP tool invocation from the frontend."""
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    session_config: Optional[SessionConfigPayload] = None


class McpHealthRequest(BaseModel):
    """A targeted MCP health probe for a specific server URL."""
    session_config: SessionConfigPayload


class ModelRefreshRequest(BaseModel):
    """Ask the backend to list models actually available to a given API key.

    The api_key is used for a single outbound call and is never logged or
    stored. Returned to clarify which models the user's key can actually
    invoke, instead of relying on SPECTRA's static catalog.
    """
    provider: str = Field(description="openai | anthropic | google")
    api_key: str = Field(description="LLM API key")


# ---------------------------------------------------------------------------
# Tool / agent definitions
# ---------------------------------------------------------------------------

class ToolDefinition(BaseModel):
    """An MCP tool surfaced to the LLM."""
    name: str
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Result of executing an MCP tool."""
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    result: str = ""
    is_error: bool = False


class AgentResponse(BaseModel):
    """Response from a specialist agent."""
    agent_name: str
    content: str
    tools_called: list[str] = Field(default_factory=list)
    tool_calls_sequence: list[dict] = Field(default_factory=list)
    is_error: bool = False
