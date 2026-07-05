const { DiagramBuilder } = require('./scripts/diagram-builder');
const fs = require('fs');

const b = new DiagramBuilder();
b.init('AWS Well-Architected Event-Driven Pipeline', 'light', 'architecture');

// 1. Regional / Managed Services (Outside VPC)
b.addNode('client', 'Mobile Client', 'user', '1');
b.addNode('cloudfront', 'CloudFront CDN', 'cloudfront', '1');
b.addNode('api_gw', 'API Gateway', 'rectangle', '1');
b.addNode('lambda_api', 'API Handler', 'lambda', '1');
b.addNode('sqs_queue', 'Task Queue', 'sqs', '1');

// 2. VPC and AZs
b.addContainer('vpc1', 'Production VPC', 'vpc');
b.addContainer('az1', 'us-east-1a', 'az', 'vpc1');
b.addContainer('az2', 'us-east-1b', 'az', 'vpc1');

// 3. Subnets inside AZs
b.addContainer('app1', 'App Subnet', 'subnet', 'az1', 'app');
b.addContainer('data1', 'Data Subnet', 'subnet', 'az1', 'data');
b.addContainer('app2', 'App Subnet', 'subnet', 'az2', 'app');
b.addContainer('data2', 'Data Subnet', 'subnet', 'az2', 'data');

// 4. Compute Resources (Inside VPC App Subnets)
b.addNode('ecs_worker1', 'ECS Worker', 'ecs', 'app1');
b.addNode('ecs_worker2', 'ECS Worker', 'ecs', 'app2');

// 5. Data Resources (Inside VPC Data Subnets)
b.addNode('rds_primary', 'Primary DB', 'rds', 'data1');
b.addNode('elasticache1', 'Redis Cache', 'elasticache', 'data1');
b.addNode('rds_replica', 'Replica DB', 'rds', 'data2');
b.addNode('elasticache2', 'Redis Cache', 'elasticache', 'data2');

// 6. Connections enforcing correct Cloud Physics
// Ingress
b.connect('client', 'cloudfront', 'HTTPS');
b.connect('cloudfront', 'api_gw', 'Forward');

// API to Compute
b.connect('api_gw', 'lambda_api', 'Invoke');

// Compute to Queue (Event Publishing)
b.connect('lambda_api', 'sqs_queue', 'Publish Event');

// Queue Polling (Workers poll queue)
b.connect('sqs_queue', 'ecs_worker1', 'Polls', 'dashed');
b.connect('sqs_queue', 'ecs_worker2', 'Polls', 'dashed');

// Worker to DB / Cache
b.connect('ecs_worker1', 'rds_primary', 'Read/Write');
b.connect('ecs_worker1', 'elasticache1', 'Cache Access');
b.connect('ecs_worker2', 'rds_replica', 'Read Only');
b.connect('ecs_worker2', 'elasticache2', 'Cache Access');

// Database Replication
b.connect('rds_primary', 'rds_replica', 'Async Replication', 'dashed');

const res = b.finalize();
if (res.success) {
    fs.writeFileSync('./event-driven-architecture.xml', res.xml);
    console.log('Successfully generated event-driven-architecture.xml');
} else {
    console.error('Failed:', res.error);
    console.error(res.details);
}
