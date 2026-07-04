#!/bin/bash
set -e

echo "=== Draw.io MCP Server & Agent Uninstaller ==="

HOME_DIR="$HOME"

# 1. Remove Kiro agent files
KIRO_AGENTS_DIR="$HOME_DIR/.kiro/agents"
if [ -f "$KIRO_AGENTS_DIR/drawio.json" ]; then
  rm "$KIRO_AGENTS_DIR/drawio.json"
  echo "- Removed Kiro agent config: $KIRO_AGENTS_DIR/drawio.json"
fi
if [ -f "$KIRO_AGENTS_DIR/drawio.md" ]; then
  rm "$KIRO_AGENTS_DIR/drawio.md"
  echo "- Removed Kiro agent spec: $KIRO_AGENTS_DIR/drawio.md"
fi

# 2. Remove Antigravity plugin directory
GEMINI_PLUGIN_DIR="$HOME_DIR/.gemini/config/plugins/drawio"
if [ -d "$GEMINI_PLUGIN_DIR" ]; then
  rm -rf "$GEMINI_PLUGIN_DIR"
  echo "- Removed Antigravity plugin: $GEMINI_PLUGIN_DIR"
fi

# 3. Remove 'drawio' key from MCP config files
echo "Cleaning MCP configurations..."
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
  if (!fs.existsSync(client.path)) {
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(client.path, "utf8"));
  } catch (e) {
    console.warn(`[WARNING] Could not parse ${client.path}: ${e.message}. Skipping.`);
    return;
  }

  if (data.mcpServers && data.mcpServers.drawio) {
    delete data.mcpServers.drawio;
    fs.writeFileSync(client.path, JSON.stringify(data, null, 2), "utf8");
    console.log(`- Removed drawio from ${client.name}: ${client.path}`);
  }
});
'

echo "Uninstallation complete! Please restart your client sessions."
