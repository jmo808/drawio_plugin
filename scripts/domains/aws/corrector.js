const EDGE_STYLES = {
    solid: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;',
    dashed: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;'
};

class AwsCorrector {
    afterLayout(builder, ctx) {
        this._forceDashedBrokerEdges(builder, ctx);
        this._correctDatabaseTier(builder, ctx);
        this._correctEventFlow(builder, ctx);
        this._correctDNSRouting(builder, ctx);
        this._correctNATRouting(builder, ctx);
    }

    _forceDashedBrokerEdges(builder, ctx) {
        for (const [, edge] of builder.edges) {
            const src = builder.cells.get(edge.sourceId);
            const tgt = builder.cells.get(edge.targetId);
            if (src && tgt) {
                if ((ctx.isBroker(src) && ctx.isCompute(tgt)) || (ctx.isCompute(src) && ctx.isBroker(tgt))) {
                    edge.style = EDGE_STYLES.dashed;
                    if (edge.label) edge.style += 'labelBackgroundColor=#ffffff;';

                    if (src.type === 'eventbridge' || tgt.type === 'eventbridge') {
                        const compNode = ctx.isCompute(src) ? src : tgt;
                        const ebNode = src.type === 'eventbridge' ? src : tgt;
                        const srcCoords = ctx.getAbsoluteCoords(compNode);
                        const tgtCoords = ctx.getAbsoluteCoords(ebNode);

                        const compAz = ctx.getAz(compNode);
                        let waypointY;
                        if (compAz) {
                            const azCoords = ctx.getAbsoluteCoords(compAz);
                            waypointY = azCoords.y - 30;
                        } else {
                            waypointY = tgtCoords.y - 30;
                        }

                        edge.style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        edge.points = [
                            { x: srcCoords.x + (compNode.width || 78) / 2, y: waypointY },
                            { x: tgtCoords.x + (ebNode.width || 78) / 2, y: waypointY }
                        ];
                    }
                }
            }
        }
    }

    _correctDatabaseTier(builder, ctx) {
        let primaryDb = null;
        let replicaDb = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'rds' || cell.type === 'dynamodb') {
                if (builder._isPrimary(cell)) primaryDb = cell;
                if (builder._isReplica(cell)) replicaDb = cell;
            }
        }

        if (!primaryDb || !replicaDb) return;

        const existingDbEdges = [];
        for (const [edgeId, edge] of builder.edges) {
            const tgt = builder.cells.get(edge.targetId);
            if (tgt && (tgt.type === 'rds' || tgt.type === 'dynamodb')) {
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
                    if (primaryDb.type === 'dynamodb') {
                        style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                    }
                    builder.connect(cell.id, primaryDb.id, 'Read/Write', style);
                } else {
                    const readLbl = primaryDb.type === 'dynamodb' ? 'Read Local' : 'Read Only';
                    let readStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    if (primaryDb.type === 'dynamodb') {
                        readStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                    }
                    builder.connect(cell.id, replicaDb.id, readLbl, readStyle);
                    
                    const writeLbl = primaryDb.type === 'dynamodb' ? 'Write Cross-AZ' : 'Read/Write';
                    let writeStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    if (primaryDb.type === 'rds') {
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
                    } else {
                        writeStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        builder.connect(cell.id, primaryDb.id, writeLbl, writeStyle);
                    }
                }
            }
        }

        if (primaryDb && primaryDb.type === 'dynamodb') {
            for (const [, cell] of builder.cells) {
                if (cell.isContainer || !cell.label) continue;
                const labelLower = cell.label.toLowerCase();
                if (labelLower.includes('api') || labelLower.includes('worker')) {
                    const az = ctx.getAz(cell);
                    if (az) {
                        const isAzB = az.id.endsWith('b') || az.id.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b|us-east-1b/i.test(az.label || '');
                        if (!isAzB) {
                            if (!ctx.hasEdge(cell.id, primaryDb.id)) {
                                let style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                builder.connect(cell.id, primaryDb.id, 'Read/Write', style);
                            }
                        } else {
                            if (replicaDb && !ctx.hasEdge(cell.id, replicaDb.id)) {
                                let readStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                readStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                builder.connect(cell.id, replicaDb.id, 'Read Local', readStyle);
                            }
                            if (!ctx.hasEdge(cell.id, primaryDb.id)) {
                                let writeStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                writeStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                builder.connect(cell.id, primaryDb.id, 'Write Cross-AZ', writeStyle);
                            }
                        }
                    }
                }
            }
        }

        const dbRepRes = builder.connect(primaryDb.id, replicaDb.id, 'Async Replication', EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;');
        if (dbRepRes.success && primaryDb.type === 'rds') {
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

        let primaryCache = null;
        let replicaCache = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'elasticache') {
                if (builder._isPrimary(cell)) primaryCache = cell;
                if (builder._isReplica(cell)) replicaCache = cell;
            }
        }
        if (primaryCache && replicaCache) {
            const cacheRepRes = builder.connect(primaryCache.id, replicaCache.id, 'Async Replication', EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;');
            if (cacheRepRes.success) {
                const createdEdge = builder.edges.get(cacheRepRes.id);
                if (createdEdge) {
                    const srcCoords = ctx.getAbsoluteCoords(primaryCache);
                    const tgtCoords = ctx.getAbsoluteCoords(replicaCache);
                    const cacheRepY = srcCoords.y + (primaryCache.height || 78) + 20;
                    createdEdge.points = [
                        { x: srcCoords.x + (primaryCache.width || 78) / 2, y: cacheRepY },
                        { x: tgtCoords.x + (replicaCache.width || 78) / 2, y: cacheRepY }
                    ];
                }
            }
        }
    }

    _correctEventFlow(builder, ctx) {
        let sqsNode = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'sqs' || cell.type === 'sns') {
                sqsNode = cell;
                break;
            }
        }

        const edgesToPurge = [];
        for (const [edgeId, edge] of builder.edges) {
            const src = builder.cells.get(edge.sourceId);
            const tgt = builder.cells.get(edge.targetId);
            if (src && tgt && ctx.isCompute(src) && (tgt.type === 'apigateway' || tgt.type === 'endpoint')) {
                const lbl = (edge.label || '').toLowerCase();
                if (lbl.includes('publish') || lbl.includes('event') || lbl.includes('log') || lbl.includes('queue')) {
                    if (sqsNode) {
                        edge.targetId = sqsNode.id;
                        edge.label = 'Publish Event Logs';
                        edge.style = EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;';
                    }
                } else {
                    edgesToPurge.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToPurge) {
            builder.edges.delete(edgeId);
        }

        if (sqsNode) {
            const badSqsEdges = [];
            for (const [edgeId, edge] of builder.edges) {
                if (edge.targetId === sqsNode.id) {
                    const src = builder.cells.get(edge.sourceId);
                    if (src && !ctx.isCompute(src)) {
                        badSqsEdges.push(edgeId);
                    }
                }
                if (edge.sourceId === sqsNode.id) {
                    const tgt = builder.cells.get(edge.targetId);
                    if (tgt && !ctx.isCompute(tgt)) {
                        badSqsEdges.push(edgeId);
                    }
                }
            }
            for (const edgeId of badSqsEdges) {
                builder.edges.delete(edgeId);
            }
        }

        if (sqsNode) {
            for (const [, cell] of builder.cells) {
                if (!ctx.isCompute(cell)) continue;
                const isWeb = cell.id.toLowerCase().includes('web') || cell.label.toLowerCase().includes('web');
                const isWorker = cell.id.toLowerCase().includes('worker') || cell.label.toLowerCase().includes('worker');

                if (isWeb && !ctx.hasEdge(cell.id, sqsNode.id)) {
                    builder.connect(cell.id, sqsNode.id, 'Publish Event Logs', 'dashed', null, 'top', 'bottom');
                }
                if (isWorker && !ctx.hasEdge(sqsNode.id, cell.id)) {
                    builder.connect(sqsNode.id, cell.id, 'Poll Tasks', 'dashed', null, 'bottom', 'top');
                }
            }

            let sqsWaypointY = 620;
            for (const [, cell] of builder.cells) {
                if (cell.isContainer && (cell.type === 'subnet' || cell.type.startsWith('subnet_'))) {
                    const subCoords = ctx.getAbsoluteCoords(cell);
                    const subBottom = subCoords.y + cell.height;
                    if (subBottom + 20 > sqsWaypointY) sqsWaypointY = subBottom + 20;
                }
                if (!cell.isContainer && ctx.isCompute(cell)) {
                    const compCoords = ctx.getAbsoluteCoords(cell);
                    const compBottom = compCoords.y + (cell.height || 68);
                    if (compBottom + 20 > sqsWaypointY) sqsWaypointY = compBottom + 20;
                }
            }

            for (const [, edge] of builder.edges) {
                if (edge.sourceId === sqsNode.id || edge.targetId === sqsNode.id) {
                    const src = builder.cells.get(edge.sourceId);
                    const tgt = builder.cells.get(edge.targetId);
                    if (src && tgt) {
                        edge.style = edge.style
                            .replace(/exitX=[^;]+;/g, '')
                            .replace(/exitY=[^;]+;/g, '')
                            .replace(/entryX=[^;]+;/g, '')
                            .replace(/entryY=[^;]+;/g, '')
                            .replace(/exitPerimeter=[^;]+;/g, '')
                            .replace(/entryPerimeter=[^;]+;/g, '');
                        
                        if (edge.sourceId === sqsNode.id) {
                            edge.style += 'exitX=0.5;exitY=1;exitPerimeter=0;entryX=0.5;entryY=0;entryPerimeter=0;';
                        } else {
                            edge.style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        }

                        const srcCoords = ctx.getAbsoluteCoords(src);
                        const tgtCoords = ctx.getAbsoluteCoords(tgt);
                        const srcX = srcCoords.x + (src.width || 78) / 2;
                        const tgtX = tgtCoords.x + (tgt.width || 78) / 2;
                        
                        edge.points = [
                            { x: srcX, y: sqsWaypointY },
                            { x: tgtX, y: sqsWaypointY }
                        ];
                    }
                }
            }
        }
    }

    _correctDNSRouting(builder, ctx) {
        let dnsNode = null;
        for (const [, cell] of builder.cells) {
            if (cell.type === 'route53') {
                dnsNode = cell;
                break;
            }
        }
        if (!dnsNode) return;

        let nextIngressNode = null;
        for (const [, cell] of builder.cells) {
            if (!nextIngressNode && cell.type === 'waf') nextIngressNode = cell;
        }
        if (!nextIngressNode) {
            for (const [, cell] of builder.cells) {
                if (!nextIngressNode && cell.type === 'cloudfront') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of builder.cells) {
                if (!nextIngressNode && cell.type === 'apigateway') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of builder.cells) {
                if (!nextIngressNode && (cell.type === 'alb' || cell.type === 'nlb')) nextIngressNode = cell;
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
            if (cell.type === 'nat_gateway') {
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
}

module.exports = AwsCorrector;
