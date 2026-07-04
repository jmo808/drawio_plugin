const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');
const path = require('path');

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
const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');

const mxCells = doc.getElementsByTagName('mxCell');
const cells = {};

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

// Root nodes are those with no parent or parent not in cells (like parent="0")
for (const id in cells) {
    if (!cells[id].parent || !cells[cells[id].parent]) {
        computeAbs(id, 0, 0);
    }
}

let errorsFound = 0;

function reportError(type, cellId, message) {
    console.log(`[${type}] Node '${cellId}': ${message}`);
    errorsFound++;
}

// Validate formatting
for (const id in cells) {
    const cell = cells[id];
    if (cell.isEdge) continue;
    // Skip empty or default system cells like id="0" or id="1"
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
        reportError('FORMAT', id, `Value contains unescaped '&lt;' or '&gt;'. In XML attributes, use raw '<' and '>' (the XML parser will handle it if you author the XML file properly, but if you manually escaped '<' into '&amp;lt;', it will render literally as '&lt;'). Wait, actually, AI shouldn't double-escape.`);
    }
}

// Check collisions
// Helper to check if A is ancestor of B
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

        // Ignore if one is an ancestor of the other
        if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue;

        // Bounding box intersection check
        const overlapX = a.abs_x < (b.abs_x + b.width) && (a.abs_x + a.width) > b.abs_x;
        const overlapY = a.abs_y < (b.abs_y + b.height) && (a.abs_y + a.height) > b.abs_y;

        if (overlapX && overlapY) {
            reportError('COLLISION', `${a.id} <-> ${b.id}`, `Nodes overlap! \n  ${a.id} bounds: [${a.abs_x}, ${a.abs_y}, ${a.width}x${a.height}]\n  ${b.id} bounds: [${b.abs_x}, ${b.abs_y}, ${b.width}x${b.height}]`);
        }
    }

    // Check if node is out of parent bounds
    const node = cells[nodeIds[i]];
    if (node.parent && cells[node.parent] && cells[node.parent].parent !== "0") {
        const p = cells[node.parent];
        if (node.abs_x < p.abs_x || node.abs_y < p.abs_y || (node.abs_x + node.width) > (p.abs_x + p.width) || (node.abs_y + node.height) > (p.abs_y + p.height)) {
            reportError('OUT_OF_BOUNDS', node.id, `Node is outside parent ${p.id} bounds!`);
        }
    }
}

// Check edge waypoints against node bounding boxes and check for missing explicit routing
for (const id in cells) {
    const cell = cells[id];
    if (!cell.isEdge) continue;

    // Find all mxPoint elements inside Array as="points"
    const el = doc.getElementById(id) || mxCells[Array.from(mxCells).findIndex(e => e.getAttribute('id') === id)];
    if (!el) continue;

    const source = el.getAttribute('source');
    const target = el.getAttribute('target');
    

    const geom = el.getElementsByTagName('mxGeometry')[0];
    if (!geom) continue;
    
    const arrayEl = geom.getElementsByTagName('Array')[0];
    if (!arrayEl) continue;

    const points = arrayEl.getElementsByTagName('mxPoint');
    for (let k = 0; k < points.length; k++) {
        const px = parseFloat(points[k].getAttribute('x') || '0');
        const py = parseFloat(points[k].getAttribute('y') || '0');
        
        // Convert point to absolute if edge has parent (though edges are usually parent="1")
        let abs_px = px;
        let abs_py = py;
        if (cell.parent && cells[cell.parent]) {
            abs_px += cells[cell.parent].abs_x;
            abs_py += cells[cell.parent].abs_y;
        }

        // Check against all nodes
        for (let i = 0; i < nodeIds.length; i++) {
            const n = cells[nodeIds[i]];
            // Don't flag collision if the edge connects to this node (source or target)
            if (el.getAttribute('source') === n.id || el.getAttribute('target') === n.id) continue;
            
            // Add a small 2px buffer to allow routing along the edge of a node
            if (abs_px > n.abs_x + 2 && abs_px < n.abs_x + n.width - 2 && 
                abs_py > n.abs_y + 2 && abs_py < n.abs_y + n.height - 2) {
                reportError('WAYPOINT_COLLISION', id, `Edge waypoint [${abs_px}, ${abs_py}] is inside node ${n.id} [${n.abs_x}, ${n.abs_y}, ${n.width}x${n.height}]. This causes the line to cut through the shape.`);
            }
        }
    }
}

// --- RUN DOMAIN VALIDATOR PLUGINS ---
const validatorsDir = path.join(__dirname, 'validators');
if (fs.existsSync(validatorsDir)) {
    const files = fs.readdirSync(validatorsDir);
    for (const file of files) {
        if (file.endsWith('.js')) {
            const validator = require(path.join(validatorsDir, file));
            validator({ cells, mxCells, doc, reportError, nodeIds });
        }
    }
}

if (errorsFound > 0) {
    console.log(`\n❌ Validation failed: ${errorsFound} issues found.`);
    console.log(`Please adjust coordinates to prevent collisions, fix formatting errors, and resolve topological routing violations.`);
    process.exit(1);
} else {
    console.log(`\n✅ Validation passed! No collisions, formatting issues, or topological routing violations detected.`);
}
