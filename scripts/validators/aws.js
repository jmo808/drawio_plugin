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
    
    return type;
}

// Helper to determine if an ALB is internal or external based on its value/label
function isInternalAlb(value) {
    return value && value.toLowerCase().includes('internal');
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

    // Check edges for topology rules
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;
        
        const el = doc.getElementById(id) || mxCells[Array.from(mxCells).findIndex(e => e.getAttribute('id') === id)];
        if (!el) continue;
        
        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');
        
        if (!sourceId || !targetId || !awsNodes[sourceId] || !awsNodes[targetId]) continue;
        
        const source = awsNodes[sourceId];
        const target = awsNodes[targetId];
        
        // Rule 1: The Grand Bypass
        if (source.type === 'application_load_balancer' && !isInternalAlb(source.value) && 
            target.type === 'application_load_balancer' && isInternalAlb(target.value)) {
            reportError('TOPOLOGY_ERROR', id, `External ALB cannot bypass Web Tier and route directly to Internal ALB.`);
        }

        // Rule 4: Client -> ALB bypass (The Grand Ingress Bypass)
        if (source.type === 'user' && target.type === 'application_load_balancer' && !isInternalAlb(target.value)) {
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
        
        // Rule 3: Stateless Horizontal Routing
        if (statelessComputeTypes.includes(source.type) && statelessComputeTypes.includes(target.type)) {
            let sourceAz = null;
            let p1 = cells[source.parent];
            while (p1 && p1.id !== "1" && p1.id !== "0") {
                if (p1.value && p1.value.toLowerCase().includes('az ')) { sourceAz = p1.id; break; }
                p1 = cells[p1.parent];
            }
            
            let targetAz = null;
            let p2 = cells[target.parent];
            while (p2 && p2.id !== "1" && p2.id !== "0") {
                if (p2.value && p2.value.toLowerCase().includes('az ')) { targetAz = p2.id; break; }
                p2 = cells[p2.parent];
            }
            
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
            const el = doc.getElementById(id) || mxCells[Array.from(mxCells).findIndex(e => e.getAttribute('id') === id)];
            if (el) {
                if (el.getAttribute('source') === webNodeId) hasOutboundEdge = true;
                if (el.getAttribute('target') === webNodeId) hasInboundEdge = true;
            }
        }
        if (!hasOutboundEdge || !hasInboundEdge) {
            reportError('TOPOLOGY_ERROR', webNodeId, `Web Tier compute node is stranded. It must receive inbound traffic from an ALB and route outbound traffic forward to the App Tier or Internal ALB.`);
        }
    }
};
