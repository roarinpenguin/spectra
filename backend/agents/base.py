"""Base agent class for SPECTRA specialist agents."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from config import AppConfig
from llm_providers import LLMProvider
from mcp_client import MCPClient
from models import AgentResponse, ToolDefinition

logger = logging.getLogger("spectra")


class BaseAgent(ABC):
    """Abstract base class for specialist agents.

    Each agent has:
    - A name and description (used by the orchestrator for routing)
    - A list of MCP tool names it can use
    - A domain-specific system prompt
    """

    name: str = ""
    description: str = ""
    tool_names: list[str] = []
    system_prompt: str = ""

    async def execute(
        self,
        query: str,
        conversation_history: list | None,
        mcp_client: MCPClient,
        config: AppConfig,
        all_tools: list[ToolDefinition],
    ) -> AgentResponse:
        """Execute the agent's task using an agentic tool-calling loop.

        Args:
            query: The user's query
            conversation_history: Previous messages for context
            mcp_client: MCP client for tool execution
            config: App configuration
            all_tools: All discovered MCP tool definitions

        Returns:
            AgentResponse with the agent's findings
        """
        # Filter tools to only those this agent can use
        agent_tools = [t for t in all_tools if t.name in self.tool_names]

        if not agent_tools:
            logger.warning(f"Agent {self.name} has no matching tools from {len(all_tools)} available")
            return AgentResponse(
                agent_name=self.name,
                content=f"No tools available for {self.name} agent.",
                is_error=True,
            )

        provider = LLMProvider(config, mcp_client)

        try:
            logger.info(f"Agent {self.name} executing with {len(agent_tools)} tools")
            result = await provider.run_agent_loop(
                system_prompt=self.system_prompt,
                user_query=query,
                tools=agent_tools,
                conversation_history=conversation_history,
                max_iterations=10,
            )
            tools_used = [t.name for t in agent_tools]
            return AgentResponse(
                agent_name=self.name,
                content=result,
                tools_called=tools_used,
            )
        except Exception as e:
            logger.error(f"Agent {self.name} error: {e}")
            return AgentResponse(
                agent_name=self.name,
                content=f"Error in {self.name} agent: {str(e)}",
                is_error=True,
            )
