# 📐 Draw.io MCP Plugin

> Generate native, fully-editable draw.io diagrams from natural language — across all major AI coding assistants.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

This plugin connects the [draw.io MCP server](https://github.com/jgraph/drawio-mcp) to your AI coding assistant and teaches it how to generate **high-quality, native draw.io XML diagrams** — not Mermaid imports, but real, individually-editable shapes on the canvas.

## ✨ Features

- **🎨 Native draw.io shapes** — Every diagram is built with native mxGraph XML, producing fully editable shapes, connectors, and containers
- **🔌 Multi-client support** — One installer for Kiro CLI, Claude Desktop, Claude Code, Cursor, Copilot CLI, and Antigravity
- **📁 Codebase-to-diagram** — Generate architecture, class, ER, and dependency diagrams directly from your project structure
- **✅ Auto-validation** — Bundled Node.js script checks diagrams for layout collisions and formatting errors before presenting them to the user
- **🔄 Round-trip editing** — Read existing `.drawio` files, modify them, and re-render
- **📚 Rich skill knowledge** — Bundled reference docs and examples ensure the AI produces correct, beautiful diagrams on the first try
- **🔒 Security hardened** — Pinned package versions, atomic config writes, config backups, least-privilege agent access

## 🖥️ Supported Clients

| Client | What gets installed |
|--------|-------------------|
| **Kiro CLI** | Custom `@drawio` steering agent + MCP server registration |
| **Claude Desktop** | MCP server registration |
| **Claude Code** | Native SKILL.md file + MCP server registration |
| **Cursor** | Native `.mdc` rule file + MCP server registration |
| **Copilot CLI** | Native `.agent.md` file + MCP server registration |
| **Antigravity** | Full skill plugin (SKILL.md, references, examples) + MCP server |

## 📦 Prerequisites

- **Node.js** ≥ 18 and **npm** installed and in your PATH.

## 🚀 Installation

### 1. Native Agent Installations (Zero-Script)

Because this repository is structured as a standard plugin, you can install it directly using your agent's native CLI or UI:

**Antigravity**
```bash
agy plugin install https://github.com/jmo808/drawio_plugin.git
```

**GitHub Copilot CLI**
```bash
copilot plugin install https://github.com/jmo808/drawio_plugin.git
```

**Claude Code**
```bash
npx add-skill https://github.com/jmo808/drawio_plugin.git
# Or use /plugin install drawio within the Claude Code interface
```

**Kiro IDE**
- Open the **Powers** panel in the IDE
- Select **Add Custom Power** → **Import power from GitHub**
- Paste `https://github.com/jmo808/drawio_plugin.git`

**Cursor**
Simply drop the `.cursor/rules/drawio.mdc` file into your project, or use community sync tools to pull it from this repo.

---

### 2. Manual Universal Installer

If you prefer to install for *all* detected clients locally on your machine at once, you can use the bundled bash/powershell scripts.

#### macOS / Linux
```bash
git clone https://github.com/jmo808/drawio_plugin.git
cd drawio_plugin
chmod +x install.sh
./install.sh
```

#### Windows (PowerShell)
```powershell
git clone https://github.com/jmo808/drawio_plugin.git
cd drawio_plugin
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer:
1. Detects which clients are present (including **Kiro CLI**, Claude Desktop, etc.) and configures only those
2. Creates `.bak` backups of all modified config files
3. Verifies the `@drawio/mcp` package is accessible

### What gets installed

| Location | Contents |
|----------|----------|
| `~/.kiro/agents/drawio.json` | Kiro CLI agent manifest |
| `~/.kiro/agents/drawio.md` | Kiro CLI agent skill instructions |
| `~/.gemini/config/plugins/drawio/` | Antigravity plugin (SKILL.md, references, examples) |
| `~/.claude/skills/drawio/SKILL.md` | Claude Code skill instructions |
| `~/.cursor/rules/drawio.mdc` | Cursor rule instructions |
| `~/.github/agents/drawio.agent.md` | Copilot agent instructions |
| Various `mcp.json` / `config.json` | MCP server entry for each detected client |

## 🗑️ Uninstallation

### macOS / Linux
```bash
./uninstall.sh
```

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Removes all installed files and cleans the `drawio` entry from every MCP config.

---

## 💬 Example: Generating a Diagram

Here's a real example of what using the plugin looks like. You type a natural-language prompt, and the AI generates native draw.io XML that opens directly in the draw.io editor.

### Prompt

```
Create a 3-tier AWS architecture diagram showing:
- Users hitting an ALB
- Web tier with EC2 instances across 2 AZs inside a VPC
- App tier with ECS and Lambda
- Data tier with RDS (primary + read replica) and ElastiCache
- Show replication between AZs
```

### What the AI does

1. **Identifies the diagram type** — cloud architecture with nested containers
2. **Uses XML for all diagrams** — as strictly instructed by the skill rules, ensuring reliable parsing
3. **Applies the rigid grid system** — places nodes at calculated positions
4. **Uses proper containment** — VPC is a swimlane, AZs are nested swimlanes inside VPC, instances have `parent="az1"` with relative coordinates
5. **Calls `open_drawio_xml`** — with the generated XML and `routing: "libavoid"` for clean edge routing
6. **Validates the diagram** — Runs the bundled `validate.js` script to compute absolute bounds and ensure no nodes are overlapping or out-of-bounds before presenting the final result.

### Generated Output

![AWS Architecture Example Diagram](skills/drawio/examples/aws-architecture.png?v=2)

### Result

The diagram opens in the draw.io web editor in your browser. Every shape is a **native, clickable, editable object** — you can drag nodes, restyle containers, add new connections, and export to SVG/PNG:

- 🟦 **Blue containers** = VPC boundary with nested AZ swimlanes
- 🟨 **Yellow containers** = Availability Zones
- 🟣 **Purple icons** = Load Balancer & Data Stores (ALB, RDS, ElastiCache)
- 🟠 **Orange icons** = Compute Services (EC2, ECS, Lambda)
- ┄ **Dashed lines** = Replication between AZs

### Key things to notice

| Feature | How it's done |
|---------|--------------|
| **Nested containers** | VPC → AZ → Instance using `parent` hierarchy |
| **Relative coordinates** | Children positioned relative to their container, not the canvas |
| **Cross-container edges** | Edges between AZs use `parent="1"` so they route correctly |
| **Semantic shapes** | `shape=mxgraph.aws4.resourceIcon` with `resIcon` for AWS services, matching the official icon set |
| **Shape labels** | Plain-text newlines (`&#xa;`) for AWS/GCP icons to ensure perfect rendering across engines |
| **Edge routing** | `routing: "libavoid"` makes connectors route around shapes cleanly |

---

## 📊 Example: Generating an Org Chart (CSV)

While most diagrams are generated via native XML, structured tabular data like organizational charts is best built using draw.io's CSV import feature.

> [!IMPORTANT]
> To ensure the org chart imports with the correct hierarchical structure, the CSV file must include specific configuration comments at the top. See the [CSV Org Chart Configuration](#-csv-org-chart-configuration) section below for detailed setup rules.

### Prompt

```
Create an organizational chart from the following company roles:
- Emily Chen is CEO
- Marcus Johnson (VP Engineering), Sarah Kim (VP Product), and David Okafor (VP Sales) report to Emily Chen
- Lisa Park (Director Frontend), James Wright (Director Backend), and Priya Sharma (Director DevOps) report to Marcus Johnson
- Alex Rivera (TL - React) and Nina Torres (TL - Design System) report to Lisa Park
- Omar Hassan (TL - API), Rachel Green (TL - Data), and Wei Zhang (TL - Microservices) report to James Wright
- Carlos Mendez (TL - Infrastructure) and Amy Liu (TL - SRE) report to Priya Sharma
- Tom Baker (PM - Mobile) and Jessica Nguyen (PM - Platform) report to Sarah Kim
- Ryan Cooper (Sales Lead - East) and Maria Santos (Sales Lead - West) report to David Okafor
```

### CSV Snippet

The AI translates this hierarchical data into a CSV format pre-pended with the required configuration comments:

```csv
# label: %name%<br><i style="font-size:11px;">%title%</i>
# style: label;image=%image%;whiteSpace=wrap;html=1;fontSize=12;fontStyle=1;rounded=1;arcSize=10;fillColor=%fill%;strokeColor=%stroke%;imageWidth=0;imageHeight=0;spacingTop=4;spacingBottom=4;spacing=8;
# connect: {"from": "manager", "to": "name", "invert": true, "style": "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;"}
# width: 190
# height: 60
# padding: 30
# ignore: image,fill,stroke
# nodespacing: 20
# levelspacing: 60
# edgespacing: 20
# layout: orgchart
## Organizational Chart — Acme Corp
name,title,manager,image,fill,stroke
Emily Chen,CEO,,,#dae8fc,#6c8ebf
Marcus Johnson,VP Engineering,Emily Chen,,#dae8fc,#6c8ebf
Sarah Kim,VP Product,Emily Chen,,#d5e8d4,#82b366
...
```

### Generated Output

![Org Chart Example Diagram](skills/drawio/examples/org-chart.png)

### Result

By combining `# layout: orgchart` with `"invert": true` and a clean edge style, draw.io parses the CSV and immediately opens a perfectly organized, top-down tree diagram where the CEO is at the top and reporting lines are neatly routed around nodes.

---

## 📂 Bundled Resources

### Reference Docs (`skills/drawio/references/`)

| File | Contents |
|------|----------|
| `xml-style-reference.md` | Complete style properties, shape types, colors, HTML labels, grid system |
| `layout-patterns.md` | Swimlane, nested container, and cross-functional table templates |
| `edge-routing-guide.md` | Routing decisions: default vs libavoid, edge style compatibility |

### Example Diagrams (`skills/drawio/examples/`)

| File | Type |
|------|------|
| `aws-architecture.xml` | 3-tier AWS architecture with nested VPC/AZ swimlanes |
| `org-chart.csv` | Org chart using draw.io's CSV import format |

### 📊 CSV Org Chart Configuration

When importing organizational charts via CSV (`open_drawio_csv`), draw.io relies on configuration comments (prefixed with `#`) at the top of the file to determine layout and connectivity. To generate a correct top-down tree hierarchy, the CSV must include:

1. **`# layout: orgchart`** — Directs the layout engine to use its specialized, compact organizational chart tree layout instead of generic hierarchical or linear stacking.
2. **`# connect: {"from": "manager", "to": "name", "invert": true, "style": "..."}`** — Configures parent-to-child relationships. 
   - `"from": "manager"` specifies the column representing the supervisor's identifier.
   - `"to": "name"` specifies the unique column identifying each node.
   - `"invert": true` is **critical**. Because draw.io naturally connects source-to-target (Employee $\rightarrow$ Manager), inverting the edge direction forces the layout engine to treat the Manager as the root node, placing them at the top of the canvas, while the arrowheads still point down towards the reports.
3. **No hardcoded edge exit/entry constraints** — Do not specify `exitX/Y` or `entryX/Y` in the edge `"style"`. Leaving these out allows the layout engine to automatically route lines orthogonally without creating awkward loops or overlapping nodes.


### Validation Tools (`skills/drawio/scripts/`)

| File | Contents |
|------|----------|
| `validate.js` | Diagram linter that parses XML, computes absolute bounds across nested containers, and detects node collisions and HTML formatting errors. |

---

## 🔒 Security

This plugin has been security-audited. Key protections:

- **📌 Pinned dependencies** — `@drawio/mcp@1.3.4` is version-pinned to prevent supply chain attacks
- **⚛️ Atomic writes** — Config files are written to `.tmp` then renamed, preventing corruption on crash
- **💾 Config backups** — `.bak` copies created before every modification
- **🔗 Symlink protection** — `rm -rf` and `cp -r` operations verify targets aren't symlinks
- **🔐 File permissions** — Config files are set to `600` (owner-only read/write) after modification
- **🛡️ Least privilege** — The Kiro agent has no `shell` access; only file read/write and `@drawio` tools
- **✅ Proper JSON handling** — All config modifications use `JSON.parse`/`JSON.stringify` (not sed/regex)

---

## 🛠️ How It Works

The plugin uses the [draw.io MCP server](https://github.com/jgraph/drawio-mcp) (`@drawio/mcp`) which exposes four tools:

| Tool | Purpose |
|------|---------|
| `open_drawio_xml` | Opens draw.io editor with native XML diagram |
| `open_drawio_csv` | Opens draw.io editor with a CSV-generated diagram |
| `open_drawio_mermaid` | Exists in MCP, but is **explicitly disabled** by the skill instructions to enforce native XML |
| `search_shapes` | Searches draw.io's shape libraries for domain icons (AWS, GCP, Cisco, etc.) |

The SKILL.md teaches the AI:
- **When to use XML vs CSV** (XML for everything except tabular org charts)
- **The rigid grid system** for consistent, non-overlapping layouts
- **Container patterns** for nested architecture diagrams
- **Edge routing** for clean, non-crossing connectors
- **Codebase scanning workflows** for auto-generating diagrams from code

## 🌐 Enterprise & Self-Hosting Configuration

In enterprise or air-gapped environments, loading diagrams through the default public editor (`https://embed.diagrams.net`) may not be permitted. The `@drawio/mcp` server natively supports routing all requests to a self-hosted or locally-run draw.io instance.

### Configuring a Custom Base URL

You can override the editor URL by setting the `DRAWIO_BASE_URL` environment variable within your MCP client's configuration file (e.g., `mcp_config.json`, `claude_desktop_config.json` depending on your agent setup).

Add the `env` object to your `drawio` server configuration:

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": [
        "-y",
        "@drawio/mcp@1.3.4"
      ],
      "env": {
        "DRAWIO_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

Replace `http://localhost:8080` with your company's internal draw.io domain (e.g., `https://drawio.internal.net`).

### Self-Hosting Draw.io Locally
If you want to run a lightweight local instance, you can spin up the official Draw.io Docker container:

```bash
docker run -d --name drawio -p 8080:8080 -p 8443:8443 jgraph/drawio
```

Once running, setting `DRAWIO_BASE_URL` to `http://localhost:8080` guarantees that all diagram generation opens purely within your local network.

---

## 📄 License

MIT
