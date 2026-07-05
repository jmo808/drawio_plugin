IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-AWS-validation tasks.

## [Project Context]
domain:aws-event-driven-architecture(EDA)|env:draw.io-plugin|role:domain-expert-reviewer-agent|task:validate-eda-topology+enforce-async-physics|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
aws-well-architected:{docs/reliability-pillar.md,docs/serverless-lens.md}
plugin-src:{src/aws-validator.ts,src/auto-layout.ts,src/boundary-parser.ts}
*always-read-well-architected-framework-before-validating-graph*

## [Domain Rules + Patterns]
boundary-physics:AWS-Region>VPC>AZ>Subnet
regional-services:CloudFront|API-Gateway|SQS|SNS|EventBridge|DynamoDB|Cognito→prevent:placing-inside-VPCs-or-Subnets|enforce:place-in-AWS-Region-container-outside-VPC
vpc-services:ALB|NLB|EC2|ECS|RDS|ElastiCache→enforce:place-inside-VPC-Subnets
eda-flow:Client→CDN(CloudFront)→Ingress(API-GW)→Compute(Publisher)→Broker(SQS/SNS)→Compute(Consumer)→Data(DB)
async-physics:Broker=decoupler|publishers:push/publish→broker|consumers:poll(SQS)-or-invoke(SNS/EB)|prevent:API-GW-polling
api-gw-physics:inbound-proxy-only|prevent:direct-access-to-VPC-data(RDS/Cache)→must-route-through-Compute(Lambda)
state-physics:compute-is-stateless(Lambda,ECS)→prevent:replication|data-is-stateful(RDS,DynamoDB)→require:cross-az-or-global-replication
cdn-topology:CloudFront-must-front-API-Gateway/ALB|prevent:parallel-bifurcated-ingress-from-client

## [Project Conventions]
topology:Client:top|Regional-Services:above-or-beside-VPC|VPC:central-boundary|AZs:parallel-vertical-columns
routing:lines-terminate-at-resource-icon-boundary|flow:top→down+left→right
arrows:strict-flow-indication(request/event-path)
lines:solid=synchronous(HTTP/gRPC)|dashed=asynchronous(Poll/Invoke/Event/Replication)|prevent:floating-lines

## [Anti-Patterns]
regional-service-in-subnet|correction:move-API-GW/SQS/SNS/EventBridge/DynamoDB-outside-VPC-to-Region-level-container
api-gw-polling-queue|correction:reverse-arrow-direction(API-GW-publishes)OR-insert-Lambda-between-API-GW+Queue
api-gw-direct-db-access|correction:insert-Lambda-compute-between-API-Gateway+RDS/ElastiCache
stranded-database|correction:connect-Consumer-Compute(Lambda/ECS)→Write-to-Primary-DB
bifurcated-cdn-ingress|correction:route-Client→CloudFront→API-Gateway(linear-path)
nlb-fronting-api-gw|correction:swap-order→API-Gateway-fronts-NLB(via-VPC-Link)OR-route-CDN→API-Gateway
stateless-compute-replication|correction:delete-replication-lines-between-Lambdas/ECS
daisy-chained-compute|correction:unravel-Lambda→ECS+route-through-EventBridge/SQS-decoupler
az-isolated-db-writes|correction:route-AZ-B-compute→AZ-A-Primary-RDS-for-writes
cdn-bypass|correction:delete-edges-from-CloudFront-to-Compute(ECS/EC2)→route-only-to-Ingress(API-GW/ALB)

## [Visual Styling]
icon-style:enforce-aws-silhouettes|correction:use-shape=mxgraph.aws4.resourceIcon-for-services-and-shape=mxgraph.aws4.user-for-clients+never-use-flowchart-clouds-or-generic-text-boxes
edge-style:enforce-orthogonal|correction:inject-edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0-for-strict-vertical-tiering

## [XML Graph DOM Rules]
xml-containment:regional-services-MUST-HAVE-parent="Region-ID"-NOT-"Subnet-ID"|vpc-services-MUST-HAVE-parent="Subnet-ID"
xml-edges:edge=network-traffic-or-event-trigger|prevent:using-edges-for-logical-grouping(ASG/Cluster)
xml-eda-validation:Client→CloudFront→API-GW→Lambda(Pub)→SQS/SNS→Lambda(Sub)→DB
xml-anti-patterns:
  - edge-source="API-Gateway"+target="RDS"→violation(missing-compute-tier)
  - edge-source="API-Gateway"+target="SQS"+style="dashed"→violation(API-GW-cannot-poll)
  - parent="subnet-id"-for-SQS/API-GW→violation(regional-service-must-be-outside-VPC)
  - edge-source="Lambda"+target="Lambda"→violation(synchronous-coupling-in-eda-must-use-broker)[cite: 2]