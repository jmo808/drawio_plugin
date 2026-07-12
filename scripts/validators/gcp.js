// Helper to get GCP node type from style string or value label
function getGcpNodeType(style, value) {
    const s = (style || '').toLowerCase();
    const v = (value || '').toLowerCase();
    
    let type = null;
    const matchResIcon = s.match(/resicon=mxgraph\.gcp2\.([a-z0-9_]+)/);
    const matchShape = s.match(/shape=mxgraph\.gcp2\.([a-z0-9_]+)/);
    
    if (matchResIcon) type = matchResIcon[1];
    else if (matchShape) type = matchShape[1];
    
    // Fallback to label inspection if XML shapes aren't perfectly matched
    if (!type) {
        if (v.includes('gclb') || v.includes('load balancer') || v.includes('load balancing')) type = 'load_balancing';
        else if (v.includes('gke') || v.includes('kubernetes engine') || v.includes('kubernetes') || v.includes('gke cluster')) type = 'kubernetes_engine';
        else if (v.includes('compute engine') || v.includes('gce') || v.includes('virtual machine') || v.includes('vm')) type = 'compute_engine';
        else if (v.includes('cloud run') || v.includes('cloudrun')) type = 'cloud_run';
        else if (v.includes('cloud functions') || v.includes('gcf')) type = 'cloud_functions';
        else if (v.includes('cloud sql') || v.includes('database') || v.includes('mysql') || v.includes('postgres')) type = 'cloud_sql';
        else if (v.includes('spanner')) type = 'cloud_spanner';
        else if (v.includes('cloud storage') || v.includes('bucket') || v.includes('gcs')) type = 'cloud_storage';
        else if (v.includes('cloud dns') || v.includes('dns')) type = 'cloud_dns';
        else if (v.includes('cloud cdn') || v.includes('cdn')) type = 'cloud_cdn';
        else if (v.includes('cloud armor') || v.includes('armor') || v.includes('waf')) type = 'cloud_armor';
        else if (v.includes('client') || v.includes('user')) type = 'user';
    }
    
    if (type === 'load_balancing' || type === 'loadbalancer' || type === 'gclb') return 'load_balancing';
    if (type && (type.includes('kubernetes') || type.includes('gke'))) return 'kubernetes_engine';
    if (type && (type.includes('compute_engine') || type.includes('gce') || type.includes('virtual_machine') || type === 'vm')) return 'compute_engine';
    if (type && (type.includes('cloud_run') || type.includes('cloudrun'))) return 'cloud_run';
    if (type && (type.includes('cloud_functions') || type.includes('gcf'))) return 'cloud_functions';
    if (type && (type.includes('cloud_sql') || type.includes('database') || type.includes('mysql') || type.includes('postgres'))) return 'cloud_sql';
    if (type && type.includes('spanner')) return 'cloud_spanner';
    if (type && (type.includes('cloud_storage') || type.includes('bucket') || type.includes('gcs'))) return 'cloud_storage';
    if (type && (type.includes('cloud_dns') || type.includes('dns'))) return 'cloud_dns';
    if (type && (type.includes('cloud_cdn') || type.includes('cdn'))) return 'cloud_cdn';
    if (type && (type.includes('cloud_armor') || type.includes('armor') || type.includes('waf'))) return 'cloud_armor';
    if (type && (type.includes('user') || type.includes('client'))) return 'user';
    
    return type;
}

// Helper to determine if a load balancer is internal or external based on its label
function isInternalLb(value) {
    return value && value.toLowerCase().includes('internal');
}

module.exports = function({ cells, mxCells, doc, reportError }) {
    const statelessComputeTypes = ['kubernetes_engine', 'compute_engine', 'cloud_run', 'cloud_functions'];
    // Find all GCP nodes and categorize them
    const gcpNodes = {};
    const webTierNodes = [];
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge) continue;
        
        const type = getGcpNodeType(cell.style, cell.value);
        if (type) {
            gcpNodes[id] = { id, type, value: cell.value, parent: cell.parent };
            const parentCell = cells[cell.parent];
            if ((type === 'compute_engine' || type === 'kubernetes_engine') && 
                ((cell.value && cell.value.toLowerCase().includes('web')) || 
                 (parentCell && parentCell.value && parentCell.value.toLowerCase().includes('web')))) {
                webTierNodes.push(id);
            }
        }
    }

    // Check edges for topology rules
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;
        
        const el = doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id);
        if (!el) continue;
        
        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');
        
        if (!sourceId || !targetId || !gcpNodes[sourceId] || !gcpNodes[targetId]) continue;
        
        const source = gcpNodes[sourceId];
        const target = gcpNodes[targetId];
        
        // Rule 1: The Grand Bypass
        if (source.type === 'load_balancing' && !isInternalLb(source.value) && 
            target.type === 'load_balancing' && isInternalLb(target.value)) {
            reportError('TOPOLOGY_ERROR', id, `External GCLB cannot bypass Web/Compute Tier and route directly to Internal Load Balancer.`);
        }
 
        // Rule 2: Client -> Load Balancer bypass (Cloud Armor bypass)
        if (source.type === 'user' && target.type === 'load_balancing' && !isInternalLb(target.value)) {
            let cloudArmorExists = false;
            for (const nid in gcpNodes) {
                if (gcpNodes[nid].type === 'cloud_armor') {
                    cloudArmorExists = true;
                    break;
                }
            }
            if (cloudArmorExists) {
                reportError('TOPOLOGY_ERROR', id, `Direct client connections bypassing Cloud Armor to External Load Balancer are forbidden.`);
            }
        }
 
        // Rule 3: DNS Direct Routing
        if (source.type === 'cloud_dns' && statelessComputeTypes.includes(target.type)) {
            reportError('TOPOLOGY_ERROR', id, `Direct routing from Cloud DNS to private compute nodes is forbidden. Cloud DNS must target Cloud Armor, Cloud CDN, or GCLB.`);
        }
 
        // Rule 4: CDN -> Compute bypass
        if (source.type === 'cloud_cdn' && statelessComputeTypes.includes(target.type)) {
            reportError('TOPOLOGY_ERROR', id, `Direct connections from Cloud CDN to private compute nodes are forbidden. CDN must target Load Balancer.`);
        }

        // Rule 5: Load Balancer -> Compute must be solid request traffic
        if (source.type === 'load_balancing' && statelessComputeTypes.includes(target.type)) {
            const isDashed = cell.style && (cell.style.includes('dashed=1') || cell.style.includes('strokePattern=dashed'));
            if (isDashed) {
                reportError('TOPOLOGY_ERROR', id, `Edge from Load Balancer to compute nodes must be solid request traffic.`);
            }
        }

        // Rule 6: Cloud Armor Bypass
        if (source.type === 'cloud_armor' && (target.type === 'load_balancing' || statelessComputeTypes.includes(target.type))) {
            reportError('TOPOLOGY_ERROR', id, `Cloud Armor must route to Cloud CDN or External Load Balancer, not directly to Compute/Application nodes.`);
        }
        
        // Rule 7: Stateless Horizontal Cross-Zone Routing
        if (statelessComputeTypes.includes(source.type) && statelessComputeTypes.includes(target.type)) {
            let sourceZone = null;
            let p1 = cells[source.parent];
            while (p1 && p1.id !== "1" && p1.id !== "0") {
                if (p1.value && (p1.value.toLowerCase().includes('zone ') || p1.value.toLowerCase().includes('az '))) { 
                    sourceZone = p1.id; 
                    break; 
                }
                p1 = cells[p1.parent];
            }
            
            let targetZone = null;
            let p2 = cells[target.parent];
            while (p2 && p2.id !== "1" && p2.id !== "0") {
                if (p2.value && (p2.value.toLowerCase().includes('zone ') || p2.value.toLowerCase().includes('az '))) { 
                    targetZone = p2.id; 
                    break; 
                }
                p2 = cells[p2.parent];
            }
            
            if (sourceZone && targetZone && sourceZone !== targetZone) {
                reportError('TOPOLOGY_ERROR', id, `Stateless compute nodes (${source.type} -> ${target.type}) cannot route horizontally across different Zones.`);
            }
        }
    }

    // Rule 8: Stranded Compute
    for (const webNodeId of webTierNodes) {
        let hasOutboundEdge = false;
        let hasInboundEdge = false;
        for (const id in cells) {
            const cell = cells[id];
            if (!cell.isEdge) continue;
            const el = doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id);
            if (el) {
                if (el.getAttribute('source') === webNodeId) hasOutboundEdge = true;
                if (el.getAttribute('target') === webNodeId) hasInboundEdge = true;
            }
        }
        if (!hasOutboundEdge || !hasInboundEdge) {
            reportError('TOPOLOGY_ERROR', webNodeId, `Web compute node is stranded. It must receive inbound traffic from GCLB and route outbound traffic forward.`);
        }
    }

    // Rule 9: Cloud SQL Failover / Secondary replication edge validation
    let hasCloudSql = false;
    let sqlPrimaryId = null;
    let sqlReplicaId = null;
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
        if (node.type === 'cloud_sql') {
            hasCloudSql = true;
            const val = (node.value || '').toLowerCase();
            const id = node.id.toLowerCase();
            if (val.includes('primary') || id.includes('primary')) {
                sqlPrimaryId = node.id;
            } else if (val.includes('replica') || val.includes('failover') || id.includes('replica') || id.includes('failover')) {
                sqlReplicaId = node.id;
            }
        }
    }

    if (hasCloudSql && sqlPrimaryId) {
        for (const id in cells) {
            const cell = cells[id];
            if (cell.isEdge || !cell.value) continue;
            
            const valLower = cell.value.toLowerCase();
            if (valLower.includes('api') || valLower.includes('worker') || valLower.includes('compute')) {
                let zoneId = null;
                let p = cells[cell.parent];
                while (p && p.id !== "1" && p.id !== "0") {
                    if (p.value && (p.value.toLowerCase().includes('zone ') || p.value.toLowerCase().includes('az '))) { 
                        zoneId = p.id; 
                        break; 
                    }
                    p = cells[p.parent];
                }
                
                if (zoneId) {
                    const isZoneB = zoneId.endsWith('b') || zoneId.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b/i.test(cells[zoneId].value || '');
                    if (!isZoneB) {
                        // Zone A: must connect to primary Cloud SQL
                        let hasEdgeToPrimary = false;
                        for (const eid in cells) {
                            const edge = cells[eid];
                            if (edge.isEdge) {
                                const el = doc.getElementById(eid) || Array.from(mxCells).find(e => e.getAttribute('id') === eid);
                                if (el && el.getAttribute('source') === id && el.getAttribute('target') === sqlPrimaryId) {
                                    hasEdgeToPrimary = true;
                                    break;
                                }
                            }
                        }
                        if (!hasEdgeToPrimary) {
                            reportError('TOPOLOGY_ERROR', id, `Node residing in Zone A must have outbound edge to Cloud SQL Primary.`);
                        }
                    } else {
                        // Zone B: must connect to Cloud SQL primary and failover/replica if replica exists
                        let hasEdgeToPrimary = false;
                        let hasEdgeToReplica = false;
                        for (const eid in cells) {
                            const edge = cells[eid];
                            if (edge.isEdge) {
                                const el = doc.getElementById(eid) || Array.from(mxCells).find(e => e.getAttribute('id') === eid);
                                if (el) {
                                    if (el.getAttribute('source') === id && el.getAttribute('target') === sqlPrimaryId) {
                                        hasEdgeToPrimary = true;
                                    }
                                    if (sqlReplicaId && el.getAttribute('source') === id && el.getAttribute('target') === sqlReplicaId) {
                                        hasEdgeToReplica = true;
                                    }
                                }
                            }
                        }
                        if (!hasEdgeToPrimary) {
                            reportError('TOPOLOGY_ERROR', id, `Node residing in Zone B must have outbound edge to Cloud SQL Primary.`);
                        }
                        if (sqlReplicaId && !hasEdgeToReplica) {
                            reportError('TOPOLOGY_ERROR', id, `Node residing in Zone B must have outbound edge to Cloud SQL Replica/Failover.`);
                        }
                    }
                }
            }
        }
    }
};
