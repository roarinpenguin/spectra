# SPECTRA

**S**ecurity **P**osture **E**xploration & **C**orrelated **T**hreat **R**esponse **A**ssistant

![SPECTRA](https://img.shields.io/badge/SPECTRA-Security%20Assistant-8B5CF6?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

---

## Overview

SPECTRA is an AI-powered security investigation assistant that provides SOC analysts with a conversational interface to query, correlate, and analyze security data from SentinelOne. It leverages the power of Large Language Models (LLMs) combined with SentinelOne's Purple AI and the Model Context Protocol (MCP) to deliver intelligent, context-aware security insights.

### What Can SPECTRA Do?

- **Natural Language Threat Hunting**: Ask questions like *"Show me critical alerts from the last 24 hours"* or *"What vulnerabilities affect my production servers?"*
- **Cross-Domain Correlation**: Automatically correlate alerts, vulnerabilities, misconfigurations, and asset inventory to provide comprehensive security context
- **Agentic Investigation**: The AI autonomously decides which tools to call, chains multiple queries, and synthesizes findings into actionable SOC reports
- **Visual Data Representation**: Tables with numeric data automatically offer pie/bar chart visualizations; Mermaid diagrams from Purple AI render as interactive charts
- **Professional Reporting**: Export complete investigations as branded PDF reports with charts, tables, and full conversation history
- **Investigation Library**: Save, load, and continue investigations across sessions

---

## Features

| Feature | Description |
|---------|-------------|
| **Agentic AI** | LLM function calling enables autonomous tool selection and multi-step result chaining |
| **Conversation Context** | Full chat history maintained for contextual follow-up questions |
| **Data Correlation** | Correlates alerts, vulnerabilities, misconfigurations, and inventory |
| **Multi-Provider LLM** | Support for OpenAI, Anthropic Claude, and Google Gemini |
| **PDF Export** | Export investigations as branded PDF reports with charts and tables |
| **Chart Visualizations** | Automatic pie/bar charts for tabular data and Mermaid diagram rendering |
| **Investigation Library** | Save, load, rename, and continue investigations |
| **Multi-Destination** | Configure multiple SentinelOne console connections |
| **Persistent Config** | Settings survive container restarts via Docker volumes |
| **Modern UI** | Purple-themed glass morphism design with responsive layout |

---

## Prerequisites

> **⚠️ IMPORTANT: Purple-MCP Dependency**
>
> SPECTRA requires a running instance of **[Purple-MCP](https://github.com/sentinelone/purple-mcp)** to function. Purple-MCP is the Model Context Protocol server that provides the tools for querying SentinelOne data.
>
> **You must have Purple-MCP running before starting SPECTRA.**

### Required Components

1. **Purple-MCP Server** - Running and accessible (default: `http://localhost:8000`)
2. **LLM API Key** - From OpenAI, Anthropic, or Google
3. **Docker & Docker Compose** - For running SPECTRA
4. **SentinelOne Console Access** - API token with appropriate permissions

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    SPECTRA Stack                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
    │   Browser     │         │   SPECTRA     │         │   SPECTRA     │
    │               │  HTTP   │   Frontend    │  HTTP   │   Backend     │
    │  User @ :3000 │◀───────▶│   (React)     │◀───────▶│   (FastAPI)   │
    │               │         │   Port 3000   │         │   Port 8080   │
    └───────────────┘         └───────────────┘         └───────┬───────┘
                                                                │
                              ┌─────────────────────────────────┼─────────────────────┐
                              │                                 │                     │
                              │                                 ▼                     │
                              │                         ┌───────────────┐             │
                              │          SSE/HTTP       │  Purple-MCP   │             │
                              │         ◀──────────────▶│   Server      │             │
                              │                         │   Port 8000   │             │
                              │                         └───────┬───────┘             │
                              │                                 │                     │
                              │     EXTERNAL DEPENDENCY         │                     │
                              │     (Must be running)           │                     │
                              └─────────────────────────────────┼─────────────────────┘
                                                                │
                    ┌───────────────────────────────────────────┴───────────────────┐
                    │                                                               │
                    ▼                                                               ▼
            ┌───────────────┐                                               ┌───────────────┐
            │  SentinelOne  │                                               │  LLM Provider │
            │  Console API  │                                               │  (OpenAI /    │
            │  + Purple AI  │                                               │  Claude /     │
            │               │                                               │  Gemini)      │
            └───────────────┘                                               └───────────────┘
```

### Data Flow

1. **User submits query** → Frontend sends to Backend
2. **Backend invokes LLM** with conversation history + available MCP tools
3. **LLM decides tool calls** → Backend executes via Purple-MCP (SSE)
4. **Purple-MCP queries** SentinelOne APIs and Purple AI
5. **Results returned to LLM** → LLM synthesizes response
6. **Final response** displayed in Frontend with charts/tables

---

## Quick Start

### 1. Start Purple-MCP First

```bash
# In the purple-mcp directory
cd purple-mcp
python -m purple_mcp.server
# Server will start on http://localhost:8000
```

### 2. Build and Run SPECTRA

#### Option A: Run with Console Output (Development/Debugging)

```bash
cd spectra
docker compose up --build
```

This keeps the terminal attached so you can see real-time logs from both frontend and backend containers. Press `Ctrl+C` to stop.

#### Option B: Run as Daemon (Production)

```bash
cd spectra
docker compose up --build -d
```

The `-d` flag runs containers in detached mode (background). 

**View logs when running as daemon:**
```bash
# All containers
docker compose logs -f

# Backend only
docker compose logs -f backend

# Frontend only
docker compose logs -f frontend
```

**Stop the daemon:**
```bash
docker compose down
```

### 3. Access SPECTRA

Open your browser to **http://localhost:3000**

### 4. Configure Settings

1. Click the **⚙️ Settings** gear icon in the header
2. Configure your **LLM Provider** and **API Key**
3. Set the **MCP Server URL** (default: `http://host.docker.internal:8000`)
4. Add your **S1 Destinations** in the second tab

---

## Environment Variables (Optional)

You can pre-configure SPECTRA using environment variables before running Docker:

```bash
export MCP_SERVER_URL=http://host.docker.internal:8000
export OPENAI_API_KEY=sk-...
export LLM_PROVIDER=openai
export LLM_MODEL=gpt-4o

docker compose up --build -d
```

Or configure everything via the Settings UI after startup.

## Settings Reference

Access settings via the **⚙️ gear icon** in the header. Settings are persisted in a Docker volume.

### General Tab

| Setting | Description | Default |
|---------|-------------|---------|
| **MCP Server URL** | URL where Purple-MCP is running | `http://host.docker.internal:8000` |
| **LLM Provider** | AI model provider (OpenAI, Anthropic, Google) | OpenAI |
| **API Key** | Your LLM provider's API key | — |
| **Model** | Specific model to use (dropdown + custom input) | `gpt-4o` |

**Supported Models:**
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o1-mini`, `o3-mini`
- **Anthropic**: `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`
- **Google**: `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`

---

## Available MCP Tools

The LLM can autonomously invoke these tools based on your queries:

| Tool | Description |
|------|-------------|
| `list_alerts` | Get security alerts with severity, status, endpoints |
| `get_alert` | Get detailed info for a specific alert |
| `list_vulnerabilities` | Get CVEs and vulnerability findings |
| `list_misconfigurations` | Get cloud/K8s security misconfigurations |
| `list_inventory_items` | Get asset inventory (endpoints, apps, users) |
| `purple_ai` | Natural language threat hunting queries via Purple AI |
| `powerquery` | Execute PowerQuery for behavioral/telemetry analysis |

---

## Investigation Library

Save and manage your investigations for later review or continuation:

- **Save Investigation**: Click the 💾 icon → Enter a name → Investigation saved
- **Load Investigation**: Click the 📚 Library icon → Select an investigation → Conversation restored
- **Rename**: Click the ✏️ pencil icon next to any saved investigation
- **Delete**: Click the 🗑️ trash icon to remove an investigation
- **Continue**: Load a saved investigation and continue asking questions

Investigations are stored server-side and persist across browser sessions.

---

## PDF Export

Click the **📥 Download** button to export the current investigation as a branded PDF report:

| Feature | Description |
|---------|-------------|
| **SPECTRA Branding** | Custom logo and purple-themed header on every page |
| **Full Conversation** | Complete Q&A history with timestamps |
| **Tables** | Properly formatted markdown tables with borders |
| **Charts** | Pie charts captured as high-quality images |
| **Page Numbers** | Footer with page numbers and "Powered by" attribution |

---

## Troubleshooting

### Viewing Logs

SPECTRA includes a built-in log viewer. Click the **⚙️ Settings** gear icon and scroll down to the **Logs** section to view recent backend activity and diagnose issues.

### Resetting Configuration

To clear all settings and start fresh:

```bash
docker compose down -v   # -v removes volumes
docker compose up --build
```

---

## Development

### Run Frontend Locally

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

### Run Backend Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Docker Volumes

Configuration is persisted in the `spectra-config` volume:
- MCP Server URL
- LLM Provider and API Key  
- LLM Model selection
- S1 Destinations (names, URLs, tokens)
- Saved investigations

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/query` | POST | Execute natural language query |
| `/api/settings` | GET/POST | Get/update configuration |
| `/api/settings/models` | GET | Get available models for current provider |
| `/api/destinations` | GET/POST | List/add S1 destinations |
| `/api/destinations/{id}` | PUT/DELETE | Update/delete destination |
| `/api/investigations` | GET/POST | List/save investigations |
| `/api/investigations/{id}` | GET/PUT/DELETE | Get/rename/delete investigation |
| `/api/mcp-health` | GET | Check MCP server connectivity |
| `/api/logs` | GET | Retrieve recent backend logs |

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

<p align="center">
  Crafted with 💜 by <a href="https://github.com/roarinpenguin-s1">Roarinpenguin</a>
</p>
