const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');
const path = require('path');

function validateXml(xmlStr, diagramType = null) {
    if (!diagramType) {
        if (xmlStr.includes('mxgraph.pid') || xmlStr.includes('tray_column') || xmlStr.includes('centrifugal_pump') || xmlStr.includes('reciprocating_compressor')) {
            diagramType = 'pfd';
        } else if (xmlStr.includes('mxgraph.kubernetes') || xmlStr.includes('kubernetes.type') || xmlStr.includes('k8s_cluster')) {
            diagramType = 'kubernetes';
        } else if (xmlStr.includes('erd.type') || xmlStr.includes('shape=table') || xmlStr.includes('ERone') || xmlStr.includes('ERmany')) {
            diagramType = 'erd';
        } else if (xmlStr.includes('network.type') || xmlStr.includes('shape=mxgraph.cisco') || xmlStr.includes('vlan')) {
            diagramType = 'network';
        } else if (xmlStr.includes('mxgraph.aws') || xmlStr.includes('cloudfront') || xmlStr.includes('apigateway')) {
            diagramType = 'architecture';
        }
    }
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const mxCells = doc.getElementsByTagName('mxCell');
    const cells = {};
    const errors = [];
    const warnings = [];

    function reportError(type, cellId, message, severity = 'error') {
        if (severity === 'warning') {
            warnings.push(`[${type}] Node '${cellId}': ${message}`);
        } else {
            errors.push(`[${type}] Node '${cellId}': ${message}`);
        }
    }

    // Parse all cells
    for (let i = 0; i < mxCells.length; i++) {
        const el = mxCells[i];
        const id = el.getAttribute('id');
        if (!id) continue;

        const parent = el.getAttribute('parent');
        const isEdge = el.getAttribute('edge') === '1' || el.hasAttribute('source') || el.hasAttribute('target');
        const value = el.getAttribute('value') || '';
        const style = el.getAttribute('style') || '';
        
        let x = 0, y = 0, width = 0, height = 0;
        const geom = el.getElementsByTagName('mxGeometry')[0];
        if (geom) {
            x = parseFloat(geom.getAttribute('x') || '0');
            y = parseFloat(geom.getAttribute('y') || '0');
            width = parseFloat(geom.getAttribute('width') || '0');
            height = parseFloat(geom.getAttribute('height') || '0');
        }

        cells[id] = {
            id,
            parent,
            isEdge,
            value,
            style,
            local_x: x,
            local_y: y,
            width,
            height,
            abs_x: 0,
            abs_y: 0,
            children: []
        };
    }

    // Build hierarchy
    for (const id in cells) {
        const cell = cells[id];
        if (cell.parent && cells[cell.parent]) {
            cells[cell.parent].children.push(id);
        }
    }

    // Compute absolute coordinates
    function computeAbs(id, offsetX, offsetY) {
        const cell = cells[id];
        cell.abs_x = cell.local_x + offsetX;
        cell.abs_y = cell.local_y + offsetY;
        for (const childId of cell.children) {
            computeAbs(childId, cell.abs_x, cell.abs_y);
        }
    }

    // Root nodes
    for (const id in cells) {
        if (!cells[id].parent || !cells[cells[id].parent]) {
            computeAbs(id, 0, 0);
        }
    }

    // Validate formatting
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge) continue;
        if (id === "0" || id === "1") continue;

        const hasHtmlTags = /<[^>]+>/.test(cell.value);
        const hasHtmlStyle = cell.style.includes('html=1');
        const hasWrap = cell.style.includes('whiteSpace=wrap');
        const isAwsShape = cell.style.includes('shape=mxgraph.aws');

        if (isAwsShape && hasHtmlTags) {
            reportError('FORMAT', id, `AWS shapes do not reliably render HTML labels in headless mode. Remove HTML tags like <b> and <br> and use plain text with &#xa; for newlines.`);
        } else {
            if (hasHtmlTags && !hasHtmlStyle) {
                reportError('FORMAT', id, `Contains HTML tags (e.g. <b>, <br>) but missing 'html=1' in style.`);
            }

            if (hasHtmlStyle && hasHtmlTags && !hasWrap) {
                reportError('FORMAT', id, `Has HTML tags and html=1, but missing 'whiteSpace=wrap'. This often causes labels to render as literal text instead of formatted HTML on custom shapes.`);
            }
        }

        if (cell.value.includes('&lt;') || cell.value.includes('&gt;')) {
            reportError('FORMAT', id, `Value contains unescaped '&lt;' or '&gt;'. In XML attributes, use raw '<' and '>' (the XML parser will handle it if you author the XML file properly, but if you manually escaped '<' into '&amp;lt;', it will render literally as '&lt;').`);
        }
    }

    // Check collisions
    function isAncestor(ancestorId, descendantId) {
        let curr = cells[descendantId];
        while (curr && curr.parent) {
            if (curr.parent === ancestorId) return true;
            curr = cells[curr.parent];
        }
        return false;
    }

    const nodeIds = Object.keys(cells).filter(id => !cells[id].isEdge && cells[id].width > 0 && cells[id].height > 0);

    for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
            const a = cells[nodeIds[i]];
            const b = cells[nodeIds[j]];

            if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue;

            const aSpans = a.style && a.style.includes('pointerEvents=1');
            const bSpans = b.style && b.style.includes('pointerEvents=1');
            const aSwimlane = a.style && a.style.includes('swimlane');
            const bSwimlane = b.style && b.style.includes('swimlane');
            if (a.parent === b.parent && ((aSpans && bSwimlane) || (bSpans && aSwimlane))) continue;

            const overlapX = a.abs_x < (b.abs_x + b.width) && (a.abs_x + a.width) > b.abs_x;
            const overlapY = a.abs_y < (b.abs_y + b.height) && (a.abs_y + a.height) > b.abs_y;

            if (overlapX && overlapY) {
                reportError('COLLISION', `${a.id} <-> ${b.id}`, `Nodes overlap! \n  ${a.id} bounds: [${a.abs_x}, ${a.abs_y}, ${a.width}x${a.height}]\n  ${b.id} bounds: [${b.abs_x}, ${b.abs_y}, ${b.width}x${b.height}]`);
            }
        }

        const node = cells[nodeIds[i]];
        if (node.parent && cells[node.parent] && cells[node.parent].parent !== "0") {
            const p = cells[node.parent];
            let minX = p.abs_x;
            let minY = p.abs_y;
            
            if (p.style && p.style.includes('swimlane')) {
                let startSize = 24;
                const startSizeMatch = p.style.match(/startSize=(\d+)/);
                if (startSizeMatch) {
                    startSize = parseInt(startSizeMatch[1], 10);
                } else if (p.style.includes('horizontal=0')) {
                    startSize = 110;
                }
                
                if (p.style.includes('horizontal=0')) {
                    minX += startSize;
                } else {
                    minY += startSize;
                }
            }
            
            if (node.abs_x < minX || node.abs_y < minY || (node.abs_x + node.width) > (p.abs_x + p.width) || (node.abs_y + node.height) > (p.abs_y + p.height)) {
                reportError('OUT_OF_BOUNDS', node.id, `Node is outside parent ${p.id} bounds!`);
            }
        }
    }

    // Check edge waypoints
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = doc.getElementById(id) || mxCells[Array.from(mxCells).findIndex(e => e.getAttribute('id') === id)];
        if (!el) continue;

        const geom = el.getElementsByTagName('mxGeometry')[0];
        if (!geom) continue;
        
        const arrayEl = geom.getElementsByTagName('Array')[0];
        if (!arrayEl) continue;

        const points = arrayEl.getElementsByTagName('mxPoint');
        for (let k = 0; k < points.length; k++) {
            const px = parseFloat(points[k].getAttribute('x') || '0');
            const py = parseFloat(points[k].getAttribute('y') || '0');
            
            let abs_px = px;
            let abs_py = py;
            if (cell.parent && cells[cell.parent]) {
                abs_px += cells[cell.parent].abs_x;
                abs_py += cells[cell.parent].abs_y;
            }

            for (let i = 0; i < nodeIds.length; i++) {
                const n = cells[nodeIds[i]];
                if (el.getAttribute('source') === n.id || el.getAttribute('target') === n.id) continue;
                if (n.style.includes('swimlane')) continue;
                
                if (abs_px > n.abs_x + 2 && abs_px < n.abs_x + n.width - 2 && 
                    abs_py > n.abs_y + 2 && abs_py < n.abs_y + n.height - 2) {
                    reportError('WAYPOINT_COLLISION', id, `Edge waypoint [${abs_px}, ${abs_py}] is inside node ${n.id} [${n.abs_x}, ${n.abs_y}, ${n.width}x${n.height}].`);
                }
            }
        }
    }

    // Run domain validator plugins
    // Validators are filtered by diagram type using a naming convention:
    //   aws.js → runs for 'architecture' diagrams (or when type is unknown)
    //   pfd.js → runs for 'pfd' diagrams (or when type is unknown)
    const VALIDATOR_TYPE_MAP = {
        'aws.js': ['architecture', null],
        'gcp.js': ['architecture', null],
        'pfd.js': ['pfd', null],
        'kubernetes.js': ['kubernetes', null],
        'erd.js': ['erd', null],
        'network.js': ['network', null],
    };
    const validatorsDir = path.join(__dirname, 'validators');
    if (fs.existsSync(validatorsDir)) {
        const files = fs.readdirSync(validatorsDir);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const allowedTypes = VALIDATOR_TYPE_MAP[file];
                if (allowedTypes && diagramType && !allowedTypes.includes(diagramType)) {
                    continue; // Skip validator that doesn't match diagram type
                }
                try {
                    const validator = require(path.join(validatorsDir, file));
                    validator({ cells, mxCells, doc, reportError, nodeIds });
                } catch (e) {
                    reportError('VALIDATOR_ERROR', file, `Validator plugin crashed: ${e.message}`);
                }
            }
        }
    }

    return {
        success: errors.length === 0,
        errors,
        warnings
    };
}

// CLI entry point
if (require.main === module) {
    if (process.argv.length < 3) {
        console.error("Usage: node validate.js <diagram.xml>");
        process.exit(1);
    }

    const file = process.argv[2];
    if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
    }

    const xmlStr = fs.readFileSync(file, 'utf8');
    const result = validateXml(xmlStr);

    if (!result.success) {
        for (const err of result.errors) {
            console.error(err);
        }
        console.log(`\n❌ Validation failed: ${result.errors.length} issues found.`);
        process.exit(1);
    } else {
        console.log(`\n✅ Validation passed! No collisions, formatting issues, or topological routing violations detected.`);
        process.exit(0);
    }
}

module.exports = { validateXml };
