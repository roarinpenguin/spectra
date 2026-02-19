"""SPECTRA LLM provider integrations with agentic function calling."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from config import AppConfig
from mcp_client import MCPClient, extract_mcp_result
from models import ToolDefinition
from tool_converter import mcp_to_anthropic, mcp_to_google, mcp_to_openai

logger = logging.getLogger("spectra")


def _detect_powerquery(text: str) -> str | None:
    """Detect if text contains a PowerQuery and extract it."""
    pq_indicators = ["| filter(", "| filter ", "| columns", "| sort", "| group", "| limit"]
    if not any(ind in text for ind in pq_indicators):
        return None

    lines = text.split("\n")
    pq_lines = []
    in_query = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("| ") or stripped.startswith("|filter") or stripped.startswith("|group"):
            in_query = True
            pq_lines.append(stripped)
        elif in_query and stripped.startswith("|"):
            pq_lines.append(stripped)
        elif in_query and stripped == "":
            continue
        elif in_query and not stripped.startswith("|"):
            break

    if pq_lines:
        return "\n".join(pq_lines)

    pattern = r'\| filter\([^)]+\)(?:\s*\|[^|]+)*'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(0).strip()

    return None


def _summarize_args(arguments: dict, max_len: int = 120) -> str:
    """Create a brief human-readable summary of tool arguments."""
    if not arguments:
        return ""
    parts = []
    for k, v in arguments.items():
        val = str(v)
        if len(val) > 60:
            val = val[:57] + "..."
        parts.append(f"{k}: {val}")
    summary = ", ".join(parts)
    if len(summary) > max_len:
        summary = summary[:max_len - 3] + "..."
    return summary


async def execute_mcp_tool(
    mcp_client: MCPClient,
    tool_name: str,
    arguments: dict,
    tools_log: list[str] | None = None,
    tool_calls_sequence: list[dict] | None = None,
) -> str:
    """Execute an MCP tool and return the result as a string.

    For purple_ai: Automatically detects and executes any PowerQuery returned,
    combining the explanation with actual query results.

    If tools_log is provided, appends tool_name (and 'powerquery' for auto-executed
    PowerQueries) so callers can track which tools were actually invoked.

    If tool_calls_sequence is provided, appends an ordered record of each call
    with tool name and a brief args summary for the thought-process trace.
    """
    if tools_log is not None and tool_name not in tools_log:
        tools_log.append(tool_name)

    if tool_calls_sequence is not None:
        tool_calls_sequence.append({
            "tool": tool_name,
            "args": _summarize_args(arguments),
        })

    try:
        result = await mcp_client.call_tool(tool_name, arguments)

        content = extract_mcp_result(result)
        if not content:
            if "error" in result:
                return f"Error: {result['error']}"
            return "No data returned"

        # For purple_ai: auto-execute any PowerQuery in the response
        if tool_name == "purple_ai":
            powerquery_str = _detect_powerquery(content)
            if powerquery_str:
                end_dt = datetime.now(timezone.utc)
                start_dt = end_dt - timedelta(days=14)

                start_datetime = start_dt.isoformat().replace("+00:00", "Z")
                end_datetime = end_dt.isoformat().replace("+00:00", "Z")

                try:
                    if tools_log is not None and "powerquery" not in tools_log:
                        tools_log.append("powerquery")
                    pq_args = {
                        "query": powerquery_str,
                        "start_datetime": start_datetime,
                        "end_datetime": end_datetime,
                    }
                    if tool_calls_sequence is not None:
                        tool_calls_sequence.append({
                            "tool": "powerquery",
                            "args": _summarize_args(pq_args),
                        })
                    pq_result = await mcp_client.call_tool("powerquery", pq_args)
                    pq_content = extract_mcp_result(pq_result)

                    if pq_content and "error" not in pq_result:
                        content = f"{content}\n\n---\n\n**Query Results:**\n\n{pq_content}"
                except Exception as e:
                    content = f"{content}\n\n(Note: PowerQuery execution failed: {str(e)})"

        if len(content) > 50000:
            content = content[:50000] + "\n\n... [truncated]"
        return content

    except Exception as e:
        return f"Tool error: {str(e)}"


class LLMProvider:
    """Unified LLM provider with agentic function calling for all providers."""

    def __init__(self, config: AppConfig, mcp_client: MCPClient):
        self.config = config
        self.mcp_client = mcp_client

    async def run_agent_loop(
        self,
        system_prompt: str,
        user_query: str,
        tools: list[ToolDefinition],
        conversation_history: list | None = None,
        max_iterations: int = 10,
    ) -> tuple[str, list[str], list[dict]]:
        """Run an agentic tool-calling loop with the configured LLM provider.

        Returns:
            Tuple of (response_text, unique_tools_called, ordered_tool_calls_sequence).
        """
        tools_log: list[str] = []
        tool_calls_sequence: list[dict] = []

        if not self.config.llm_api_key:
            return "**LLM not configured.** Please configure an API key in Settings.", tools_log, tool_calls_sequence

        if self.config.llm_provider == "openai":
            result = await self._run_openai_loop(
                system_prompt, user_query, tools, conversation_history, max_iterations, tools_log, tool_calls_sequence
            )
        elif self.config.llm_provider == "anthropic":
            result = await self._run_anthropic_loop(
                system_prompt, user_query, tools, conversation_history, max_iterations, tools_log, tool_calls_sequence
            )
        elif self.config.llm_provider == "google":
            result = await self._run_google_loop(
                system_prompt, user_query, tools, conversation_history, max_iterations, tools_log, tool_calls_sequence
            )
        else:
            result = f"Unknown LLM provider: {self.config.llm_provider}"

        return result, tools_log, tool_calls_sequence

    async def simple_call(self, system_prompt: str, user_prompt: str) -> str:
        """Simple LLM call without function calling (for classification, synthesis, etc.)."""
        if not self.config.llm_api_key:
            raise ValueError("LLM not configured")

        if self.config.llm_provider == "openai":
            return await self._call_openai_simple(system_prompt, user_prompt)
        elif self.config.llm_provider == "anthropic":
            return await self._call_anthropic_simple(system_prompt, user_prompt)
        elif self.config.llm_provider == "google":
            return await self._call_google_simple(system_prompt, user_prompt)
        else:
            raise ValueError(f"Unknown LLM provider: {self.config.llm_provider}")

    # -------------------------------------------------------------------------
    # OpenAI
    # -------------------------------------------------------------------------

    async def _call_openai_simple(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.llm_api_key}",
                },
                json={
                    "model": self.config.llm_model,
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
                    return result["choices"][0]["message"].get("content", "No response")
            return f"OpenAI Error ({response.status_code}): {response.text[:200]}"

    async def _run_openai_loop(
        self,
        system_prompt: str,
        user_query: str,
        tools: list[ToolDefinition],
        conversation_history: list | None,
        max_iterations: int,
        tools_log: list[str] | None = None,
        tool_calls_sequence: list[dict] | None = None,
    ) -> str:
        openai_tools = mcp_to_openai(tools)
        messages = [{"role": "system", "content": system_prompt}]

        if conversation_history:
            for msg in conversation_history:
                msg_dict = msg.model_dump() if hasattr(msg, 'model_dump') else msg
                messages.append({"role": msg_dict["role"], "content": msg_dict["content"]})

        messages.append({"role": "user", "content": user_query})

        async with httpx.AsyncClient(timeout=120.0) as client:
            for iteration in range(max_iterations):
                logger.info(f"OpenAI agent loop iteration {iteration + 1}")
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.config.llm_api_key}",
                    },
                    json={
                        "model": self.config.llm_model,
                        "max_completion_tokens": 4096,
                        "messages": messages,
                        "tools": openai_tools,
                        "tool_choice": "auto",
                    },
                )

                if response.status_code != 200:
                    return f"OpenAI Error ({response.status_code}): {response.text[:500]}"

                result = response.json()
                choice = result.get("choices", [{}])[0]
                message = choice.get("message", {})
                finish_reason = choice.get("finish_reason")

                messages.append(message)

                if finish_reason == "stop" or not message.get("tool_calls"):
                    return message.get("content", "No response generated")

                for tool_call in message.get("tool_calls", []):
                    func = tool_call.get("function", {})
                    tool_name = func.get("name", "")
                    try:
                        arguments = json.loads(func.get("arguments", "{}"))
                    except json.JSONDecodeError:
                        arguments = {}

                    logger.info(f"OpenAI calling tool: {tool_name}")
                    tool_result = await execute_mcp_tool(self.mcp_client, tool_name, arguments, tools_log, tool_calls_sequence)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.get("id"),
                        "content": tool_result,
                    })

        return "Max iterations reached. Please try a more specific query."

    # -------------------------------------------------------------------------
    # Anthropic
    # -------------------------------------------------------------------------

    async def _call_anthropic_simple(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self.config.llm_api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": self.config.llm_model,
                    "max_tokens": 4096,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )

            if response.status_code == 200:
                result = response.json()
                if "content" in result and len(result["content"]) > 0:
                    return result["content"][0].get("text", "No response")
            return f"Anthropic Error ({response.status_code}): {response.text[:200]}"

    async def _run_anthropic_loop(
        self,
        system_prompt: str,
        user_query: str,
        tools: list[ToolDefinition],
        conversation_history: list | None,
        max_iterations: int,
        tools_log: list[str] | None = None,
        tool_calls_sequence: list[dict] | None = None,
    ) -> str:
        anthropic_tools = mcp_to_anthropic(tools)
        messages = []

        if conversation_history:
            for msg in conversation_history:
                msg_dict = msg.model_dump() if hasattr(msg, 'model_dump') else msg
                messages.append({"role": msg_dict["role"], "content": msg_dict["content"]})

        messages.append({"role": "user", "content": user_query})

        async with httpx.AsyncClient(timeout=120.0) as client:
            for iteration in range(max_iterations):
                logger.info(f"Anthropic agent loop iteration {iteration + 1}")
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": self.config.llm_api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": self.config.llm_model,
                        "max_tokens": 4096,
                        "system": system_prompt,
                        "messages": messages,
                        "tools": anthropic_tools,
                    },
                )

                if response.status_code != 200:
                    return f"Anthropic Error ({response.status_code}): {response.text[:500]}"

                result = response.json()
                content_blocks = result.get("content", [])
                stop_reason = result.get("stop_reason", "end_turn")

                # Add assistant response to messages
                messages.append({"role": "assistant", "content": content_blocks})

                # If no tool use, extract text and return
                if stop_reason != "tool_use":
                    text_parts = []
                    for block in content_blocks:
                        if block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                    return "\n".join(text_parts) or "No response generated"

                # Process tool calls
                tool_results = []
                for block in content_blocks:
                    if block.get("type") == "tool_use":
                        tool_name = block.get("name", "")
                        tool_input = block.get("input", {})
                        tool_use_id = block.get("id", "")

                        logger.info(f"Anthropic calling tool: {tool_name}")
                        tool_output = await execute_mcp_tool(
                            self.mcp_client, tool_name, tool_input, tools_log, tool_calls_sequence
                        )

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": tool_output,
                        })

                # Add tool results as user message
                messages.append({"role": "user", "content": tool_results})

        return "Max iterations reached. Please try a more specific query."

    # -------------------------------------------------------------------------
    # Google
    # -------------------------------------------------------------------------

    async def _call_google_simple(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.config.llm_model}:generateContent",
                headers={"Content-Type": "application/json"},
                params={"key": self.config.llm_api_key},
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
                        return parts[0].get("text", "No response")
            return f"Google Error ({response.status_code}): {response.text[:200]}"

    async def _run_google_loop(
        self,
        system_prompt: str,
        user_query: str,
        tools: list[ToolDefinition],
        conversation_history: list | None,
        max_iterations: int,
        tools_log: list[str] | None = None,
        tool_calls_sequence: list[dict] | None = None,
    ) -> str:
        google_tools = mcp_to_google(tools)
        contents = []

        if conversation_history:
            for msg in conversation_history:
                msg_dict = msg.model_dump() if hasattr(msg, 'model_dump') else msg
                role = "model" if msg_dict["role"] == "assistant" else "user"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg_dict["content"]}],
                })

        contents.append({"role": "user", "parts": [{"text": user_query}]})

        async with httpx.AsyncClient(timeout=120.0) as client:
            for iteration in range(max_iterations):
                logger.info(f"Google agent loop iteration {iteration + 1}")
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{self.config.llm_model}:generateContent",
                    headers={"Content-Type": "application/json"},
                    params={"key": self.config.llm_api_key},
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": contents,
                        "tools": [{"functionDeclarations": google_tools}],
                        "generationConfig": {"maxOutputTokens": 4096},
                    },
                )

                if response.status_code != 200:
                    return f"Google Error ({response.status_code}): {response.text[:500]}"

                result = response.json()
                candidates = result.get("candidates", [])
                if not candidates:
                    return "No response from Google AI"

                candidate_content = candidates[0].get("content", {})
                parts = candidate_content.get("parts", [])

                # Add model response to contents
                contents.append(candidate_content)

                # Check for function calls
                function_calls = [p for p in parts if "functionCall" in p]
                if not function_calls:
                    # Return text response
                    text_parts = [p.get("text", "") for p in parts if "text" in p]
                    return "\n".join(text_parts) or "No response generated"

                # Execute function calls and build responses
                function_responses = []
                for fc_part in function_calls:
                    call = fc_part["functionCall"]
                    tool_name = call.get("name", "")
                    tool_args = call.get("args", {})

                    logger.info(f"Google calling tool: {tool_name}")
                    tool_output = await execute_mcp_tool(
                        self.mcp_client, tool_name, tool_args, tools_log, tool_calls_sequence
                    )

                    function_responses.append({
                        "functionResponse": {
                            "name": tool_name,
                            "response": {"content": tool_output},
                        }
                    })

                # Add function responses
                contents.append({
                    "role": "user",
                    "parts": function_responses,
                })

        return "Max iterations reached. Please try a more specific query."
