IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-AWS-validation tasks.

## [Project Context]
domain:aws-cloud-architecture|env:draw.io-plugin|role:domain-expert-reviewer-agent|task:validate-cloud-topology+enforce-3-tier-physics|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
aws-well-architected:{docs/reliability-pillar.md,docs/security-pillar.md}
plugin-src:{src/aws-validator.ts,src/auto-layout.ts,src/boundary-parser.ts}
*always-read-well-architected-framework-before-validating-graph*

## [Domain Rules + Patterns]
vpc-hierarchy:Region→VPC→AvailabilityZone(AZ)→Subnet→Resource
subnet-segmentation:public(ALB,NATGW,IGW)|private-compute(EC2,ECS,EKS,Lambda)|private-data(RDS,ElastiCache,Redshift)
3-tier-flow:Client→Public-Subnet(ALB)→Private-Compute(Web/App)→Private-Data(DB/Cache)
state-physics:compute-is-stateless(EC2,ECS,Lambda)→prevent:replication|data-is-stateful(RDS,Cache,S3)→require:cross-az-replication
db-access:primary(writer)=cross-az-inbound-allowed|replica(reader)=local-az-read-only
compute-patterns:ALB→routes-to-parallel-targets(EC2|ECS|Lambda)|prevent:synchronous-daisy-chaining(EC2→Lambda→ECS)

## [Project Conventions]
topology:Client:top|VPC:outer-boundary|AZs:parallel-vertical-columns|Subnets:horizontal-bands-inside-AZs
routing:lines-terminate-at-resource-icon-boundary|flow:top→down+left→right
arrows:strict-flow-indication(request-path)
lines:solid=request-traffic|dashed=replication/async-events|prevent:floating-lines

## [Anti-Patterns]
stateless-compute-replication|correction:delete-replication-lines-between-Lambdas/EC2/ECS
bypassing-app-tier|correction:delete-lines-from-Web(EC2)→Data(RDS)+route-Web→App→Data
daisy-chained-compute|correction:unravel-EC2→Lambda→ECS+route-ALB→parallel-compute-targets
az-isolated-db-writes|correction:route-AZ-B-compute→AZ-A-Primary-RDS-for-writes
flat-az-network|correction:wrap-resources-in-explicit-Public/Private-Subnet-boundaries-inside-AZs
unreplicated-stateful-cache|correction:draw-dashed-replication-line-between-AZ-A+AZ-B-ElastiCache
internet-facing-db|correction:move-RDS/Cache-to-private-data-subnet+remove-igw-route
double-alb-spaghetti|correction:represent-ALB-as-single-logical-icon-spanning-AZs-instead-of-duplicate-ALBs+place-inside-VPC-container
missing-internal-decoupling|correction:insert-internal-ALB-between-Web-and-App-tiers
web-to-app-coupling|correction:prevent-direct-lines-from-Web-to-App-compute+insert-Internal-ALB-between-tiers
floating-igw|correction:attach-IGW-directly-to-VPC-boundary-edge

## [Visual Styling]
icon-style:enforce-aws-silhouettes|correction:use-shape=mxgraph.aws4.resourceIcon-for-services-and-shape=mxgraph.aws4.user-for-clients+never-use-flowchart-clouds-or-generic-text-boxes