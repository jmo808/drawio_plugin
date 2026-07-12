module.exports = function({ cells, mxCells, doc, reportError, nodeIds }) {
    // Helper to find parent VLAN container ID
    function getVlanId(nodeId) {
        if (!cells[nodeId]) return null;
        let currId = cells[nodeId].parent;
        while (currId && cells[currId] && currId !== '1' && currId !== '0') {
            const p = cells[currId];
            const val = (p.value || '').toLowerCase();
            if (val.includes('vlan') || (p.style && p.style.includes('network.type=vlan'))) {
                return currId;
            }
            currId = p.parent;
        }
        return null;
    }

    // Helper to check device type
    function isDeviceType(n, type) {
        if (!n) return false;
        const style = n.style || '';
        const val = (n.value || '').toLowerCase();
        return style.includes(`network.type=${type}`) || 
               val.includes(type) ||
               (style.includes('shape=mxgraph.cisco') && style.includes(type));
    }

    // Helper to check network tier
    function isTier(n, tier) {
        if (!n) return false;
        const style = n.style || '';
        const val = (n.value || '').toLowerCase();
        return style.includes(`network.tier=${tier}`) || val.includes(tier);
    }

    // Helper to check if a node is actually a network device
    function isNetworkDevice(n) {
        if (!n) return false;
        const style = n.style || '';
        const val = (n.value || '').toLowerCase();
        const NETWORK_DEVICE_TYPES = ['switch', 'router', 'firewall', 'server', 'workstation', 'wireless_ap', 'wan', 'lan'];
        return style.includes('shape=mxgraph.cisco') || 
               NETWORK_DEVICE_TYPES.some(t => style.includes(`network.type=${t}`) || val.includes(t));
    }

    // Process nodes
    if (nodeIds) {
        nodeIds.forEach(nodeId => {
            const node = cells[nodeId];
            if (node.isEdge || isDeviceType(node, 'vlan') || !isNetworkDevice(node)) return;

            // Find all connected edges
            const connectedEdges = [];
            for (const edgeId in cells) {
                const edge = cells[edgeId];
                if (!edge.isEdge) continue;

                const el = doc.getElementById(edgeId) || Array.from(mxCells).find(e => e.getAttribute('id') === edgeId);
                if (el) {
                    const s = el.getAttribute('source');
                    const t = el.getAttribute('target');
                    if (s === nodeId || t === nodeId) {
                        connectedEdges.push(edgeId);
                    }
                }
            }

            // Rule 2: ORPHAN_DEVICE
            if (connectedEdges.length === 0) {
                reportError('ORPHAN_DEVICE', nodeId, `Network device is disconnected and has no active switch or controller ports.`);
            }
        });
    }

    // Process edges & count Core-to-Distribution links
    let coreDistLinkCount = 0;
    let sampleCoreDistId = null;

    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id);
        if (!el) continue;

        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');
        const source = cells[sourceId];
        const target = cells[targetId];

        if (source && target) {
            // Core to Distribution tracking
            const isCoreS = isTier(source, 'core');
            const isDistS = isTier(source, 'distribution');
            const isCoreT = isTier(target, 'core');
            const isDistT = isTier(target, 'distribution');

            if ((isCoreS && isDistT) || (isDistS && isCoreT)) {
                coreDistLinkCount++;
                sampleCoreDistId = id;
            }

            // Rule 1: DIRECT_WAN_TO_LAN
            const isWanS = isDeviceType(source, 'wan') || (source.value && source.value.toLowerCase().includes('internet'));
            const isLanS = isDeviceType(source, 'server') || isDeviceType(source, 'workstation');
            const isWanT = isDeviceType(target, 'wan') || (target.value && target.value.toLowerCase().includes('internet'));
            const isLanT = isDeviceType(target, 'server') || isDeviceType(target, 'workstation');

            if ((isWanS && isLanT) || (isLanS && isWanT)) {
                reportError('DIRECT_WAN_TO_LAN', id, `Direct connection from WAN to private LAN server/workstation detected. Public traffic must terminate at a Firewall or Edge Router.`);
            }

            // Rule 3: VLAN_LEAK
            const sourceVlan = getVlanId(sourceId);
            const targetVlan = getVlanId(targetId);

            if (sourceVlan && targetVlan && sourceVlan !== targetVlan) {
                // VLAN leak unless routed through router/firewall
                const isRouterS = isDeviceType(source, 'router') || isDeviceType(source, 'firewall');
                const isRouterT = isDeviceType(target, 'router') || isDeviceType(target, 'firewall');
                if (!isRouterS && !isRouterT) {
                    reportError('VLAN_LEAK', id, `Direct cross-connect between different VLAN containers detected. Inter-VLAN traffic must route through a gateway switch or router.`);
                }
            }
        }
    }

    // Rule 4: REDUNDANCY_WARNING
    if (coreDistLinkCount === 1 && sampleCoreDistId) {
        reportError('REDUNDANCY_WARNING', sampleCoreDistId, `Trunk link between Core and Distribution layers lacks high-availability. Add a redundant trunk connection.`, 'warning');
    }
};
