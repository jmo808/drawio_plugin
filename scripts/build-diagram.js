const fs = require('fs');
const path = require('path');
const { DiagramBuilder } = require('./diagram-builder');

function buildDiagram(inputJsonPath, outputXmlPath) {
    if (!fs.existsSync(inputJsonPath)) {
        return { success: false, error: `Input file not found: ${inputJsonPath}` };
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(inputJsonPath, 'utf8'));
    } catch (e) {
        return { success: false, error: `Failed to parse input JSON: ${e.message}` };
    }

    const b = new DiagramBuilder();

    // 1. Initialize diagram
    const initRes = b.init(config.title || 'Architecture', config.theme || 'light', config.type || 'architecture');
    if (!initRes.success) {
        return { success: false, error: `Initialization failed: ${initRes.error}` };
    }

    // 2. Add containers
    if (config.containers && Array.isArray(config.containers)) {
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
                        return { success: false, error: `Failed to add container "${c.id}": ${res.error}` };
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
            return { success: false, error: `Circular parent dependencies detected in containers: ${pending.map(c => c.id).join(', ')}` };
        }
    }

    // 3. Add nodes
    if (config.nodes && Array.isArray(config.nodes)) {
        for (const n of config.nodes) {
            const parentId = n.parentId || n.parent_id || '1';
            const res = b.addNode(n.id, n.label, n.type, parentId, n.variant);
            if (!res.success) {
                return { success: false, error: `Failed to add node "${n.id}": ${res.error}` };
            }
        }
    }

    // 4. Add connections
    if (config.edges && Array.isArray(config.edges)) {
        for (const e of config.edges) {
            const res = b.connect(e.sourceId || e.source_id, e.targetId || e.target_id, e.label, e.style, e.color, e.exitPort || e.exit_port, e.entryPort || e.entry_port);
            if (!res.success) {
                return { success: false, error: `Failed to connect "${e.sourceId || e.source_id}" -> "${e.targetId || e.target_id}": ${res.error}` };
            }
        }
    }

    // 5. Finalize and write
    const finalRes = b.finalize();
    if (!finalRes.success) {
        return { success: false, error: `Finalization failed: ${finalRes.error}`, details: finalRes.details };
    }

    try {
        fs.writeFileSync(outputXmlPath, finalRes.xml, 'utf8');
        return { success: true, xml: finalRes.xml };
    } catch (e) {
        return { success: false, error: `Failed to write output file: ${e.message}` };
    }
}

// CLI entry point
if (require.main === module) {
    if (process.argv.length < 4) {
        console.error("Usage: node build-diagram.js <input.json> <output.xml/drawio>");
        process.exit(1);
    }
    const res = buildDiagram(process.argv[2], process.argv[3]);
    if (!res.success) {
        console.error(res.error);
        if (res.details) {
            console.error(JSON.stringify(res.details, null, 2));
        }
        process.exit(1);
    } else {
        console.log(`Successfully generated diagram at: ${process.argv[3]}`);
        process.exit(0);
    }
}

module.exports = { buildDiagram };
