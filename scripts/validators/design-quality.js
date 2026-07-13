/**
 * Design Quality Validator — aesthetic checks from a "Graphic Designer" perspective.
 *
 * All issues are reported as **warnings** (not errors) because they don't break
 * diagram functionality; they surface layout and visual-consistency concerns.
 *
 * Runs for ALL diagram types (universal design quality).
 *
 * @module validators/design-quality
 */

'use strict';

const { findElement, getEdgesForNode } = require('./validator-utils');

/**
 * Returns true if `id` is a root cell that should be skipped.
 */
function isRootCell(id) {
    return id === '0' || id === '1';
}

/**
 * Returns true if `ancestorId` is an ancestor of `descendantId`.
 */
function isAncestor(ancestorId, descendantId, cells) {
    let curr = cells[descendantId];
    while (curr && curr.parent) {
        if (curr.parent === ancestorId) return true;
        curr = cells[curr.parent];
    }
    return false;
}

/**
 * Returns true if a cell is a container (has children and is not an edge).
 */
function isContainer(cell) {
    return !cell.isEdge && cell.children && cell.children.length > 0;
}

/**
 * Group sibling node IDs by parent, filtering to non-edge, non-root cells
 * with positive dimensions.
 */
function groupSiblingsByParent(cells) {
    const groups = {};
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge || isRootCell(id) || cell.width <= 0 || cell.height <= 0) continue;
        const parentId = cell.parent || '__root__';
        if (!groups[parentId]) groups[parentId] = [];
        groups[parentId].push(id);
    }
    return groups;
}

module.exports = function ({ cells, mxCells, doc, reportError, nodeIds }) {

    const siblingGroups = groupSiblingsByParent(cells);

    // ─── Rule 1: NODE_SPACING_TOO_TIGHT ──────────────────────────────────────────
    // Check if any two non-edge, non-ancestor sibling nodes are closer than 15px.
    for (const parentId in siblingGroups) {
        const siblings = siblingGroups[parentId];
        for (let i = 0; i < siblings.length; i++) {
            for (let j = i + 1; j < siblings.length; j++) {
                const a = cells[siblings[i]];
                const b = cells[siblings[j]];

                // Skip ancestor/descendant pairs
                if (isAncestor(a.id, b.id, cells) || isAncestor(b.id, a.id, cells)) continue;

                // Compute gaps between bounding boxes
                const horizontalGap = Math.max(0,
                    Math.max(a.abs_x, b.abs_x) - Math.min(a.abs_x + a.width, b.abs_x + b.width)
                );
                const verticalGap = Math.max(0,
                    Math.max(a.abs_y, b.abs_y) - Math.min(a.abs_y + a.height, b.abs_y + b.height)
                );

                // Check if they overlap (caught by COLLISION rule elsewhere)
                const overlapX = a.abs_x < (b.abs_x + b.width) && (a.abs_x + a.width) > b.abs_x;
                const overlapY = a.abs_y < (b.abs_y + b.height) && (a.abs_y + a.height) > b.abs_y;
                if (overlapX && overlapY) continue; // overlap — skip, handled elsewhere

                const gap = Math.min(horizontalGap, verticalGap);
                if (gap < 15) {
                    reportError(
                        'NODE_SPACING_TOO_TIGHT',
                        a.id,
                        `Nodes "${a.value}" and "${b.value}" are only ${gap}px apart — minimum recommended spacing is 15px.`,
                        'warning'
                    );
                }
            }
        }
    }

    // ─── Rule 2: EXCESSIVE_WHITESPACE ────────────────────────────────────────────
    // Check if a container has more than 85% empty space (children fill < 15%).
    for (const id in cells) {
        const cell = cells[id];
        if (cell.isEdge || isRootCell(id)) continue;
        // Skip direct children of root (top-level containers)
        if (cell.parent === '0' || cell.parent === '1') continue;
        if (!isContainer(cell)) continue;

        const containerArea = cell.width * cell.height;
        if (containerArea <= 10000) continue; // too small to matter

        let childrenArea = 0;
        for (const childId of cell.children) {
            const child = cells[childId];
            if (child && !child.isEdge) {
                childrenArea += child.width * child.height;
            }
        }

        const fillRatio = childrenArea / containerArea;
        if (fillRatio < 0.15) {
            const pctEmpty = Math.round((1 - fillRatio) * 100);
            reportError(
                'EXCESSIVE_WHITESPACE',
                id,
                `Container "${cell.value}" is ${pctEmpty}% empty — consider reducing size.`,
                'warning'
            );
        }
    }

    // ─── Rule 3: MISALIGNED_SIBLINGS ─────────────────────────────────────────────
    // Check if siblings on roughly the same row have slightly different Y values.
    for (const parentId in siblingGroups) {
        const siblings = siblingGroups[parentId]
            .filter(sid => !isContainer(cells[sid])); // only leaf nodes

        if (siblings.length < 2) continue;

        // Group siblings into horizontal bands (Y within 30px)
        const bands = [];
        const assigned = new Set();

        for (let i = 0; i < siblings.length; i++) {
            if (assigned.has(siblings[i])) continue;
            const band = [siblings[i]];
            assigned.add(siblings[i]);
            const baseY = cells[siblings[i]].abs_y;

            for (let j = i + 1; j < siblings.length; j++) {
                if (assigned.has(siblings[j])) continue;
                if (Math.abs(cells[siblings[j]].abs_y - baseY) <= 30) {
                    band.push(siblings[j]);
                    assigned.add(siblings[j]);
                }
            }
            if (band.length >= 2) {
                bands.push(band);
            }
        }

        for (const band of bands) {
            const ys = band.map(sid => cells[sid].abs_y);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const spread = maxY - minY;

            if (spread > 5 && spread <= 30) {
                // Find the median Y as the "correct" alignment
                const sortedYs = [...ys].sort((a, b) => a - b);
                const medianY = sortedYs[Math.floor(sortedYs.length / 2)];

                for (const sid of band) {
                    const diff = Math.abs(cells[sid].abs_y - medianY);
                    if (diff > 5) {
                        reportError(
                            'MISALIGNED_SIBLINGS',
                            sid,
                            `Node "${cells[sid].value}" is ${Math.round(diff)}px off-grid from its siblings — consider aligning.`,
                            'warning'
                        );
                    }
                }
            }
        }
    }

    // ─── Rule 4: EDGE_LABEL_OVERLAP ──────────────────────────────────────────────
    // Check if an edge's label midpoint falls within 20px of a non-source/target node.
    const nonEdgeNodes = nodeIds ? nodeIds.filter(nid => !isRootCell(nid)) : [];

    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;
        if (!cell.value || cell.value.trim() === '') continue;

        const el = findElement(id, doc, mxCells);
        if (!el) continue;

        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');

        if (!sourceId || !targetId) continue;
        const src = cells[sourceId];
        const tgt = cells[targetId];
        if (!src || !tgt) continue;

        // Edge label midpoint approximation (midpoint of source/target centres)
        const midX = ((src.abs_x + src.width / 2) + (tgt.abs_x + tgt.width / 2)) / 2;
        const midY = ((src.abs_y + src.height / 2) + (tgt.abs_y + tgt.height / 2)) / 2;

        for (const nid of nonEdgeNodes) {
            if (nid === sourceId || nid === targetId) continue;
            const n = cells[nid];
            if (!n || n.width <= 0 || n.height <= 0) continue;

            // Check if midpoint is within 20px of node bounding box
            const expandedLeft = n.abs_x - 20;
            const expandedTop = n.abs_y - 20;
            const expandedRight = n.abs_x + n.width + 20;
            const expandedBottom = n.abs_y + n.height + 20;

            if (midX >= expandedLeft && midX <= expandedRight &&
                midY >= expandedTop && midY <= expandedBottom) {
                reportError(
                    'EDGE_LABEL_OVERLAP',
                    id,
                    `Edge label "${cell.value}" may overlap with node "${n.value}" (${nid}).`,
                    'warning'
                );
                break; // one warning per edge is enough
            }
        }
    }

    // ─── Rule 5: ORPHAN_EDGE_ENDPOINT ────────────────────────────────────────────
    // Check if an edge references a source or target that doesn't exist in cells.
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = findElement(id, doc, mxCells);
        if (!el) continue;

        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');

        const missingSource = sourceId && !cells[sourceId];
        const missingTarget = targetId && !cells[targetId];

        if (missingSource || missingTarget) {
            const parts = [];
            if (missingSource) parts.push(`source "${sourceId}"`);
            if (missingTarget) parts.push(`target "${targetId}"`);
            reportError(
                'ORPHAN_EDGE_ENDPOINT',
                id,
                `Edge references missing node: ${parts.join(' and ')}.`,
                'warning'
            );
        }
    }

    // ─── Rule 6: INCONSISTENT_ICON_SIZE ──────────────────────────────────────────
    // Check if sibling leaf nodes have significantly different dimensions (>30%).
    for (const parentId in siblingGroups) {
        const siblings = siblingGroups[parentId]
            .filter(sid => !isContainer(cells[sid])); // only leaf nodes

        for (let i = 0; i < siblings.length; i++) {
            for (let j = i + 1; j < siblings.length; j++) {
                const a = cells[siblings[i]];
                const b = cells[siblings[j]];

                const minW = Math.min(a.width, b.width);
                const minH = Math.min(a.height, b.height);

                if (minW <= 0 || minH <= 0) continue;

                const widthDiff = Math.abs(a.width - b.width) / minW;
                const heightDiff = Math.abs(a.height - b.height) / minH;

                if (widthDiff > 0.3 || heightDiff > 0.3) {
                    reportError(
                        'INCONSISTENT_ICON_SIZE',
                        a.id,
                        `Node "${a.value}" (${a.width}×${a.height}) has a significantly different size than sibling "${b.value}" (${b.width}×${b.height}).`,
                        'warning'
                    );
                }
            }
        }
    }
};
