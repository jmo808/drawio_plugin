const EDGE_STYLES = {
    solid: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;',
    dashed: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;'
};

class GcpCorrector {
    afterLayout(builder, ctx) {
        this._correctDNSRouting(builder, ctx);
        this._correctNATRouting(builder, ctx);
        this._correctDatabaseTier(builder, ctx);
    }

    _correctDNSRouting(builder, ctx) {
        let dnsNode = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'cloud_dns') {
                dnsNode = cell;
                break;
            }
        }
        if (!dnsNode) return;

        let nextIngressNode = null;
        for (const [, cell] of builder.cells) {
            if (!nextIngressNode && cell.type === 'cloud_armor') nextIngressNode = cell;
        }
        if (!nextIngressNode) {
            for (const [, cell] of builder.cells) {
                if (!nextIngressNode && cell.type === 'cloud_cdn') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of builder.cells) {
                if (!nextIngressNode && cell.type === 'load_balancing') nextIngressNode = cell;
            }
        }

        let clientNode = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'user' || cell.id.toLowerCase().includes('client') || (cell.label || '').toLowerCase().includes('client')) {
                clientNode = cell;
                break;
            }
        }

        if (nextIngressNode) {
            for (const [, edge] of builder.edges) {
                if (edge.sourceId === dnsNode.id) {
                    const tgt = builder.cells.get(edge.targetId);
                    if (tgt && tgt.id !== nextIngressNode.id) {
                        edge.targetId = nextIngressNode.id;
                        edge.label = 'Route Traffic';
                    }
                }
            }

            if (!ctx.hasEdge(dnsNode.id, nextIngressNode.id)) {
                builder.connect(dnsNode.id, nextIngressNode.id, 'Route Traffic', 'solid');
            }

            if (clientNode && !ctx.hasEdge(clientNode.id, dnsNode.id)) {
                builder.connect(clientNode.id, dnsNode.id, 'Resolve Domain', 'solid');
            }
        }
    }

    _correctNATRouting(builder, ctx) {
        let natNode = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'cloud_nat') {
                natNode = cell;
                break;
            }
        }
        if (!natNode) return;

        let pubSubnet = null;
        for (const [, cell] of builder.cells) {
            if (cell.isContainer && (cell.type === 'subnet' || cell.id.toLowerCase().includes('subnet'))) {
                const idLower = cell.id.toLowerCase();
                const labelLower = (cell.label || '').toLowerCase();
                if (idLower.includes('pub') || idLower.includes('public') || idLower.includes('ingress') ||
                    labelLower.includes('pub') || labelLower.includes('public') || labelLower.includes('ingress')) {
                    pubSubnet = cell;
                    break;
                }
            }
        }

        if (pubSubnet && natNode.parentId !== pubSubnet.id) {
            natNode.parentId = pubSubnet.id;
            builder._autoExpand(pubSubnet.id);
        }

        for (const [, edge] of builder.edges) {
            if (edge.sourceId === natNode.id || edge.targetId === natNode.id) {
                edge.style = EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;';
            }
        }
    }

    _correctDatabaseTier(builder, ctx) {
        let primaryDb = null;
        let replicaDb = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'cloud_sql' || cell.type === 'cloud_spanner') {
                if (builder._isPrimary(cell)) primaryDb = cell;
                if (builder._isReplica(cell)) replicaDb = cell;
            }
        }

        if (!primaryDb || !replicaDb) return;

        const existingDbEdges = [];
        for (const [edgeId, edge] of builder.edges) {
            const tgt = builder.cells.get(edge.targetId);
            if (tgt && (tgt.type === 'cloud_sql' || tgt.type === 'cloud_spanner')) {
                existingDbEdges.push(edgeId);
            }
        }
        for (const edgeId of existingDbEdges) {
            builder.edges.delete(edgeId);
        }

        const replicationEdges = [];
        for (const [edgeId, edge] of builder.edges) {
            const lbl = (edge.label || '').toLowerCase();
            if (lbl.includes('replication')) {
                replicationEdges.push(edgeId);
            }
        }
        for (const edgeId of replicationEdges) {
            builder.edges.delete(edgeId);
        }

        for (const [, cell] of builder.cells) {
            if (ctx.isCompute(cell)) {
                const az = ctx.getAz(cell);
                const isAzB = az && (az.id.endsWith('b') || az.id.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b|us-east-1b/i.test(az.label || ''));

                if (!isAzB) {
                    let style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    builder.connect(cell.id, primaryDb.id, 'Read/Write', style);
                } else {
                    const readLbl = 'Read Only';
                    let readStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    builder.connect(cell.id, replicaDb.id, readLbl, readStyle);
                    
                    const writeLbl = 'Read/Write';
                    let writeStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    
                    const isWeb = cell.id.toLowerCase().includes('web') || (cell.label || '').toLowerCase().includes('web');
                    const entryY = isWeb ? 0.35 : 0.65;
                    writeStyle += `exitX=0;exitY=0.5;exitPerimeter=0;entryX=1;entryY=${entryY};entryPerimeter=0;`;
                    const connRes = builder.connect(cell.id, primaryDb.id, writeLbl, writeStyle);
                    
                    if (connRes.success) {
                        const createdEdge = builder.edges.get(connRes.id);
                        if (createdEdge) {
                            const srcCoords = ctx.getAbsoluteCoords(cell);
                            const tgtCoords = ctx.getAbsoluteCoords(primaryDb);
                            const dbAbsCoords = tgtCoords;
                            const routeY = Math.max(
                                dbAbsCoords.y + (primaryDb.height || 78) + 20,
                                srcCoords.y + (cell.height || 68) + 20
                            );
                            createdEdge.points = [
                                { x: srcCoords.x, y: routeY },
                                { x: tgtCoords.x + (primaryDb.width || 78), y: routeY }
                            ];
                        }
                    }
                }
            }
        }

        const dbRepRes = builder.connect(primaryDb.id, replicaDb.id, 'Async Replication', EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;');
        if (dbRepRes.success) {
            const createdEdge = builder.edges.get(dbRepRes.id);
            if (createdEdge) {
                const srcCoords = ctx.getAbsoluteCoords(primaryDb);
                const tgtCoords = ctx.getAbsoluteCoords(replicaDb);
                const repWaypointY = srcCoords.y + (primaryDb.height || 78) + 20;
                createdEdge.points = [
                    { x: srcCoords.x + (primaryDb.width || 78) / 2, y: repWaypointY },
                    { x: tgtCoords.x + (replicaDb.width || 78) / 2, y: repWaypointY }
                ];
            }
        }
    }
}

module.exports = GcpCorrector;
