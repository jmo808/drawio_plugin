module.exports = function({ cells, mxCells, doc, reportError, nodeIds }) {
    // Helper to check if a node is an ERD table
    function isErdTable(node) {
        if (!node) return false;
        const style = node.style || '';
        const val = (node.value || '').toLowerCase();
        return style.includes('erd.type=table') || style.includes('shape=table') || val.includes('table');
    }

    // Helper to parse columns from table card value/label
    function getColumns(node) {
        const val = node.value || '';
        // Strip HTML tags for clean text parsing, but keep newlines/breaks
        const cleanText = val.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
        // Split by lines
        const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // The first line is typically the Table Name
        // Subsequent lines represent columns.
        const cols = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const isPk = line.includes('[PK]') || line.startsWith('+') || line.toLowerCase().includes(' pk');
            const isFk = line.includes('[FK]') || line.toLowerCase().includes(' fk');
            
            let name = line.replace(/^\+\s*/, '').replace(/\[(PK|FK)\]/gi, '').trim();
            if (name.includes(':')) {
                name = name.split(':')[0].trim();
            } else {
                name = name.split(/\s+/)[0].trim();
            }
            cols.push({ original: line, name, isPk, isFk });
        }
        return cols;
    }

    if (nodeIds) {
        nodeIds.forEach(nodeId => {
            const node = cells[nodeId];
            if (node.isEdge || !isErdTable(node)) return;

            const cols = getColumns(node);
            const pkCols = cols.filter(c => c.isPk);
            const fkCols = cols.filter(c => c.isFk);

            // Find all connected edges for this table card
            const connectedEdges = [];
            let selfReferencingEdgeFound = false;

            for (const edgeId in cells) {
                const edge = cells[edgeId];
                if (!edge.isEdge) continue;

                const el = doc.getElementById(edgeId) || Array.from(mxCells).find(e => e.getAttribute('id') === edgeId);
                if (el) {
                    const s = el.getAttribute('source');
                    const t = el.getAttribute('target');
                    if (s === nodeId || t === nodeId) {
                        connectedEdges.push(edgeId);
                        if (s === nodeId && t === nodeId) {
                            selfReferencingEdgeFound = true;
                        }
                    }
                }
            }

            // Rule 2: ORPHAN_TABLE (warning)
            if (connectedEdges.length === 0) {
                reportError('ORPHAN_TABLE', nodeId, `Table is disconnected and has no relationships with other tables.`, 'warning');
            }

            // Rule 1: FK_WITHOUT_TARGET
            if (fkCols.length > 0 && connectedEdges.length === 0) {
                reportError('FK_WITHOUT_TARGET', nodeId, `Table contains foreign key columns but has no relationship connections to target primary key tables.`);
            }

            // Rule 3: DUPLICATE_PK
            if (pkCols.length > 1) {
                reportError('DUPLICATE_PK', nodeId, `Multiple primary key columns detected (${pkCols.map(c => c.name).join(', ')}). Composite primary keys must be explicitly declared or only one column designated as PK.`);
            }

            // Rule 4: SELF_REFERENCE_MISSING
            const hasSelfRefCol = cols.some(c => ['parent_id', 'manager_id', 'reports_to', 'prev_id'].includes(c.name.toLowerCase()));
            if (hasSelfRefCol && !selfReferencingEdgeFound) {
                reportError('SELF_REFERENCE_MISSING', nodeId, `Table contains hierarchical/self-referencing column but is missing a self-referencing relationship edge connecting back to itself.`);
            }
        });
    }
};
