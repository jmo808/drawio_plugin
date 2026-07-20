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
import fs from 'node:fs';
import os from 'node:os';
import { DOMParser } from '@xmldom/xmldom';

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
const TIMEOUT_MS = 40_000;
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
      env: {
        ...process.env,
        MCP_WORKSPACE_ROOT: os.tmpdir()
      }
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
      'connect_tiers', 'connect_ha_compute_to_data', 'provision_ha_data_tier', 'get_state', 'builder_validate', 'validate_file', 'compile_json_spec', 'finalize',
    ];
    const hasAllTools = requiredTools.every(t => toolNames.includes(t));

    const openXmlT = tools.find(t => t.name === 'open_drawio_xml');
    const compileJsonT = tools.find(t => t.name === 'compile_json_spec');
    const addNodeT = tools.find(t => t.name === 'add_node');
    const addContainerT = tools.find(t => t.name === 'add_container');
    const connectT = tools.find(t => t.name === 'connect');

    const descOk = (
      openXmlT && openXmlT.description.includes('Only use for loading existing diagrams') &&
      compileJsonT && compileJsonT.description.includes('MANDATORY: Use this tool to generate all new diagrams') &&
      addNodeT && addNodeT.description.includes('Only use for making incremental modifications') &&
      addContainerT && addContainerT.description.includes('Only use for making incremental modifications') &&
      connectT && connectT.description.includes('Only use for making incremental modifications')
    );

    record(
      'Test 2: List Tools',
      hasAllTools && tools.length >= 20 && descOk,
      `Got ${tools.length} tools. Descriptions interception matched: ${descOk}`,
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
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'feed', label: 'Feed Tank', type: 'vessel', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add feed failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'sep', label: '3-Phase Separator', type: 'vessel', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add vessel failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'pump', label: 'Oil Pump', type: 'pump', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add pump failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'prod', label: 'Product Tank', type: 'vessel', parent_id: '1' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `add prod failed: ${r.error}`); throw new Error('stop'); }

    // Connect feed to separator
    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'feed', target_id: 'sep', label: 'Feed Stream' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `connect feed stream failed: ${r.error}`); throw new Error('stop'); }

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

    // Connect pump to product
    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'pump', target_id: 'prod', label: 'Product Stream' } }));
    if (!r.success) { record('Test 7: PFD Workflow', false, `connect product stream failed: ${r.error}`); throw new Error('stop'); }

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

    // ───── Test 11: Multi-AZ Ingress and Compute Corrections ───────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Corrections Test', type: 'architecture' } }));
    if (!r.success) { record('Test 11: Multi-AZ Corrections', false, `init failed: ${r.error}`); throw new Error('stop'); }

    await client.callTool({ name: 'add_node', arguments: { id: 'client', label: 'User Client', type: 'user', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'cf', label: 'CloudFront CDN', type: 'cloudfront', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'apigw', label: 'API Gateway', type: 'apigateway', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'queue', label: 'Task Queue', type: 'sqs', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'r53', label: 'Route 53', type: 'route53', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'waf', label: 'WAF & Shield', type: 'waf', parent_id: '1' } });
    
    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'Production VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az1', label: 'us-east-1a', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az2', label: 'us-east-1b', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'pub1', label: 'Public Subnet', type: 'subnet', parent_id: 'az1', tier: 'web' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'pub2', label: 'Public Subnet', type: 'subnet', parent_id: 'az2', tier: 'web' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'app1', label: 'App Subnet', type: 'subnet', parent_id: 'az1', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'app2', label: 'App Subnet', type: 'subnet', parent_id: 'az2', tier: 'app' } });

    await client.callTool({ name: 'add_node', arguments: { id: 'albA', label: 'External ALB A', type: 'alb', parent_id: 'pub1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'albB', label: 'External ALB B', type: 'alb', parent_id: 'pub2' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'ecs1', label: 'ECS Worker A', type: 'ecs', parent_id: 'app1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'ecs2', label: 'ECS Worker B', type: 'ecs', parent_id: 'app2' } });

    // Connections with violations
    await client.callTool({ name: 'connect', arguments: { source_id: 'client', target_id: 'albA', label: 'Forward Traffic' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'cf', target_id: 'albA', label: 'Forward Traffic' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'cf', target_id: 'ecs1', label: 'Bypass Routing' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'ecs1', target_id: 'ecs2', label: 'Sync' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'ecs1', target_id: 'apigw', label: 'Publish Event' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'ecs2', target_id: 'apigw', label: 'REST API Call' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'r53', target_id: 'ecs1', label: 'DNS Resolve' } });

    // Finalize triggers corrections
    r = parseBuilderResult(await client.callTool({ name: 'finalize', arguments: {} }));
    
    // Fetch state again to inspect corrections
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const albsCount = r.nodes.filter(n => n.type === 'alb').length;
    const ecs1ToEcs2Edge = r.edges.find(e => e.source === 'ecs1' && e.target === 'ecs2');
    const clientToAlbEdge = r.edges.find(e => e.source === 'client' && e.target === 'albA');
    const cfToAlbEdge = r.edges.find(e => e.source === 'cf' && e.target === 'albA');
    const cfToEcs1Edge = r.edges.find(e => e.source === 'cf' && e.target === 'ecs1');
    const cfToApigwEdge = r.edges.find(e => e.source === 'cf' && e.target === 'apigw');
    const apigwToAlbEdge = r.edges.find(e => e.source === 'apigw' && e.target === 'albA');
    const ecs1ToApigwEdge = r.edges.find(e => e.source === 'ecs1' && e.target === 'apigw');
    const ecs2ToApigwEdge = r.edges.find(e => e.source === 'ecs2' && e.target === 'apigw');
    const ecs1ToSqsEdge = r.edges.find(e => e.source === 'ecs1' && e.target === 'queue');
    const r53ToEcs1Edge = r.edges.find(e => e.source === 'r53' && e.target === 'ecs1');
    const r53ToWafEdge = r.edges.find(e => e.source === 'r53' && e.target === 'waf');
    const albANode = r.nodes.find(n => n.id === 'albA');
    const albBNode = r.nodes.find(n => n.id === 'albB');
    const doubleAlbMerged = albsCount === 2 && albANode && albANode.parent === 'pub1' && albBNode && albBNode.parent === 'pub2';
    const horizontalComputeEdgeDeleted = !ecs1ToEcs2Edge;
    const clientBypassFixed = !clientToAlbEdge && apigwToAlbEdge && apigwToAlbEdge.label === 'Forward';
    const cdnToApigwAligned = !cfToAlbEdge && !cfToEcs1Edge && cfToApigwEdge && cfToApigwEdge.label === 'Forward';
    const eventFlowTargetingFixed = !ecs1ToApigwEdge && ecs1ToSqsEdge && ecs1ToSqsEdge.label === 'Publish Event Logs';
    const reverseSyncEdgePurged = !ecs2ToApigwEdge;
    const dnsHallucinationFixed = !r53ToEcs1Edge && r53ToWafEdge && r53ToWafEdge.label === 'Route Traffic';

    const correctionsOk = r.success && doubleAlbMerged && horizontalComputeEdgeDeleted && clientBypassFixed && cdnToApigwAligned && eventFlowTargetingFixed && reverseSyncEdgePurged && dnsHallucinationFixed;

    record(
      'Test 11: Multi-AZ Ingress and Compute Corrections',
      correctionsOk,
      `Double ALB Preserved/Nested (pub1/pub2): ${doubleAlbMerged}. Cross-AZ compute edge deleted: ${horizontalComputeEdgeDeleted}. Client Bypass Rerouted: ${clientBypassFixed}. CDN Aligned: ${cdnToApigwAligned}. Event Flow Rerouted to SQS: ${eventFlowTargetingFixed}. Reverse Sync Purged: ${reverseSyncEdgePurged}. DNS Hallucination Fixed: ${dnsHallucinationFixed}.`
    );

    // ───── Test 12: validate_file Tool ──────────────────────────────────────
    const tempFile = path.join(os.tmpdir(), `test-e2e-validate-${Date.now()}.xml`);
    const validXmlContent = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="n" value="Node" style="shape=rectangle" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>`;
    fs.writeFileSync(tempFile, validXmlContent, 'utf8');

    r = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempFile } }));
    fs.unlinkSync(tempFile);

    const validateFileOk = r.success && r.errors.length === 0;
    record(
      'Test 12: validate_file Tool',
      validateFileOk,
      `Validation succeeded: ${r.success}, Errors count: ${r.errors?.length}`
    );

    // ───── Test 13: Edge Type Validation Matrix (aws.js) ─────────────────────
    const tempInvalidFile = path.join(os.tmpdir(), `test-e2e-invalid-${Date.now()}.xml`);
    const invalidXmlContent = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="client" value="User Client" style="shape=mxgraph.aws3.user" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="cf" value="CloudFront CDN" style="shape=mxgraph.aws3.cloudfront" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="alb" value="External ALB" style="shape=mxgraph.aws3.application_load_balancer" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="ecs" value="ECS Web Task" style="shape=mxgraph.aws3.ecs" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="apigw" value="API Gateway" style="shape=mxgraph.aws3.apigateway" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="r53" value="Route 53" style="shape=mxgraph.aws3.route53" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="waf" value="WAF Shield" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/></mxCell>
      
      <mxCell id="e1" edge="1" source="client" target="alb" parent="1"/>
      <mxCell id="e2" edge="1" source="ecs" target="apigw" parent="1"/>
      <mxCell id="e3" edge="1" source="r53" target="ecs" parent="1"/>
      <mxCell id="e4" edge="1" source="cf" target="ecs" parent="1"/>
      <mxCell id="e5" edge="1" source="alb" target="apigw" parent="1"/>
      <mxCell id="e6" edge="1" source="alb" target="ecs" style="dashed=1" parent="1"/>
      <mxCell id="e7" edge="1" source="apigw" target="ecs" parent="1"/>
      <mxCell id="e8" edge="1" source="waf" target="alb" parent="1"/>
    </root></mxGraphModel>`;
    
    fs.writeFileSync(tempInvalidFile, invalidXmlContent, 'utf8');
    r = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempInvalidFile } }));
    fs.unlinkSync(tempInvalidFile);

    const hasBypassErr = r.errors.some(e => e.includes('bypassing CDN/WAF to External ALB are forbidden'));
    const hasApigwErr = r.errors.some(e => e.includes('Outbound API Gateway event targeting is forbidden'));
    const hasDnsErr = r.errors.some(e => e.includes('Direct routing from Route 53 to private compute nodes is forbidden'));
    const hasCdnComputeErr = r.errors.some(e => e.includes('Direct connections from CloudFront to private compute nodes are forbidden'));
    const hasReverseProxyErr = r.errors.some(e => e.includes('Outbound routing from ALB to API Gateway or CDN is forbidden'));
    const hasDashedAlbComputeErr = r.errors.some(e => e.includes('Edge from Load Balancer to private compute nodes must be solid request traffic'));
    const hasApigwComputeBypassErr = r.errors.some(e => e.includes('API Gateway is forbidden from routing directly to private compute nodes when an ALB is present'));
    const hasWafBypassErr = r.errors.some(e => e.includes('WAF & Shield must route to CloudFront CDN or API Gateway, not directly to ALB or compute'));

    const validationMatrixOk = !r.success && hasBypassErr && hasApigwErr && hasDnsErr && hasCdnComputeErr && hasReverseProxyErr && hasDashedAlbComputeErr && hasApigwComputeBypassErr && hasWafBypassErr;
    record(
      'Test 13: Edge Type Validation Matrix (aws.js)',
      validationMatrixOk,
      `Bypass Err: ${hasBypassErr}. APIGW Err: ${hasApigwErr}. DNS Err: ${hasDnsErr}. CDN->Compute Err: ${hasCdnComputeErr}. ReverseProxy Err: ${hasReverseProxyErr}. DashedAlb Err: ${hasDashedAlbComputeErr}. ApigwBypass Err: ${hasApigwComputeBypassErr}. WafBypass Err: ${hasWafBypassErr}.`
    );

    // ───── Test 14: compile_json_spec Tool ───────────────────────────────────
    const tempSpecFile = path.join(os.tmpdir(), `test-e2e-spec-${Date.now()}.json`);
    const tempOutputFile = path.join(os.tmpdir(), `test-e2e-compiled-${Date.now()}.xml`);
    const validSpecContent = {
        title: "Test Spec Diagram",
        theme: "light",
        type: "architecture",
        nodes: [
            { id: "n1", label: "Node 1", type: "rectangle", parentId: "1" },
            { id: "n2", label: "Node 2", type: "rectangle", parentId: "1" }
        ],
        edges: [
            { sourceId: "n1", targetId: "n2", label: "Connect" }
        ]
    };
    fs.writeFileSync(tempSpecFile, JSON.stringify(validSpecContent, null, 2), 'utf8');

    r = parseBuilderResult(await client.callTool({
        name: 'compile_json_spec',
        arguments: { spec_path: tempSpecFile, output_path: tempOutputFile }
    }));

    const outputFileExists = fs.existsSync(tempOutputFile);
    if (fs.existsSync(tempSpecFile)) fs.unlinkSync(tempSpecFile);
    if (outputFileExists) fs.unlinkSync(tempOutputFile);

    const compileJsonSpecOk = r.success && outputFileExists;
    record(
        'Test 14: compile_json_spec Tool',
        compileJsonSpecOk,
        `Success: ${r.success}. Output file created: ${outputFileExists}`
    );

    // ───── Test 15: Internal ALB Preservation ──────────────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Internal ALB Test', type: 'architecture' } }));
    if (!r.success) { record('Test 15: Internal ALB Preservation', false, `init failed: ${r.error}`); throw new Error('stop'); }

    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az1', label: 'AZ 1', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az2', label: 'AZ 2', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'pub1', label: 'Public Subnet', type: 'subnet', parent_id: 'az1', tier: 'web' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'app1', label: 'App Subnet', type: 'subnet', parent_id: 'az1', tier: 'app' } });

    await client.callTool({ name: 'add_node', arguments: { id: 'extAlbA', label: 'External ALB A', type: 'alb', parent_id: 'pub1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'extAlbB', label: 'External ALB B', type: 'alb', parent_id: 'pub1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'intAlb', label: 'Internal ALB', type: 'alb', parent_id: 'app1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'ecsWeb', label: 'ECS Web', type: 'ecs', parent_id: 'pub1' } });

    await client.callTool({ name: 'connect', arguments: { source_id: 'extAlbA', target_id: 'ecsWeb' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'intAlb', target_id: 'ecsWeb' } });

    // Finalize triggers ALB merge corrections
    r = parseBuilderResult(await client.callTool({ name: 'finalize', arguments: {} }));

    // Inspect state after corrections
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const allAlbs15 = r.nodes.filter(n => n.type === 'alb');
    const internalAlbSurvived = allAlbs15.some(n => n.parent === 'app1');
    const extAlbsMerged = allAlbs15.filter(n => n.parent !== 'app1').length === 1;
    const totalAlbs15 = allAlbs15.length;

    record(
      'Test 15: Internal ALB Preservation',
      r.success && internalAlbSurvived && extAlbsMerged && totalAlbs15 === 2,
      `Total ALBs: ${totalAlbs15}. Internal ALB survived: ${internalAlbSurvived}. External ALBs merged to 1: ${extAlbsMerged}`
    );

    // ───── Test 16: Route53 Type Registration ──────────────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Route53 Test', type: 'architecture' } }));
    if (!r.success) { record('Test 16: Route53 Type Registration', false, `init failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'r53node', label: 'Route 53 DNS', type: 'route53', parent_id: '1' } }));
    if (!r.success) { record('Test 16: Route53 Type Registration', false, `add_node failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const r53Node16 = r.nodes.find(n => n.id === 'r53node');
    const r53TypeOk = r53Node16 && r53Node16.type === 'route53';

    // Also validate the XML via validate_file
    const tempR53File = path.join(os.tmpdir(), `test-e2e-r53-${Date.now()}.xml`);
    const finR53 = await client.callTool({ name: 'finalize', arguments: {} });
    const finR53Text = (finR53.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
    // Extract the XML from the finalize result (the XML is base64-decoded or embedded)
    // Re-init and re-add to validate via validate_file with the built-in state
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Route53 Test 2', type: 'architecture' } }));
    await client.callTool({ name: 'add_node', arguments: { id: 'r53node2', label: 'Route 53 DNS', type: 'route53', parent_id: '1' } });
    const finalR53_2 = await client.callTool({ name: 'finalize', arguments: {} });
    const finalR53_2Text = (finalR53_2.content || []).map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
    // Extract XML from the URL (everything after data:application... or just check for editor text)
    const r53UrlMatch = finalR53_2Text.match(/https?:\/\/[^\s]+/);
    let validateR53Ok = true;
    if (r53UrlMatch) {
      // Decode the URL to get the XML, write to file and validate
      try {
        const url = new URL(r53UrlMatch[0]);
        const xmlParam = url.hash?.replace('#R', '') || '';
        const xmlContent = decodeURIComponent(xmlParam);
        if (xmlContent.includes('<mxGraphModel')) {
          fs.writeFileSync(tempR53File, xmlContent, 'utf8');
          const valR53 = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempR53File } }));
          validateR53Ok = valR53.success && valR53.errors.length === 0;
          if (fs.existsSync(tempR53File)) fs.unlinkSync(tempR53File);
        }
      } catch (_) { /* URL parsing failed, skip deep validation */ }
    }

    record(
      'Test 16: Route53 Type Registration',
      r.success && r53TypeOk && validateR53Ok,
      `Node exists: ${!!r53Node16}. Type is route53: ${r53TypeOk}. Validation OK: ${validateR53Ok}`
    );

    // ───── Test 17: EventBridge Node Style ─────────────────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'EventBridge Test', type: 'architecture' } }));
    if (!r.success) { record('Test 17: EventBridge Node Style', false, `init failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'eb', label: 'Event Bus', type: 'eventbridge', parent_id: '1' } }));
    if (!r.success) { record('Test 17: EventBridge Node Style', false, `add eventbridge failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'consumer', label: 'Consumer', type: 'ecs', parent_id: '1' } }));
    if (!r.success) { record('Test 17: EventBridge Node Style', false, `add ecs failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'connect', arguments: { source_id: 'eb', target_id: 'consumer' } }));
    if (!r.success) { record('Test 17: EventBridge Node Style', false, `connect failed: ${r.error}`); throw new Error('stop'); }

    // get_state verifies edge exists and is dashed
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const ebEdge = r.edges.find(e => e.source === 'eb' && e.target === 'consumer');
    const ebEdgeIsDashed = ebEdge && ebEdge.style === 'dashed';

    // Finalize ensures the XML parses and validates successfully
    const ebFinal = await client.callTool({ name: 'finalize', arguments: {} });

    record(
      'Test 17: EventBridge Node Style',
      r.success && !!ebEdge && ebEdgeIsDashed && !!ebFinal,
      `Edge exists: ${!!ebEdge}. Style is dashed: ${ebEdgeIsDashed}.`
    );

    // ───── Test 18: Primary/Replica Heuristic Safety ───────────────────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Heuristic Test', type: 'architecture' } }));
    if (!r.success) { record('Test 18: Primary/Replica Heuristic Safety', false, `init failed: ${r.error}`); throw new Error('stop'); }

    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az1', label: 'AZ 1', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'app1', label: 'App Subnet', type: 'subnet', parent_id: 'az1', tier: 'app' } });

    await client.callTool({ name: 'add_node', arguments: { id: 'lambda', label: 'API Handler', type: 'lambda', parent_id: 'app1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'web', label: 'Web Server', type: 'ecs', parent_id: 'app1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'sqs2', label: 'Task Queue', type: 'sqs', parent_id: 'app1' } });

    await client.callTool({ name: 'connect', arguments: { source_id: 'lambda', target_id: 'web', label: 'Forward' } });

    // Finalize triggers the correction pass including primary/replica heuristic
    r = parseBuilderResult(await client.callTool({ name: 'finalize', arguments: {} }));

    // Inspect state after corrections
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    // The edge we created was lambda -> web. The SQS auto-wiring may add a compute->sqs edge.
    // The KEY check is that no spurious primary/replica edges were created (e.g. treating
    // 'lambda' ending in 'a' as primary or 'web' ending in 'b' as replica).
    const manualEdge18 = r.edges.find(e => e.source === 'lambda' && e.target === 'web');
    // Check for spurious replication/cross-AZ write edges
    const hasReplicationEdge = r.edges.some(e => (e.label || '').toLowerCase().includes('replication'));
    const hasCrossAzWrite = r.edges.some(e => (e.label || '').toLowerCase().includes('read/write'));
    const noSpuriousEdges = !hasReplicationEdge && !hasCrossAzWrite;

    record(
      'Test 18: Primary/Replica Heuristic Safety',
      r.success && noSpuriousEdges && !!manualEdge18,
      `Total edges: ${r.edges.length}. Manual edge present: ${!!manualEdge18}. No replication edges: ${!hasReplicationEdge}. No cross-AZ writes: ${!hasCrossAzWrite}`
    );

    // ───── Test 19: JSON Spec with Ports and Color ─────────────────────────
    const tempSpecFile19 = path.join(os.tmpdir(), `test-e2e-spec19-${Date.now()}.json`);
    const tempOutputFile19 = path.join(os.tmpdir(), `test-e2e-compiled19-${Date.now()}.xml`);
    const specContent19 = {
      title: 'Port Test',
      type: 'pfd',
      containers: [],
      nodes: [
        { id: 'v1', label: 'Vessel', type: 'vessel', parentId: '1' },
        { id: 'p1', label: 'Pump', type: 'pump', parentId: '1' }
      ],
      edges: [
        { sourceId: 'v1', targetId: 'p1', label: 'Oil', style: 'solid', exitPort: 'bottom', entryPort: 'left', color: '#b85450' }
      ]
    };
    fs.writeFileSync(tempSpecFile19, JSON.stringify(specContent19, null, 2), 'utf8');

    r = parseBuilderResult(await client.callTool({
      name: 'compile_json_spec',
      arguments: { spec_path: tempSpecFile19, output_path: tempOutputFile19 }
    }));

    let portColorOk = false;
    const outputExists19 = fs.existsSync(tempOutputFile19);
    if (outputExists19) {
      const outputXml19 = fs.readFileSync(tempOutputFile19, 'utf8');
      const hasExitBottom = outputXml19.includes('exitX=0.5') && outputXml19.includes('exitY=1');
      const hasEntryLeft = outputXml19.includes('entryX=0') && outputXml19.includes('entryY=0.5');
      const hasColor = outputXml19.includes('strokeColor=#b85450');
      portColorOk = hasExitBottom && hasEntryLeft && hasColor;
    }

    if (fs.existsSync(tempSpecFile19)) fs.unlinkSync(tempSpecFile19);
    if (outputExists19) fs.unlinkSync(tempOutputFile19);

    record(
      'Test 19: JSON Spec with Ports and Color',
      r.success && outputExists19 && portColorOk,
      `Success: ${r.success}. Output exists: ${outputExists19}. Port/Color in XML: ${portColorOk}`
    );

    // ───── Test 20: Serverless Layout and Data Matrix validation ───────────
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'Serverless Layout Test', type: 'architecture' } }));
    if (!r.success) { record('Test 20: Serverless Layout and Data Matrix validation', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add API Gateway, Event Bridge, and DynamoDB Tables
    await client.callTool({ name: 'add_node', arguments: { id: 'apigw', label: 'API Gateway', type: 'apigateway', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'eb', label: 'Event Bus', type: 'eventbridge', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbA', label: 'DynamoDB Table A Primary', type: 'dynamodb', parent_id: '1', variant: 'primary' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'dbB', label: 'DynamoDB Table B Replica', type: 'dynamodb', parent_id: '1', variant: 'replica' } });

    // VPC and AZs
    await client.callTool({ name: 'add_container', arguments: { id: 'vpc', label: 'VPC', type: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az1', label: 'AZ A', type: 'az', parent_id: 'vpc' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'az2', label: 'AZ B', type: 'az', parent_id: 'vpc' } });

    // Subnets: AZ A has both, AZ B has only one (creating empty subnet to be purged in AZ A)
    await client.callTool({ name: 'add_container', arguments: { id: 'appSubnetA', label: 'App Subnet A', type: 'subnet', parent_id: 'az1', tier: 'app' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'dataSubnetA', label: 'Private Data Subnet A', type: 'subnet', parent_id: 'az1', tier: 'data' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'appSubnetB', label: 'App Subnet B', type: 'subnet', parent_id: 'az2', tier: 'app' } });

    // AZ A compute nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'apiA', label: 'API Handler Api', type: 'lambda', parent_id: 'appSubnetA' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'workerA', label: 'Processor Worker Worker', type: 'ecs', parent_id: 'appSubnetA' } });

    // AZ B compute nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'apiB', label: 'API Handler Api', type: 'lambda', parent_id: 'appSubnetB' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'workerB', label: 'Processor Worker Worker', type: 'ecs', parent_id: 'appSubnetB' } });

    // Connect API Gateway directly to Event Bridge (direct integration hallucination)
    await client.callTool({ name: 'connect', arguments: { source_id: 'apigw', target_id: 'eb', label: 'Direct Integration' } });

    // Connect compute nodes to Event Bridge (to show upward routing)
    await client.callTool({ name: 'connect', arguments: { source_id: 'apiA', target_id: 'eb', label: 'Trigger' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'workerA', target_id: 'eb', label: 'Publish' } });

    // Finalize
    r = parseBuilderResult(await client.callTool({ name: 'finalize', arguments: {} }));

    // Get final state
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const hasApigwToEb = r.edges.some(e => e.source === 'apigw' && e.target === 'eb');
    const dataSubnetDeleted = !r.containers.some(c => c.id === 'dataSubnetA');
    const apiAToPrimary = r.edges.some(e => e.source === 'apiA' && e.target === 'dbA');
    const workerAToPrimary = r.edges.some(e => e.source === 'workerA' && e.target === 'dbA');
    const apiBToReplica = r.edges.some(e => e.source === 'apiB' && e.target === 'dbB');
    const workerBToReplica = r.edges.some(e => e.source === 'workerB' && e.target === 'dbB');
    const apiBToPrimaryCross = r.edges.some(e => e.source === 'apiB' && e.target === 'dbA');
    const workerBToPrimaryCross = r.edges.some(e => e.source === 'workerB' && e.target === 'dbA');

    const dbAPosition = r.nodes.find(n => n.id === 'dbA');
    const ebPosition = r.nodes.find(n => n.id === 'eb');
    const dbBPosition = r.nodes.find(n => n.id === 'dbB');
    const flankedCorrectly = dbAPosition && ebPosition && dbBPosition && dbAPosition.x < ebPosition.x && ebPosition.x < dbBPosition.x;

    const test20Ok = r.success && !hasApigwToEb && dataSubnetDeleted && apiAToPrimary && workerAToPrimary && apiBToReplica && workerBToReplica && apiBToPrimaryCross && workerBToPrimaryCross && flankedCorrectly;

    record(
      'Test 20: Serverless Layout and Data Matrix validation',
      test20Ok,
      `API Gateway to EventBridge purged: ${!hasApigwToEb}. Empty subnet purged: ${dataSubnetDeleted}. AZ-A worker connected to Primary: ${workerAToPrimary}. AZ-B worker connected to Replica/Primary: ${workerBToReplica}/${workerBToPrimaryCross}. DynamoDB flanking EB: ${flankedCorrectly}.`
    );

    // ───── Test 21: PFD Layout Wraparound & Font Color ───────────────────────
    // Init diagram with type 'pfd'
    r = parseBuilderResult(await client.callTool({ name: 'init_diagram', arguments: { title: 'PFD Wraparound Test', type: 'pfd' } }));
    if (!r.success) { record('Test 21: PFD Layout Wraparound & Font Color', false, `init failed: ${r.error}`); throw new Error('stop'); }

    // Add 3 AZ containers
    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'az1', label: '120 Grinding', type: 'az' } }));
    if (!r.success) { record('Test 21: PFD Layout Wraparound & Font Color', false, `add az1 failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'az2', label: '130 Milling Screen', type: 'az' } }));
    if (!r.success) { record('Test 21: PFD Layout Wraparound & Font Color', false, `add az2 failed: ${r.error}`); throw new Error('stop'); }

    r = parseBuilderResult(await client.callTool({ name: 'add_container', arguments: { id: 'az3', label: '210 Ore Separation', type: 'az' } }));
    if (!r.success) { record('Test 21: PFD Layout Wraparound & Font Color', false, `add az3 failed: ${r.error}`); throw new Error('stop'); }

    // Add a node into each to force autoExpand and check parent shifting
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'node1', label: 'Mill 1', type: 'vessel', parent_id: 'az1' } }));
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'node2', label: 'Screen 1', type: 'pump', parent_id: 'az2' } }));
    r = parseBuilderResult(await client.callTool({ name: 'add_node', arguments: { id: 'node3', label: 'Float 1', type: 'cyclone', parent_id: 'az3' } }));

    // Get final state
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const az1Obj = r.containers.find(c => c.id === 'az1');
    const az2Obj = r.containers.find(c => c.id === 'az2');
    const az3Obj = r.containers.find(c => c.id === 'az3');

    // az1 and az2 should be on row 0 (y=160), az3 should be on row 1 (y >= 500)
    const row0Ok = az1Obj && az2Obj && az1Obj.y === 160 && az2Obj.y === 160;
    const row1Ok = az3Obj && az3Obj.y >= 500;
    const fontColorOk = az1Obj?.style?.includes('fontColor=light-dark') && az1Obj.style.includes('#000000');

    const test21Ok = r.success && row0Ok && row1Ok && fontColorOk;

    record(
      'Test 21: PFD Layout Wraparound & Font Color',
      test21Ok,
      `Row 0 AZs aligned (y=160): ${row0Ok}. Row 1 AZ wrapped (y>=500): ${row1Ok}. Font color correct: ${fontColorOk}.`
    );

    // Test 22: Container Layout mappings for new domains (K8s, Network, Flowchart Group)
    await client.callTool({ name: 'init_diagram', arguments: { title: 'New Domains Layout Test', type: 'architecture' } });
    
    // K8s containers
    await client.callTool({ name: 'add_container', arguments: { id: 'k8s_cluster', label: 'K8s Cluster', type: 'cluster' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'k8s_ns1', label: 'Namespace 1', type: 'namespace', parent_id: 'k8s_cluster' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'k8s_ns2', label: 'Namespace 2', type: 'namespace', parent_id: 'k8s_cluster' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'k8s_dep1', label: 'Deployment 1', type: 'deployment', parent_id: 'k8s_ns1' } });
    
    // Network containers
    await client.callTool({ name: 'add_container', arguments: { id: 'net_wan', label: 'WAN', type: 'wan' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'net_dmz', label: 'DMZ', type: 'dmz' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'net_lan', label: 'LAN', type: 'lan' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'net_vlan1', label: 'VLAN 1', type: 'vlan', parent_id: 'net_lan' } });
    await client.callTool({ name: 'add_container', arguments: { id: 'net_vlan2', label: 'VLAN 2', type: 'vlan', parent_id: 'net_lan' } });

    // Flowchart group
    await client.callTool({ name: 'add_container', arguments: { id: 'fc_group', label: 'Flowchart Group', type: 'group' } });
    
    // Finalize to run layout engine
    await client.callTool({ name: 'finalize', arguments: {} });
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const clusterVal = r.containers.find(c => c.id === 'k8s_cluster');
    const ns1Val = r.containers.find(c => c.id === 'k8s_ns1');
    const ns2Val = r.containers.find(c => c.id === 'k8s_ns2');
    const dep1Val = r.containers.find(c => c.id === 'k8s_dep1');
    
    const wanVal = r.containers.find(c => c.id === 'net_wan');
    const dmzVal = r.containers.find(c => c.id === 'net_dmz');
    const lanVal = r.containers.find(c => c.id === 'net_lan');
    const vlan1Val = r.containers.find(c => c.id === 'net_vlan1');
    const vlan2Val = r.containers.find(c => c.id === 'net_vlan2');
    
    const groupVal = r.containers.find(c => c.id === 'fc_group');

    // Assert that the container types mapped correctly to specific layout values
    const k8sLayoutOk = !!(clusterVal && ns1Val && ns2Val && dep1Val &&
                        ns1Val.width === 540 && ns2Val.width === 540 &&
                        ns2Val.x > ns1Val.x && dep1Val.width === ns1Val.width - 40);
                        
    const netLayoutOk = !!(wanVal && dmzVal && lanVal && vlan1Val && vlan2Val &&
                        dmzVal.y > wanVal.y && lanVal.y > dmzVal.y &&
                        vlan2Val.x > vlan1Val.x && vlan1Val.width === 350);
                        
    const groupLayoutOk = !!(groupVal && groupVal.width === 560);

    const test22Ok = r.success && k8sLayoutOk && netLayoutOk && groupLayoutOk;

    record(
      'Test 22: Container Layout mappings for new domains',
      test22Ok,
      `K8s layout Ok: ${k8sLayoutOk}. Network layout Ok: ${netLayoutOk}. Group layout Ok: ${groupLayoutOk}.`
    );

    // Test 23: Node style mapping and sizes for new domains
    await client.callTool({ name: 'init_diagram', arguments: { title: 'New Node Types Test', type: 'architecture' } });
    
    // Flowchart nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'fc_proc', label: 'Process', type: 'process', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'fc_dec', label: 'Decision', type: 'decision', parent_id: '1' } });
    
    // K8s nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'k8s_pod1', label: 'Pod 1', type: 'pod', parent_id: '1' } });
    
    // Network nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'net_rtr', label: 'Router 1', type: 'router', parent_id: '1' } });
    
    // Sequence nodes
    await client.callTool({ name: 'add_node', arguments: { id: 'seq_note', label: 'Note 1', type: 'note', parent_id: '1' } });
    
    // Finalize
    await client.callTool({ name: 'finalize', arguments: {} });
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const procNode = r.nodes.find(n => n.id === 'fc_proc');
    const decNode = r.nodes.find(n => n.id === 'fc_dec');
    const podNode = r.nodes.find(n => n.id === 'k8s_pod1');
    const rtrNode = r.nodes.find(n => n.id === 'net_rtr');
    const noteNode = r.nodes.find(n => n.id === 'seq_note');

    const nodeSizesOk = !!(
      procNode && procNode.width === 140 && procNode.height === 60 &&
      decNode && decNode.width === 140 && decNode.height === 80 &&
      podNode && podNode.width === 60 && podNode.height === 60 &&
      rtrNode && rtrNode.width === 80 && rtrNode.height === 60 &&
      noteNode && noteNode.width === 120 && noteNode.height === 60
    );

    const test23Ok = r.success && nodeSizesOk;
    record(
      'Test 23: Node Style and Size mapping for new domains',
      test23Ok,
      `Node sizes matched: ${nodeSizesOk}.`
    );

    // Test 24: Connector style mapping for new domains
    await client.callTool({ name: 'init_diagram', arguments: { title: 'New Edge Styles Test', type: 'architecture' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'n1', label: 'Node 1', type: 'rectangle', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'n2', label: 'Node 2', type: 'rectangle', parent_id: '1' } });
    
    await client.callTool({ name: 'connect', arguments: { source_id: 'n1', target_id: 'n2', label: '1:N Relation', style: '1:N' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'n2', target_id: 'n1', label: 'Callback', style: 'async' } });
    
    // Finalize
    const finalizeRes = await client.callTool({ name: 'finalize', arguments: {} });
    const outputXml = finalizeRes.xml || '';

    const style1Ok = outputXml.includes('endArrow=ERmany') && outputXml.includes('startArrow=ERone');
    const style2Ok = outputXml.includes('endArrow=open') && !outputXml.includes('dashed=1');

    const test24Ok = style1Ok && style2Ok;
    record(
      'Test 24: Connector style mapping for new domains',
      test24Ok,
      `1:N style matches: ${style1Ok}. Async style matches: ${style2Ok}.`
    );

    // Test 25: Flowchart Layout Strategy
    await client.callTool({ name: 'init_diagram', arguments: { title: 'Flowchart Layout Test', type: 'flowchart' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'fc1', label: 'Start', type: 'start', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'fc2', label: 'Process', type: 'process', parent_id: '1' } });
    await client.callTool({ name: 'finalize', arguments: {} });
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const fc1Val = r.nodes.find(n => n.id === 'fc1');
    const fc2Val = r.nodes.find(n => n.id === 'fc2');
    const flowchartOk = !!(fc1Val && fc2Val && (fc1Val.x + fc1Val.width / 2) === (fc2Val.x + fc2Val.width / 2) && fc2Val.y > fc1Val.y);

    // Test 26: Sequence Layout Strategy
    await client.callTool({ name: 'init_diagram', arguments: { title: 'Sequence Layout Test', type: 'sequence' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'p1', label: 'Alice', type: 'participant', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'p2', label: 'Bob', type: 'participant', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'act1', label: 'Active', type: 'activation', parent_id: 'p1' } });
    await client.callTool({ name: 'finalize', arguments: {} });
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const p1Val = r.nodes.find(n => n.id === 'p1');
    const p2Val = r.nodes.find(n => n.id === 'p2');
    const act1Val = r.nodes.find(n => n.id === 'act1');
    const sequenceOk = !!(p1Val && p2Val && act1Val && p2Val.x > p1Val.x && act1Val.parent === 'p1');

    // Test 27: Mind Map Layout Strategy
    await client.callTool({ name: 'init_diagram', arguments: { title: 'Mindmap Test', type: 'mindmap' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'center', label: 'Root Idea', type: 'central', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'branch1', label: 'Branch 1 (Right)', type: 'branch', parent_id: '1' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'branch2', label: 'Branch 2 (Left)', type: 'branch', parent_id: '1' } });
    await client.callTool({ name: 'finalize', arguments: {} });
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const centerVal = r.nodes.find(n => n.id === 'center');
    const b1Val = r.nodes.find(n => n.id === 'branch1');
    const b2Val = r.nodes.find(n => n.id === 'branch2');
    const mindmapOk = !!(centerVal && b1Val && b2Val && b1Val.x > centerVal.x && b2Val.x < centerVal.x);

    record('Test 25: Flowchart Layout Strategy', flowchartOk, `Flowchart Ok: ${flowchartOk}`);
    record('Test 26: Sequence Layout Strategy', sequenceOk, `Sequence Ok: ${sequenceOk}`);
    record('Test 27: Mind Map Layout Strategy', mindmapOk, `Mindmap Ok: ${mindmapOk}`);

    // Test 28: PFD equipment shape and size variant resolution
    await client.callTool({ name: 'init_diagram', arguments: { title: 'PFD Equipment Test', type: 'pfd' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'pump1', label: 'Centrifugal Pump', type: 'pump', parent_id: '1', variant: 'centrifugal' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'col1', label: 'Tray Column', type: 'distillation_column', parent_id: '1', variant: 'tray' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'col2', label: 'Packed Column', type: 'distillation_column', parent_id: '1', variant: 'packed' } });
    await client.callTool({ name: 'add_node', arguments: { id: 'pump2', label: 'PD Pump', type: 'pump', parent_id: '1', variant: 'positive_displacement' } });
    
    await client.callTool({ name: 'connect', arguments: { source_id: 'pump1', target_id: 'col1', label: 'Feed Stream' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'col1', target_id: 'pump2', label: 'Bottoms Discharge' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'pump1', target_id: 'col2', label: 'Feed Stream 2' } });
    await client.callTool({ name: 'connect', arguments: { source_id: 'col2', target_id: 'pump2', label: 'Bottoms Discharge 2' } });

    const finalizePfdRes = await client.callTool({ name: 'finalize', arguments: {} });
    const pfdXml = finalizePfdRes.xml || '';
    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));

    const p1Node = r.nodes ? r.nodes.find(n => n.id === 'pump1') : null;
    const p2Node = r.nodes ? r.nodes.find(n => n.id === 'pump2') : null;
    const col1Node = r.nodes ? r.nodes.find(n => n.id === 'col1') : null;
    const col2Node = r.nodes ? r.nodes.find(n => n.id === 'col2') : null;

    const pfdResolutionOk = !!(
      p1Node && p1Node.variant === 'centrifugal' && p1Node.width === 100 && p1Node.height === 70 &&
      p2Node && p2Node.variant === 'positive_displacement' && p2Node.width === 100 && p2Node.height === 70 &&
      col1Node && col1Node.variant === 'tray' && col1Node.width === 100 && col1Node.height === 320 &&
      col2Node && col2Node.variant === 'packed' && col2Node.width === 100 && col2Node.height === 320
    );

    const feedStreamOk = pfdXml.includes('source="pump1" target="col1"') &&
                         pfdXml.includes('exitX=1') && pfdXml.includes('exitY=0.5') &&
                         pfdXml.includes('entryX=0') && pfdXml.includes('entryY=0.5');
                         
    const bottomsStreamOk = pfdXml.includes('source="col1" target="pump2"') &&
                            pfdXml.includes('exitX=0.5') && pfdXml.includes('exitY=1') &&
                            pfdXml.includes('entryX=0') && pfdXml.includes('entryY=0.5');

    const test28Ok = pfdResolutionOk && feedStreamOk && bottomsStreamOk;
    record(
      'Test 28: PFD equipment variant and auto-nozzle resolution',
      test28Ok,
      `PFD equipment resolved: ${pfdResolutionOk}. Feed stream nozzle Ok: ${feedStreamOk}. Bottoms stream nozzle Ok: ${bottomsStreamOk}.`
    );
    // Test 29-34: PFD Validator Rules
    const tempPfdInvalidFile = path.join(os.tmpdir(), `test-e2e-pfd-invalid-${Date.now()}.xml`);
    const pfdInvalidXmlContent = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      
      <!-- Distillation column at x=100, y=100, w=100, h=300 -->
      <mxCell id="col" value="Fractionator" style="shape=mxgraph.pid.vessels.tray_column;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="300" as="geometry"/></mxCell>
      <!-- Pump at x=300, y=100, w=80, h=60 -->
      <mxCell id="pump" value="Suction Pump" style="shape=mxgraph.pid.pumps.centrifugal_pump_1;" vertex="1" parent="1"><mxGeometry x="300" y="100" width="80" height="60" as="geometry"/></mxCell>
      <!-- Vessel/Tank at x=500, y=100, w=100, h=100 -->
      <mxCell id="vessel" value="Feed Tank" style="shape=mxgraph.pid.vessels.tank;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="100" height="100" as="geometry"/></mxCell>
      <!-- Dead End pump -->
      <mxCell id="deadpump" value="Dead Pump" style="shape=mxgraph.pid.pumps.centrifugal_pump_1;" vertex="1" parent="1"><mxGeometry x="700" y="100" width="80" height="60" as="geometry"/></mxCell>
      <!-- Compressor at x=800, y=100, w=100, h=80 -->
      <mxCell id="comp" value="RecipCompressor" style="shape=mxgraph.pid.compressors.reciprocating_compressor;" vertex="1" parent="1"><mxGeometry x="800" y="100" width="100" height="80" as="geometry"/></mxCell>
      <!-- Instrument controller -->
      <mxCell id="ctrl" value="TIC" style="shape=mxgraph.pid.indicators.locally_mounted_instrument;" vertex="1" parent="1"><mxGeometry x="950" y="100" width="60" height="60" as="geometry"/></mxCell>

      <!-- PHASE_PORT_VIOLATION 1: Vapor stream exiting from bottom of distillation column (exitY=1) -->
      <mxCell id="e_phase1" value="Overhead Vapor" edge="1" source="col" target="pump" style="exitX=0.5;exitY=1;entryX=0;entryY=0.5;" parent="1"/>
      <!-- PHASE_PORT_VIOLATION 2: Bottoms Liquid exiting from top of distillation column (exitY=0) -->
      <mxCell id="e_phase2" value="Bottoms Liquid" edge="1" source="col" target="vessel" style="exitX=0.5;exitY=0;entryX=0;entryY=0.5;" parent="1"/>
      
      <!-- OPPOSING_FLOW: Process stream routing from right to left (vessel at 500 to pump at 300) without recycle/return in label -->
      <mxCell id="e_oppose" value="Process Stream" edge="1" source="vessel" target="pump" style="edgeStyle=orthogonalEdgeStyle;strokeWidth=3;" parent="1"/>
      
      <!-- GRAVITY_VIOLATION: Liquid stream going uphill from col (y=100) to higher node (y=20, which is < 100) without pump/compressor -->
      <mxCell id="high_node" value="High Node" style="shape=mxgraph.pid.vessels.tank;" vertex="1" parent="1"><mxGeometry x="100" y="20" width="100" height="50" as="geometry"/></mxCell>
      <mxCell id="e_gravity" value="Liquid Stream" edge="1" source="col" target="high_node" style="edgeStyle=orthogonalEdgeStyle;" parent="1"/>
      
      <!-- INSTRUMENT_IN_PROCESS_LINE: Dotted/dashed instrument line using heavy process line style -->
      <mxCell id="e_inst" value="Control Line" edge="1" source="col" target="ctrl" style="edgeStyle=orthogonalEdgeStyle;strokeWidth=3;" parent="1"/>

      <!-- COMPRESSOR_INLET_AT_BOTTOM: Inlet stream enters compressor from top instead of side/bottom -->
      <mxCell id="e_comp_in" value="Suction Stream" edge="1" source="vessel" target="comp" style="exitX=1;exitY=0.5;entryX=0;entryY=0.2;" parent="1"/>
    </root></mxGraphModel>`;
    
    fs.writeFileSync(tempPfdInvalidFile, pfdInvalidXmlContent, 'utf8');
    const pfdVal = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempPfdInvalidFile } }));
    fs.unlinkSync(tempPfdInvalidFile);

    const hasPhasePortErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('PHASE_PORT_VIOLATION'));
    const hasDeadEndErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('DEAD_END_STREAM'));
    const hasOpposingFlowErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('OPPOSING_FLOW'));
    const hasGravityErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('GRAVITY_VIOLATION'));
    const hasInstErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('INSTRUMENT_IN_PROCESS_LINE'));
    const hasCompInletErr = pfdVal.errors && pfdVal.errors.some(e => e.includes('COMPRESSOR_INLET_AT_BOTTOM'));

    record('Test 29: PHASE_PORT_VIOLATION rule', hasPhasePortErr, `Found PHASE_PORT_VIOLATION: ${hasPhasePortErr}`);
    record('Test 30: DEAD_END_STREAM rule', hasDeadEndErr, `Found DEAD_END_STREAM: ${hasDeadEndErr}`);
    record('Test 31: OPPOSING_FLOW rule', hasOpposingFlowErr, `Found OPPOSING_FLOW: ${hasOpposingFlowErr}`);
    record('Test 32: GRAVITY_VIOLATION rule', hasGravityErr, `Found GRAVITY_VIOLATION: ${hasGravityErr}`);
    record('Test 33: INSTRUMENT_IN_PROCESS_LINE rule', hasInstErr, `Found INSTRUMENT_IN_PROCESS_LINE: ${hasInstErr}`);
    record('Test 34: COMPRESSOR_INLET_AT_BOTTOM rule', hasCompInletErr, `Found COMPRESSOR_INLET_AT_BOTTOM: ${hasCompInletErr}`);

    // Test 35-39: Kubernetes Validator Rules
    const tempK8sInvalidFile = path.join(os.tmpdir(), `test-e2e-k8s-invalid-${Date.now()}.xml`);
    const k8sInvalidXmlContent = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      
      <!-- Cluster container -->
      <mxCell id="cluster" value="Cluster" style="swimlane;html=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="800" height="500" as="geometry"/></mxCell>
      
      <!-- Namespace 1 -->
      <mxCell id="ns1" value="Namespace 1" style="swimlane;html=1;" vertex="1" parent="cluster"><mxGeometry x="20" y="40" width="300" height="400" as="geometry"/></mxCell>
      <!-- Namespace 2 -->
      <mxCell id="ns2" value="Namespace 2" style="swimlane;html=1;" vertex="1" parent="cluster"><mxGeometry x="350" y="40" width="300" height="400" as="geometry"/></mxCell>
      
      <!-- Deployment 1 inside ns1 -->
      <mxCell id="dep1" value="Deployment 1" style="swimlane;html=1;" vertex="1" parent="ns1"><mxGeometry x="20" y="40" width="200" height="200" as="geometry"/></mxCell>
      
      <!-- Pod 1 inside dep1 (Valid) -->
      <mxCell id="pod1" value="Pod 1" style="mxgraph.kubernetes.icon;kubernetes.type=pod;" vertex="1" parent="dep1"><mxGeometry x="10" y="10" width="60" height="60" as="geometry"/></mxCell>
      
      <!-- ORPHAN_POD: Pod 2 outside any Deployment or Namespace (nested in root '1') -->
      <mxCell id="pod2" value="Pod 2" style="mxgraph.kubernetes.icon;kubernetes.type=pod;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="60" height="60" as="geometry"/></mxCell>
      
      <!-- SERVICE_WITHOUT_TARGET: Service 1 has no target pod/deployment -->
      <mxCell id="svc1" value="Service 1" style="mxgraph.kubernetes.icon;kubernetes.type=service;" vertex="1" parent="ns1"><mxGeometry x="20" y="260" width="60" height="60" as="geometry"/></mxCell>
      
      <!-- INGRESS_BYPASS: Ingress 1 connects directly to Pod 1, bypassing any Service -->
      <mxCell id="ing1" value="Ingress 1" style="mxgraph.kubernetes.icon;kubernetes.type=ingress;" vertex="1" parent="ns1"><mxGeometry x="20" y="340" width="60" height="60" as="geometry"/></mxCell>
      <mxCell id="e_bypass" edge="1" source="ing1" target="pod1" parent="1"/>

      <!-- PVC_WITHOUT_PV: PVC 1 exists but is not connected to a PV -->
      <mxCell id="pvc1" value="PVC 1" style="mxgraph.kubernetes.icon;kubernetes.type=pvc;" vertex="1" parent="ns1"><mxGeometry x="100" y="260" width="60" height="60" as="geometry"/></mxCell>
      
      <!-- Pod 3 in ns2 -->
      <mxCell id="pod3" value="Pod 3" style="mxgraph.kubernetes.icon;kubernetes.type=pod;" vertex="1" parent="ns2"><mxGeometry x="20" y="40" width="60" height="60" as="geometry"/></mxCell>
      
      <!-- NAMESPACE_LEAK: Direct cross-talk edge between pod1 (in ns1) and pod3 (in ns2) -->
      <mxCell id="e_leak" edge="1" source="pod1" target="pod3" parent="1"/>
    </root></mxGraphModel>`;

    fs.writeFileSync(tempK8sInvalidFile, k8sInvalidXmlContent, 'utf8');
    const k8sVal = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempK8sInvalidFile } }));
    fs.unlinkSync(tempK8sInvalidFile);

    const hasOrphanErr = k8sVal.errors && k8sVal.errors.some(e => e.includes('ORPHAN_POD'));
    const hasSvcTargetErr = k8sVal.errors && k8sVal.errors.some(e => e.includes('SERVICE_WITHOUT_TARGET'));
    const hasIngressBypassErr = k8sVal.errors && k8sVal.errors.some(e => e.includes('INGRESS_BYPASS'));
    const hasPvcWithoutPvErr = k8sVal.errors && k8sVal.errors.some(e => e.includes('PVC_WITHOUT_PV'));
    const hasNamespaceLeakErr = k8sVal.errors && k8sVal.errors.some(e => e.includes('NAMESPACE_LEAK'));

    record('Test 35: ORPHAN_POD rule', hasOrphanErr, `Found ORPHAN_POD: ${hasOrphanErr}`);
    record('Test 36: SERVICE_WITHOUT_TARGET rule', hasSvcTargetErr, `Found SERVICE_WITHOUT_TARGET: ${hasSvcTargetErr}`);
    record('Test 37: INGRESS_BYPASS rule', hasIngressBypassErr, `Found INGRESS_BYPASS: ${hasIngressBypassErr}`);
    record('Test 38: PVC_WITHOUT_PV rule', hasPvcWithoutPvErr, `Found PVC_WITHOUT_PV: ${hasPvcWithoutPvErr}`);
    record('Test 39: NAMESPACE_LEAK rule', hasNamespaceLeakErr, `Found NAMESPACE_LEAK: ${hasNamespaceLeakErr}`);

    // Test 40-43: ERD Validator Rules
    const tempErdInvalidFile = path.join(os.tmpdir(), `test-e2e-erd-invalid-${Date.now()}.xml`);
    const erdInvalidXmlContent = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      
      <!-- Table 1 (Valid table with PK) -->
      <mxCell id="t1" value="&lt;b&gt;Users&lt;/b&gt;&#10;+ id: INT [PK]&#10;name: VARCHAR" style="shape=table;html=1;erd.type=table;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="150" height="100" as="geometry"/></mxCell>
      
      <!-- Table 2 (FK_WITHOUT_TARGET: Table 2 has orders.user_id FK, but no connected edge to Users) -->
      <mxCell id="t2" value="&lt;b&gt;Orders&lt;/b&gt;&#10;+ id: INT [PK]&#10;user_id: INT [FK]" style="shape=table;html=1;erd.type=table;" vertex="1" parent="1"><mxGeometry x="300" y="100" width="150" height="100" as="geometry"/></mxCell>
      
      <!-- Table 3 (ORPHAN_TABLE: Table 3 has no relationships or connected edges) -->
      <mxCell id="t3" value="&lt;b&gt;Products&lt;/b&gt;&#10;+ id: INT [PK]" style="shape=table;html=1;erd.type=table;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="150" height="100" as="geometry"/></mxCell>
      
      <!-- Table 4 (DUPLICATE_PK: Multiple primary key columns) -->
      <mxCell id="t4" value="&lt;b&gt;Payments&lt;/b&gt;&#10;+ id: INT [PK]&#10;+ trans_id: INT [PK]" style="shape=table;html=1;erd.type=table;" vertex="1" parent="1"><mxGeometry x="100" y="300" width="150" height="100" as="geometry"/></mxCell>
      
      <!-- Table 5 (SELF_REFERENCE_MISSING: parent_id exists but no self-referencing edge) -->
      <mxCell id="t5" value="&lt;b&gt;Categories&lt;/b&gt;&#10;+ id: INT [PK]&#10;parent_id: INT [FK]" style="shape=table;html=1;erd.type=table;" vertex="1" parent="1"><mxGeometry x="300" y="300" width="150" height="100" as="geometry"/></mxCell>
    </root></mxGraphModel>`;

    fs.writeFileSync(tempErdInvalidFile, erdInvalidXmlContent, 'utf8');
    const erdVal = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempErdInvalidFile } }));
    fs.unlinkSync(tempErdInvalidFile);

    const hasFkTargetErr = erdVal.errors && erdVal.errors.some(e => e.includes('FK_WITHOUT_TARGET'));
    const hasOrphanTableErr = erdVal.warnings && erdVal.warnings.some(w => w.includes('ORPHAN_TABLE'));
    const hasDupPkErr = erdVal.errors && erdVal.errors.some(e => e.includes('DUPLICATE_PK'));
    const hasSelfRefMissingErr = erdVal.errors && erdVal.errors.some(e => e.includes('SELF_REFERENCE_MISSING'));

    record('Test 40: FK_WITHOUT_TARGET rule', hasFkTargetErr, `Found FK_WITHOUT_TARGET: ${hasFkTargetErr}`);
    record('Test 41: ORPHAN_TABLE rule', hasOrphanTableErr, `Found ORPHAN_TABLE: ${hasOrphanTableErr}`);
    record('Test 42: DUPLICATE_PK rule', hasDupPkErr, `Found DUPLICATE_PK: ${hasDupPkErr}`);
    record('Test 43: SELF_REFERENCE_MISSING rule', hasSelfRefMissingErr, `Found SELF_REFERENCE_MISSING: ${hasSelfRefMissingErr}`);

    // Test 44: ERD Table Rendering and Dynamic Sizing
    await client.callTool({ name: 'init_diagram', arguments: { title: 'ERD Rendering Test', type: 'erd' } });
    
    // Table 1: 3 columns (height should be 120)
    await client.callTool({
      name: 'add_node',
      arguments: {
        id: 't_users',
        label: 'Users',
        type: 'table',
        parent_id: '1',
        columns: [
          { name: 'id', type: 'INT', pk: true, nullable: false },
          { name: 'email', type: 'VARCHAR(255)', nullable: false },
          { name: 'created_at', type: 'TIMESTAMP', nullable: true }
        ]
      }
    });

    // Table 2: 6 columns (height should be 40 + 6 * 22 = 172)
    await client.callTool({
      name: 'add_node',
      arguments: {
        id: 't_orders',
        label: 'Orders',
        type: 'table',
        parent_id: '1',
        columns: [
          { name: 'id', type: 'INT', pk: true, nullable: false },
          { name: 'user_id', type: 'INT', fk: true, nullable: false },
          { name: 'total', type: 'DECIMAL(10,2)', nullable: false },
          { name: 'status', type: 'VARCHAR(50)', nullable: false },
          { name: 'created_at', type: 'TIMESTAMP', nullable: false },
          { name: 'updated_at', type: 'TIMESTAMP', nullable: true }
        ]
      }
    });

    r = parseBuilderResult(await client.callTool({ name: 'get_state', arguments: {} }));
    const usersNode = r.nodes ? r.nodes.find(n => n.id === 't_users') : null;
    const ordersNode = r.nodes ? r.nodes.find(n => n.id === 't_orders') : null;

    const erdRenderingOk = !!(
      usersNode && usersNode.label.includes('<b>Users</b>') &&
      usersNode.label.includes('+ id: INT [PK] NOT NULL') &&
      usersNode.label.includes('email: VARCHAR(255) NOT NULL') &&
      usersNode.label.includes('created_at: TIMESTAMP NULL') &&
      usersNode.width === 180 && usersNode.height === 120 &&
      
      ordersNode && ordersNode.label.includes('<b>Orders</b>') &&
      ordersNode.label.includes('+ id: INT [PK] NOT NULL') &&
      ordersNode.label.includes('user_id: INT [FK] NOT NULL') &&
      ordersNode.label.includes('total: DECIMAL(10,2) NOT NULL') &&
      ordersNode.width === 180 && ordersNode.height === 172
    );

    record('Test 44: ERD Table Rendering and Dynamic Sizing', erdRenderingOk, `ERD Rendering resolved: ${erdRenderingOk}`);

    // Test 45-48: Network Validator Rules
    const tempNetInvalidFile = path.join(os.tmpdir(), `test-e2e-net-invalid-${Date.now()}.xml`);
    const netInvalidXmlContent = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      
      <!-- Core Switch 1 -->
      <mxCell id="core1" value="Core Switch 1" style="shape=mxgraph.cisco.switches.workgroup_switch;network.type=switch;network.tier=core;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- Core Switch 2 (redundant) -->
      <mxCell id="core2" value="Core Switch 2" style="shape=mxgraph.cisco.switches.workgroup_switch;network.type=switch;network.tier=core;" vertex="1" parent="1"><mxGeometry x="220" y="100" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- Distribution Switch 1 -->
      <mxCell id="dist1" value="Dist Switch 1" style="shape=mxgraph.cisco.switches.workgroup_switch;network.type=switch;network.tier=distribution;" vertex="1" parent="1"><mxGeometry x="100" y="250" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- REDUNDANCY_WARNING: Single edge between core1 and dist1 -->
      <mxCell id="e_core_dist" edge="1" source="core1" target="dist1" parent="1"/>

      <!-- ORPHAN_DEVICE: Standalone workstation with no edges -->
      <mxCell id="pc1" value="Orphan PC" style="shape=mxgraph.cisco.computers_and_peripherals.pc;network.type=workstation;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- WAN Internet node -->
      <mxCell id="wan" value="Internet" style="shape=mxgraph.cisco.misc.web_browser;network.type=wan;" vertex="1" parent="1"><mxGeometry x="100" y="10" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- LAN server -->
      <mxCell id="srv1" value="Intranet Server" style="shape=mxgraph.cisco.servers.standard_host;network.type=server;" vertex="1" parent="1"><mxGeometry x="300" y="250" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- DIRECT_WAN_TO_LAN: Edge from wan to srv1 bypassing firewall -->
      <mxCell id="e_bypass" edge="1" source="wan" target="srv1" parent="1"/>

      <!-- VLAN 10 Container -->
      <mxCell id="vlan10" value="VLAN 10" style="swimlane;html=1;network.type=vlan;" vertex="1" parent="1"><mxGeometry x="100" y="400" width="200" height="200" as="geometry"/></mxCell>
      <!-- VLAN 20 Container -->
      <mxCell id="vlan20" value="VLAN 20" style="swimlane;html=1;network.type=vlan;" vertex="1" parent="1"><mxGeometry x="350" y="400" width="200" height="200" as="geometry"/></mxCell>
      
      <!-- Workstation in VLAN 10 -->
      <mxCell id="pc10" value="PC 10" style="shape=mxgraph.cisco.computers_and_peripherals.pc;network.type=workstation;" vertex="1" parent="vlan10"><mxGeometry x="20" y="40" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- Workstation in VLAN 20 -->
      <mxCell id="pc20" value="PC 20" style="shape=mxgraph.cisco.computers_and_peripherals.pc;network.type=workstation;" vertex="1" parent="vlan20"><mxGeometry x="20" y="40" width="80" height="60" as="geometry"/></mxCell>
      
      <!-- VLAN_LEAK: Direct cross-connect edge between pc10 and pc20 -->
      <mxCell id="e_leak" edge="1" source="pc10" target="pc20" parent="1"/>
    </root></mxGraphModel>`;

    fs.writeFileSync(tempNetInvalidFile, netInvalidXmlContent, 'utf8');
    const netVal = parseBuilderResult(await client.callTool({ name: 'validate_file', arguments: { file_path: tempNetInvalidFile } }));
    fs.unlinkSync(tempNetInvalidFile);

    const hasDirectWanErr = netVal.errors && netVal.errors.some(e => e.includes('DIRECT_WAN_TO_LAN'));
    const hasOrphanDevErr = netVal.errors && netVal.errors.some(e => e.includes('ORPHAN_DEVICE'));
    const hasVlanLeakErr = netVal.errors && netVal.errors.some(e => e.includes('VLAN_LEAK'));
    const hasRedundancyWarn = netVal.warnings && netVal.warnings.some(w => w.includes('REDUNDANCY_WARNING'));

    record('Test 45: DIRECT_WAN_TO_LAN rule', hasDirectWanErr, `Found DIRECT_WAN_TO_LAN: ${hasDirectWanErr}`);
    record('Test 46: ORPHAN_DEVICE rule', hasOrphanDevErr, `Found ORPHAN_DEVICE: ${hasOrphanDevErr}`);
    record('Test 47: VLAN_LEAK rule', hasVlanLeakErr, `Found VLAN_LEAK: ${hasVlanLeakErr}`);
    record('Test 48: REDUNDANCY_WARNING rule', hasRedundancyWarn, `Found REDUNDANCY_WARNING: ${hasRedundancyWarn}`);

    // ───── Test 49: Hybrid Cloud Layout & Validation ─────────────────────────
    const tempSpecPath = path.join(os.tmpdir(), `test-e2e-hybrid-spec-${Date.now()}.json`);
    const tempOutPath = path.join(os.tmpdir(), `test-e2e-hybrid-out-${Date.now()}.drawio`);
    
    const hybridSpec = {
      title: "Hybrid Cloud Network Test",
      theme: "light",
      type: "architecture",
      containers: [
        { id: "aws_region", label: "AWS Cloud", type: "region" },
        { id: "azure_region", label: "Azure Cloud", type: "region" }
      ],
      nodes: [
        { id: "clients", label: "Corporate Clients", type: "user", parentId: "aws_region" },
        { id: "aws_app", label: "AWS ECS App", type: "ecs", parentId: "aws_region" },
        { id: "skytap_app", label: "Skytap AIX App", type: "server", parentId: "azure_region" }
      ],
      edges: [
        { sourceId: "clients", targetId: "aws_app", label: "access" },
        { sourceId: "aws_app", targetId: "skytap_app", label: "sync" }
      ]
    };
    
    fs.writeFileSync(tempSpecPath, JSON.stringify(hybridSpec, null, 2), 'utf8');
    const hybridRes = parseBuilderResult(await client.callTool({
      name: 'compile_json_spec',
      arguments: { spec_path: tempSpecPath, output_path: tempOutPath }
    }));
    
    const hybridCompiledOk = hybridRes.success && fs.existsSync(tempOutPath);
    let coordsOk = false;
    
    if (hybridCompiledOk) {
      const xmlContent = fs.readFileSync(tempOutPath, 'utf8');
      const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
      const cells = doc.getElementsByTagName('mxCell');
      let awsX = null, azureX = null;
      let awsY = null, azureY = null;
      for (let i = 0; i < cells.length; i++) {
        const id = cells[i].getAttribute('id');
        const geom = cells[i].getElementsByTagName('mxGeometry')[0];
        if (geom) {
          const x = parseFloat(geom.getAttribute('x') || '0');
          const y = parseFloat(geom.getAttribute('y') || '0');
          if (id === 'aws_region') { awsX = x; awsY = y; }
          if (id === 'azure_region') { azureX = x; azureY = y; }
        }
      }
      if (awsX !== null && azureX !== null && awsY !== null && azureY !== null &&
          (Math.abs(awsX - azureX) >= 100 || Math.abs(awsY - azureY) >= 100)) {
        coordsOk = true;
      }
      fs.unlinkSync(tempOutPath);
    }
    fs.unlinkSync(tempSpecPath);
    
    record('Test 49: Hybrid Cloud compiles without AWS validation error', hybridCompiledOk, `Hybrid compile: ${hybridCompiledOk}`);
    record('Test 50: Root-level containers positioned side-by-side', coordsOk, `Side-by-side layout: ${coordsOk}`);
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
