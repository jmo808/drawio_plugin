module.exports = function({ cells, mxCells, doc, reportError }) {
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = doc.getElementById(id) || mxCells[Array.from(mxCells).findIndex(e => e.getAttribute('id') === id)];
        if (!el) continue;

        const source = el.getAttribute('source');
        const target = el.getAttribute('target');

        // Rule: HOSTILE_PID_ROUTING
        // Forbid the use of mxgraph.pid shapes when explicit routing is required, unless perimeter is overridden
        if (source && cells[source]) {
            const sourceStyle = cells[source].style;
            if (sourceStyle.includes('mxgraph.pid.separators') || sourceStyle.includes('mxgraph.pid.compressors')) {
                if (!sourceStyle.includes('perimeter=')) {
                    if (cell.style.includes('exitX=') || cell.style.includes('exitY=')) {
                        reportError('HOSTILE_PID_ROUTING', id, `Edge attempts to use explicit 'exitX/Y' on a hostile PID shape (${source}) without a perimeter override. Draw.io will silently ignore this and snap to a default port, causing intersecting lines. Add 'perimeter=ellipsePerimeter;' or 'perimeter=rectanglePerimeter;' to the shape's style to allow custom port routing.`);
                    }
                }
            }
        }
        if (target && cells[target]) {
            const targetStyle = cells[target].style;
            if (targetStyle.includes('mxgraph.pid.separators') || targetStyle.includes('mxgraph.pid.compressors')) {
                if (!targetStyle.includes('perimeter=')) {
                    if (cell.style.includes('entryX=') || cell.style.includes('entryY=')) {
                        reportError('HOSTILE_PID_ROUTING', id, `Edge attempts to use explicit 'entryX/Y' on a hostile PID shape (${target}) without a perimeter override. Draw.io will silently ignore this and snap to a default port, causing intersecting lines. Add 'perimeter=ellipsePerimeter;' or 'perimeter=rectanglePerimeter;' to the shape's style to allow custom port routing.`);
                    }
                }
            }
        }
    }
};
