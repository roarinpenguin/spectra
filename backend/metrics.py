"""SPECTRA observability metrics for agents and tools."""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("spectra")


class MetricsCollector:
    """Collects and reports metrics for agents, tools, and the orchestrator."""

    def __init__(self):
        self._agent_metrics: dict[str, AgentMetrics] = {}
        self._tool_metrics: dict[str, ToolMetrics] = {}
        self._orchestrator_metrics = OrchestratorMetrics()

    def record_agent_call(self, agent_name: str, latency_ms: float, error: bool = False):
        """Record an agent execution."""
        if agent_name not in self._agent_metrics:
            self._agent_metrics[agent_name] = AgentMetrics(agent_name)
        m = self._agent_metrics[agent_name]
        m.call_count += 1
        m.total_latency_ms += latency_ms
        if error:
            m.error_count += 1

    def record_tool_call(self, tool_name: str, latency_ms: float, error: bool = False):
        """Record a tool execution."""
        if tool_name not in self._tool_metrics:
            self._tool_metrics[tool_name] = ToolMetrics(tool_name)
        m = self._tool_metrics[tool_name]
        m.call_count += 1
        m.total_latency_ms += latency_ms
        if error:
            m.error_count += 1

    def record_routing(self, agent_name: str, is_multi_agent: bool = False):
        """Record an orchestrator routing decision."""
        self._orchestrator_metrics.total_queries += 1
        if is_multi_agent:
            self._orchestrator_metrics.multi_agent_queries += 1

        if agent_name not in self._orchestrator_metrics.routing_counts:
            self._orchestrator_metrics.routing_counts[agent_name] = 0
        self._orchestrator_metrics.routing_counts[agent_name] += 1

    def get_metrics(self) -> dict[str, Any]:
        """Return all metrics as a dictionary."""
        return {
            "agents": {
                name: m.to_dict() for name, m in self._agent_metrics.items()
            },
            "tools": {
                name: m.to_dict() for name, m in self._tool_metrics.items()
            },
            "orchestrator": self._orchestrator_metrics.to_dict(),
        }

    def reset(self):
        """Reset all metrics."""
        self._agent_metrics.clear()
        self._tool_metrics.clear()
        self._orchestrator_metrics = OrchestratorMetrics()


class AgentMetrics:
    """Metrics for a single agent."""

    def __init__(self, name: str):
        self.name = name
        self.call_count: int = 0
        self.error_count: int = 0
        self.total_latency_ms: float = 0

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.call_count if self.call_count > 0 else 0

    @property
    def error_rate(self) -> float:
        return self.error_count / self.call_count if self.call_count > 0 else 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "call_count": self.call_count,
            "error_count": self.error_count,
            "error_rate": round(self.error_rate, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 1),
            "total_latency_ms": round(self.total_latency_ms, 1),
        }


class ToolMetrics:
    """Metrics for a single MCP tool."""

    def __init__(self, name: str):
        self.name = name
        self.call_count: int = 0
        self.error_count: int = 0
        self.total_latency_ms: float = 0

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.call_count if self.call_count > 0 else 0

    @property
    def error_rate(self) -> float:
        return self.error_count / self.call_count if self.call_count > 0 else 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "call_count": self.call_count,
            "error_count": self.error_count,
            "error_rate": round(self.error_rate, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 1),
            "total_latency_ms": round(self.total_latency_ms, 1),
        }


class OrchestratorMetrics:
    """Metrics for the orchestrator."""

    def __init__(self):
        self.total_queries: int = 0
        self.multi_agent_queries: int = 0
        self.routing_counts: dict[str, int] = {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_queries": self.total_queries,
            "multi_agent_queries": self.multi_agent_queries,
            "multi_agent_rate": round(
                self.multi_agent_queries / self.total_queries
                if self.total_queries > 0 else 0, 4
            ),
            "routing_distribution": self.routing_counts,
        }


# Global metrics collector instance
metrics = MetricsCollector()


class Timer:
    """Context manager for timing operations."""

    def __init__(self):
        self.start_time: float = 0
        self.elapsed_ms: float = 0

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, *args):
        self.elapsed_ms = (time.time() - self.start_time) * 1000
