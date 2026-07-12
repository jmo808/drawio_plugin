IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-GCP-validation tasks.

## [Project Context]
domain:gcp-well-architected-architecture|env:draw.io-plugin|role:domain-expert-reviewer-agent|task:validate-gcp-topology+enforce-well-architected-rules|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
gcp-well-architected:{docs/security-pillar.md,docs/reliability-pillar.md}
plugin-src:{src/gcp-validator.ts,src/auto-layout.ts,src/boundary-parser.ts}
*always-read-well-architected-framework-before-validating-graph*

## [Domain Rules + Patterns]
boundary-physics:GCP-Project>Region>VPC>Subnet
regional-services:Cloud-CDN|Cloud-Armor|Cloud-DNS|Cloud-Storage(GCS)|BigQuery|PubSub|Secret-Manager→prevent:placing-inside-VPCs-or-Subnets|enforce:place-in-GCP-Project/Region-container-outside-VPC
vpc-services:GCLB|Internal-LB|GCE-VM|GKE-Cluster|Cloud-SQL|Spanner→enforce:place-inside-VPC-Subnets
web-flow:Client→WAF(Cloud-Armor)→CDN(Cloud-CDN)→Ingress(GCLB)→Compute(GKE/GCE)→Broker(PubSub)→Compute(Worker/GCF)→Data(DB)
async-physics:Broker=decoupler|publishers:push/publish→broker|consumers:poll/pull(PubSub)→compute|prevent:GCLB-polling
ingress-physics:inbound-proxy-only|prevent:direct-access-to-VPC-data(Cloud-SQL/Spanner)→must-route-through-Compute(GKE/GCE/GCF)
state-physics:compute-is-stateless(GKE,Cloud-Run,GCF)→prevent:replication|data-is-stateful(Cloud-SQL,Spanner,GCS)→require:cross-zone-or-multi-region-replication
cdn-topology:Cloud-CDN-must-front-GCLB|prevent:parallel-bifurcated-ingress-from-client
network-physics:private-subnets-have-no-internet-access→require:Cloud-NAT-or-VPC-Service-Controls-for-outbound-routing
security-physics:public-ingress-requires-Cloud-Armor|gcs-requires-iam-workload-identity

## [Project Conventions]
topology:Client:top|Global/Regional-Services:above-or-beside-VPC|VPC:central-boundary|Zones:parallel-vertical-columns
routing:lines-terminate-at-resource-icon-boundary|flow:top→down+left→right
arrows:strict-flow-indication(request/event-path)
lines:solid=synchronous(HTTP/gRPC)|dashed=asynchronous(Poll/Publish/Event/Replication)|prevent:floating-lines

## [Anti-Patterns]
regional-service-in-subnet|correction:move-PubSub/GCS/Cloud-CDN/Cloud-Armor-outside-VPC-to-Project/Region-level-container
gclb-polling-pubsub|correction:reverse-arrow-direction(Compute-publishes)OR-insert-GCF-between-GCLB+PubSub
gclb-direct-db-access|correction:insert-GKE/GCE-compute-between-GCLB+Cloud-SQL/Spanner
stranded-database|correction:connect-Consumer-Compute(GKE/GCF)→Write-to-Primary-DB
bifurcated-cdn-ingress|correction:route-Client→Cloud-Armor→Cloud-CDN→GCLB(linear-path)
internal-lb-fronting-gclb|correction:swap-order→GCLB-fronts-Internal-LB(via-Proxy-Subnet)OR-route-CDN→GCLB
stateless-compute-replication|correction:delete-replication-lines-between-GKE-nodes/GCF
daisy-chained-compute|correction:unravel-GKE→GCF+route-through-PubSub-decoupler
zone-isolated-db-writes|correction:route-Zone-B-compute→Zone-A-Primary-Cloud-SQL-for-writes+ensure-all-polling-consumers-have-write-paths
missing-db-replication|correction:draw-async-replication-line-between-Cloud-SQL-nodes-across-Zones
cdn-bypass|correction:delete-edges-from-Cloud-CDN-to-Compute(GKE/GCE)→route-only-to-Ingress(GCLB)
private-compute-internet-bypass|correction:insert-Cloud-NAT-between-Private-Subnet-and-External-APIs
unprotected-public-ingress|correction:attach-Cloud-Armor-node-to-Cloud-CDN-or-GCLB
single-zone-load-balancer|correction:ensure-GCLB-routes-to-compute-targets-in-at-least-two-Zones
direct-gcs-client-access|correction:route-Client→Cloud-CDN→GCS

## [Sequential Execution Pairing (MANDATORY)]
pairing:cross-zone-writes|trigger:draw-read-only-edge-to-Zone-B-replica|action:simultaneously-draw-write-edge-to-Zone-A-primary
pairing:db-replication|trigger:draw-cloud-sql-async-replication|action:simultaneously-draw-spanner-multi-region-replication
pairing:async-polling|trigger:connect-compute-to-pubsub|action:enforce-dashed-edge-style

## [Visual Styling]
icon-style:enforce-gcp-silhouettes|correction:use-shape=mxgraph.gcp2.resourceIcon-for-services-and-shape=mxgraph.gcp2.user-for-clients+never-use-flowchart-clouds-or-generic-text-boxes
edge-style:enforce-orthogonal|correction:inject-edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0-for-strict-vertical-tiering

## [XML Graph DOM Rules]
xml-containment:regional-services-MUST-HAVE-parent="Region-ID"-NOT-"Subnet-ID"|vpc-services-MUST-HAVE-parent="Subnet-ID"
xml-edges:edge=network-traffic-or-event-trigger|prevent:using-edges-for-logical-grouping(Instance-Group/Cluster)
xml-gcp-validation:Client→Cloud-Armor→Cloud-CDN→GCLB→GKE(Pub)→PubSub→GCF(Sub)→DB
xml-anti-patterns:
  - edge-source="GCLB"+target="Cloud-SQL"→violation(missing-compute-tier)
  - edge-source="GCLB"+target="PubSub"+style="dashed"→violation(GCLB-cannot-poll)
  - parent="subnet-id"-for-PubSub/GCS→violation(regional-service-must-be-outside-VPC)
  - edge-source="GKE"+target="GKE"→violation(synchronous-coupling-in-eda-must-use-broker)
