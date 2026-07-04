// Helper to get AWS node type from style string
function getAwsNodeType(style) {
    if (!style) return null;
    const match = style.match(/resIcon=mxgraph\.aws4\.([a-zA-Z0-9_]+)/);
    if (match) return match[1];
    if (style.includes('shape=mxgraph.aws4.application_load_balancer') || style.includes('resIcon=mxgraph.aws4.application_load_balancer')) return 'application_load_balancer';
    return null;
}

// Helper to determine if an ALB is internal or external based on its value/label
function isInternalAlb(value) {
    return value && value.toLowerCase().includes('internal');
}

module.exports = function({ cells, mxCells, doc, reportError }) {
    // Find all AWS nodes and categorize them
    const awsNodes = {};
    const webTierNodes = [];
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge) continue;
        
        const type = getAwsNodeType(cell.style);
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
        
        // Rule 3: Stateless Horizontal Routing
        const statelessComputeTypes = ['ec2', 'ecs', 'lambda'];
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
