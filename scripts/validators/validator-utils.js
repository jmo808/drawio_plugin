/**
 * Shared validator utilities — eliminates code duplication across all validator
 * modules by extracting common cell-lookup, edge-traversal, parent-chain
 * walking, zone/AZ detection, node-type detection, and load-balancer helpers.
 *
 * @module validator-utils
 */

'use strict';

/**
 * Find an mxCell DOM element by its ID.
 *
 * Every validator repeats this exact pattern:
 *   `doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id)`
 *
 * @param {string} id         — The cell ID to look up.
 * @param {Document} doc      — The parsed XML document.
 * @param {NodeList} mxCells  — The live NodeList of `<mxCell>` elements.
 * @returns {Element|undefined} The matching DOM element, or undefined.
 */
function findElement(id, doc, mxCells) {
    return doc.getElementById(id) || Array.from(mxCells).find(e => e.getAttribute('id') === id);
}

/**
 * Return every edge cell whose `source` or `target` attribute equals `nodeId`.
 *
 * Replaces the inline loops that iterate all cells looking for edges connected
 * to a specific node (~15 occurrences across all validators).
 *
 * @param {string} nodeId              — The node to find edges for.
 * @param {Object.<string, Object>} cells — The full cells map `{ id: cellData }`.
 * @param {Document} doc               — The parsed XML document.
 * @param {NodeList} mxCells           — The live NodeList of `<mxCell>` elements.
 * @returns {{ id: string, el: Element, sourceId: string, targetId: string }[]}
 *   Array of edge descriptors with the DOM element and resolved source/target IDs.
 */
function getEdgesForNode(nodeId, cells, doc, mxCells) {
    const results = [];
    for (const id in cells) {
        const cell = cells[id];
        if (!cell.isEdge) continue;

        const el = findElement(id, doc, mxCells);
        if (!el) continue;

        const sourceId = el.getAttribute('source');
        const targetId = el.getAttribute('target');

        if (sourceId === nodeId || targetId === nodeId) {
            results.push({ id, el, sourceId, targetId });
        }
    }
    return results;
}

/**
 * Walk up the parent chain from `nodeId` and return the first cell where
 * `matchFn(cell)` returns `true`.
 *
 * Used by GCP, AWS, Kubernetes, and Network validators to locate containing
 * zone / AZ / namespace / VLAN containers.
 *
 * @param {string} nodeId                — Starting node ID.
 * @param {Object.<string, Object>} cells — The full cells map.
 * @param {function(Object): boolean} matchFn — Predicate applied to each parent cell.
 * @returns {Object|null} The first matching cell, or `null`.
 */
function walkParentChain(nodeId, cells, matchFn) {
    if (!cells[nodeId]) return null;
    let currId = cells[nodeId].parent;
    while (currId && cells[currId] && currId !== '1' && currId !== '0') {
        const p = cells[currId];
        if (matchFn(p)) return p;
        currId = p.parent;
    }
    return null;
}

/**
 * Walk up the parent chain from `nodeId` and return the ID of the first
 * container whose label contains "zone" or "az".
 *
 * Duplicated ~6 times across GCP and AWS validators.  Implemented on top of
 * {@link walkParentChain}.
 *
 * @param {string} nodeId                — Starting node ID.
 * @param {Object.<string, Object>} cells — The full cells map.
 * @returns {string|null} The matching container's ID, or `null`.
 */
function getZoneOrAZ(nodeId, cells) {
    const match = walkParentChain(nodeId, cells, (p) => {
        const val = (p.value || '').toLowerCase();
        return val.includes('zone ') || val.includes('az ');
    });
    return match ? match.id : null;
}

/**
 * Factory that creates a node-type detection function.
 *
 * Generalises the identical structure of `getGcpNodeType()` and
 * `getAwsNodeType()`.  The returned function accepts `(style, value)` and
 * returns a canonical type string (or the raw match if no normalisation rule
 * matches).
 *
 * @param {RegExp[]} shapePatterns
 *   Ordered array of regex patterns to try against the lowercased style string.
 *   Each regex **must** have exactly one capture group whose value becomes the
 *   initial `type` candidate.
 *
 * @param {{ keywords: string[], type: string }[]} labelMap
 *   Ordered array of label-fallback entries used when no shape pattern matches.
 *   The first entry whose **every** keyword is found in the lowercased label
 *   wins.
 *
 * @param {{ match: (t: string) => boolean, type: string }[]} normalisationRules
 *   Ordered array of normalisation rules applied to the raw `type` candidate.
 *   The first rule whose `match(type)` returns `true` causes the function to
 *   return the rule's `type` string.
 *
 * @returns {function(string, string): string|null}
 */
function createNodeTypeDetector(shapePatterns, labelMap, normalisationRules) {
    return function detectNodeType(style, value) {
        const s = (style || '').toLowerCase();
        const v = (value || '').toLowerCase();

        let type = null;

        // 1. Try shape patterns against style string
        for (const pattern of shapePatterns) {
            const m = s.match(pattern);
            if (m) {
                type = m[1];
                break;
            }
        }

        // 2. Fallback to label/value inspection
        if (!type) {
            for (const entry of labelMap) {
                if (entry.keywords.some(kw => v.includes(kw))) {
                    type = entry.type;
                    break;
                }
            }
        }

        // 3. Normalise
        if (type && normalisationRules) {
            for (const rule of normalisationRules) {
                if (rule.match(type)) return rule.type;
            }
        }

        return type;
    };
}

/**
 * Check whether a value/label indicates an **internal** load balancer.
 *
 * Currently duplicated as `isInternalLb()` in gcp.js and `isInternalAlb()` in
 * aws.js — they are identical functions.
 *
 * @param {string} value — The cell's value / label text.
 * @returns {boolean}
 */
function isInternalLb(value) {
    return !!(value && value.toLowerCase().includes('internal'));
}

module.exports = {
    findElement,
    getEdgesForNode,
    walkParentChain,
    getZoneOrAZ,
    createNodeTypeDetector,
    isInternalLb,
};
