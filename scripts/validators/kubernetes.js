module.exports = function({ cells, mxCells, doc, reportError, nodeIds }) {
    // Helper to find parent namespace/deployment container
    function getContainerTypeAndId(nodeId) {
        if (!cells[nodeId]) return null;
        let currId = cells[nodeId].parent;
        while (currId && cells[currId] && currId !== '1' && currId !== '0') {
            const p = cells[currId];
            const style = p.style || '';
            const val = (p.value || '').toLowerCase();
            if (style.includes('deployment') || val.includes('deployment')) {
                return { type: 'deployment', id: currId };
            }
            if (style.includes('namespace') || val.includes('namespace')) {
                return { type: 'namespace', id: currId };
            }
            currId = p.parent;
        }
        return null;
    }

    // Helper to find the namespace ID of any node
    function getNamespaceId(nodeId) {
        if (!cells[nodeId]) return null;
        let currId = cells[nodeId].parent;
        while (currId && cells[currId] && currId !== '1' && currId !== '0') {
            const p = cells[currId];
            const val = (p.value || '').toLowerCase();
            if (val.includes('namespace') || (p.style && p.style.includes('namespace'))) {
                return currId;
            }
            currId = p.parent;
        }
        return null;
    }

    // Helper to check if a node is of a specific K8s type
    function isK8sType(n, type) {
        if (!n) return false;
        const style = n.style || '';
        const val = (n.value || '').toLowerCase();
        return style.includes(`kubernetes.type=${type}`) || 
               (style.includes('mxgraph.kubernetes') && (style.includes(type) || val.includes(type))) ||
               val.includes(type);
    }

    // Process nodes
    if (nodeIds) {
        nodeIds.forEach(nodeId => {
            const node = cells[nodeId];
            if (node.isEdge) return;

            // Rule 1: ORPHAN_POD
            if (isK8sType(node, 'pod')) {
                const container = getContainerTypeAndId(nodeId);
                if (!container) {
                    reportError('ORPHAN_POD', nodeId, `Pod is not nested inside any Deployment or Namespace container. Kubernetes pods must reside within deployment or namespace boundaries.`);
                }
            }

            // Rule 2: SERVICE_WITHOUT_TARGET
            if (isK8sType(node, 'service')) {
                let targetFound = false;
                for (const edgeId in cells) {
                    const edge = cells[edgeId];
                    if (!edge.isEdge) continue;

                    const el = doc.getElementById(edgeId) || Array.from(mxCells).find(e => e.getAttribute('id') === edgeId);
                    if (el) {
                        const s = el.getAttribute('source');
                        const t = el.getAttribute('target');
                        if (s === nodeId) {
                            const targetNode = cells[t];
                            if (targetNode && (isK8sType(targetNode, 'pod') || isK8sType(targetNode, 'deployment'))) {
                                targetFound = true;
                                break;
                            }
                        }
                    }
                }
                if (!targetFound) {
                    reportError('SERVICE_WITHOUT_TARGET', nodeId, `Service does not target/connect to any Pod or Deployment. Services must route traffic to backend workloads.`);
                }
            }

            // Rule 4: PVC_WITHOUT_PV
            if (isK8sType(node, 'pvc')) {
                let pvFound = false;
                for (const edgeId in cells) {
                    const edge = cells[edgeId];
                    if (!edge.isEdge) continue;

                    const el = doc.getElementById(edgeId) || Array.from(mxCells).find(e => e.getAttribute('id') === edgeId);
                    if (el) {
                        const s = el.getAttribute('source');
                        const t = el.getAttribute('target');
                        if (s === nodeId || t === nodeId) {
                            const peerId = (s === nodeId) ? t : s;
                            const peerNode = cells[peerId];
                            if (peerNode && isK8sType(peerNode, 'pv') && !isK8sType(peerNode, 'pvc')) {
                                pvFound = true;
                                break;
                            }
                        }
                    }
                }
                if (!pvFound) {
                    reportError('PVC_WITHOUT_PV', nodeId, `PersistentVolumeClaim is not bound or connected to any PersistentVolume. Storage claims must be bound to a PV backing store.`);
                }
            }
        });
    }

    // Process edges
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
            // Rule 3: INGRESS_BYPASS
            if (isK8sType(source, 'ingress') && isK8sType(target, 'pod')) {
                reportError('INGRESS_BYPASS', id, `Ingress connects directly to Pod ${targetId}, bypassing the Service layer. External traffic must route through a Service for load balancing and discovery.`);
            }

            // Rule 5: NAMESPACE_LEAK
            if (isK8sType(source, 'pod') && isK8sType(target, 'pod')) {
                const sourceNs = getNamespaceId(sourceId);
                const targetNs = getNamespaceId(targetId);
                if (sourceNs && targetNs && sourceNs !== targetNs) {
                    reportError('NAMESPACE_LEAK', id, `Direct cross-namespace pod connection detected from ${sourceId} to ${targetId}. Pods in different namespaces must communicate through Services or Ingress boundaries to preserve namespace isolation.`);
                }
            }
        }
    }
};
