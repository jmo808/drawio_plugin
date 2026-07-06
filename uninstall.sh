#!/bin/bash
set -euo pipefail

echo "=== Draw.io MCP Server & Agent Uninstaller ==="

HOME_DIR="$HOME"

# Pre-flight: Node.js needed for JSON cleanup
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required for JSON config cleanup but was not found."
  echo "Skipping MCP config cleanup. Manually remove 'drawio' from your MCP config files."
  echo "Continuing with file removal..."
else
  # 6. Remove 'drawio' key from MCP config files
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

  if (fs.existsSync(client.path)) {
    fs.copyFileSync(client.path, client.path + ".bak");
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
    const tmpPath = client.path + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, client.path);
    try { fs.chmodSync(client.path, 0o600); } catch(e) {}
    console.log(`- Removed drawio from ${client.name}: ${client.path}`);
  }
});
'
fi

# 1. Remove Kiro agent and skill files
KIRO_AGENTS_DIR="$HOME_DIR/.kiro/agents"
KIRO_SKILLS_DIR="$HOME_DIR/.kiro/skills/drawio"
if [ -f "$KIRO_AGENTS_DIR/drawio.json" ]; then
  rm "$KIRO_AGENTS_DIR/drawio.json"
  echo "- Removed Kiro agent config: $KIRO_AGENTS_DIR/drawio.json"
fi
if [ -d "$KIRO_SKILLS_DIR" ] && [ ! -L "$KIRO_SKILLS_DIR" ]; then
  rm -rf "$KIRO_SKILLS_DIR"
  echo "- Removed Kiro skill: $KIRO_SKILLS_DIR"
fi
# Remove legacy drawio.md from agents/ if present from older installs
if [ -f "$KIRO_AGENTS_DIR/drawio.md" ]; then
  rm "$KIRO_AGENTS_DIR/drawio.md"
  echo "- Removed legacy Kiro agent spec: $KIRO_AGENTS_DIR/drawio.md"
fi

# 2. Remove Antigravity plugin directory
GEMINI_PLUGIN_DIR="$HOME_DIR/.gemini/config/plugins/drawio"
if [ -d "$GEMINI_PLUGIN_DIR" ] && [ ! -L "$GEMINI_PLUGIN_DIR" ]; then
  rm -rf "$GEMINI_PLUGIN_DIR"
  echo "- Removed Antigravity plugin: $GEMINI_PLUGIN_DIR"
fi

# 3. Remove Claude Code Skill
CLAUDE_SKILLS_DIR="$HOME_DIR/.claude/skills/drawio"
if [ -d "$CLAUDE_SKILLS_DIR" ] && [ ! -L "$CLAUDE_SKILLS_DIR" ]; then
  rm -rf "$CLAUDE_SKILLS_DIR"
  echo "- Removed Claude Code skill: $CLAUDE_SKILLS_DIR"
fi

# 4. Remove Cursor Rule
CURSOR_RULE_FILE="$HOME_DIR/.cursor/rules/drawio.mdc"
if [ -f "$CURSOR_RULE_FILE" ]; then
  rm "$CURSOR_RULE_FILE"
  echo "- Removed Cursor rule: $CURSOR_RULE_FILE"
fi

# 5. Remove Copilot Skill
COPILOT_SKILLS_DIR="$HOME_DIR/.github/skills/drawio"
if [ -d "$COPILOT_SKILLS_DIR" ] && [ ! -L "$COPILOT_SKILLS_DIR" ]; then
  rm -rf "$COPILOT_SKILLS_DIR"
  echo "- Removed Copilot skill: $COPILOT_SKILLS_DIR"
fi
# Remove legacy .agent.md file if present from older installs
COPILOT_LEGACY="$HOME_DIR/.github/agents/drawio.agent.md"
if [ -f "$COPILOT_LEGACY" ]; then
  rm "$COPILOT_LEGACY"
  echo "- Removed legacy Copilot agent: $COPILOT_LEGACY"
fi

echo "Uninstallation complete! Please restart your client sessions."
