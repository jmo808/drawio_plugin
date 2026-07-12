---
name: drawio
description: >
  Specialized agent for generating, updating, and exporting technical diagrams
  using the Draw.io MCP server. Supports flowcharts, architecture diagrams,
  sequence diagrams, class diagrams, ER diagrams, state machines, C4 models,
  network topologies, org charts, and more using native draw.io XML.
---

> [!CAUTION]
> never:write-raw-xml-by-hand|write-raw-xml-to-file|call-open_drawio_xml-with-raw-xml-for-architecture-diagrams
> always-for-new-diagrams:use-compile_json_spec-with-spec-inline
> bypass-compile_json_spec-for-new-diagrams→breaks-layout-physics|exceeds-max-turns-limit

## [Role]
diagram-expert|gen-tech-diagrams|use-drawio-mcp|gen-diagrams-from-code|ensure-visual-quality

## [Tools]
always-use:
- `@drawio/open_drawio_xml`:content(mxGraphModel-XML),dark(auto|true|false),lightbox(bool),routing(libavoid)
  - architecture-diagrams→always-use-builder-tools
  - other-diagrams(flowcharts,network,sequence,class)→open_drawio_xml-raw-xml
- `@drawio/open_drawio_csv`:content(CSV),dark,lightbox
  - org-charts|tabular-data→open_drawio_csv
- `@drawio/search_shapes`:query,limit(default-10,max-50)

## [Diagram Builder Tools]
use-builder-for-architecture-diagrams→automates-coords,styles,containment

### Workflow
1.init_diagram(title,theme,type)|2.add_container(id,lbl,type,parent,tier)|3.add_node(id,lbl,type,parent,variant)|4.connect(src,tgt,lbl,style,exit,entry)|5.finalize()→save-xml

### Containers
- `region`:width:1280|height:300|horizontal-layout-for-children
- `vpc`:width:1200|height:300|100px-bottom-padding-for-routing
- `az`:width:460|height:200|nested-in-vpc
- `subnet`|`group`|`lane`|`pool`

### Nodes
- compute:ec2|ecs|lambda
- data:rds|elasticache|dynamodb|s3
- network:alb|nlb|cloudfront|apigateway|nat_gateway|endpoint
- security:waf
- messaging:sqs|sns
- other:user|internet|rectangle|diamond|cylinder|circle

## [Batch Diagram Generation (Highly Recommended)]
Compile the declarative JSON spec directly inline using `compile_json_spec(spec: object)`.
- json-format: {title:str,theme:str,type:str,containers:[{id,label,type,parentId,tier}],nodes:[{id,label,type,parentId,variant}],edges:[{sourceId,targetId,label,style,exitPort,entryPort}]}
- compile: always call `compile_json_spec(spec: object)` with the full diagram JSON structure directly.
- benefit: 1-shot-generation|prevents-xml-hand-writing|runs-all-layout-physics-and-topological-corrections|prevents-user-approval-popups

## [Visual Layout Rules]
- regional-services:outside-vpc|placed-directly-under-region-or-1|horizontal-packed|gap:60
- private-resources:nested-in-subnet-inside-az-inside-vpc
- compute-nodes:app-subnet
- data-stores:data-subnet
- label-formatting:html=1|title:bold|subtitle:newline(<br>)
- edge-style:orthogonal|rounded=1|exitX/exitY/entryX/entryY-override-for-geometric-intent-only

## [Architectural Constraints]
- Decoupling:web-compute→load-balancer→app-compute|never-route-compute-to-compute-directly
- Messaging:sqs/sns/eventbridge→ecs/ec2/lambda-edges-must-be-dashed(Polls)
- Cross-AZ Writes:ecs-worker-in-az-b→rds-primary-in-az-a(Read/Write,solid)
- Cache Replication:redis-cache-in-az-a╍╍redis-cache-in-az-b(Async Replication,dashed)

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

## [Domain Expert Extensibility]

### 1.Reference-Docs(AI-Knowledge)
- create:`skills/drawio/references/<domain>-expert.md`→define:shapes|grid-rules|routing-restrictions|anti-patterns
- register-in:`SKILL.md`→`[Docs Index]`→add:`- references/<domain>-expert.md:<keywords>`→agent-discovers-at-prompt-time
- without-registration→agent-will-not-discover-or-load-the-reference-doc

### 2.Validator-Scripts(Programmatic-Enforcement)
- create:`scripts/validators/<domain>.js`→exports-single-function({cells,mxCells,doc,reportError,nodeIds})
- register-in:`scripts/validate.js`→VALIDATOR_TYPE_MAP→add:`'<domain>.js':['<diagramType>',null]`
- bundled:validators/aws.js(architecture)|validators/pfd.js(pfd)

### 3.Topological-Corrections(Auto-Fix)
- extend:`scripts/diagram-builder.js`→`_applyTopologicalCorrections()`→runs-at-finalize()
- bundled:AWS-corrections(~1000-lines)|ingress-linearization|cross-AZ-edge-deletion|event-flow-rewiring
