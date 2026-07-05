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
      'connect_tiers', 'connect_ha_compute_to_data', 'provision_ha_data_tier', 'get_state', 'builder_validate', 'finalize',
    ];
    const hasAllTools = requiredTools.every(t => toolNames.includes(t));

    record(
      'Test 2: List Tools',
      hasAllTools && tools.length === 15,
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

    // ───── Test 8: HA Compute to Data Macro ───────────────────────────────
    // Init diagram with type 'architecture'
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'HA Macro Test', type: 'architecture' } }));
    if (!r.success) { record('Test 8: HA Macro Workflow', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add VPC, AZs, Subnets, compute, DBs, caches
    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'azA', label: 'AZ A', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'azB', label: 'AZ B', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'appA', label: 'App A', type: 'subnet', parent_id: 'azA', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'appB', label: 'App B', type: 'subnet', parent_id: 'azB', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'dataA', label: 'Data A', type: 'subnet', parent_id: 'azA', tier: 'data' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'dataB', label: 'Data B', type: 'subnet', parent_id: 'azB', tier: 'data' } });

    await client.callTool({ name: 'add_node', arguments: { id: 'ecsB', label: 'ECS B', type: 'ecs', parent_id: 'appB' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbA', label: 'Primary DB', type: 'rds', parent_id: 'dataA', variant: 'primary' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbB', label: 'Replica DB', type: 'rds', parent_id: 'dataB', variant: 'replica' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cacheA', label: 'Cache A', type: 'elasticache', parent_id: 'dataA', variant: 'primary' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cacheB', label: 'Cache B', type: 'elasticache', parent_id: 'dataB', variant: 'replica' } });

    // Run the macro
    r = parseBuilderResult(await client.callTool({
      name: 'connect_ha_compute_to_data',
      arguments: {
        compute_id: 'ecsB',
        primary_db_id: 'dbA',
        replica_db_id: 'dbB',
        primary_cache_id: 'cacheA',
        replica_cache_id: 'cacheB'
      }
    }));
    
    // Check that edges were correctly populated
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const hasEcsBToDbA = r.edges.some(e => e.source === 'ecsB' && e.target === 'dbA');
    const hasEcsBToDbB = r.edges.some(e => e.source === 'ecsB' && e.target === 'dbB');
    const hasDbAToDbB = r.edges.some(e => e.source === 'dbA' && e.target === 'dbB');
    const hasCacheAToCacheB = r.edges.some(e => e.source === 'cacheA' && e.target === 'cacheB');
    const hasEcsBToCacheB = r.edges.some(e => e.source === 'ecsB' && e.target === 'cacheB');

    const macroOk = r.success && hasEcsBToDbA && hasEcsBToDbB && hasDbAToDbB && hasCacheAToCacheB && hasEcsBToCacheB;

    record(
      'Test 8: HA Macro Workflow',
      macroOk,
      `State edges: ${r.edges.length}/5 connected correctly. ecsB->dbA=${hasEcsBToDbA}, ecsB->dbB=${hasEcsBToDbB}, dbA->dbB=${hasDbAToDbB}, cacheA->cacheB=${hasCacheAToCacheB}, ecsB->cacheB=${hasEcsBToCacheB}`
    );

    // ───── Test 9: provision_ha_data_tier Macro ───────────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Provision HA Macro Test', type: 'architecture' } }));
    if (!r.success) { record('Test 9: provision_ha_data_tier Workflow', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add VPC, AZs, Subnets, compute, DBs, caches
    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'azA', label: 'AZ A', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'azB', label: 'AZ B', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'appA', label: 'App A', type: 'subnet', parent_id: 'azA', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'appB', label: 'App B', type: 'subnet', parent_id: 'azB', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'dataA', label: 'Data A', type: 'subnet', parent_id: 'azA', tier: 'data' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'dataB', label: 'Data B', type: 'subnet', parent_id: 'azB', tier: 'data' } });

    await client.callTool({ name: 'add_node', arguments: { id: 'ecsA', label: 'ECS A', type: 'ecs', parent_id: 'appA' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'ecsB', label: 'ECS B', type: 'ecs', parent_id: 'appB' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbA', label: 'Primary DB', type: 'rds', parent_id: 'dataA', variant: 'primary' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbB', label: 'Replica DB', type: 'rds', parent_id: 'dataB', variant: 'replica' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cacheA', label: 'Cache A', type: 'elasticache', parent_id: 'dataA', variant: 'primary' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cacheB', label: 'Cache B', type: 'elasticache', parent_id: 'dataB', variant: 'replica' } });

    // Run the macro for RDS
    await client.callTool({
      name: 'provision_ha_data_tier',
      arguments: {
        primary_az_compute_id: 'ecsA',
        secondary_az_compute_id: 'ecsB',
        data_resource_type: 'rds'
      }
    });

    // Run the macro for ElastiCache
    await client.callTool({
      name: 'provision_ha_data_tier',
      arguments: {
        primary_az_compute_id: 'ecsA',
        secondary_az_compute_id: 'ecsB',
        data_resource_type: 'elasticache'
      }
    });
    
    // Check that edges were correctly populated
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const hasEcsAToDbA_9 = r.edges.some(e => e.source === 'ecsA' && e.target === 'dbA');
    const hasEcsBToDbB_9 = r.edges.some(e => e.source === 'ecsB' && e.target === 'dbB');
    const hasEcsBToDbA_cross_9 = r.edges.some(e => e.source === 'ecsB' && e.target === 'dbA');
    const hasDbAToDbB_rep_9 = r.edges.some(e => e.source === 'dbA' && e.target === 'dbB');
    const hasEcsAToCacheA_9 = r.edges.some(e => e.source === 'ecsA' && e.target === 'cacheA');
    const hasEcsBToCacheB_9 = r.edges.some(e => e.source === 'ecsB' && e.target === 'cacheB');
    const hasCacheAToCacheB_rep_9 = r.edges.some(e => e.source === 'cacheA' && e.target === 'cacheB');

    const provisionOk_9 = r.success && hasEcsAToDbA_9 && hasEcsBToDbB_9 && hasEcsBToDbA_cross_9 && hasDbAToDbB_rep_9 && hasEcsAToCacheA_9 && hasEcsBToCacheB_9 && hasCacheAToCacheB_rep_9;

    record(
      'Test 9: provision_ha_data_tier Workflow',
      provisionOk_9,
      `State edges: ${r.edges.length} connected. ecsA->dbA=${hasEcsAToDbA_9}, ecsB->dbB=${hasEcsBToDbB_9}, ecsB->dbA=${hasEcsBToDbA_cross_9}, dbA->dbB=${hasDbAToDbB_rep_9}, ecsA->cacheA=${hasEcsAToCacheA_9}, ecsB->cacheB=${hasEcsBToCacheB_9}, cacheA->cacheB=${hasCacheAToCacheB_rep_9}`
    );

    // ───── Test 10: Region & Horizontal Layout ─────────────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Region Test', type: 'architecture' } }));
    if (!r.success) { record('Test 10: Region & Horizontal Layout', false, `init failed: ${r.error}`); throw new Error('stop'); }

    await client.callTool({ name: 'add_container', arguments: { id: 'reg', label: 'AWS Region', type: 'region' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cf', label: 'CDN', type: 'cloudfront', parent_id: 'reg' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'gw', label: 'API GW', type: 'apigateway', parent_id: 'reg' } });

    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const cfNode = r.nodes.find(n => n.id === 'cf');
    const gwNode = r.nodes.find(n => n.id === 'gw');
    
    // They must be horizontal: cfNode.y === gwNode.y and cfNode.x !== gwNode.x
    const layoutOk = r.success && cfNode && gwNode && cfNode.y === gwNode.y && cfNode.x !== gwNode.x;
    
    record(
      'Test 10: Region & Horizontal Layout',
      layoutOk,
      `Region created: ${r.success}. CDN x=${cfNode?.x} y=${cfNode?.y}, GW x=${gwNode?.x} y=${gwNode?.y}`
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
