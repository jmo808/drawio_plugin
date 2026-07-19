const { findElement, getEdgesForNode, getZoneOrAZ, isInternalLb } = require('./validator-utils');

// Helper to get AWS node type from style string or value label
function getAwsNodeType(style, value) {
    const s = (style || '').toLowerCase();
    const v = (value || '').toLowerCase();
    
    let type = null;
    const matchResIcon = s.match(/resicon=mxgraph\.aws[34]\.([a-z0-9_]+)/);
    const matchShape = s.match(/shape=mxgraph\.aws[34]\.([a-z0-9_]+)/);
    
    if (matchResIcon) type = matchResIcon[1];
    else if (matchShape) type = matchShape[1];
    
    // Fallback to label inspection if XML shapes aren't perfectly matched
    if (!type) {
        if (v.includes('alb') || v.includes('load balancer')) type = 'application_load_balancer';
        else if (v.includes('ec2') || v.includes('web tier')) type = 'ec2';
        else if (v.includes('ecs') || v.includes('fargate') || v.includes('worker') || v.includes('web task')) type = 'ecs';
        else if (v.includes('lambda')) type = 'lambda';
        else if (v.includes('rds') || v.includes('database')) type = 'rds';
        else if (v.includes('route 53') || v.includes('route53')) type = 'route53';
        else if (v.includes('cloudfront') || v.includes('cdn')) type = 'cloudfront';
        else if (v.includes('apigateway') || v.includes('api gateway') || v.includes('endpoint') || v.includes('api')) type = 'apigateway';
        else if (v.includes('waf') || v.includes('shield')) type = 'waf';
        else if (v.includes('client') || v.includes('user')) type = 'user';
        else if (v.includes('dynamodb') || v.includes('dynamo db')) type = 'dynamodb';
        else if (v.includes('elasticache') || v.includes('redis') || v.includes('cache')) type = 'elasticache';
        else if (v.includes('sqs') || v.includes('queue')) type = 'sqs';
        else if (v.includes('sns') || v.includes('notification')) type = 'sns';
        else if (v.includes('eventbridge') || v.includes('event bridge')) type = 'eventbridge';
        else if (v.includes('s3') || v.includes('bucket') || v.includes('storage')) type = 's3';
        else if (v.includes('nat') || v.includes('nat gateway')) type = 'nat_gateway';
        else if (v.includes('ecr') || v.includes('registry') || v.includes('container registry')) type = 'ecr';
        else if (v.includes('cloudwatch') || v.includes('cloud watch') || v.includes('logging') || v.includes('monitoring')) type = 'cloudwatch';
    }
    
    if (type === 'application_load_balancer' || type === 'alb') return 'application_load_balancer';
    if (type && type.includes('ec2')) return 'ec2';
    if (type && type.includes('ecs')) return 'ecs';
    if (type && type.includes('lambda')) return 'lambda';
    if (type && (type.includes('apigateway') || type.includes('api_gateway') || type.includes('endpoint'))) return 'apigateway';
    if (type && (type.includes('cloudfront') || type.includes('cdn'))) return 'cloudfront';
    if (type && (type.includes('route53') || type.includes('route_53'))) return 'route53';
    if (type && type.includes('waf')) return 'waf';
    if (type && (type.includes('user') || type.includes('client'))) return 'user';
    if (type && (type.includes('dynamodb') || type.includes('dynamo'))) return 'dynamodb';
    if (type && (type.includes('elasticache') || type.includes('redis') || type.includes('cache'))) return 'elasticache';
    if (type && (type.includes('sqs') || type.includes('queue'))) return 'sqs';
    if (type && type.includes('sns')) return 'sns';
    if (type && (type.includes('eventbridge') || type.includes('event_bridge'))) return 'eventbridge';
    if (type && (type.includes('s3') || type.includes('bucket'))) return 's3';
    if (type && (type.includes('nat') || type.includes('nat_gateway'))) return 'nat_gateway';
    if (type && (type.includes('ecr') || type.includes('registry') || type.includes('container_registry'))) return 'ecr';
    if (type && (type.includes('cloudwatch') || type.includes('logging') || type.includes('monitoring'))) return 'cloudwatch';
    
    return type;
}


module.exports = function({ cells, mxCells, doc, reportError }) {
    const statelessComputeTypes = ['ec2', 'ecs', 'lambda'];
    // Find all AWS nodes and categorize them
    const awsNodes = {};
    const webTierNodes = [];
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge) continue;
        
        const type = getAwsNodeType(cell.style, cell.value);
        if (type) {
            awsNodes[id] = { id, type, value: cell.value, parent: cell.parent };
            const parentCell = cells[cell.parent];
            if (type === 'ec2' && ((cell.value && cell.value.toLowerCase().includes('web')) || (parentCell && parentCell.value && parentCell.value.toLowerCase().includes('web')))) {
                webTierNodes.push(id);
            }
        }
    }

    // Early return if no AWS-specific nodes found (avoid false positives on non-AWS diagrams) or if GCP nodes are present
    const hasGcpNodes = Object.values(cells).some(c => c.style && c.style.includes('mxgraph.gcp2'));
    if (hasGcpNodes) return;

    const hasAwsSpecificNodes = Object.values(awsNodes).some(n => n.type !== 'user');
    if (!hasAwsSpecificNodes) return;

    // Check edges for topology rules
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;
        
        const el = findElement(id, doc, mxCells);
        if (!el) continue;
        
        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');
        
        if (!sourceId || !targetId || !awsNodes[sourceId] || !awsNodes[targetId]) continue;
        
        const source = awsNodes[sourceId];
        const target = awsNodes[targetId];
        
        // Rule 1: The Grand Bypass
        if (source.type === 'application_load_balancer' && !isInternalLb(source.value) && 
            target.type === 'application_load_balancer' && isInternalLb(target.value)) {
            reportError('TOPOLOGY_ERROR', id, `External ALB cannot bypass Web Tier and route directly to Internal ALB.`);
        }

        // Rule 4: Client -> ALB bypass (The Grand Ingress Bypass)
        if (source.type === 'user' && target.type === 'application_load_balancer' && !isInternalLb(target.value)) {
            reportError('TOPOLOGY_ERROR', id, `Direct client connections bypassing CDN/WAF to External ALB are forbidden.`);
        }

        // Rule 5: Compute -> API Gateway outbound (API Gateway Anti-Pattern)
        if (statelessComputeTypes.includes(source.type) && target.type === 'apigateway') {
            reportError('TOPOLOGY_ERROR', id, `Outbound API Gateway event targeting is forbidden. Use Task Queue (SQS) instead.`);
        }

        // Rule 6: Route 53 -> Compute direct (DNS Direct Routing Hallucination)
        if (source.type === 'route53' && statelessComputeTypes.includes(target.type)) {
            reportError('TOPOLOGY_ERROR', id, `Direct routing from Route 53 to private compute nodes is forbidden. Route 53 must target WAF/CloudFront/ALB.`);
        }

        // Rule 7: CDN -> Compute bypass (Direct CDN-to-Compute Bypass)
        if (source.type === 'cloudfront' && statelessComputeTypes.includes(target.type)) {
            reportError('TOPOLOGY_ERROR', id, `Direct connections from CloudFront to private compute nodes are forbidden.`);
        }

        // Rule 8: Reverse Proxy Routing (ALB -> APIGW/CDN)
        if (source.type === 'application_load_balancer' && (target.type === 'apigateway' || target.type === 'cloudfront')) {
            reportError('TOPOLOGY_ERROR', id, `Outbound routing from ALB to API Gateway or CDN is forbidden.`);
        }

        // Rule 9: Synchronous Ingress Constraint (ALB -> Compute must be solid request traffic)
        if (source.type === 'application_load_balancer' && statelessComputeTypes.includes(target.type)) {
            const isDashed = cell.style && (cell.style.includes('dashed=1') || cell.style.includes('strokePattern=dashed'));
            if (isDashed) {
                reportError('TOPOLOGY_ERROR', id, `Edge from Load Balancer to private compute nodes must be solid request traffic.`);
            }
        }

        // Rule 10: API Gateway to Compute Bypass (when ALB exists)
        if (source.type === 'apigateway' && statelessComputeTypes.includes(target.type)) {
            let albExists = false;
            for (const nid in awsNodes) {
                if (awsNodes[nid].type === 'application_load_balancer') {
                    albExists = true;
                    break;
                }
            }
            if (albExists) {
                reportError('TOPOLOGY_ERROR', id, `API Gateway is forbidden from routing directly to private compute nodes when an ALB is present.`);
            }
        }

        // Rule 11: WAF Bypass (WAF -> ALB/Compute bypass)
        if (source.type === 'waf' && (target.type === 'application_load_balancer' || statelessComputeTypes.includes(target.type))) {
            reportError('TOPOLOGY_ERROR', id, `WAF & Shield must route to CloudFront CDN or API Gateway, not directly to ALB or compute nodes.`);
        }
        
        // Rule 3: Stateless Horizontal Routing
        if (statelessComputeTypes.includes(source.type) && statelessComputeTypes.includes(target.type)) {
            const sourceAz = getZoneOrAZ(source.id, cells);
            const targetAz = getZoneOrAZ(target.id, cells);
            
            if (sourceAz && targetAz && sourceAz !== targetAz) {
                reportError('TOPOLOGY_ERROR', id, `Stateless compute nodes (${source.type} -> ${target.type}) cannot route horizontally across different AZs.`);
            }
        }
    }

    // Rule 2: Stranded Compute
    for (const webNodeId of webTierNodes) {
        let hasOutboundEdge = false;
        let hasInboundEdge = false;
        for (const id in cells) {
            const cell = cells[id];
            if (!cell.isEdge) continue;
            const el = findElement(id, doc, mxCells);
            if (el) {
                if (el.getAttribute('source') === webNodeId) hasOutboundEdge = true;
                if (el.getAttribute('target') === webNodeId) hasInboundEdge = true;
            }
        }
        if (!hasOutboundEdge || !hasInboundEdge) {
            reportError('TOPOLOGY_ERROR', webNodeId, `Web Tier compute node is stranded. It must receive inbound traffic from an ALB and route outbound traffic forward to the App Tier or Internal ALB.`);
        }
    }

    // Rule: Every node containing "api" or "worker" in its label/value residing in an AZ must have an explicitly defined edge targeting the DynamoDB tier (if DynamoDB is present)
    let hasDynamo = false;
    let dynamoPrimaryId = null;
    let dynamoReplicaId = null;
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        if (node.type === 'dynamodb') {
            hasDynamo = true;
            const val = (node.value || '').toLowerCase();
            const id = node.id.toLowerCase();
            if (val.includes('primary') || id.includes('primary')) {
                dynamoPrimaryId = node.id;
            } else if (val.includes('replica') || val.includes('secondary') || id.includes('replica') || id.includes('secondary')) {
                dynamoReplicaId = node.id;
            }
        }
    }

    if (hasDynamo && dynamoPrimaryId) {
        for (const id in cells) {
            const cell = cells[id];
            if (cell.isEdge || !cell.value) continue;
            
            const valLower = cell.value.toLowerCase();
            if (valLower.includes('api') || valLower.includes('worker')) {
                const azId = getZoneOrAZ(id, cells);
                
                if (azId) {
                    const isAzB = azId.endsWith('b') || azId.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b/i.test(cells[azId].value || '');
                    if (!isAzB) {
                        // AZ-A node: must connect to primary DynamoDB
                        let hasEdgeToPrimary = false;
                        for (const eid in cells) {
                            const edge = cells[eid];
                            if (edge.isEdge) {
                                const el = findElement(eid, doc, mxCells);
                                if (el && el.getAttribute('source') === id && el.getAttribute('target') === dynamoPrimaryId) {
                                    hasEdgeToPrimary = true;
                                    break;
                                }
                            }
                        }
                        if (!hasEdgeToPrimary) {
                            reportError('TOPOLOGY_ERROR', id, `Node labeled "Api" or "Worker" in AZ-A must have outbound edge to DynamoDB Primary.`);
                        }
                    } else {
                        // AZ-B node: must connect to primary DynamoDB (for write) and replica DynamoDB (for read) if replica exists
                        let hasEdgeToPrimary = false;
                        let hasEdgeToReplica = false;
                        for (const eid in cells) {
                            const edge = cells[eid];
                            if (edge.isEdge) {
                                const el = findElement(eid, doc, mxCells);
                                if (el) {
                                    if (el.getAttribute('source') === id && el.getAttribute('target') === dynamoPrimaryId) {
                                        hasEdgeToPrimary = true;
                                    }
                                    if (dynamoReplicaId && el.getAttribute('source') === id && el.getAttribute('target') === dynamoReplicaId) {
                                        hasEdgeToReplica = true;
                                    }
                                }
                            }
                        }
                        if (!hasEdgeToPrimary) {
                            reportError('TOPOLOGY_ERROR', id, `Node labeled "Api" or "Worker" in AZ-B must have outbound edge to DynamoDB Primary.`);
                        }
                        if (dynamoReplicaId && !hasEdgeToReplica) {
                            reportError('TOPOLOGY_ERROR', id, `Node labeled "Api" or "Worker" in AZ-B must have outbound edge to DynamoDB Replica.`);
                        }
                    }
                }
            }
        }
    }

    // Rule: High Availability Load Balancing (Multi-AZ target routing)
    let hasAlb = false;
    let albId = null;
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        if (node.type === 'application_load_balancer' && !isInternalLb(node.value)) {
            hasAlb = true;
            albId = node.id;
            break;
        }
    }
    if (hasAlb && albId) {
        const targetAzs = new Set();
        for (const id in cells) {
            const cell = cells[id];
            if (cell.isEdge) {
                const el = findElement(id, doc, mxCells);
                if (el && el.getAttribute('source') === albId) {
                    const targetNodeId = el.getAttribute('target');
                    const targetNode = awsNodes[targetNodeId];
                    if (targetNode && statelessComputeTypes.includes(targetNode.type)) {
                        const azId = getZoneOrAZ(targetNode.id, cells);
                        if (azId) {
                            targetAzs.add(azId);
                        } else {
                            const valLower = (targetNode.value || '').toLowerCase();
                            if (valLower.includes('az a') || valLower.includes('az-a') || valLower.includes('az_a')) {
                                targetAzs.add('az_a');
                            } else if (valLower.includes('az b') || valLower.includes('az-b') || valLower.includes('az_b')) {
                                targetAzs.add('az_b');
                            }
                        }
                    }
                }
            }
        }
        
        const allAzs = new Set();
        for (const nid in awsNodes) {
            const node = awsNodes[nid];
            if (statelessComputeTypes.includes(node.type)) {
                const azId = getZoneOrAZ(node.id, cells);
                if (azId) {
                    allAzs.add(azId);
                } else {
                    const valLower = (node.value || '').toLowerCase();
                    if (valLower.includes('az a') || valLower.includes('az-a') || valLower.includes('az_a')) {
                        allAzs.add('az_a');
                    } else if (valLower.includes('az b') || valLower.includes('az-b') || valLower.includes('az_b')) {
                        allAzs.add('az_b');
                    }
                }
            }
        }
        
        if (allAzs.size >= 2 && targetAzs.size < 2) {
            reportError('TOPOLOGY_ERROR', albId, `External ALB must route to compute targets in at least two different Availability Zones (AZs) for high availability.`);
        }
    }

    // Rule: Linear public ingress chain (Client -> WAF -> CDN -> ALB)
    let wafNode = null;
    let cdnNode = null;
    let clientNode = null;
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        if (node.type === 'waf') wafNode = node;
        if (node.type === 'cloudfront') cdnNode = node;
        if (node.type === 'user') clientNode = node;
    }
    
    if (clientNode) {
        if (wafNode) {
            let clientToWaf = false;
            const dnsNode = Object.values(awsNodes).find(n => n.type === 'route53');
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === clientNode.id) {
                        const target = el.getAttribute('target');
                        if (target === wafNode.id) {
                            clientToWaf = true;
                            break;
                        }
                        if (dnsNode && target === dnsNode.id) {
                            clientToWaf = true;
                            break;
                        }
                    }
                }
            }
            if (!clientToWaf) {
                reportError('TOPOLOGY_ERROR', clientNode.id, `Client must route to WAF & Shield first for secure public ingress.`);
            }
        }
        
        if (wafNode && cdnNode) {
            let wafToCdn = false;
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === wafNode.id && el.getAttribute('target') === cdnNode.id) {
                        wafToCdn = true;
                        break;
                    }
                }
            }
            if (!wafToCdn) {
                reportError('TOPOLOGY_ERROR', wafNode.id, `WAF & Shield must connect to CloudFront CDN for caching inspected edge traffic.`);
            }
        }
        
        if (cdnNode && hasAlb && albId) {
            let cdnToAlb = false;
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === cdnNode.id && el.getAttribute('target') === albId) {
                        cdnToAlb = true;
                        break;
                    }
                }
            }
            if (!cdnToAlb) {
                reportError('TOPOLOGY_ERROR', cdnNode.id, `CloudFront CDN must route backend requests to External Load Balancer (ALB).`);
            }
        }
    }

    // Rule: Production Ingress requires Route 53 (DNS)
    if (clientNode) {
        const hasDns = Object.values(awsNodes).some(n => n.type === 'route53');
        if (!hasDns) {
            reportError('TOPOLOGY_WARNING', clientNode.id, `Production-grade AWS architectures must include Route 53 to resolve client requests.`, 'warning');
        }
    }

    // Rule: Private compute nodes require NAT Gateway
    let hasPrivateCompute = false;
    let privateComputeNodeId = null;
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        if (statelessComputeTypes.includes(node.type)) {
            const parentCell = cells[node.parent];
            const pLbl = (parentCell && parentCell.value || '').toLowerCase();
            if (!pLbl.includes('public') && !pLbl.includes('ingress') && !pLbl.includes('dmz')) {
                hasPrivateCompute = true;
                privateComputeNodeId = node.id;
                break;
            }
        }
    }
    if (hasPrivateCompute) {
        const hasNat = Object.values(awsNodes).some(n => n.type === 'nat_gateway');
        if (!hasNat) {
            reportError('TOPOLOGY_WARNING', privateComputeNodeId, `Compute nodes in private subnets require NAT Gateway in the VPC to fetch outbound updates/packages.`, 'warning');
        }
    }

    // Rule: ECS/EKS clusters require ECR (Elastic Container Registry)
    let hasContainerCluster = false;
    let clusterNodeId = null;
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        // ecs acts as our general container cluster type
        if (node.type === 'ecs') {
            hasContainerCluster = true;
            clusterNodeId = node.id;
            break;
        }
    }
    if (hasContainerCluster) {
        const hasEcr = Object.values(awsNodes).some(n => n.type === 'ecr');
        if (!hasEcr) {
            reportError('TOPOLOGY_WARNING', clusterNodeId, `ECS/EKS clusters require Elastic Container Registry (ECR) in the account to store and pull container images.`, 'warning');
        }
    }

    // Rule: Observability requirements (CloudWatch)
    const hasObservability = Object.values(awsNodes).some(n => n.type === 'cloudwatch');
    if (!hasObservability) {
        let obsTargetId = '1';
        for (const nid in awsNodes) {
            if (statelessComputeTypes.includes(awsNodes[nid].type)) {
                obsTargetId = awsNodes[nid].id;
                break;
            }
        }
        reportError('TOPOLOGY_WARNING', obsTargetId, `Production-grade AWS architectures must include CloudWatch (Cloud Logging/Monitoring) for observability.`, 'warning');
    }

    // Rule: NAT Gateway placement validation
    for (const nid in awsNodes) {
        const node = awsNodes[nid];
        if (node.type === 'nat_gateway') {
            const parentCell = cells[node.parent];
            const pLbl = (parentCell && parentCell.value || '').toLowerCase();
            const pStyle = (parentCell && parentCell.style || '').toLowerCase();
            const isWebTier = pStyle.includes('e1d5e7') || pStyle.includes('291e2e');
            if (!pLbl.includes('public') && !pLbl.includes('ingress') && !pLbl.includes('dmz') && !isWebTier) {
                reportError('TOPOLOGY_ERROR', node.id, `NAT Gateway must be placed in a public subnet to route egress traffic.`);
            }
        }
    }
};
