# 📐 Draw.io MCP Plugin

> Generate native, fully-editable draw.io diagrams from natural language — across all major AI coding assistants.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

This plugin connects the [draw.io MCP server](https://github.com/jgraph/drawio-mcp) to your AI coding assistant and teaches it how to generate **high-quality, native draw.io XML diagrams** — not Mermaid imports, but real, individually-editable shapes on the canvas.

## ✨ Features

- **🎨 Native draw.io shapes** — Every diagram is built with native mxGraph XML, producing fully editable shapes, connectors, and containers
- **🔌 Multi-client support** — One installer for Kiro CLI, Claude Desktop, Claude Code, Cursor, Copilot CLI, and Antigravity
- **📁 Codebase-to-diagram** — Generate architecture, class, ER, and dependency diagrams directly from your project structure
- **🔄 Round-trip editing** — Read existing `.drawio` files, modify them, and re-render
- **📚 Rich skill knowledge** — Bundled reference docs and examples ensure the AI produces correct, beautiful diagrams on the first try
- **🔒 Security hardened** — Pinned package versions, atomic config writes, config backups, least-privilege agent access

## 🖥️ Supported Clients

| Client | What gets installed |
|--------|-------------------|
| **Kiro CLI** | Custom `@drawio` steering agent + MCP server registration |
| **Claude Desktop** | MCP server registration |
| **Claude Code** | MCP server registration |
| **Cursor** | MCP server registration |
| **Copilot CLI** | MCP server registration |
| **Antigravity** | Full skill plugin (SKILL.md, references, examples) + MCP server |

## 📦 Prerequisites

- **Node.js** ≥ 18 and **npm** installed and in your PATH.

## 🚀 Installation

### macOS / Linux
```bash
git clone https://github.com/jmo808/drawio_plugin.git
cd drawio_plugin
chmod +x install.sh
./install.sh
```

### Windows (PowerShell)
```powershell
git clone https://github.com/jmo808/drawio_plugin.git
cd drawio_plugin
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer:
1. Detects which clients are present and configures only those
2. Creates `.bak` backups of all modified config files
3. Verifies the `@drawio/mcp` package is accessible

### What gets installed

| Location | Contents |
|----------|----------|
| `~/.kiro/agents/drawio.json` | Kiro agent manifest |
| `~/.kiro/agents/drawio.md` | Kiro agent skill instructions |
| `~/.gemini/config/plugins/drawio/` | Antigravity plugin (SKILL.md, references, examples) |
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
2. **Chooses XML** (not Mermaid) — because the diagram needs nested containers (VPC > AZ > instances) and domain-specific shapes
3. **Applies the rigid grid system** — places nodes at calculated positions
4. **Uses proper containment** — VPC is a swimlane, AZs are nested swimlanes inside VPC, instances have `parent="az1"` with relative coordinates
5. **Calls `open_drawio_xml`** — with the generated XML and `routing: "libavoid"` for clean edge routing

### Generated XML (abbreviated)

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>

    <!-- Cloud shape for internet users -->
    <mxCell id="users" value="&lt;b&gt;Internet / Users&lt;/b&gt;"
            style="shape=mxgraph.flowchart.cloud;whiteSpace=wrap;html=1;
                   fillColor=#f5f5f5;strokeColor=#666666;"
            vertex="1" parent="1">
      <mxGeometry x="310" y="40" width="140" height="80" as="geometry"/>
    </mxCell>

    <!-- ALB -->
    <mxCell id="alb" value="&lt;b&gt;ALB&lt;/b&gt;&lt;br&gt;Application Load Balancer"
            style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;"
            vertex="1" parent="1">
      <mxGeometry x="310" y="180" width="140" height="60" as="geometry"/>
    </mxCell>

    <!-- VPC container (outermost swimlane) -->
    <mxCell id="vpc" value="VPC (10.0.0.0/16)"
            style="swimlane;startSize=24;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;"
            vertex="1" parent="1">
      <mxGeometry x="40" y="300" width="700" height="620" as="geometry"/>
    </mxCell>

    <!-- AZ 1 (nested inside VPC) -->
    <mxCell id="az1" value="AZ us-east-1a"
            style="swimlane;startSize=24;fillColor=#fff2cc;strokeColor=#d6b656;html=1;"
            vertex="1" parent="vpc">
      <mxGeometry x="20" y="36" width="320" height="560" as="geometry"/>
    </mxCell>

    <!-- EC2 instance (nested inside AZ) — note parent="az1" -->
    <mxCell id="web1" value="&lt;b&gt;EC2&lt;/b&gt;&lt;br&gt;web-1 (t3.large)"
            style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
            vertex="1" parent="az1">
      <mxGeometry x="90" y="40" width="140" height="60" as="geometry"/>
    </mxCell>

    <!-- RDS cylinder shape -->
    <mxCell id="rds_primary" value="&lt;b&gt;RDS Primary&lt;/b&gt;&lt;br&gt;PostgreSQL"
            style="shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
            vertex="1" parent="az1">
      <mxGeometry x="20" y="360" width="120" height="80" as="geometry"/>
    </mxCell>

    <!-- Cross-container edge (parent="1", not inside any container) -->
    <mxCell id="e_alb_web1" value="HTTPS" edge="1" parent="1"
            source="alb" target="web1"
            style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>

    <!-- Dashed replication edge -->
    <mxCell id="e_rds_repl" value="Replication" edge="1" parent="1"
            source="rds_primary" target="rds_replica"
            style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;dashed=1;strokeColor=#999;">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>

    <!-- ... more nodes and edges ... -->
  </root>
</mxGraphModel>
```

### Result

The diagram opens in the draw.io web editor in your browser. Every shape is a **native, clickable, editable object** — you can drag nodes, restyle containers, add new connections, and export to SVG/PNG:

- 🟦 **Blue containers** = VPC boundary with nested AZ swimlanes
- 🟨 **Yellow containers** = Availability Zones
- 🟩 **Green node** = Load balancer
- 🔵 **Blue nodes** = Compute (EC2, ECS, Lambda)
- ⬡ **Cylinders** = Data stores (RDS, ElastiCache)
- ┄ **Dashed lines** = Replication between AZs

### Key things to notice

| Feature | How it's done |
|---------|--------------|
| **Nested containers** | VPC → AZ → Instance using `parent` hierarchy |
| **Relative coordinates** | Children positioned relative to their container, not the canvas |
| **Cross-container edges** | Edges between AZs use `parent="1"` so they route correctly |
| **Semantic shapes** | `shape=cylinder3` for databases, `shape=mxgraph.flowchart.cloud` for internet |
| **HTML labels** | Bold titles + descriptions using `&lt;b&gt;` and `&lt;br&gt;` with `html=1` |
| **Edge routing** | `routing: "libavoid"` makes connectors route around shapes cleanly |

---

## 📂 Bundled Resources

### Reference Docs (`references/`)

| File | Contents |
|------|----------|
| `xml-style-reference.md` | Complete style properties, shape types, colors, HTML labels, grid system |
| `layout-patterns.md` | Swimlane, nested container, and cross-functional table templates |
| `edge-routing-guide.md` | Routing decisions: default vs libavoid, edge style compatibility |

### Example Diagrams (`examples/`)

| File | Type |
|------|------|
| `aws-architecture.xml` | 3-tier AWS architecture with nested VPC/AZ swimlanes |
| `org-chart.csv` | Org chart using draw.io's CSV import format |

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

The plugin uses the [draw.io MCP server](https://github.com/jgraph/drawio-mcp) (`@drawio/mcp`) which exposes three tools:

| Tool | Purpose |
|------|---------|
| `open_drawio_xml` | Opens draw.io editor with native XML diagram |
| `open_drawio_csv` | Opens draw.io editor with a CSV-generated diagram |
| `search_shapes` | Searches draw.io's shape libraries for domain icons (AWS, GCP, Cisco, etc.) |

The SKILL.md teaches the AI:
- **When to use XML vs CSV** (XML for everything except tabular org charts)
- **The rigid grid system** for consistent, non-overlapping layouts
- **Container patterns** for nested architecture diagrams
- **Edge routing** for clean, non-crossing connectors
- **Codebase scanning workflows** for auto-generating diagrams from code

---

## 📄 License

MIT
