"""SPECTRA Pydantic models."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


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
    mcp_server_url: Optional[str] = Field(None, description="MCP server URL")
    llm_provider: Optional[Literal["anthropic", "openai", "google"]] = Field(None, description="LLM provider")
    llm_api_key: Optional[str] = Field(None, description="LLM API key")
    llm_model: Optional[str] = Field(None, description="LLM model name")


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
    investigation_id: Optional[str] = Field(None, description="Existing ID to update, or None for new")


class ToolDefinition(BaseModel):
    """MCP tool definition with schema."""
    name: str
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Result from an MCP tool execution."""
    tool_name: str
    content: str
    is_error: bool = False


class AgentResponse(BaseModel):
    """Response from a specialist agent."""
    agent_name: str
    content: str
    tools_called: list[str] = Field(default_factory=list)
    tool_calls_sequence: list[dict] = Field(default_factory=list)
    is_error: bool = False
