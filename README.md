# Draw.io MCP Plugin & Custom Agent

This plugin enables Draw.io diagramming capabilities across multiple coding assistants, including codebase-to-diagram generation, round-trip editing workflows, and rich reference examples.

## Features
- **Multi-client support:** Works with Kiro CLI, Claude Desktop/Code, Cursor, Copilot CLI, and Antigravity.
- **Native XML diagrams:** Generates fully editable draw.io diagrams using native shapes (not Mermaid imports).
- **Codebase-to-diagram:** Generate architecture diagrams directly from your project structure.
- **Round-trip workflow:** Edit diagrams in Draw.io and sync changes back through the MCP server.
- **References & examples:** Bundled reference documentation and example diagrams for Antigravity skill usage.

## Supported Clients
- **Kiro CLI:** Registers the custom `@drawio` steering agent and MCP server.
- **Claude Desktop:** Registers the `@drawio/mcp` server.
- **Claude Code:** Registers the `@drawio/mcp` server.
- **Cursor:** Registers the `@drawio/mcp` server.
- **Copilot CLI:** Registers the `@drawio/mcp` server.
- **Antigravity:** Registers the native `drawio` skill plugin (with references and examples) and MCP server.

## Prerequisites
This plugin requires **Node.js** and **NPM** to be installed on your machine.

## Installation

### macOS / Linux
```bash
chmod +x install.sh
./install.sh
```

### Windows
Open PowerShell and run:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer automatically detects which clients are present and configures them. After installation, a verification step confirms the `@drawio/mcp` package is accessible.

**What gets installed:**
- **Kiro:** `~/.kiro/agents/drawio.json` and `~/.kiro/agents/drawio.md`
- **Antigravity:** `~/.gemini/config/plugins/drawio/` (plugin.json, SKILL.md, references/, examples/)
- **MCP configs:** The `drawio` server entry is added to each detected client's MCP config file

> **Note:** The installer creates `.bak` backups of all MCP config files before modifying them.

## Uninstallation

### macOS / Linux
```bash
chmod +x uninstall.sh
./uninstall.sh
```

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

The uninstaller removes Kiro agent files, the Antigravity plugin directory, and the `drawio` entry from all MCP configuration files. Clients that aren't installed are skipped automatically.

## Usage (Kiro CLI)
After running the installer, restart your Kiro CLI session and switch to the drawio agent:
```bash
kiro-cli --v3
# In Kiro chat:
/agent drawio
```

## Usage (Antigravity)
Start a session and invoke the drawio skill:
```text
using drawio to generate an architecture diagram
```

## Security
- The `@drawio/mcp` npm package is pinned to a specific version to prevent supply chain attacks.
- Config file modifications use atomic writes (temp file + rename) to prevent corruption.
- All MCP config files are backed up (`.bak`) before modification.
- The Kiro agent uses least-privilege tool access (no shell access).
