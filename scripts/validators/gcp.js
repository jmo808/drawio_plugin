const { findElement, getEdgesForNode, getZoneOrAZ, isInternalLb } = require('./validator-utils');

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
        else if (v.includes('artifact registry') || v.includes('container registry') || v.includes('registry')) type = 'artifact_registry';
        else if (v.includes('nat') || v.includes('router') || v.includes('cloud router')) type = 'cloud_nat';
        else if (v.includes('logging') || v.includes('monitoring') || v.includes('operations suite') || v.includes('ops suite') || v.includes('observability')) type = 'operations_suite';
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
    if (type && (type.includes('artifact_registry') || type.includes('registry') || type.includes('artifact registry'))) return 'artifact_registry';
    if (type && (type.includes('cloud_nat') || type.includes('nat') || type.includes('router'))) return 'cloud_nat';
    if (type && (type.includes('operations_suite') || type.includes('logging') || type.includes('monitoring') || type.includes('ops_suite'))) return 'operations_suite';
    if (type && (type.includes('user') || type.includes('client'))) return 'user';
    
    return type;
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

    const hasGcpSpecificNodes = Object.values(gcpNodes).some(n => n.type !== 'user');
    if (!hasGcpSpecificNodes) {
        return; // Skip validation for non-GCP diagrams
    }

    // Check edges for topology rules
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;
        
        const el = findElement(id, doc, mxCells);
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

        // Rule 6: Cloud Armor direct to Compute bypass
        if (source.type === 'cloud_armor' && statelessComputeTypes.includes(target.type)) {
            reportError('TOPOLOGY_ERROR', id, `Cloud Armor must not route directly to compute nodes. Route through Cloud CDN and/or External Load Balancer.`);
        }
        
        // Rule 7: Stateless Horizontal Cross-Zone Routing
        if (statelessComputeTypes.includes(source.type) && statelessComputeTypes.includes(target.type)) {
            const sourceZone = getZoneOrAZ(source.id, cells);
            const targetZone = getZoneOrAZ(target.id, cells);
            
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
            const el = findElement(id, doc, mxCells);
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
                const zoneId = getZoneOrAZ(id, cells);
                
                if (zoneId) {
                    const isZoneB = zoneId.endsWith('b') || zoneId.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b/i.test(cells[zoneId].value || '');
                    if (!isZoneB) {
                        // Zone A: must connect to primary Cloud SQL
                        let hasEdgeToPrimary = false;
                        for (const eid in cells) {
                            const edge = cells[eid];
                            if (edge.isEdge) {
                                const el = findElement(eid, doc, mxCells);
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
                                const el = findElement(eid, doc, mxCells);
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

    // Rule 10: High Availability Load Balancing (Multi-Zone target routing)
    let hasGclb = false;
    let gclbId = null;
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
        if (node.type === 'load_balancing' && !isInternalLb(node.value)) {
            hasGclb = true;
            gclbId = node.id;
            break;
        }
    }
    if (hasGclb && gclbId) {
        const targetZones = new Set();
        for (const id in cells) {
            const cell = cells[id];
            if (cell.isEdge) {
                const el = findElement(id, doc, mxCells);
                if (el && el.getAttribute('source') === gclbId) {
                    const targetNodeId = el.getAttribute('target');
                    const targetNode = gcpNodes[targetNodeId];
                    if (targetNode && statelessComputeTypes.includes(targetNode.type)) {
                        const zoneId = getZoneOrAZ(targetNode.id, cells);
                        if (zoneId) {
                            targetZones.add(zoneId);
                        } else {
                            const valLower = (targetNode.value || '').toLowerCase();
                            if (valLower.includes('zone a') || valLower.includes('zone-a') || valLower.includes('zone_a')) {
                                targetZones.add('zone_a');
                            } else if (valLower.includes('zone b') || valLower.includes('zone-b') || valLower.includes('zone_b')) {
                                targetZones.add('zone_b');
                            }
                        }
                    }
                }
            }
        }
        
        const allZones = new Set();
        for (const nid in gcpNodes) {
            const node = gcpNodes[nid];
            if (statelessComputeTypes.includes(node.type)) {
                const zoneId = getZoneOrAZ(node.id, cells);
                if (zoneId) {
                    allZones.add(zoneId);
                } else {
                    const valLower = (node.value || '').toLowerCase();
                    if (valLower.includes('zone a') || valLower.includes('zone-a') || valLower.includes('zone_a')) {
                        allZones.add('zone_a');
                    } else if (valLower.includes('zone b') || valLower.includes('zone-b') || valLower.includes('zone_b')) {
                        allZones.add('zone_b');
                    }
                }
            }
        }
        
        if (allZones.size >= 2 && targetZones.size < 2) {
            reportError('TOPOLOGY_ERROR', gclbId, `GCLB must route to compute targets in at least two different Zones/Availability Zones for high availability.`);
        }
    }

    // Rule 11: Linear public ingress chain (Client -> Armor -> CDN -> GCLB)
    let armorNode = null;
    let cdnNode = null;
    let clientNode = null;
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
        if (node.type === 'cloud_armor') armorNode = node;
        if (node.type === 'cloud_cdn') cdnNode = node;
        if (node.type === 'user') clientNode = node;
    }
    
    if (clientNode) {
        if (armorNode) {
            let clientToArmor = false;
            // The ingress spine corrector builds: client→dns→waf→cdn→lb
            // Accept either client→armor directly OR client→dns (when DNS routes to armor)
            const dnsNode = Object.values(gcpNodes).find(n => n.type === 'cloud_dns');
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === clientNode.id) {
                        const target = el.getAttribute('target');
                        if (target === armorNode.id) {
                            clientToArmor = true;
                            break;
                        }
                        if (dnsNode && target === dnsNode.id) {
                            // Client routes to DNS first, which is valid if DNS routes to armor
                            clientToArmor = true;
                            break;
                        }
                    }
                }
            }
            if (!clientToArmor) {
                reportError('TOPOLOGY_ERROR', clientNode.id, `Client must route to Cloud Armor (WAF) first for secure public ingress.`);
            }
        }
        
        if (armorNode && cdnNode) {
            let armorToCdn = false;
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === armorNode.id && el.getAttribute('target') === cdnNode.id) {
                        armorToCdn = true;
                        break;
                    }
                }
            }
            if (!armorToCdn) {
                reportError('TOPOLOGY_ERROR', armorNode.id, `Cloud Armor must connect to Cloud CDN for caching inspected edge traffic.`);
            }
        }
        
        if (cdnNode && hasGclb && gclbId) {
            let cdnToGclb = false;
            for (const id in cells) {
                const cell = cells[id];
                if (cell.isEdge) {
                    const el = findElement(id, doc, mxCells);
                    if (el && el.getAttribute('source') === cdnNode.id && el.getAttribute('target') === gclbId) {
                        cdnToGclb = true;
                        break;
                    }
                }
            }
            if (!cdnToGclb) {
                reportError('TOPOLOGY_ERROR', cdnNode.id, `Cloud CDN must route backend requests to External HTTP Load Balancer (GCLB).`);
            }
        }
    }

    // Rule 12: Production Ingress requires Cloud DNS
    if (clientNode) {
        const hasDns = Object.values(gcpNodes).some(n => n.type === 'cloud_dns');
        if (!hasDns) {
            reportError('TOPOLOGY_ERROR', clientNode.id, `Production-grade GCP architectures must include Cloud DNS to resolve client requests.`);
        }
    }

    // Rule 13: Private compute nodes require Cloud NAT
    let hasPrivateCompute = false;
    let privateComputeNodeId = null;
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
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
        const hasCloudNat = Object.values(gcpNodes).some(n => n.type === 'cloud_nat');
        if (!hasCloudNat) {
            reportError('TOPOLOGY_ERROR', privateComputeNodeId, `Compute nodes in private subnets require Cloud NAT/Router in the VPC to fetch outbound updates/packages.`);
        }
    }

    // Rule 14: GKE clusters require Artifact Registry
    let hasGke = false;
    let gkeNodeId = null;
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
        if (node.type === 'kubernetes_engine') {
            hasGke = true;
            gkeNodeId = node.id;
            break;
        }
    }
    if (hasGke) {
        const hasRegistry = Object.values(gcpNodes).some(n => n.type === 'artifact_registry');
        if (!hasRegistry) {
            reportError('TOPOLOGY_ERROR', gkeNodeId, `GKE clusters require Artifact Registry in the project to store and pull container images.`);
        }
    }

    // Rule 15: Observability requirements
    const hasObservability = Object.values(gcpNodes).some(n => n.type === 'operations_suite');
    if (!hasObservability) {
        let obsTargetId = '1';
        for (const nid in gcpNodes) {
            if (statelessComputeTypes.includes(gcpNodes[nid].type)) {
                obsTargetId = gcpNodes[nid].id;
                break;
            }
        }
        reportError('TOPOLOGY_ERROR', obsTargetId, `Production-grade GCP architectures must include Cloud Operations Suite (Cloud Logging/Monitoring) for observability.`);
    }

    // Rule 16: Cloud NAT placement validation
    for (const nid in gcpNodes) {
        const node = gcpNodes[nid];
        if (node.type === 'cloud_nat') {
            const parentCell = cells[node.parent];
            const pLbl = (parentCell && parentCell.value || '').toLowerCase();
            const pStyle = (parentCell && parentCell.style || '').toLowerCase();
            // Accept if parent label suggests public/ingress/dmz,
            // or if parent style matches the web/ingress subnet colors (e1d5e7 = light mode purple)
            const isWebTier = pStyle.includes('e1d5e7') || pStyle.includes('291e2e');
            if (!pLbl.includes('public') && !pLbl.includes('ingress') && !pLbl.includes('dmz') && !isWebTier) {
                reportError('TOPOLOGY_ERROR', node.id, `Cloud NAT must be placed in a public subnet (e.g. Public Ingress Subnet) to route egress traffic.`);
            }
        }
    }
};
