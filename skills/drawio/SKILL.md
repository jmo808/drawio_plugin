---
name: drawio
description: >
  Specialized agent for generating, updating, and exporting technical diagrams
  using the Draw.io MCP server. Supports flowcharts, architecture diagrams,
  sequence diagrams, class diagrams, ER diagrams, state machines, C4 models,
  network topologies, org charts, and more using native draw.io XML.
---

> [!CAUTION]
> never:write-raw-xml-by-hand|write-raw-xml-to-file|call-open_drawio_xml-with-raw-xml-for-new-diagrams
> always-for-new-diagrams:use-compile_json_spec-with-spec-inline
> bypass-compile_json_spec-for-new-diagrams→breaks-layout-physics|exceeds-max-turns-limit

## [Role]
diagram-expert|gen-tech-diagrams|use-drawio-mcp|gen-diagrams-from-code|ensure-visual-quality

## [Tools & Diagram Generation Guidelines]
- `@drawio/compile_json_spec`: **MANDATORY** for generating all new diagrams. Do not write raw XML or use individual incremental tools to build a diagram from scratch. Pass the full, single-turn JSON spec containing all nodes, containers, and connections.
- `@drawio/open_drawio_xml`: Only use for loading and rendering existing `.xml` or `.drawio` files from the workspace. Do NOT use to create new diagrams.
- `@drawio/add_node`, `@drawio/add_container`, `@drawio/connect`: Only use for making small incremental modifications or adjustments to an existing, loaded diagram.

## [Universal Diagram Catalog (JSON Spec Reference)]

Use the following catalog of JSON configurations to formulate the `compile_json_spec` payloads:

### 1. Cloud Architecture (AWS & GCP)
- **Type**: `architecture`
- **Theme**: `aws` or `gcp`
- **Spec Structure**:
```json
{
  "title": "Three-Tier AWS Web App",
  "type": "architecture",
  "theme": "aws",
  "containers": [
    { "id": "vpc_prod", "label": "Production VPC", "type": "vpc" },
    { "id": "az_a", "label": "Availability Zone A", "type": "az", "parentId": "vpc_prod" },
    { "id": "sub_web_a", "label": "Web Subnet", "type": "subnet", "parentId": "az_a", "tier": "web" },
    { "id": "sub_app_a", "label": "App Subnet", "type": "subnet", "parentId": "az_a", "tier": "app" }
  ],
  "nodes": [
    { "id": "cdn", "label": "CloudFront CDN", "type": "cloudfront" },
    { "id": "alb", "label": "Application Load Balancer", "type": "alb", "parentId": "vpc_prod" },
    { "id": "web_srv", "label": "Web Instance", "type": "ec2", "parentId": "sub_web_a" },
    { "id": "app_srv", "label": "App Server", "type": "ecs", "parentId": "sub_app_a" }
  ],
  "edges": [
    { "sourceId": "cdn", "targetId": "alb", "label": "HTTP/S" },
    { "sourceId": "alb", "targetId": "web_srv", "label": "Forward" },
    { "sourceId": "web_srv", "targetId": "app_srv", "label": "API Request" }
  ]
}
```

### 2. Process Flow Diagram (PFD)
- **Type**: `pfd`
- **Theme**: `default`
- **Spec Structure**:
```json
{
  "title": "Distillation Column Subsystem",
  "type": "pfd",
  "nodes": [
    { "id": "feed_pump", "label": "Feed Charge Pump", "type": "pump", "variant": "centrifugal" },
    { "id": "dist_column", "label": "Tray Distillation Column", "type": "distillation_column", "variant": "tray" },
    { "id": "btms_pump", "label": "Bottoms Transfer Pump", "type": "pump", "variant": "positive_displacement" }
  ],
  "edges": [
    { "sourceId": "feed_pump", "targetId": "dist_column", "label": "Raw Feed Feedstream", "exitPort": "right", "entryPort": "left" },
    { "sourceId": "dist_column", "targetId": "btms_pump", "label": "Column Bottoms Outflow", "exitPort": "bottom", "entryPort": "left" }
  ]
}
```

### 3. Kubernetes Topology
- **Type**: `kubernetes`
- **Theme**: `default`
- **Spec Structure**:
```json
{
  "title": "Microservices Cluster Layout",
  "type": "kubernetes",
  "containers": [
    { "id": "ns_prod", "label": "Namespace: production", "type": "lane" },
    { "id": "pod_api", "label": "Pod: api-gateway", "type": "group", "parentId": "ns_prod" }
  ],
  "nodes": [
    { "id": "ing", "label": "Ingress: gateway", "type": "apigateway", "parentId": "ns_prod" },
    { "id": "svc", "label": "Service: api-service", "type": "endpoint", "parentId": "ns_prod" },
    { "id": "c_gate", "label": "Container: gateway-app", "type": "pod", "parentId": "pod_api" },
    { "id": "pvc_claim", "label": "Claim: data-pvc", "type": "pvc", "parentId": "ns_prod" },
    { "id": "pv_volume", "label": "Volume: data-pv", "type": "pv", "parentId": "ns_prod" }
  ],
  "edges": [
    { "sourceId": "ing", "targetId": "svc", "label": "Route" },
    { "sourceId": "svc", "targetId": "c_gate", "label": "Target" },
    { "sourceId": "pvc_claim", "targetId": "pv_volume", "label": "Binds" }
  ]
}
```

### 4. Entity-Relationship Diagram (ERD)
- **Type**: `erd`
- **Theme**: `default`
- **Spec Structure**:
```json
{
  "title": "E-Commerce User Schema",
  "type": "erd",
  "nodes": [
    {
      "id": "t_users",
      "label": "Users",
      "type": "table",
      "columns": [
        { "name": "id", "type": "INT", "pk": true, "nullable": false },
        { "name": "email", "type": "VARCHAR(255)", "nullable": false },
        { "name": "created_at", "type": "TIMESTAMP", "nullable": true }
      ]
    },
    {
      "id": "t_orders",
      "label": "Orders",
      "type": "table",
      "columns": [
        { "name": "id", "type": "INT", "pk": true, "nullable": false },
        { "name": "user_id", "type": "INT", "fk": true, "nullable": false },
        { "name": "total", "type": "DECIMAL(10,2)", "nullable": false }
      ]
    }
  ],
  "edges": [
    { "sourceId": "t_users", "targetId": "t_orders", "label": "user_id = id" }
  ]
}
```

### 5. Network Topology
- **Type**: `network`
- **Theme**: `default`
- **Spec Structure**:
```json
{
  "title": "Corporate HQ WAN & LAN",
  "type": "network",
  "containers": [
    { "id": "vlan10", "label": "VLAN 10 - Users", "type": "vlan" }
  ],
  "nodes": [
    { "id": "internet", "label": "ISP WAN Gateway", "type": "wan" },
    { "id": "fw", "label": "Edge Firewall", "type": "firewall" },
    { "id": "core_sw", "label": "Core Switch 1", "type": "switch", "tier": "core" },
    { "id": "dist_sw", "label": "Dist Switch 1", "type": "switch", "tier": "distribution" },
    { "id": "user_pc", "label": "Accounting PC", "type": "workstation", "parentId": "vlan10" }
  ],
  "edges": [
    { "sourceId": "internet", "targetId": "fw" },
    { "sourceId": "fw", "targetId": "core_sw" },
    { "sourceId": "core_sw", "targetId": "dist_sw" },
    { "sourceId": "dist_sw", "targetId": "user_pc" }
  ]
}
```

### 6. General Flowchart
- **Type**: `flowchart`
- **Theme**: `default`
- **Spec Structure**:
```json
{
  "title": "User Onboarding Flow",
  "type": "flowchart",
  "nodes": [
    { "id": "start", "label": "Start Registration", "type": "circle" },
    { "id": "decision", "label": "Email Verified?", "type": "diamond" },
    { "id": "success", "label": "Setup Profile", "type": "rectangle" },
    { "id": "db_save", "label": "Save Profile Data", "type": "cylinder" }
  ],
  "edges": [
    { "sourceId": "start", "targetId": "decision" },
    { "sourceId": "decision", "targetId": "success", "label": "Yes" },
    { "sourceId": "decision", "targetId": "start", "label": "No" },
    { "sourceId": "success", "targetId": "db_save" }
  ]
}
```

## [Docs Index]
prefer-retrieval-led-reasoning|read-file-before-using-APIs
- references/xml-style-reference.md:XML-styles|shape-properties|hex-colors|HTML-labels
- references/layout-patterns.md:swimlane-templates|container-coordinates|table-structures
- references/edge-routing-guide.md:orthogonal-libavoid-decisions|waypoint-prevention
- references/aws-well-architected-reviewer.md:cloud-constraints|well-architected-validation
- references/gcp-well-architected-reviewer.md:gcp|google-cloud|kubernetes|gke|cloud-sql|spanner
- references/pid-reference.md:P&ID-ISA-conventions|native-industrial-shapes
- references/pfd-engineering-expert.md:PFD-process-flow-rules|industrial-validation
- references/kubernetes-topology-expert.md:kubernetes|k8s|pod|namespace|deployment|service|ingress|pvc|pv
- references/erd-database-expert.md:erd|database|schema|table|entity|relationship|pk|fk|index
- references/network-topology-expert.md:network|topology|switch|router|firewall|vlan|wan|lan|port

## [Domain Expert Extensibility]

### 1. Reference Docs (AI Knowledge)
- create: `skills/drawio/references/<domain>-expert.md` → define: shapes, grid-rules, routing-restrictions, and anti-patterns.
- register-in: `SKILL.md` → `[Docs Index]` → add: `- references/<domain>-expert.md:<keywords>`.

### 2. Validator Scripts (Programmatic Enforcement)
- create: `scripts/validators/<domain>.js` → exports single function `({cells, mxCells, doc, reportError, nodeIds})`.
- register-in: `scripts/validate.js` → `VALIDATOR_TYPE_MAP` → add: `'<domain>.js':['<diagramType>',null]`.

### 3. Topological Corrections (Auto-Fix)
- extend: `scripts/diagram-builder.js` → `_applyTopologicalCorrections()` → runs at finalize time to enforce structural rules.
