#!/usr/bin/env node

/**
 * End-to-end test for the draw.io MCP wrapper with Diagram Builder.
 *
 * Spawns mcp-wrapper.js as a child process via StdioClientTransport,
 * connects the official MCP SDK client, and exercises:
 *   1. Initialize — connect without errors
 *   2. List Tools  — expect 13 tools (4 original + 9 builder)
 *   3. Reject Bad XML — overlapping boxes → isError + "COLLISION"
 *   4. Accept Good XML — non-overlapping boxes → success URL
 *   5. Builder: init_diagram + add containers + add nodes + connect + finalize
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Paths ────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_PATH = path.join(__dirname, 'mcp-wrapper.js');

// ── Test fixtures ────────────────────────────────────────────────────────────
const BAD_XML = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="a" value="Box A" style="html=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="100" as="geometry"/></mxCell>
  <mxCell id="b" value="Box B" style="html=1;" vertex="1" parent="1"><mxGeometry x="150" y="150" width="100" height="100" as="geometry"/></mxCell>
</root></mxGraphModel>`;

const GOOD_XML = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="a" value="Box A" style="html=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="100" as="geometry"/></mxCell>
  <mxCell id="b" value="Box B" style="html=1;" vertex="1" parent="1"><mxGeometry x="300" y="100" width="100" height="100" as="geometry"/></mxCell>
</root></mxGraphModel>`;

// ── Harness ──────────────────────────────────────────────────────────────────
const results = [];

function record(name, passed, detail = '') {
  const tag = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const line = `[${tag}] ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ name, passed, detail });
}

/** Parse builder tool response text as JSON */
function parseBuilderResult(result) {
  const text = (result.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Global timeout ───────────────────────────────────────────────────────────
const TIMEOUT_MS = 20_000;
const timer = setTimeout(() => {
  console.error(`\n⏱  Timed out after ${TIMEOUT_MS / 1000}s — aborting.`);
  process.exit(1);
}, TIMEOUT_MS);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let client;
  let transport;

  try {
    // ───── Test 1: Initialize ──────────────────────────────────────────────
    transport = new StdioClientTransport({
      command: 'node',
      args: [WRAPPER_PATH],
    });

    client = new Client({
      name: 'drawio-e2e-test',
      version: '1.0.0',
    });

    await client.connect(transport);
    record('Test 1: Initialize', true, 'Connected to wrapper');

    // ───── Test 2: List Tools ──────────────────────────────────────────────
    const { tools } = await client.listTools();
    const toolNames = tools.map(t => t.name).sort();
    const requiredTools = [
      'open_drawio_csv', 'open_drawio_mermaid', 'open_drawio_xml', 'search_shapes',
      'init_diagram', 'add_container', 'add_node', 'connect', 'disconnect',
      'connect_tiers', 'get_state', 'builder_validate', 'finalize',
    ];
    const hasAllTools = requiredTools.every(t => toolNames.includes(t));

    record(
      'Test 2: List Tools',
      hasAllTools && tools.length === 13,
      `Got ${tools.length} tools: ${toolNames.join(', ')}`,
    );

    // ───── Test 3: Reject Bad XML ──────────────────────────────────────────
    const badResult = await client.callTool({
      name: 'open_drawio_xml',
      arguments: { content: BAD_XML },
    });

    const badIsError = badResult.isError === true;
    const badText = (badResult.content || [])
      .map(c => (typeof c === 'string' ? c : c.text || ''))
      .join('\n');
    const badMentionsCollision = /collision/i.test(badText) || /overlap/i.test(badText);

    record(
      'Test 3: Reject Bad XML',
      badIsError && badMentionsCollision,
      `isError=${badIsError}, mentions collision/overlap=${badMentionsCollision}`,
    );

    // ───── Test 4: Accept Good XML ─────────────────────────────────────────
    const goodResult = await client.callTool({
      name: 'open_drawio_xml',
      arguments: { content: GOOD_XML },
    });

    const goodNotError = goodResult.isError !== true;
    const goodText = (goodResult.content || [])
      .map(c => (typeof c === 'string' ? c : c.text || ''))
      .join('\n');
    const goodHasUrl = /draw\.io/i.test(goodText) || /editor/i.test(goodText);

    record(
      'Test 4: Accept Good XML',
      goodNotError && goodHasUrl,
      `isError=${!goodNotError}, mentions editor URL=${goodHasUrl}`,
    );

    // ───── Test 5: Builder Full Workflow ────────────────────────────────────
    // Step 1: init
    let r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'E2E Test' } }));
    if (!r.success) { record('Test 5: Builder Workflow', false, `init_diagram failed: ${r.error}`); throw new Error('stop'); }

    // Step 2: add a container
    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'grp1', label: 'Group 1', type: 'group' } }));
    if (!r.success) { record('Test 5: Builder Workflow', false, `add_container failed: ${r.error}`); throw new Error('stop'); }

    // Step 3: add nodes (using generic rectangles to avoid AWS topology rules)
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'n1', label: 'Node A', type: 'rectangle', parent_id: 'grp1' } }));
    if (!r.success) { record('Test 5: Builder Workflow', false, `add_node n1 failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'n2', label: 'Node B', type: 'rectangle', parent_id: 'grp1' } }));
    if (!r.success) { record('Test 5: Builder Workflow', false, `add_node n2 failed: ${r.error}`); throw new Error('stop'); }

    // Step 4: connect
    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'n1', target_id: 'n2' } }));
    if (!r.success) { record('Test 5: Builder Workflow', false, `connect failed: ${r.error}`); throw new Error('stop'); }

    // Step 5: get_state
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const stateOk = r.success && r.containers.length === 1 && r.nodes.length === 2 && r.edges.length === 1;

    // Step 6: finalize
    const finalResult = await client.callTool({ name: 'finalize', arguments: {} });
    const finalText = (finalResult.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
    const finalHasUrl = /draw\.io/i.test(finalText) || /editor/i.test(finalText);

    record(
      'Test 5: Builder Workflow',
      stateOk && finalHasUrl,
      `State: ${r.summary || '?'} | Finalize: ${finalHasUrl ? 'URL returned' : 'no URL'}`,
    );

    // ───── Test 6: BPMN Swimlanes ───────────────────────────────────────────
    // Init diagram with type 'bpmn'
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'BPMN Test', type: 'bpmn' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add 2 lanes
    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'lane1', label: 'User Lane', type: 'lane' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `add lane1 failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'lane2', label: 'System Lane', type: 'lane' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `add lane2 failed: ${r.error}`); throw new Error('stop'); }

    // Add nodes inside lanes
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'start', label: 'Start', type: 'circle', parent_id: 'lane1' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `add start node failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'task1', label: 'Do Work', type: 'rectangle', parent_id: 'lane1' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `add task1 failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'task2', label: 'Validate', type: 'rectangle', parent_id: 'lane2' } }));
    if (!r.success) { record('Test 6: BPMN Swimlanes', false, `add task2 failed: ${r.error}`); throw new Error('stop'); }

    // Connect them
    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'start', target_id: 'task1' } }));
    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'task1', target_id: 'task2' } }));

    // Finalize
    const bpmnFinal = await client.callTool({ name: 'finalize', arguments: {} });
    const bpmnText = (bpmnFinal.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
    const bpmnOk = /draw\.io/i.test(bpmnText) || /editor/i.test(bpmnText);

    record(
      'Test 6: BPMN Swimlanes',
      bpmnOk,
      `BPMN diagram finalized successfully: ${bpmnOk ? 'OK' : 'Failed'}`
    );

    // ───── Test 7: PFD Nozzles & Suppression ─────────────────────────────────
    // Init diagram with type 'pfd'
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'PFD Test', type: 'pfd' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add nodes (equipment)
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'sep', label: '3-Phase Separator', type: 'vessel', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add vessel failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'pump', label: 'Oil Pump', type: 'pump', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add pump failed: ${r.error}`); throw new Error('stop'); }

    // Connect with nozzle overrides (exitPort, entryPort)
    r = parseBuilderResult(await client.callTool({
      name: 'connect',
      arguments: {
        source_id: 'sep',
        target_id: 'pump',
        label: 'Oil Stream',
        exit_port: 'bottom',
        entry_port: 'left'
      }
    }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `connect with nozzles failed: ${r.error}`); throw new Error('stop'); }

    // Finalize
    const pfdFinal = await client.callTool({ name: 'finalize', arguments: {} });
    const pfdText = (pfdFinal.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
    const pfdOk = /draw\.io/i.test(pfdText) || /editor/i.test(pfdText);

    record(
      'Test 7: PFD Workflow',
      pfdOk,
      `PFD diagram finalized successfully: ${pfdOk ? 'OK' : 'Failed'}`
    );

  } catch (err) {
    if (err.message !== 'stop') {
      const testNum = results.length + 1;
      record(`Test ${testNum}: (crashed)`, false, err.message);
    }
  } finally {
    try { await client?.close(); } catch (_) { /* ignore */ }
    clearTimeout(timer);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${passed}/${total} tests passed`);
  console.log(`${'═'.repeat(50)}`);

  process.exit(passed === total ? 0 : 1);
}

main();
