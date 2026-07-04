#!/bin/bash
set -euo pipefail

echo "=== Draw.io MCP Server & Agent Installer ==="

# Pre-flight check: Verify Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but was not found in your PATH."
  echo "Please install Node.js and try again."
  exit 1
fi

# Resolve script directory so it can be run from anywhere
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"

# 1. Setup Kiro CLI Agents
KIRO_DIR="$HOME/.kiro"
KIRO_AGENTS_DIR="$KIRO_DIR/agents"
if [ -d "$KIRO_DIR" ]; then
  echo "Installing Kiro agent files..."
  mkdir -p "$KIRO_AGENTS_DIR"
  
  # Dynamically replace {{HOME}} placeholder in drawio.json
  node -e '
  const fs = require("fs");
  const template = fs.readFileSync(process.argv[1], "utf8");
  const resolved = template.replace(/\{\{HOME\}\}/g, process.argv[2]);
  fs.writeFileSync(process.argv[3], resolved, "utf8");
  ' "$SCRIPT_DIR/drawio.json" "$HOME_DIR" "$KIRO_AGENTS_DIR/drawio.json"

  cp "$SCRIPT_DIR/drawio.md" "$KIRO_AGENTS_DIR/"
fi

# 2. Setup Antigravity Agent Plugins
GEMINI_DIR="$HOME/.gemini"
GEMINI_PLUGINS_DIR="$GEMINI_DIR/config/plugins"
if [ -d "$GEMINI_PLUGINS_DIR" ]; then
  echo "Installing Antigravity plugin files..."
  mkdir -p "$GEMINI_PLUGINS_DIR/drawio/skills/drawio"
  cp "$SCRIPT_DIR/plugin.json" "$GEMINI_PLUGINS_DIR/drawio/"
  cp "$SCRIPT_DIR/drawio.md" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/SKILL.md"

  if [ -d "$SCRIPT_DIR/references" ] && [ ! -L "$SCRIPT_DIR/references" ]; then
    rm -rf "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/references"
    cp -r "$SCRIPT_DIR/references" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/references"
  fi
  if [ -d "$SCRIPT_DIR/examples" ] && [ ! -L "$SCRIPT_DIR/examples" ]; then
    rm -rf "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/examples"
    cp -r "$SCRIPT_DIR/examples" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/examples"
  fi
fi

# 3. Configure MCP Servers across clients using Node.js
echo "Updating MCP configurations..."
node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");

const home = os.homedir();

const paths = [
  { name: "Kiro CLI", path: path.join(home, ".kiro/settings/mcp.json") },
  { name: "Claude Desktop", path: path.join(home, "Library/Application Support/Claude/claude_desktop_config.json") },
  { name: "Claude Code", path: path.join(home, ".claude.json") },
  { name: "Claude Code (Settings)", path: path.join(home, ".claude/settings.json") },
  { name: "Cursor", path: path.join(home, ".cursor/mcp.json") },
  { name: "Copilot CLI", path: path.join(home, ".copilot/mcp-config.json") },
  { name: "Antigravity", path: path.join(home, ".gemini/config/mcp_config.json") }
];

paths.forEach(client => {
  const parentDir = path.dirname(client.path);
  if (!fs.existsSync(parentDir)) {
    return;
  }

  if (fs.existsSync(client.path)) {
    fs.copyFileSync(client.path, client.path + ".bak");
  }

  let data = { mcpServers: {} };
  if (fs.existsSync(client.path)) {
    try {
      data = JSON.parse(fs.readFileSync(client.path, "utf8"));
    } catch (e) {
      console.warn(`[WARNING] Skip: Could not parse JSON at ${client.path}. Skipping this client: ${e.message}`);
      return;
    }
  }

  if (!data.mcpServers) {
    data.mcpServers = {};
  }

  data.mcpServers.drawio = {
    command: "npx",
    args: ["-y", "@drawio/mcp@1.3.4"]
  };

  const tmpPath = client.path + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, client.path);
  try { fs.chmodSync(client.path, 0o600); } catch(e) {}
  console.log(`- Configured ${client.name} at: ${client.path}`);
});
'

echo "Verifying @drawio/mcp package..."
if npx -y @drawio/mcp@1.3.4 --help >/dev/null 2>&1; then
  echo "✓ @drawio/mcp package verified successfully"
else
  echo "⚠ WARNING: @drawio/mcp package could not be verified. The MCP server may not work until the package is available."
fi

echo "Installation complete! Please restart your client sessions to load the drawio tools."
