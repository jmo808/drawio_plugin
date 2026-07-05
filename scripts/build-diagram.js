const fs = require('fs');
const path = require('path');
const { DiagramBuilder } = require('./diagram-builder');

if (process.argv.length < 4) {
    console.error("Usage: node build-diagram.js <input.json> <output.xml/drawio>");
    process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}

let config;
try {
    config = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
    console.error(`Failed to parse input JSON: ${e.message}`);
    process.exit(1);
}

const b = new DiagramBuilder();

// 1. Initialize diagram
const initRes = b.init(config.title || 'Architecture', config.theme || 'light', config.type || 'architecture');
if (!initRes.success) {
    console.error(`Initialization failed: ${initRes.error}`);
    process.exit(1);
}

// 2. Add containers (sort by depth/hierarchy to ensure parents exist first)
if (config.containers && Array.isArray(config.containers)) {
    // Basic topological sort by checking parent existence or lack thereof
    const added = new Set(['1']);
    let pending = [...config.containers];
    let loops = 0;
    
    while (pending.length > 0 && loops < 100) {
        const nextPending = [];
        for (const c of pending) {
            const parentId = c.parentId || c.parent_id || '1';
            if (added.has(parentId)) {
                const res = b.addContainer(c.id, c.label, c.type, parentId, c.tier);
                if (!res.success) {
                    console.error(`Failed to add container "${c.id}": ${res.error}`);
                    process.exit(1);
                }
                added.add(c.id);
            } else {
                nextPending.push(c);
            }
        }
        pending = nextPending;
        loops++;
    }
    
    if (pending.length > 0) {
        console.error(`Circular parent dependencies detected in containers: ${pending.map(c => c.id).join(', ')}`);
        process.exit(1);
    }
}

// 3. Add nodes
if (config.nodes && Array.isArray(config.nodes)) {
    for (const n of config.nodes) {
        const parentId = n.parentId || n.parent_id || '1';
        const res = b.addNode(n.id, n.label, n.type, parentId, n.variant);
        if (!res.success) {
            console.error(`Failed to add node "${n.id}": ${res.error}`);
            process.exit(1);
        }
    }
}

// 4. Add connections
if (config.edges && Array.isArray(config.edges)) {
    for (const e of config.edges) {
        const res = b.connect(e.sourceId || e.source_id, e.targetId || e.target_id, e.label, e.style, e.exitPort || e.exit_port, e.entryPort || e.entry_port);
        if (!res.success) {
            console.error(`Failed to connect "${e.sourceId || e.source_id}" -> "${e.targetId || e.target_id}": ${res.error}`);
            process.exit(1);
        }
    }
}

// 5. Finalize and write
const finalRes = b.finalize();
if (!finalRes.success) {
    console.error(`Finalization failed: ${finalRes.error}`);
    if (finalRes.details) {
        console.error(finalRes.details);
    }
    process.exit(1);
}

try {
    fs.writeFileSync(outputPath, finalRes.xml, 'utf8');
    console.log(`Successfully generated diagram at: ${outputPath}`);
} catch (e) {
    console.error(`Failed to write output file: ${e.message}`);
    process.exit(1);
}
