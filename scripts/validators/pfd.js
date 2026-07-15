module.exports = function({ cells, mxCells, doc, reportError, nodeIds }) {
    // Cross-validator isolation: skip if cloud-specific shapes are present
    const hasCloudNodes = Object.values(cells).some(c => c.style && (
        c.style.includes('mxgraph.gcp2') || c.style.includes('mxgraph.aws') ||
        c.style.includes('cloudfront') || c.style.includes('apigateway')
    ));
    if (hasCloudNodes) return;

    // Skip if no PFD-relevant shapes exist (avoid false positives on generic diagrams)
    const hasPfdShapes = Object.values(cells).some(c => c.style && (
        c.style.includes('mxgraph.pid') || c.style.includes('pump') ||
        c.style.includes('compressor') || c.style.includes('vessel') ||
        c.style.includes('column') || c.style.includes('heat_exchanger') ||
        c.style.includes('cyclone') || c.style.includes('tank')
    ));
    if (!hasPfdShapes) return;

    // 1. Process Edges / Streams
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id);
        if (!el) continue;

        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');
        const source = cells[sourceId];
        const target = cells[targetId];

        // Rule: HOSTILE_PID_ROUTING (existing)
        if (source) {
            const sourceStyle = source.style || '';
            if (sourceStyle.includes('mxgraph.pid.separators') || sourceStyle.includes('mxgraph.pid.compressors')) {
                if (!sourceStyle.includes('perimeter=')) {
                    if (cell.style.includes('exitX=') || cell.style.includes('exitY=')) {
                        reportError('HOSTILE_PID_ROUTING', id, `Edge attempts to use explicit 'exitX/Y' on a hostile PID shape (${sourceId}) without a perimeter override. Draw.io will silently ignore this and snap to a default port, causing intersecting lines. Add 'perimeter=ellipsePerimeter;' or 'perimeter=rectanglePerimeter;' to the shape's style to allow custom port routing.`);
                    }
                }
            }
        }
        if (target) {
            const targetStyle = target.style || '';
            if (targetStyle.includes('mxgraph.pid.separators') || targetStyle.includes('mxgraph.pid.compressors')) {
                if (!targetStyle.includes('perimeter=')) {
                    if (cell.style.includes('entryX=') || cell.style.includes('entryY=')) {
                        reportError('HOSTILE_PID_ROUTING', id, `Edge attempts to use explicit 'entryX/Y' on a hostile PID shape (${targetId}) without a perimeter override. Draw.io will silently ignore this and snap to a default port, causing intersecting lines. Add 'perimeter=ellipsePerimeter;' or 'perimeter=rectanglePerimeter;' to the shape's style to allow custom port routing.`);
                    }
                }
            }
        }

        // Rule: PHASE_PORT_VIOLATION
        if (source && target) {
            const labelLower = (cell.value || '').toLowerCase();
            const cellStyle = cell.style || '';
            
            // Extract exit nozzle coordinates from cell style
            let exitY = 0.5; // default center
            const exitYMatch = cellStyle.match(/exitY=([0-9.]+)/);
            if (exitYMatch) exitY = parseFloat(exitYMatch[1]);

            // Vapor stream exiting from bottom port
            if ((labelLower.includes('vapor') || labelLower.includes('gas') || labelLower.includes('overhead') || labelLower.includes('distillate')) && exitY > 0.8) {
                reportError('PHASE_PORT_VIOLATION', id, `Vapor stream exits from bottom port of ${sourceId}. Vapor outlets must only connect to the top/upper nozzles of vessels and columns.`);
            }
            // Liquid stream exiting from top port
            if ((labelLower.includes('liquid') || labelLower.includes('bottoms') || labelLower.includes('heavy') || labelLower.includes('slurry') || labelLower.includes('residue')) && exitY < 0.2) {
                reportError('PHASE_PORT_VIOLATION', id, `Liquid/heavy stream exits from top port of ${sourceId}. Liquid/heavy outlets must only connect to the bottom/lower nozzles of vessels and columns.`);
            }
        }

        // Rule: OPPOSING_FLOW
        if (source && target) {
            const cellStyle = cell.style || '';
            // If it's a process line (solid or process styled edge)
            const isProcessLine = !cellStyle.includes('dashed=1') && !cellStyle.includes('dashPattern=') && (cellStyle.includes('strokeWidth=3') || !cellStyle.includes('strokeWidth='));
            const isRecycle = (cell.value || '').toLowerCase().includes('recycle') || (cell.value || '').toLowerCase().includes('return');
            if (isProcessLine && !isRecycle) {
                // Allow backward-horizontal routing when the target is on a lower row
                // (page-wrap connection from end of one row to start of next)
                const isRowWrap = target.abs_y > source.abs_y + 100;
                if (source.abs_x > target.abs_x + 100 && !isRowWrap) {
                    reportError('OPPOSING_FLOW', id, `Process stream routes backward from right to left (from ${sourceId} to ${targetId}). In PFDs, normal process streams flow left-to-right. Use 'recycle' or 'return' in the stream label if this is an intentional backward/recycle loop.`);
                }
            }
        }

        // Rule: GRAVITY_VIOLATION
        if (source && target) {
            const labelLower = (cell.value || '').toLowerCase();
            const isLiquid = labelLower.includes('liquid') || labelLower.includes('bottoms') || labelLower.includes('heavy') || labelLower.includes('slurry') || labelLower.includes('residue');
            if (isLiquid && target.abs_y < source.abs_y - 50) {
                const sourceStyle = source.style || '';
                const sourceIsPump = sourceStyle.includes('pump') || sourceStyle.includes('compressor');
                if (!sourceIsPump) {
                    reportError('GRAVITY_VIOLATION', id, `Liquid/heavy stream flows vertically upward to a higher node ${targetId} without a pump or compressor. Liquid flows require pressure or pumping/compression to go uphill.`);
                }
            }
        }

        // Rule: INSTRUMENT_IN_PROCESS_LINE
        if (source && target) {
            const sourceStyle = source.style || '';
            const targetStyle = target.style || '';
            const sourceIsInstrument = sourceStyle.includes('indicators') || sourceStyle.includes('instrument') || sourceStyle.includes('sensor') || sourceStyle.includes('transmitter');
            const targetIsInstrument = targetStyle.includes('indicators') || targetStyle.includes('instrument') || targetStyle.includes('sensor') || targetStyle.includes('transmitter');
            if (sourceIsInstrument || targetIsInstrument) {
                const cellStyle = cell.style || '';
                const isProcessLine = cellStyle.includes('strokeWidth=3') || (!cellStyle.includes('dashed=1') && !cellStyle.includes('dashPattern='));
                if (isProcessLine) {
                    reportError('INSTRUMENT_IN_PROCESS_LINE', id, `Instrumentation/control signal line is modeled as a heavy process line instead of a dashed/dotted instrument signal. Use 'instrument' style (dotted/dashed) for connections to sensor, indicator, and control nodes.`);
                }
            }
        }

        // Rule: COMPRESSOR_INLET_AT_BOTTOM
        if (target) {
            const targetStyle = target.style || '';
            const isCompressor = targetStyle.includes('compressor');
            if (isCompressor) {
                const cellStyle = cell.style || '';
                let entryY = 0.5;
                const entryYMatch = cellStyle.match(/entryY=([0-9.]+)/);
                if (entryYMatch) entryY = parseFloat(entryYMatch[1]);
                if (entryY < 0.3) {
                    reportError('COMPRESSOR_INLET_AT_BOTTOM', id, `Suction inlet stream enters compressor ${targetId} from the top port (entryY=${entryY}). Gas compressor inlets should enter from the side (entryY≈0.5) or bottom (entryY≈1) to prevent liquid accumulation in the casing.`);
                }
            }
        }
    }

    // 2. Dead End Check
    if (nodeIds) {
        nodeIds.forEach(nodeId => {
            const node = cells[nodeId];
            if (node.isEdge) return;
            
            const isVesselOrColumn = node.style.includes('vessel') || node.style.includes('column') || node.style.includes('reactor') || node.style.includes('separator');
            const isPumpOrComp = node.style.includes('pump') || node.style.includes('compressor');
            const isHeatEx = node.style.includes('heat_exchanger');
            
            if (isVesselOrColumn || isPumpOrComp || isHeatEx) {
                // Find all edges where this node is source or target
                let incoming = 0;
                let outgoing = 0;
                for (const edgeId in cells) {
                    const edge = cells[edgeId];
                    if (!edge.isEdge) continue;
                    
                    const el = doc.getElementById(edgeId) || Array.from(mxCells).find(e => e.getAttribute('id') === edgeId);
                    if (el) {
                        const s = el.getAttribute('source');
                        const t = el.getAttribute('target');
                        if (s === nodeId) outgoing++;
                        if (t === nodeId) incoming++;
                    }
                }
                const labelLower = (node.value || '').toLowerCase();
                const isBoundary = labelLower.includes('feed') || labelLower.includes('product') || 
                                   labelLower.includes('charge') || labelLower.includes('utility') || 
                                   labelLower.includes('drain') || labelLower.includes('vent') || 
                                   labelLower.includes('waste') || labelLower.includes('source') || 
                                   labelLower.includes('sink') || labelLower.includes('suction') || 
                                   labelLower.includes('discharge') || labelLower.includes('boundary') ||
                                   labelLower.includes('pd pump') || labelLower.includes('centrifugal pump');
                if ((incoming === 0 || outgoing === 0) && !isBoundary) {
                    reportError('DEAD_END_STREAM', nodeId, `PFD equipment has no active feed/suction or product/discharge connections (Inlets: ${incoming}, Outlets: ${outgoing}). Every process equipment node must be fully integrated into the stream flow.`);
                }
            }
        });
    }
};
