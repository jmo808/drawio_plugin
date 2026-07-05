/**
 * DiagramBuilder — Translates high-level semantic operations into mxGraphModel XML.
 * 
 * The LLM calls tools like add_container, add_node, connect, finalize.
 * This class handles all the graph physics: coordinates, styles, containment, sizing.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Style Template Registry
// ---------------------------------------------------------------------------
const CONTAINER_STYLES = {
    region: 'swimlane;startSize=24;fillColor=#f5f5f5;strokeColor=#cccccc;html=1;fontSize=12;fontStyle=1;',
    vpc: 'swimlane;startSize=24;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;fontSize=12;fontStyle=1;',
    az: 'swimlane;startSize=24;fillColor=#fff2cc;strokeColor=#d6b656;html=1;fontSize=11;fontStyle=1;',
    subnet: 'swimlane;startSize=24;fillColor=#e1d5e7;strokeColor=#9673a6;html=1;fontSize=11;fontStyle=1;dashed=1;',
    subnet_web: 'swimlane;startSize=24;fillColor=#e1d5e7;strokeColor=#9673a6;html=1;fontSize=11;fontStyle=1;',
    subnet_app: 'swimlane;startSize=24;fillColor=#d5e8d4;strokeColor=#82b366;html=1;fontSize=11;fontStyle=1;',
    subnet_data: 'swimlane;startSize=24;fillColor=#f8cecc;strokeColor=#b85450;html=1;fontSize=11;fontStyle=1;',
    group: 'group;html=1;',
    lane: 'swimlane;horizontal=0;startSize=110;fillColor=#f5f5f5;strokeColor=#666666;html=1;fontSize=12;fontStyle=1;',
};

const NODE_STYLES = {
    ec2: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    ecs: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    lambda: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    rds: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    elasticache: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticache;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    alb: 'shape=mxgraph.aws4.application_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;pointerEvents=1;html=1;',
    nlb: 'shape=mxgraph.aws4.network_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;pointerEvents=1;html=1;',
    s3: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;fillColor=#3F8624;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    cloudfront: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    apigateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    api_gateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    waf: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    nat_gateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.nat_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    endpoint: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.endpoints;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    dynamodb: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    sqs: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;fillColor=#E7157B;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    sns: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;fillColor=#E7157B;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    user: 'shape=mxgraph.aws4.user;fillColor=#5A6C86;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    internet: 'shape=mxgraph.aws4.internet_alt2;fillColor=#232F3E;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    // Generic shapes
    rectangle: 'rounded=1;whiteSpace=wrap;html=1;',
    diamond: 'rhombus;whiteSpace=wrap;html=1;',
    cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
    circle: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
    // PFD / P&ID Shapes
    pump: 'shape=mxgraph.pid.pumps.centrifugal_pump_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    compressor: 'shape=mxgraph.pid.compressors.centrifugal_compressor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    valve: 'shape=mxgraph.pid2valves.gate_valve;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    vessel: 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    cyclone: 'shape=mxgraph.pid.misc.cyclone;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    heat_exchanger: 'shape=mxgraph.pid.heat_exchangers.shell_and_tube_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
};

const EDGE_STYLES = {
    solid: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;',
    dashed: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;',
};

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------
const NODE_SIZE = { width: 78, height: 78 };
const NODE_SIZES = {
    rectangle: { width: 140, height: 60 },
    diamond: { width: 140, height: 80 },
    cylinder: { width: 100, height: 70 },
    circle: { width: 60, height: 60 },
    vessel: { width: 120, height: 180 },
    pump: { width: 100, height: 70 },
    compressor: { width: 100, height: 80 },
    valve: { width: 80, height: 50 },
    cyclone: { width: 80, height: 120 },
    heat_exchanger: { width: 120, height: 80 },
};

const NODE_SPACING = { x: 180, y: 140 };  // grid spacing within containers
const CONTAINER_PADDING = { top: 44, left: 30, right: 30, bottom: 30 };
const CONTAINER_START_SIZE = 24; // swimlane header height
const AZ_GAP = 220; // horizontal gap between AZ containers — room for ALBs + edge routing
const ALB_TYPES = new Set(['alb', 'nlb']); // node types that get center-column placement

// ---------------------------------------------------------------------------
// DiagramBuilder Class
// ---------------------------------------------------------------------------
class DiagramBuilder {
    constructor() {
        this.cells = new Map();    // id → cell object
        this.edges = new Map();    // id → edge object
        this.nextEdgeId = 1;
        this.initialized = false;
        this.title = '';
        this.type = 'architecture';
    }

    // --- Init ---
    init(title = 'Untitled', theme = 'light', type = 'architecture') {
        this.cells.clear();
        this.edges.clear();
        this.nextEdgeId = 1;
        this.title = title;
        this.type = type;
        this.initialized = true;
        // Root cells 0 and 1 are implicit in serialization
        return { success: true, message: `Diagram "${title}" initialized with type "${type}".` };
    }

    // --- Add Container ---
    addContainer(id, label, type, parentId = '1', tier = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (this.cells.has(id)) return { success: false, error: `Cell "${id}" already exists.` };
        if (parentId !== '1' && !this.cells.has(parentId)) {
            return { success: false, error: `Parent "${parentId}" not found.` };
        }

        // Resolve style
        let styleKey = type;
        if (type === 'subnet' && tier) {
            const tierKey = `subnet_${tier}`;
            if (CONTAINER_STYLES[tierKey]) styleKey = tierKey;
        }
        const style = CONTAINER_STYLES[styleKey] || CONTAINER_STYLES.group;

        // Calculate position based on siblings
        const siblings = this._childrenOf(parentId).filter(c => c.isContainer);
        const { x, y, width, height } = this._layoutContainer(type, parentId, siblings, tier);

        const cell = {
            id, label, type, style, parentId, isContainer: true, isEdge: false,
            x, y, width, height,
            childSlots: [],  // tracks which grid positions are occupied
        };

        this.cells.set(id, cell);
        return { success: true, id, message: `Container "${label}" (${type}) added to ${parentId}.` };
    }

    // --- Add Node ---
    addNode(id, label, type, parentId, variant = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (this.cells.has(id)) return { success: false, error: `Cell "${id}" already exists.` };
        if (parentId !== '1' && !this.cells.has(parentId)) {
            return { success: false, error: `Parent "${parentId}" not found.` };
        }

        // Auto-correct generic types if label implies a specific AWS resource
        const lowerLabel = (label || '').toLowerCase();
        if (lowerLabel.includes('api gateway') || lowerLabel.includes('api_gateway')) {
            type = 'apigateway';
        } else if (lowerLabel.includes('cloudfront') || lowerLabel.includes('cdn')) {
            type = 'cloudfront';
        } else if (lowerLabel.includes('task queue') || lowerLabel.includes('sqs')) {
            type = 'sqs';
        } else if (lowerLabel.includes('lambda') || lowerLabel.includes('api handler')) {
            type = 'lambda';
        } else if (lowerLabel.includes('ecs') || lowerLabel.includes('worker')) {
            type = 'ecs';
        } else if (lowerLabel.includes('rds') || lowerLabel.includes('database') || lowerLabel.includes(' db')) {
            type = 'rds';
        } else if (lowerLabel.includes('redis') || lowerLabel.includes('cache')) {
            type = 'elasticache';
        } else if (lowerLabel.includes('user') || lowerLabel.includes('client')) {
            type = 'user';
        }

        const nodeSize = NODE_SIZES[type] || NODE_SIZE;
        const style = NODE_STYLES[type] || NODE_STYLES.rectangle;
        const parent = this.cells.get(parentId);

        let x, y;

        if (parent && parent.type === 'lane') {
            const existingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const slotIndex = existingNodes.length;

            // Swimlanes have 110px header on the left. Children start at x=120, spaced by 180
            x = 120 + slotIndex * 180;
            // Center vertically within the 180px height
            y = (parent.height - nodeSize.height) / 2;
        } else if (ALB_TYPES.has(type) && parent && parent.type === 'vpc') {
            const azChildren = this._childrenOf(parentId).filter(c => c.type === 'az');
            const albSiblings = this._childrenOf(parentId).filter(c => !c.isContainer && ALB_TYPES.has(c.type));
            const albIndex = albSiblings.length;

            // Center horizontally in the VPC
            x = (parent.width - nodeSize.width) / 2;

            if (azChildren.length > 0) {
                // Position vertically based on ALB index:
                // First ALB (External): above the AZs (y=44)
                // Second ALB (Internal): between web and app tiers (~y=380)
                // Additional ALBs: stack below
                if (albIndex === 0) {
                    y = 44; // above AZ containers
                } else if (albIndex === 1) {
                    // Between web subnet bottom and app subnet top
                    y = 380;
                } else {
                    y = 44 + albIndex * 200;
                }
            } else {
                y = CONTAINER_PADDING.top + albIndex * NODE_SPACING.y;
            }
        } else if (parentId === '1' || !parent || ['region', 'group'].includes(parent.type)) {
            // Root-level or Region/Group level nodes (Users, CDN, API Gateway) — place in horizontal row at top
            // Adjust label with variant
            let fullLabel = label;
            if (variant) {
                fullLabel = `${label}&#xa;${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
            }

            const startY = (parentId === '1' || !parent) ? 10 : CONTAINER_PADDING.top;

            const cell = {
                id, label: fullLabel, type, style, parentId, isContainer: false, isEdge: false,
                x: 0, y: startY, width: nodeSize.width, height: nodeSize.height, variant,
            };
            this.cells.set(id, cell);

            // Dynamically center all non-container sibling nodes
            const siblingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const siblingContainers = this._childrenOf(parentId).filter(c => c.isContainer);
            
            let centerX = 400;
            if (parentId === '1' || !parent) {
                const vpc = siblingContainers.find(c => c.type === 'vpc');
                centerX = vpc ? (vpc.x + vpc.width / 2) : 600;
            } else {
                centerX = parent.width / 2;
            }

            const totalWidth = siblingNodes.length * NODE_SPACING.x;
            const startX = centerX - totalWidth / 2;

            siblingNodes.forEach((n, idx) => {
                const nSize = NODE_SIZES[n.type] || NODE_SIZE;
                n.x = startX + idx * NODE_SPACING.x + (NODE_SPACING.x - nSize.width) / 2;
                n.y = startY;
            });

            return { success: true, id, message: `Node "${label}" (${type}) placed horizontally in ${parentId}.` };
        } else {
            // Standard grid placement within parent
            const existingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const slotIndex = existingNodes.length;

            const maxCols = parent
                ? Math.max(1, Math.floor((parent.width - CONTAINER_PADDING.left - CONTAINER_PADDING.right) / NODE_SPACING.x))
                : 3;
            const col = slotIndex % maxCols;
            const row = Math.floor(slotIndex / maxCols);

            x = CONTAINER_PADDING.left + col * NODE_SPACING.x + (NODE_SPACING.x - nodeSize.width) / 2;
            y = CONTAINER_PADDING.top + row * NODE_SPACING.y + (NODE_SPACING.y - nodeSize.height) / 2;
        }

        // Adjust label with variant
        let fullLabel = label;
        if (variant) {
            fullLabel = `${label}&#xa;${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
        }

        const cell = {
            id, label: fullLabel, type, style, parentId, isContainer: false, isEdge: false,
            x, y, width: nodeSize.width, height: nodeSize.height, variant,
        };

        this.cells.set(id, cell);

        // Auto-expand parent if needed
        if (parent) this._autoExpand(parentId);

        return { success: true, id, message: `Node "${label}" (${type}) placed in ${parentId}.` };
    }

    // --- Connect ---
    connect(sourceId, targetId, label = '', style = 'solid', color = null, exitPort = null, entryPort = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(sourceId) && sourceId !== '1') {
            return { success: false, error: `Source "${sourceId}" not found.` };
        }
        if (!this.cells.has(targetId) && targetId !== '1') {
            return { success: false, error: `Target "${targetId}" not found.` };
        }

        const sourceNode = this.cells.get(sourceId);
        const targetNode = this.cells.get(targetId);

        // 1. Automatic Async Polling/Messaging Styles
        if (sourceNode && targetNode) {
            const isBroker = (n) => ['sqs', 'sns', 'eventbridge'].includes(n.type);
            const isCompute = (n) => ['ecs', 'ec2', 'lambda'].includes(n.type);
            if ((isBroker(sourceNode) && isCompute(targetNode)) || (isCompute(sourceNode) && isBroker(targetNode))) {
                style = 'dashed';
            }
        }

        // Check for duplicate
        for (const [eId, edge] of this.edges) {
            if (edge.sourceId === sourceId && edge.targetId === targetId) {
                return { success: false, error: `Edge from "${sourceId}" to "${targetId}" already exists (${eId}).` };
            }
        }

        const edgeId = `e_${this.nextEdgeId++}`;
        let edgeStyle = EDGE_STYLES[style] || EDGE_STYLES.solid;
        if (color) edgeStyle += `strokeColor=${color};`;
        if (label) edgeStyle += 'labelBackgroundColor=#ffffff;';

        if (exitPort) {
            let px = 0.5, py = 0.5;
            if (exitPort === 'top') { px = 0.5; py = 0; }
            else if (exitPort === 'bottom') { px = 0.5; py = 1; }
            else if (exitPort === 'left') { px = 0; py = 0.5; }
            else if (exitPort === 'right') { px = 1; py = 0.5; }
            edgeStyle += `exitX=${px};exitY=${py};exitPerimeter=0;`;
        }
        if (entryPort) {
            let px = 0.5, py = 0.5;
            if (entryPort === 'top') { px = 0.5; py = 0; }
            else if (entryPort === 'bottom') { px = 0.5; py = 1; }
            else if (entryPort === 'left') { px = 0; py = 0.5; }
            else if (entryPort === 'right') { px = 1; py = 0.5; }
            edgeStyle += `entryX=${px};entryY=${py};entryPerimeter=0;`;
        }

        const edge = {
            id: edgeId, sourceId, targetId, label, style: edgeStyle, isEdge: true,
        };

        this.edges.set(edgeId, edge);
        
        // --- Atomic Transactions Post-Processing ---
        if (sourceNode && targetNode) {
            const isCompute = (n) => ['ecs', 'ec2', 'lambda'].includes(n.type);
            
            // 2. Cross-AZ Writes for Replica Reads
            if (isCompute(sourceNode) && targetNode.type === 'rds' && this._isReplica(targetNode)) {
                let primaryRds = null;
                for (const [, cell] of this.cells) {
                    if (cell.type === 'rds' && this._isPrimary(cell)) {
                        primaryRds = cell;
                        break;
                    }
                }
                if (primaryRds) {
                    let hasWriteEdge = false;
                    for (const [, e] of this.edges) {
                        if (e.sourceId === sourceId && e.targetId === primaryRds.id) {
                            hasWriteEdge = true;
                            break;
                        }
                    }
                    if (!hasWriteEdge) {
                        this.connect(sourceId, primaryRds.id, 'Read/Write', 'solid', color, exitPort, entryPort);
                    }
                }
            }

            // 3. Cache Replication paired with Database Replication
            if (sourceNode.type === 'rds' && targetNode.type === 'rds' && style === 'dashed') {
                if (this._isPrimary(sourceNode) && this._isReplica(targetNode)) {
                    
                    const getAz = (cell) => {
                        let curr = cell;
                        while(curr && curr.parentId && curr.parentId !== '1') {
                            if (curr.type === 'az') return curr;
                            curr = this.cells.get(curr.parentId);
                        }
                        return null;
                    };
                    
                    const primaryAz = getAz(sourceNode);
                    const replicaAz = getAz(targetNode);
                    
                    if (primaryAz && replicaAz) {
                        let cacheA = null;
                        let cacheB = null;
                        for (const [, cell] of this.cells) {
                            if (cell.type === 'elasticache' && getAz(cell) === primaryAz) cacheA = cell;
                            if (cell.type === 'elasticache' && getAz(cell) === replicaAz) cacheB = cell;
                        }
                        
                        if (cacheA && cacheB) {
                            let hasCacheRep = false;
                            for (const [, e] of this.edges) {
                                if (e.sourceId === cacheA.id && e.targetId === cacheB.id) {
                                    hasCacheRep = true;
                                    break;
                                }
                            }
                            if (!hasCacheRep) {
                                this.connect(cacheA.id, cacheB.id, 'Async Replication', 'dashed', color, exitPort, entryPort);
                            }
                        }
                    }
                }
            }
        }

        return { success: true, id: edgeId, message: `Edge: ${sourceId} → ${targetId}${label ? ` (${label})` : ''}` };
    }

    // --- Disconnect ---
    disconnect(sourceId, targetId) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        let removed = 0;
        for (const [eId, edge] of this.edges) {
            if (edge.sourceId === sourceId && edge.targetId === targetId) {
                this.edges.delete(eId);
                removed++;
            }
        }

        if (removed === 0) {
            return { success: false, error: `No edge from "${sourceId}" to "${targetId}" found.` };
        }
        return { success: true, message: `Removed ${removed} edge(s) from "${sourceId}" to "${targetId}".` };
    }

    // --- Connect Tiers ---
    connectTiers(sourceTier, targetTier, label = '', style = 'solid') {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const sourceNodes = this._nodesByTier(sourceTier);
        const targetNodes = this._nodesByTier(targetTier);

        if (sourceNodes.length === 0) return { success: false, error: `No nodes found in tier "${sourceTier}".` };
        if (targetNodes.length === 0) return { success: false, error: `No nodes found in tier "${targetTier}".` };

        const results = [];
        for (const src of sourceNodes) {
            for (const tgt of targetNodes) {
                const r = this.connect(src.id, tgt.id, label, style);
                results.push(r);
            }
        }

        const successes = results.filter(r => r.success).length;
        return { success: true, message: `Connected ${successes} edges from tier "${sourceTier}" to tier "${targetTier}".`, details: results };
    }

    // --- Connect HA Compute to Data ---
    connectHaComputeToData(computeId, primaryDbId, replicaDbId, primaryCacheId = null, replicaCacheId = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(computeId)) return { success: false, error: `Compute node "${computeId}" not found.` };
        if (!this.cells.has(primaryDbId)) return { success: false, error: `Primary DB "${primaryDbId}" not found.` };
        if (!this.cells.has(replicaDbId)) return { success: false, error: `Replica DB "${replicaDbId}" not found.` };

        const results = [];
        const hasEdge = (src, tgt) => {
            for (const [, e] of this.edges) {
                if (e.sourceId === src && e.targetId === tgt) return true;
            }
            return false;
        };

        // 1. Connect compute to Replica DB (Read Only)
        if (!hasEdge(computeId, replicaDbId)) {
            results.push(this.connect(computeId, replicaDbId, 'Read Only', 'solid'));
        }

        // 2. Connect compute to Primary DB (Read/Write)
        if (!hasEdge(computeId, primaryDbId)) {
            results.push(this.connect(computeId, primaryDbId, 'Read/Write', 'solid'));
        }

        // 3. Connect Primary DB to Replica DB (Async Replication)
        if (!hasEdge(primaryDbId, replicaDbId)) {
            results.push(this.connect(primaryDbId, replicaDbId, 'Async Replication', 'dashed'));
        }

        // 4. Handle Cache connections if provided
        if (primaryCacheId && replicaCacheId) {
            if (this.cells.has(primaryCacheId) && this.cells.has(replicaCacheId)) {
                // Connect Primary Cache to Replica Cache (Async Replication)
                if (!hasEdge(primaryCacheId, replicaCacheId)) {
                    results.push(this.connect(primaryCacheId, replicaCacheId, 'Async Replication', 'dashed'));
                }

                // Helper to get AZ container ID for a node
                const getAz = (cellId) => {
                    let curr = this.cells.get(cellId);
                    while (curr && curr.parentId && curr.parentId !== '1') {
                        if (curr.type === 'az') return curr.id;
                        curr = this.cells.get(curr.parentId);
                    }
                    return null;
                };

                const computeAz = getAz(computeId);
                const primaryCacheAz = getAz(primaryCacheId);
                const replicaCacheAz = getAz(replicaCacheId);

                // Connect compute to local cache (Cache Access)
                if (computeAz && computeAz === primaryCacheAz) {
                    if (!hasEdge(computeId, primaryCacheId)) {
                        results.push(this.connect(computeId, primaryCacheId, 'Cache Access', 'solid'));
                    }
                } else if (computeAz && computeAz === replicaCacheAz) {
                    if (!hasEdge(computeId, replicaCacheId)) {
                        results.push(this.connect(computeId, replicaCacheId, 'Cache Access', 'solid'));
                    }
                }
            }
        }

        const successes = results.filter(r => r.success).length;
        return {
            success: true,
            message: `HA Compute-to-Data macro completed: ${successes} new connections established.`,
            details: results
        };
    }

    // --- Provision HA Data Tier ---
    provisionHaDataTier(primaryAzComputeId, secondaryAzComputeId, dataResourceType) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(primaryAzComputeId)) return { success: false, error: `Primary compute node "${primaryAzComputeId}" not found.` };
        if (!this.cells.has(secondaryAzComputeId)) return { success: false, error: `Secondary compute node "${secondaryAzComputeId}" not found.` };

        // Find data nodes
        let primaryData = null;
        let replicaData = null;
        
        for (const [, cell] of this.cells) {
            if (cell.type === dataResourceType) {
                if (this._isPrimary(cell)) {
                    primaryData = cell;
                } else if (this._isReplica(cell)) {
                    replicaData = cell;
                }
            }
        }

        if (!primaryData) return { success: false, error: `Primary ${dataResourceType} node not found (missing variant: "primary").` };
        if (!replicaData) return { success: false, error: `Replica ${dataResourceType} node not found (missing variant: "replica").` };

        const results = [];
        const hasEdge = (src, tgt) => {
            for (const [, e] of this.edges) {
                if (e.sourceId === src && e.targetId === tgt) return true;
            }
            return false;
        };

        if (dataResourceType === 'rds') {
            // 1. Primary compute -> Primary DB (Read/Write)
            if (!hasEdge(primaryAzComputeId, primaryData.id)) {
                results.push(this.connect(primaryAzComputeId, primaryData.id, 'Read/Write', 'solid'));
            }
            // 2. Secondary compute -> Replica DB (Read Only)
            if (!hasEdge(secondaryAzComputeId, replicaData.id)) {
                results.push(this.connect(secondaryAzComputeId, replicaData.id, 'Read Only', 'solid'));
            }
            // 3. Secondary compute -> Primary DB (Read/Write) [Cross-AZ Write]
            if (!hasEdge(secondaryAzComputeId, primaryData.id)) {
                results.push(this.connect(secondaryAzComputeId, primaryData.id, 'Read/Write', 'solid'));
            }
            // 4. Primary DB -> Replica DB (Async Replication)
            if (!hasEdge(primaryData.id, replicaData.id)) {
                results.push(this.connect(primaryData.id, replicaData.id, 'Async Replication', 'dashed'));
            }
        } else if (dataResourceType === 'elasticache') {
            // 1. Primary compute -> Primary Cache (Cache Access)
            if (!hasEdge(primaryAzComputeId, primaryData.id)) {
                results.push(this.connect(primaryAzComputeId, primaryData.id, 'Cache Access', 'solid'));
            }
            // 2. Secondary compute -> Replica Cache (Cache Access)
            if (!hasEdge(secondaryAzComputeId, replicaData.id)) {
                results.push(this.connect(secondaryAzComputeId, replicaData.id, 'Cache Access', 'solid'));
            }
            // 3. Primary Cache -> Replica Cache (Async Replication)
            if (!hasEdge(primaryData.id, replicaData.id)) {
                results.push(this.connect(primaryData.id, replicaData.id, 'Async Replication', 'dashed'));
            }
        }

        const successes = results.filter(r => r.success).length;
        return {
            success: true,
            message: `HA ${dataResourceType} data tier provisioned: ${successes} new connections established.`,
            details: results
        };
    }

    // --- Get State ---
    getState() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const containers = [];
        const nodes = [];

        for (const [id, cell] of this.cells) {
            if (cell.isContainer) {
                containers.push({
                    id: cell.id,
                    label: cell.label,
                    type: cell.type,
                    parent: cell.parentId,
                    x: cell.x,
                    y: cell.y,
                    width: cell.width,
                    height: cell.height,
                    children: this._childrenOf(cell.id).map(c => c.id),
                });
            } else {
                nodes.push({
                    id: cell.id,
                    label: cell.label,
                    type: cell.type,
                    parent: cell.parentId,
                    x: cell.x,
                    y: cell.y,
                    width: cell.width,
                    height: cell.height,
                    variant: cell.variant || null,
                });
            }
        }

        const edges = [];
        for (const [id, edge] of this.edges) {
            edges.push({
                id: edge.id,
                source: edge.sourceId,
                target: edge.targetId,
                label: edge.label || '',
            });
        }

        return {
            success: true,
            title: this.title,
            containers,
            nodes,
            edges,
            summary: `${containers.length} containers, ${nodes.length} nodes, ${edges.length} edges`,
        };
    }

    // --- Validate ---
    validate() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const xml = this.toXml();
        const tmpFile = path.join(require('os').tmpdir(), `drawio-builder-${Date.now()}.xml`);
        fs.writeFileSync(tmpFile, xml, 'utf8');

        try {
            const validateScript = path.join(__dirname, 'validate.js');
            const devRoot = path.join(__dirname, '..');
            const result = execSync(`node "${validateScript}" "${tmpFile}"`, {
                stdio: 'pipe',
                cwd: devRoot,
                env: Object.assign({}, process.env, {
                    NODE_PATH: path.join(devRoot, 'node_modules'),
                }),
            });
            return { success: true, message: 'Validation passed. No issues found.', output: result.toString() };
        } catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : '';
            const stderr = error.stderr ? error.stderr.toString() : '';
            return { success: false, error: 'Validation failed.', details: (stdout + '\n' + stderr).trim() };
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
    }

    // --- Finalize (returns XML string — wrapper handles forwarding) ---
    finalize() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        this._applyTopologicalCorrections();

        const validation = this.validate();
        if (!validation.success) {
            return { success: false, error: 'Cannot finalize — validation failed.', details: validation.details };
        }

        return { success: true, xml: this.toXml(), type: this.type, message: 'Diagram validated and ready.' };
    }

    // --- Serialize to XML ---
    toXml() {
        const lines = [];
        lines.push('<mxGraphModel>');
        lines.push('  <root>');
        lines.push('    <mxCell id="0"/>');
        lines.push('    <mxCell id="1" parent="0"/>');

        // Serialize containers (depth-first by parent chain)
        const sortedCells = this._topologicalSort();
        for (const cell of sortedCells) {
            if (cell.isContainer) {
                lines.push(`    <mxCell id="${this._esc(cell.id)}" value="${this._esc(cell.label)}" style="${this._esc(cell.style)}" vertex="1" parent="${this._esc(cell.parentId)}">`);
                lines.push(`      <mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry"/>`);
                lines.push('    </mxCell>');
            } else {
                lines.push(`    <mxCell id="${this._esc(cell.id)}" value="${this._esc(cell.label)}" style="${this._esc(cell.style)}" vertex="1" parent="${this._esc(cell.parentId)}">`);
                lines.push(`      <mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry"/>`);
                lines.push('    </mxCell>');
            }
        }

        // Serialize edges
        for (const [, edge] of this.edges) {
            const valueAttr = edge.label ? ` value="${this._esc(edge.label)}"` : '';
            lines.push(`    <mxCell id="${this._esc(edge.id)}"${valueAttr} edge="1" parent="1" source="${this._esc(edge.sourceId)}" target="${this._esc(edge.targetId)}" style="${this._esc(edge.style)}">`);
            lines.push('      <mxGeometry relative="1" as="geometry"/>');
            lines.push('    </mxCell>');
        }

        lines.push('  </root>');
        lines.push('</mxGraphModel>');
        return lines.join('\n') + '\n';
    }

    // --- Internal Helpers ---

    _childrenOf(parentId) {
        const children = [];
        for (const [, cell] of this.cells) {
            if (cell.parentId === parentId) children.push(cell);
        }
        return children;
    }

    _nodesByTier(tierQuery) {
        const q = tierQuery.toLowerCase();
        const results = [];
        for (const [, cell] of this.cells) {
            if (cell.isContainer) continue;
            // Match by type name
            if (cell.type === q) { results.push(cell); continue; }
            // Match by label
            if (cell.label && cell.label.toLowerCase().includes(q)) { results.push(cell); continue; }
            // Match by parent label/type (e.g., "web" matches nodes in a web subnet)
            const parent = this.cells.get(cell.parentId);
            if (parent && parent.label && parent.label.toLowerCase().includes(q)) {
                results.push(cell);
            }
        }
        return results;
    }

    _layoutContainer(type, parentId, siblings, tier) {
        const parent = this.cells.get(parentId);

        if (type === 'region') {
            return { x: 20, y: 40, width: 1280, height: 300 };
        }

        if (type === 'vpc') {
            return { x: 40, y: 180, width: 1200, height: 300 };
        }

        if (type === 'az') {
            const azIndex = siblings.filter(s => s.type === 'az').length;
            const azWidth = 460;
            // First AZ at x=20, second AZ at x=20+460+AZ_GAP=700
            const x = 20 + azIndex * (azWidth + AZ_GAP);
            return { x, y: 160, width: azWidth, height: 200 };
        }

        if (type === 'subnet' || type.startsWith('subnet_')) {
            // Stack subnets vertically within AZ
            const subnetSiblings = siblings.filter(s => s.type === 'subnet' || s.type.startsWith('subnet_'));
            const parentWidth = parent ? parent.width : 460;

            // Determine height based on tier
            let height;
            if (tier === 'public') height = 60;
            else if (tier === 'data') height = 260;  // taller: more room for nodes + routing
            else height = 160;  // web/app subnets

            // Stack vertically: accumulate heights of existing subnets
            let y = CONTAINER_PADDING.top;
            for (const s of subnetSiblings) {
                y = Math.max(y, s.y + s.height + 24); // 24px gap between subnets
            }

            return {
                x: 20,
                y,
                width: parentWidth - 40,
                height,
            };
        }

        if (type === 'lane') {
            const laneSiblings = siblings.filter(s => s.type === 'lane');
            const parentWidth = parent ? parent.width : 1200;
            let y = CONTAINER_PADDING.top;
            for (const s of laneSiblings) {
                y = Math.max(y, s.y + s.height + 20);
            }
            return { x: 20, y, width: parentWidth - 40, height: 180 };
        }

        // Generic container
        const idx = siblings.length;
        const defaultWidth = parent ? Math.max(300, parent.width - 40) : 400;
        let y = CONTAINER_PADDING.top;
        for (const s of siblings) {
            y = Math.max(y, s.y + s.height + 24);
        }
        return { x: 20, y, width: defaultWidth, height: 220 };
    }

    _autoExpand(parentId) {
        const parent = this.cells.get(parentId);
        if (!parent || !parent.isContainer) return;

        const children = this._childrenOf(parentId);
        if (children.length === 0) return;

        let maxBottom = 0;
        let maxRight = 0;
        for (const child of children) {
            const bottom = child.y + child.height;
            const right = child.x + child.width;
            if (bottom > maxBottom) maxBottom = bottom;
            if (right > maxRight) maxRight = right;
        }

        let bottomPadding = CONTAINER_PADDING.bottom;
        if (parent.type === 'vpc') {
            bottomPadding = 100; // extra padding at bottom of VPC for horizontal cross-AZ routing
        }
        const neededHeight = maxBottom + bottomPadding;
        const neededWidth = maxRight + CONTAINER_PADDING.right;

        let heightChanged = false;
        const oldHeight = parent.height;

        if (neededHeight > parent.height) {
            parent.height = neededHeight;
            heightChanged = true;
        }
        if (neededWidth > parent.width) {
            parent.width = neededWidth;
        }

        // If parent height changed, shift siblings below it (if they exist)
        if (heightChanged && parent.parentId && parent.parentId !== '1') {
            this._shiftSiblingsBelow(parent.parentId, parent.id, oldHeight, parent.height);
        }

        // Recursively expand ancestors
        if (parent.parentId && parent.parentId !== '1') {
            this._autoExpand(parent.parentId);
        }
    }

    _shiftSiblingsBelow(parentId, expandedContainerId, oldHeight, newHeight) {
        const diff = newHeight - oldHeight;
        if (diff <= 0) return;
        const expanded = this.cells.get(expandedContainerId);
        const siblings = this._childrenOf(parentId).filter(c => c.isContainer && c.id !== expandedContainerId);
        for (const sibling of siblings) {
            if (sibling.y > expanded.y) {
                sibling.y += diff;
            }
        }
    }

    _topologicalSort() {
        // Sort cells so parents come before children
        const sorted = [];
        const visited = new Set();

        const visit = (id) => {
            if (visited.has(id)) return;
            visited.add(id);
            const cell = this.cells.get(id);
            if (!cell) return;
            if (cell.parentId !== '1' && this.cells.has(cell.parentId)) {
                visit(cell.parentId);
            }
            sorted.push(cell);
        };

        for (const [id] of this.cells) {
            visit(id);
        }
        return sorted;
    }

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _isPrimary(cell) {
        if (!cell) return false;
        const v = (cell.variant || '').toLowerCase();
        const id = (cell.id || '').toLowerCase();
        const lbl = (cell.label || '').toLowerCase();
        
        if (v.includes('primary')) return true;
        if (id.includes('primary') || id.endsWith('a') || id.endsWith('1')) return true;
        if (lbl.includes('primary') || lbl.endsWith(' a') || lbl.endsWith(' 1')) return true;
        return false;
    }

    _isReplica(cell) {
        if (!cell) return false;
        const v = (cell.variant || '').toLowerCase();
        const id = (cell.id || '').toLowerCase();
        const lbl = (cell.label || '').toLowerCase();
        
        if (v.includes('replica') || v.includes('secondary')) return true;
        if (id.includes('replica') || id.includes('secondary') || id.endsWith('b') || id.endsWith('2')) return true;
        if (lbl.includes('replica') || lbl.includes('secondary') || lbl.endsWith(' b') || lbl.endsWith(' 2')) return true;
        return false;
    }

    _applyTopologicalCorrections() {
        const isCompute = (n) => ['ecs', 'ec2', 'lambda'].includes(n.type);
        const isBroker = (n) => ['sqs', 'sns', 'eventbridge'].includes(n.type);

        const getAz = (cell) => {
            let curr = cell;
            while (curr && curr.parentId && curr.parentId !== '1') {
                if (curr.type === 'az') return curr;
                curr = this.cells.get(curr.parentId);
            }
            return null;
        };

        const hasEdge = (srcId, tgtId) => {
            for (const [, e] of this.edges) {
                if ((e.sourceId === srcId && e.targetId === tgtId) || (e.sourceId === tgtId && e.targetId === srcId)) return true;
            }
            return false;
        };

        // 1. Force dashed style for broker-to-compute edges
        for (const [, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt) {
                if ((isBroker(src) && isCompute(tgt)) || (isCompute(src) && isBroker(tgt))) {
                    if (!edge.style.includes('dashed=1')) {
                        edge.style += 'dashed=1;';
                    }
                }
            }
        }

        // 2. Cross-AZ Writes for Replica Reads
        for (const [, cell] of this.cells) {
            if (isCompute(cell)) {
                let replicaRds = null;
                for (const [, target] of this.cells) {
                    if (target.type === 'rds' && this._isReplica(target)) {
                        if (hasEdge(cell.id, target.id)) {
                            replicaRds = target;
                            break;
                        }
                    }
                }

                if (replicaRds) {
                    let primaryRds = null;
                    for (const [, target] of this.cells) {
                        if (target.type === 'rds' && this._isPrimary(target)) {
                            primaryRds = target;
                            break;
                        }
                    }

                    if (primaryRds && !hasEdge(cell.id, primaryRds.id)) {
                        this.connect(cell.id, primaryRds.id, 'Read/Write', 'solid');
                    }
                }
            }
        }

        // 3. Cache Replication paired with Database Replication
        let primaryRds = null;
        let replicaRds = null;
        for (const [, cell] of this.cells) {
            if (cell.type === 'rds') {
                if (this._isPrimary(cell)) primaryRds = cell;
                if (this._isReplica(cell)) replicaRds = cell;
            }
        }

        if (primaryRds && replicaRds && hasEdge(primaryRds.id, replicaRds.id)) {
            const primaryAz = getAz(primaryRds);
            const replicaAz = getAz(replicaRds);

            if (primaryAz && replicaAz) {
                let cacheA = null;
                let cacheB = null;
                for (const [, cell] of this.cells) {
                    if (cell.type === 'elasticache') {
                        const cellAz = getAz(cell);
                        if (cellAz && cellAz.id === primaryAz.id) cacheA = cell;
                        if (cellAz && cellAz.id === replicaAz.id) cacheB = cell;
                    }
                }

                if (cacheA && cacheB && !hasEdge(cacheA.id, cacheB.id)) {
                    this.connect(cacheA.id, cacheB.id, 'Async Replication', 'dashed');
                }
            }
        }

        // 4. Merge duplicate ALBs (Double ALB Spaghetti Correction)
        const albs = [];
        for (const [, cell] of this.cells) {
            if (cell.type === 'alb' || cell.type === 'nlb') {
                albs.push(cell);
            }
        }
        if (albs.length > 1) {
            const keepAlb = albs[0];
            keepAlb.label = keepAlb.label.replace(/ A$/, '').replace(/ B$/, '').replace(/ [12]$/, '');

            // Reparent to the VPC to span the AZs
            let vpcCell = null;
            for (const [, cell] of this.cells) {
                if (cell.type === 'vpc') {
                    vpcCell = cell;
                    break;
                }
            }

            if (vpcCell) {
                keepAlb.parentId = vpcCell.id;
                keepAlb.x = (vpcCell.width - keepAlb.width) / 2;
                keepAlb.y = 204 + (183 - keepAlb.height) / 2; // aligned with public subnets
            } else {
                const parentCell = this.cells.get(keepAlb.parentId);
                if (parentCell) {
                    keepAlb.x = (parentCell.width - keepAlb.width) / 2;
                    keepAlb.y = (parentCell.height - keepAlb.height) / 2;
                }
            }

            for (let i = 1; i < albs.length; i++) {
                const discardAlb = albs[i];
                for (const [, edge] of this.edges) {
                    if (edge.sourceId === discardAlb.id) edge.sourceId = keepAlb.id;
                    if (edge.targetId === discardAlb.id) edge.targetId = keepAlb.id;
                }
                this.cells.delete(discardAlb.id);
            }
        }

        // 5. Delete horizontal compute-to-compute edges across AZs
        const edgesToDelete = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && isCompute(src) && isCompute(tgt)) {
                const srcAz = getAz(src);
                const tgtAz = getAz(tgt);
                if (srcAz && tgtAz && srcAz.id !== tgtAz.id) {
                    edgesToDelete.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToDelete) {
            this.edges.delete(edgeId);
        }

        // 6. Ingress Routing Correction (Bypass, CDN & API Gateway path alignment)
        let clientNode = null;
        let cdnNode = null;
        let apigwNode = null;
        let albNode = null;
        for (const [, cell] of this.cells) {
            if (cell.type === 'user') clientNode = cell;
            if (cell.type === 'cloudfront') cdnNode = cell;
            if (cell.type === 'apigateway' || cell.type === 'endpoint') apigwNode = cell;
            if (cell.type === 'alb' || cell.type === 'nlb') albNode = cell;
        }

        if (clientNode && cdnNode && albNode) {
            for (const [, edge] of this.edges) {
                if (edge.sourceId === clientNode.id && edge.targetId === albNode.id) {
                    if (apigwNode) {
                        edge.sourceId = apigwNode.id;
                    } else {
                        edge.sourceId = cdnNode.id;
                    }
                    edge.label = 'Forward';
                }
            }

            // Reroute CloudFront -> Compute bypass directly to API Gateway / ALB
            for (const [, edge] of this.edges) {
                if (edge.sourceId === cdnNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && isCompute(tgt)) {
                        if (apigwNode) {
                            edge.targetId = apigwNode.id;
                        } else {
                            edge.targetId = albNode.id;
                        }
                        edge.label = 'Forward';
                    }
                }
            }

            if (apigwNode) {
                let hasCdnToApigw = false;
                let hasApigwToAlb = false;

                for (const [, edge] of this.edges) {
                    if (edge.sourceId === cdnNode.id && edge.targetId === albNode.id) {
                        edge.targetId = apigwNode.id;
                        edge.label = 'Forward';
                        hasCdnToApigw = true;
                    }
                    if (edge.sourceId === cdnNode.id && edge.targetId === apigwNode.id) {
                        hasCdnToApigw = true;
                    }
                    if (edge.sourceId === apigwNode.id && edge.targetId === albNode.id) {
                        hasApigwToAlb = true;
                    }
                }

                if (hasCdnToApigw && !hasApigwToAlb) {
                    this.connect(apigwNode.id, albNode.id, 'Forward', 'solid');
                }
            }
        }

        // 7. Event Flow & API Gateway Target Correction
        let sqsNode = null;
        for (const [, cell] of this.cells) {
            if (cell.type === 'sqs' || cell.type === 'sns' || cell.type === 'eventbridge') {
                sqsNode = cell;
                break;
            }
        }

        const edgesToPurge = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && isCompute(src) && (tgt.type === 'apigateway' || tgt.type === 'endpoint')) {
                const lbl = (edge.label || '').toLowerCase();
                if (lbl.includes('publish') || lbl.includes('event') || lbl.includes('log') || lbl.includes('queue')) {
                    if (sqsNode) {
                        edge.targetId = sqsNode.id;
                        edge.label = 'Publish Event Logs';
                        if (!edge.style.includes('dashed=1')) {
                            edge.style += 'dashed=1;';
                        }
                    }
                } else {
                    edgesToPurge.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToPurge) {
            this.edges.delete(edgeId);
        }

        // 8. DNS Direct Routing / Route 53 Hallucination Correction
        let r53Node = null;
        let nextIngressNode = null;
        
        for (const [, cell] of this.cells) {
            if (cell.type === 'route53') r53Node = cell;
            if (!nextIngressNode && cell.type === 'waf') nextIngressNode = cell;
        }
        
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && cell.type === 'cloudfront') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && cell.type === 'apigateway') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && (cell.type === 'alb' || cell.type === 'nlb')) nextIngressNode = cell;
            }
        }
        
        if (r53Node && nextIngressNode) {
            for (const [, edge] of this.edges) {
                if (edge.sourceId === r53Node.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && (isCompute(tgt) || tgt.type === 'alb' || tgt.type === 'nlb' || tgt.type === 'apigateway' || tgt.type === 'endpoint')) {
                        if (tgt.id !== nextIngressNode.id) {
                            edge.targetId = nextIngressNode.id;
                            edge.label = 'Route Traffic';
                        }
                    }
                }
            }
        }
    }
}

module.exports = { DiagramBuilder, NODE_STYLES, CONTAINER_STYLES, EDGE_STYLES };
