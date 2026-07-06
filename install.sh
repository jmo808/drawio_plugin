#!/bin/bash
set -euo pipefail

echo "=== Draw.io MCP Server & Agent Installer ==="

# Pre-flight check: Verify Node.js is installed and is version 24+
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but was not found in your PATH."
  echo "Please install Node.js 24+ and try again."
  exit 1
fi

if ! node -e 'process.exit(parseInt(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' >/dev/null 2>&1; then
  echo "Error: Node.js version 24 or higher is required. You have version $(node -v)."
  exit 1
fi

# Resolve script directory so it can be run from anywhere
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"

echo "Installing local dependencies..."
cd "$SCRIPT_DIR"
npm install --silent

# 1. Setup Kiro CLI/IDE
KIRO_DIR="$HOME/.kiro"
KIRO_AGENTS_DIR="$KIRO_DIR/agents"
KIRO_SKILLS_DIR="$KIRO_DIR/skills/drawio"
if [ -d "$KIRO_DIR" ]; then
  echo "Installing Kiro agent and skill files..."
  mkdir -p "$KIRO_AGENTS_DIR"
  mkdir -p "$KIRO_SKILLS_DIR"

  # Install agent config with prompt pointing to skill location
  node -e '
  const fs = require("fs");
  const template = fs.readFileSync(process.argv[1], "utf8");
  const resolved = template.replace(/\{\{HOME\}\}/g, process.argv[2]);
  fs.writeFileSync(process.argv[3], resolved, "utf8");
  ' "$SCRIPT_DIR/drawio.json" "$HOME_DIR" "$KIRO_AGENTS_DIR/drawio.json"

  # Install skill with full directory structure
  cp "$SCRIPT_DIR/skills/drawio/SKILL.md" "$KIRO_SKILLS_DIR/SKILL.md"

  # Copy references/ for progressive disclosure (loaded on-demand)
  if [ -d "$SCRIPT_DIR/skills/drawio/references" ] && [ ! -L "$SCRIPT_DIR/skills/drawio/references" ]; then
    rm -rf "$KIRO_SKILLS_DIR/references"
    cp -r "$SCRIPT_DIR/skills/drawio/references" "$KIRO_SKILLS_DIR/references"
  fi

  # Copy scripts/ for executable utilities
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    rm -rf "$KIRO_SKILLS_DIR/scripts"
    cp -r "$SCRIPT_DIR/scripts" "$KIRO_SKILLS_DIR/scripts"
  fi

  # Remove legacy drawio.md from agents/ if present from older installs
  if [ -f "$KIRO_AGENTS_DIR/drawio.md" ]; then
    rm "$KIRO_AGENTS_DIR/drawio.md"
    echo "  - Cleaned up legacy agent spec: $KIRO_AGENTS_DIR/drawio.md"
  fi
fi

# 2. Setup Antigravity Agent Plugins
GEMINI_DIR="$HOME/.gemini"
GEMINI_PLUGINS_DIR="$GEMINI_DIR/config/plugins"
if [ -d "$GEMINI_PLUGINS_DIR" ]; then
  echo "Installing Antigravity plugin files..."
  mkdir -p "$GEMINI_PLUGINS_DIR/drawio/skills/drawio"
  cp "$SCRIPT_DIR/plugin.json" "$GEMINI_PLUGINS_DIR/drawio/"
  cp "$SCRIPT_DIR/skills/drawio/SKILL.md" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/SKILL.md"
  if [ -d "$SCRIPT_DIR/skills/drawio/references" ] && [ ! -L "$SCRIPT_DIR/skills/drawio/references" ]; then
    rm -rf "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/references"
    cp -r "$SCRIPT_DIR/skills/drawio/references" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/references"
  fi
  # Clean up target examples folder (if any) to keep agent environment clean
  rm -rf "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/examples"

  
  # Copy scripts
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    rm -rf "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/scripts"
    cp -r "$SCRIPT_DIR/scripts" "$GEMINI_PLUGINS_DIR/drawio/skills/drawio/scripts"
  fi
fi

# Extract the body of SKILL.md (strip lines 1-8 which contain the original YAML frontmatter)
if [ -f "$SCRIPT_DIR/skills/drawio/SKILL.md" ]; then
  DRAWIO_BODY=$(sed '1,8d' "$SCRIPT_DIR/skills/drawio/SKILL.md")
fi

# 3. Setup Claude Code Skill
CLAUDE_DIR="$HOME/.claude"
CLAUDE_SKILLS_DIR="$CLAUDE_DIR/skills/drawio"
if [ -d "$CLAUDE_DIR" ]; then
  echo "Installing Claude Code skill files..."
  mkdir -p "$CLAUDE_SKILLS_DIR"
  # Claude Code supports the full SKILL.md + subdirectory structure natively
  cp "$SCRIPT_DIR/skills/drawio/SKILL.md" "$CLAUDE_SKILLS_DIR/SKILL.md"

  # Copy references/ for progressive disclosure (loaded on-demand)
  if [ -d "$SCRIPT_DIR/skills/drawio/references" ] && [ ! -L "$SCRIPT_DIR/skills/drawio/references" ]; then
    rm -rf "$CLAUDE_SKILLS_DIR/references"
    cp -r "$SCRIPT_DIR/skills/drawio/references" "$CLAUDE_SKILLS_DIR/references"
  fi

  # Copy scripts/ for executable utilities
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    rm -rf "$CLAUDE_SKILLS_DIR/scripts"
    cp -r "$SCRIPT_DIR/scripts" "$CLAUDE_SKILLS_DIR/scripts"
  fi
fi

# 4. Setup Cursor Rule
CURSOR_DIR="$HOME/.cursor"
CURSOR_RULES_DIR="$CURSOR_DIR/rules"
if [ -d "$CURSOR_DIR" ]; then
  echo "Installing Cursor rule files..."
  mkdir -p "$CURSOR_RULES_DIR"
  cat <<EOF > "$CURSOR_RULES_DIR/drawio.mdc"
---
description: Specialized agent for generating, updating, and exporting technical diagrams using the Draw.io MCP server.
globs: *
alwaysApply: false
---
$DRAWIO_BODY
EOF
fi

# 5. Setup Copilot Skill
COPILOT_DIR="$HOME/.github"
COPILOT_SKILLS_DIR="$COPILOT_DIR/skills/drawio"
if [ -d "$HOME/.copilot" ]; then
  echo "Installing Copilot skill files..."
  mkdir -p "$COPILOT_SKILLS_DIR"
  # Copilot CLI supports the full SKILL.md + subdirectory structure
  cp "$SCRIPT_DIR/skills/drawio/SKILL.md" "$COPILOT_SKILLS_DIR/SKILL.md"

  # Copy references/ for progressive disclosure (loaded on-demand)
  if [ -d "$SCRIPT_DIR/skills/drawio/references" ] && [ ! -L "$SCRIPT_DIR/skills/drawio/references" ]; then
    rm -rf "$COPILOT_SKILLS_DIR/references"
    cp -r "$SCRIPT_DIR/skills/drawio/references" "$COPILOT_SKILLS_DIR/references"
  fi

  # Copy scripts/ for executable utilities
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    rm -rf "$COPILOT_SKILLS_DIR/scripts"
    cp -r "$SCRIPT_DIR/scripts" "$COPILOT_SKILLS_DIR/scripts"
  fi

  # Remove legacy .agent.md file if present from older installs
  LEGACY_AGENT="$COPILOT_DIR/agents/drawio.agent.md"
  if [ -f "$LEGACY_AGENT" ]; then
    rm "$LEGACY_AGENT"
    echo "  - Cleaned up legacy agent file: $LEGACY_AGENT"
  fi
fi

# 6. Configure MCP Servers across clients using Node.js
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

  const wrapperPath = path.join(process.argv[1], "scripts", "mcp-wrapper.js");
  data.mcpServers.drawio = {
    command: "node",
    args: [wrapperPath]
  };


  const tmpPath = client.path + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, client.path);
  try { fs.chmodSync(client.path, 0o600); } catch(e) {}
  console.log(`- Configured ${client.name} at: ${client.path}`);
});
' "$SCRIPT_DIR"

echo "Verifying local @drawio/mcp package..."
if node ./node_modules/@drawio/mcp/src/index.js --help >/dev/null 2>&1; then
  echo "✓ @drawio/mcp package verified successfully"
else
  echo "⚠ WARNING: @drawio/mcp package could not be verified. The MCP server may not work until the package is available."
fi

echo "Installation complete! Please restart your client sessions to load the drawio tools."
