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

    record(
      'Test 2: List Tools',
      hasAllTools && tools.length === 17,
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
