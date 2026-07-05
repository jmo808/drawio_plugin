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
        } else if (parentId === '1' || !parent) {
            // Root-level nodes (Users, Internet, etc.) — place above the VPC
            // Adjust label with variant
            let fullLabel = label;
            if (variant) {
                fullLabel = `${label}&#xa;${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
            }

            const cell = {
                id, label: fullLabel, type, style, parentId, isContainer: false, isEdge: false,
                x: 0, y: 10, width: nodeSize.width, height: nodeSize.height, variant,
            };
            this.cells.set(id, cell);

            // Dynamically center all root-level nodes
            const rootNodes = this._childrenOf('1').filter(c => !c.isContainer);
            const rootContainers = this._childrenOf('1').filter(c => c.isContainer);
            
            const vpc = rootContainers.find(c => c.type === 'vpc');
            const centerX = vpc ? (vpc.x + vpc.width / 2) : 400;

            const totalWidth = rootNodes.length * NODE_SPACING.x;
            const startX = centerX - totalWidth / 2;

            rootNodes.forEach((n, idx) => {
                const nSize = NODE_SIZES[n.type] || NODE_SIZE;
                n.x = startX + idx * NODE_SPACING.x + (NODE_SPACING.x - nSize.width) / 2;
                n.y = 10;
            });

            return { success: true, id, message: `Node "${label}" (${type}) placed at root.` };
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
                    children: this._childrenOf(cell.id).map(c => c.id),
                });
            } else {
                nodes.push({
                    id: cell.id,
                    label: cell.label,
                    type: cell.type,
                    parent: cell.parentId,
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

        if (type === 'vpc') {
            return { x: 40, y: 180, width: 1200, height: 1060 };
        }

        if (type === 'az') {
            const azIndex = siblings.filter(s => s.type === 'az').length;
            const azWidth = 460;
            // First AZ at x=20, second AZ at x=20+460+AZ_GAP=700
            const x = 20 + azIndex * (azWidth + AZ_GAP);
            return { x, y: 160, width: azWidth, height: 860 };
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

        const neededHeight = maxBottom + CONTAINER_PADDING.bottom;
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
}

module.exports = { DiagramBuilder, NODE_STYLES, CONTAINER_STYLES, EDGE_STYLES };
