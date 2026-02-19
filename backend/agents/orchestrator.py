"""SPECTRA Orchestrator - routes queries to specialist agents."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from agents.alert_triage import AlertTriageAgent
from agents.asset_intel import AssetIntelAgent
from agents.base import BaseAgent
from agents.correlation import CorrelationAgent
from agents.posture import PostureAgent
from agents.threat_hunt import ThreatHuntAgent
from agents.vulnerability import VulnerabilityAgent
from config import AppConfig
from llm_providers import LLMProvider
from mcp_client import MCPClient
from models import AgentResponse, ToolDefinition

logger = logging.getLogger("spectra")

GENERAL_SYSTEM_PROMPT = """You are a SOC (Security Operations Center) analyst assistant powered by SentinelOne. You help security analysts investigate threats, triage alerts, and understand their security posture.

You have access to tools that query real SentinelOne data via MCP (Model Context Protocol). Use them autonomously to answer questions.

DATA SOURCE ATTRIBUTION:
When presenting findings, naturally reference which SentinelOne MCP tools and data sources you used.
For example: "I queried `list_alerts` and found 12 active alerts, then used `purple_ai` to investigate the most critical one..."

OUTPUT FORMAT:
Use proper markdown with ## headers, tables, and bullet lists. Be concise and scannable.
IMPORTANT: Use single backticks for inline tool/field names (e.g. `list_alerts`), NEVER triple-backtick code blocks for tool names.

SENTINELONE RECOMMENDATIONS:
When providing remediation or next steps, ONLY recommend SentinelOne platform capabilities. NEVER recommend competitor security products.
Key capabilities: STAR (custom detection/response rules), Network Quarantine, Remote Shell, Storyline (attack chain visualization), Singularity Identity (ITDR), Singularity Ranger (attack surface), Singularity Cloud Security (CNAPP), Vigilance MDR, Singularity Marketplace (integrations), Device Control, Firewall Control, Application Control.
Map findings to MITRE ATT&CK techniques and suggest specific STAR rules where applicable.

BEHAVIOR RULES:
1. NEVER ask the user to choose options - ACT AUTONOMOUSLY
2. NEVER tell the user to run queries manually - YOU execute them
3. ALWAYS present results as formatted tables when you have structured data
4. Be concise but thorough. Execute queries and present results.
5. NEVER recommend competitor security products — only SentinelOne capabilities."""

SYNTHESIS_PROMPT = """You are a SOC analyst synthesizing results from multiple specialist agents.

Given the original user query and findings from multiple agents, create a single coherent response that:
1. Integrates all findings into a unified narrative
2. Highlights correlations between different data domains
3. Provides a prioritized summary of critical findings
4. Includes actionable recommendations using SentinelOne capabilities

Use proper markdown with ## headers, tables, and bullet lists. Use single backticks for tool/field names.
Do NOT repeat raw data - synthesize and analyze it.
NEVER recommend competitor security products. Only recommend SentinelOne platform capabilities (STAR rules, Network Quarantine, Remote Shell, Singularity Identity, Ranger, Cloud Security, Vigilance MDR, etc.).
Map findings to MITRE ATT&CK techniques and suggest specific STAR rules where applicable."""


class Orchestrator:
    """Routes incoming queries to the appropriate specialist agent(s).

    The orchestrator:
    1. Classifies the incoming query into one or more domains
    2. Routes to single or multiple specialist agents
    3. For multi-agent queries, runs agents in parallel and synthesizes results
    4. Falls back to a general agent with all tools if no specialist matches
    """

    def __init__(self):
        self.agents: dict[str, BaseAgent] = {}
        self._register_default_agents()

    def _register_default_agents(self):
        """Register the default set of specialist agents."""
        for agent_cls in [
            AlertTriageAgent,
            ThreatHuntAgent,
            VulnerabilityAgent,
            AssetIntelAgent,
            PostureAgent,
            CorrelationAgent,
        ]:
            agent = agent_cls()
            self.agents[agent.name] = agent

    def register_agent(self, agent: BaseAgent):
        """Register an additional specialist agent."""
        self.agents[agent.name] = agent
        logger.info(f"Registered agent: {agent.name}")

    def get_agent_descriptions(self) -> list[dict[str, Any]]:
        """Return descriptions of all registered agents."""
        return [
            {
                "name": agent.name,
                "description": agent.description,
                "tools": agent.tool_names,
            }
            for agent in self.agents.values()
        ]

    async def classify(
        self, query: str, config: AppConfig, mcp_client: MCPClient
    ) -> list[str]:
        """Classify a query and return the best agent name(s).

        Returns a list of agent names. Multiple agents indicate a multi-domain
        query that needs parallel execution and synthesis.
        """
        agent_list = "\n".join(
            f"- {a.name}: {a.description}" for a in self.agents.values()
        )

        classification_prompt = f"""You are a query router. Given the user's security question, determine which specialist agent(s) should handle it.

Available agents:
{agent_list}
- general: Handles queries that don't clearly match any specialist.

ROUTING RULES:
- For simple single-domain questions, return ONE agent name.
- For cross-domain correlation queries (e.g., "risk posture of endpoint X", "correlate alerts with vulnerabilities"), return "correlation".
- For multi-domain questions that need separate answers (e.g., "show alerts and list assets"), return multiple agent names separated by commas.
- When unsure, prefer "correlation" for complex multi-domain queries.

Respond with ONLY the agent name(s), comma-separated if multiple. Examples:
- "alert_triage"
- "threat_hunt"
- "correlation"
- "alert_triage,vulnerability"
- "general"

Nothing else."""

        try:
            provider = LLMProvider(config, mcp_client)
            result = await provider.simple_call(classification_prompt, f"User query: {query}")
            result = result.strip().lower().strip('"').strip("'")

            # Parse comma-separated agent names
            agent_names = [n.strip() for n in result.split(",") if n.strip()]

            # Validate all names
            valid_names = []
            for name in agent_names:
                if name in self.agents:
                    valid_names.append(name)
                elif name == "general":
                    valid_names.append("general")
                else:
                    # Try to extract known agent name from the response
                    for agent_name in self.agents:
                        if agent_name in name:
                            valid_names.append(agent_name)
                            break

            if valid_names:
                logger.info(f"LLM classified query as: {valid_names}")
                return valid_names

        except Exception as e:
            logger.warning(f"LLM classification failed: {e}, falling back to keyword matching")

        # Keyword-based fallback
        return [self._keyword_classify(query)]

    def _keyword_classify(self, query: str) -> str:
        """Fallback keyword-based classification."""
        query_lower = query.lower()

        alert_keywords = ["alert", "alerts", "incident", "incidents", "detection", "detections", "threat", "threats"]
        vuln_keywords = ["vulnerability", "vulnerabilities", "cve", "cves", "patch", "exploit", "cvss"]
        hunt_keywords = [
            "hunt", "hunting", "process", "network connection", "lateral movement",
            "persistence", "powerquery", "telemetry", "deep visibility", "purple ai",
            "endpoint activity", "file operation", "dns", "registry",
        ]
        asset_keywords = ["inventory", "asset", "assets", "endpoint", "endpoints", "server", "servers", "device", "devices"]
        posture_keywords = ["misconfiguration", "misconfig", "compliance", "posture", "cloud security", "iam", "benchmark"]
        correlation_keywords = ["risk posture", "correlate", "correlation", "security overview", "comprehensive", "investigate"]

        # Check correlation first (multi-domain indicators)
        if any(w in query_lower for w in correlation_keywords):
            return "correlation"
        if any(w in query_lower for w in hunt_keywords):
            return "threat_hunt"
        if any(w in query_lower for w in alert_keywords):
            return "alert_triage"
        if any(w in query_lower for w in vuln_keywords):
            return "vulnerability"
        if any(w in query_lower for w in posture_keywords):
            return "posture"
        if any(w in query_lower for w in asset_keywords):
            return "asset_intel"

        return "general"

    async def process(
        self,
        query: str,
        conversation_history: list | None,
        config: AppConfig,
        mcp_client: MCPClient,
    ) -> dict[str, Any]:
        """Process a query through the orchestrator.

        1. Discover available tools
        2. Classify the query
        3. Route to single or multiple agents
        4. Synthesize multi-agent results if needed

        Returns:
            Dict with 'result' (str), 'agent' (str), 'tools_used' (list[str]).
        """
        all_tools = await mcp_client.discover_tools()
        logger.info(f"Orchestrator processing query with {len(all_tools)} tools available")

        agent_names = await self.classify(query, config, mcp_client)

        # Filter out "general" from the list
        specialist_names = [n for n in agent_names if n != "general" and n in self.agents]

        if not specialist_names:
            # No specialist matched — use general with all tools
            result = await self._run_general(
                query, conversation_history, config, mcp_client, all_tools
            )
            result["thought_process"] = {
                "classification": "general",
                "reason": "No specialist agent matched",
                "tool_calls": result.get("tool_calls_sequence", []),
            }
            result.pop("tool_calls_sequence", None)
            return result

        if len(specialist_names) == 1:
            # Single agent routing
            agent = self.agents[specialist_names[0]]
            logger.info(f"Routing to specialist agent: {agent.name}")
            response = await agent.execute(
                query=query,
                conversation_history=conversation_history,
                mcp_client=mcp_client,
                config=config,
                all_tools=all_tools,
            )

            if response.is_error:
                logger.warning(f"Agent {agent.name} returned error, falling back to general")
                result = await self._run_general(
                    query, conversation_history, config, mcp_client, all_tools
                )
                result["thought_process"] = {
                    "classification": f"{agent.name} (fallback to general)",
                    "reason": f"{agent.name} agent returned an error",
                    "tool_calls": result.get("tool_calls_sequence", []),
                }
                result.pop("tool_calls_sequence", None)
                return result

            return {
                "result": response.content,
                "agent": response.agent_name,
                "tools_used": response.tools_called,
                "thought_process": {
                    "classification": response.agent_name,
                    "reason": f"Routed to {response.agent_name} specialist",
                    "tool_calls": response.tool_calls_sequence,
                },
            }

        # Multi-agent routing — run agents in parallel
        logger.info(f"Multi-agent routing to: {specialist_names}")
        agents_to_run = [self.agents[n] for n in specialist_names]

        responses = await asyncio.gather(
            *[
                agent.execute(
                    query=query,
                    conversation_history=conversation_history,
                    mcp_client=mcp_client,
                    config=config,
                    all_tools=all_tools,
                )
                for agent in agents_to_run
            ],
            return_exceptions=True,
        )

        # Collect successful results
        agent_results = []
        all_tools_used: list[str] = []
        all_tool_calls: list[dict] = []
        agent_labels: list[str] = []
        for i, resp in enumerate(responses):
            if isinstance(resp, Exception):
                logger.error(f"Agent {agents_to_run[i].name} raised exception: {resp}")
            elif isinstance(resp, AgentResponse) and not resp.is_error:
                agent_results.append(resp)
                agent_labels.append(resp.agent_name)
                for t in resp.tools_called:
                    if t not in all_tools_used:
                        all_tools_used.append(t)
                all_tool_calls.extend(resp.tool_calls_sequence)
            else:
                logger.warning(f"Agent {agents_to_run[i].name} returned error")

        if not agent_results:
            result = await self._run_general(
                query, conversation_history, config, mcp_client, all_tools
            )
            result["thought_process"] = {
                "classification": f"{', '.join(specialist_names)} (all failed, fallback to general)",
                "reason": "All specialist agents failed",
                "tool_calls": result.get("tool_calls_sequence", []),
            }
            result.pop("tool_calls_sequence", None)
            return result

        if len(agent_results) == 1:
            return {
                "result": agent_results[0].content,
                "agent": agent_results[0].agent_name,
                "tools_used": agent_results[0].tools_called,
                "thought_process": {
                    "classification": agent_results[0].agent_name,
                    "reason": f"Multi-agent routing ({', '.join(specialist_names)}), one succeeded",
                    "tool_calls": agent_results[0].tool_calls_sequence,
                },
            }

        # Synthesize multiple agent results
        synthesized = await self._synthesize(query, agent_results, config, mcp_client)
        return {
            "result": synthesized,
            "agent": " + ".join(agent_labels),
            "tools_used": all_tools_used,
            "thought_process": {
                "classification": " + ".join(agent_labels),
                "reason": f"Parallel execution of {len(agent_labels)} agents, then synthesis",
                "tool_calls": all_tool_calls,
            },
        }

    async def _synthesize(
        self,
        query: str,
        responses: list[AgentResponse],
        config: AppConfig,
        mcp_client: MCPClient,
    ) -> str:
        """Synthesize results from multiple specialist agents into a single response."""
        combined = "\n\n".join(
            f"=== {r.agent_name.upper()} AGENT FINDINGS ===\n{r.content}"
            for r in responses
        )

        # Truncate if too long
        if len(combined) > 60000:
            combined = combined[:60000] + "\n\n... [truncated]"

        user_prompt = f"""User Query: {query}

Agent Findings:
{combined}

Synthesize these findings into a single comprehensive response."""

        try:
            provider = LLMProvider(config, mcp_client)
            return await provider.simple_call(SYNTHESIS_PROMPT, user_prompt)
        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            # Fallback: concatenate results
            return "\n\n---\n\n".join(r.content for r in responses)

    async def _run_general(
        self,
        query: str,
        conversation_history: list | None,
        config: AppConfig,
        mcp_client: MCPClient,
        all_tools: list[ToolDefinition],
    ) -> dict[str, Any]:
        """Run a general query with all available tools."""
        logger.info("Running general agent with all tools")
        provider = LLMProvider(config, mcp_client)
        result, tools_used, calls_sequence = await provider.run_agent_loop(
            system_prompt=GENERAL_SYSTEM_PROMPT,
            user_query=query,
            tools=all_tools,
            conversation_history=conversation_history,
        )
        return {
            "result": result,
            "agent": "general",
            "tools_used": tools_used,
            "tool_calls_sequence": calls_sequence,
        }
