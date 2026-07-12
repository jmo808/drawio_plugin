#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DiagramBuilder } = require('./diagram-builder');
const { validateXml } = require('./validate');
const { buildDiagram } = require('./build-diagram');

// ---------------------------------------------------------------------------
// Resolve dependencies and run startup self-test
// ---------------------------------------------------------------------------
const devRoot = path.join(__dirname, '..');
const nodeModulesDir = path.join(devRoot, 'node_modules');
const validateScript = path.join(__dirname, 'validate.js');

// --- Resolve @drawio/mcp path ---
let mcpPath = null;
let useNpx = false;

if (process.env.DRAWIO_MCP_PATH) {
    if (fs.existsSync(process.env.DRAWIO_MCP_PATH)) {
        mcpPath = process.env.DRAWIO_MCP_PATH;
    } else {
        console.error(`[WRAPPER] DRAWIO_MCP_PATH set but not found: ${process.env.DRAWIO_MCP_PATH}`);
    }
}

if (!mcpPath) {
    const localMcp = path.join(nodeModulesDir, '@drawio', 'mcp', 'src', 'index.js');
    if (fs.existsSync(localMcp)) {
        mcpPath = localMcp;
    }
}

if (!mcpPath) {
    console.error('[WRAPPER] WARNING: @drawio/mcp not found locally — falling back to npx');
    useNpx = true;
}

console.error(`[WRAPPER] @drawio/mcp: ${useNpx ? 'npx -y @drawio/mcp@1.3.4' : mcpPath}`);

// --- Check validate.js ---
let validationEnabled = true;
const validateExists = fs.existsSync(validateScript);
if (!validateExists) {
    console.error('[WRAPPER] WARNING: validate.js not found — validation disabled');
    validationEnabled = false;
}

// --- Check @xmldom/xmldom ---
let xmldomOk = false;
if (validationEnabled) {
    try {
        require.resolve('@xmldom/xmldom', { paths: [nodeModulesDir] });
        xmldomOk = true;
    } catch (e) {
        const xmldomPath = path.join(nodeModulesDir, '@xmldom', 'xmldom');
        xmldomOk = fs.existsSync(xmldomPath);
    }
    if (!xmldomOk) {
        console.error('[WRAPPER] WARNING: @xmldom/xmldom not loadable — validation disabled');
        validationEnabled = false;
    }
}

console.error(
    `[WRAPPER] @drawio/mcp: ${useNpx ? 'npx' : mcpPath} | ` +
    `validate.js: ${validateExists ? 'OK' : 'MISSING'} | ` +
    `xmldom: ${xmldomOk ? 'OK' : (validateExists ? 'MISSING' : 'SKIPPED')} | ` +
    `builder: OK`
);

// ---------------------------------------------------------------------------
// Diagram Builder instance (stateful for the session)
// ---------------------------------------------------------------------------
const builder = new DiagramBuilder();

// Builder tool definitions for tools/list augmentation
const BUILDER_TOOLS = [
    {
        name: 'init_diagram',
        description: 'Initialize a new diagram. Call this before any other builder tool.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Diagram title' },
                type: { type: 'string', enum: ['architecture', 'flowchart', 'pfd', 'bpmn'], description: 'Diagram type', default: 'architecture' },
            },
            required: ['title'],
        },
    },
    {
        name: 'add_container',
        description: 'Only use for making incremental modifications or manual additions to an existing diagram. Do NOT use to construct new diagrams from scratch. Use compile_json_spec for new diagrams.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Unique ID for this container' },
                label: { type: 'string', description: 'Display label' },
                type: { type: 'string', enum: ['region', 'vpc', 'az', 'subnet', 'group', 'lane'], description: 'Container type' },
                parent_id: { type: 'string', description: 'Parent container ID (default: root)', default: '1' },
                tier: { type: 'string', enum: ['public', 'web', 'app', 'data'], description: 'Subnet tier (for subnet type)' },
            },
            required: ['id', 'label', 'type'],
        },
    },
    {
        name: 'add_node',
        description: 'Only use for making incremental modifications or manual additions to an existing diagram. Do NOT use to construct new diagrams from scratch. Use compile_json_spec for new diagrams.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Unique ID for this node' },
                label: { type: 'string', description: 'Display label' },
                type: { type: 'string', enum: ['ec2', 'ecs', 'lambda', 'rds', 'elasticache', 'dynamodb', 's3', 'alb', 'nlb', 'cloudfront', 'route53', 'apigateway', 'api_gateway', 'waf', 'nat_gateway', 'endpoint', 'sqs', 'sns', 'eventbridge', 'user', 'internet', 'rectangle', 'diamond', 'cylinder', 'circle', 'pump', 'compressor', 'valve', 'vessel', 'cyclone', 'heat_exchanger', 'table', 'view'], description: 'Node type — determines shape and style' },
                parent_id: { type: 'string', description: 'Parent container ID' },
                variant: { type: 'string', description: 'Optional variant label (e.g., "primary", "replica")' },
                columns: {
                    type: 'array',
                    description: 'Optional columns definition array for database tables (e.g. [{name: "id", type: "INT", pk: true}])',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            pk: { type: 'boolean' },
                            fk: { type: 'boolean' },
                            nullable: { type: 'boolean' }
                        },
                        required: ['name']
                    }
                }
            },
            required: ['id', 'label', 'type', 'parent_id'],
        },
    },
    {
        name: 'connect',
        description: 'Only use for making incremental modifications or manual additions to an existing diagram. Do NOT use to construct new diagrams from scratch. Use compile_json_spec for new diagrams.',
        inputSchema: {
            type: 'object',
            properties: {
                source_id: { type: 'string', description: 'Source node ID' },
                target_id: { type: 'string', description: 'Target node ID' },
                label: { type: 'string', description: 'Edge label (optional)' },
                style: { type: 'string', enum: ['solid', 'dashed'], description: 'Edge style', default: 'solid' },
                color: { type: 'string', description: 'Edge color (e.g., "#b85450")' },
                exit_port: { type: 'string', enum: ['top', 'bottom', 'left', 'right'], description: 'Optional source nozzle/connection port' },
                entry_port: { type: 'string', enum: ['top', 'bottom', 'left', 'right'], description: 'Optional target nozzle/connection port' },
            },
            required: ['source_id', 'target_id'],
        },
    },
    {
        name: 'disconnect',
        description: 'Remove an edge between two nodes.',
        inputSchema: {
            type: 'object',
            properties: {
                source_id: { type: 'string', description: 'Source node ID' },
                target_id: { type: 'string', description: 'Target node ID' },
            },
            required: ['source_id', 'target_id'],
        },
    },
    {
        name: 'connect_tiers',
        description: 'Bulk-connect all nodes in one tier to all nodes in another tier. Tiers are matched by node type or parent label.',
        inputSchema: {
            type: 'object',
            properties: {
                source_tier: { type: 'string', description: 'Source tier (node type like "ec2", or parent label keyword like "web")' },
                target_tier: { type: 'string', description: 'Target tier' },
                label: { type: 'string', description: 'Edge label' },
                style: { type: 'string', enum: ['solid', 'dashed'], default: 'solid' },
            },
            required: ['source_tier', 'target_tier'],
        },
    },
    {
        name: 'connect_ha_compute_to_data',
        description: 'Connect a compute node to database and cache tiers with high-availability replication rules.',
        inputSchema: {
            type: 'object',
            properties: {
                compute_id: { type: 'string', description: 'Source compute node ID' },
                primary_db_id: { type: 'string', description: 'Primary database node ID' },
                replica_db_id: { type: 'string', description: 'Replica database node ID' },
                primary_cache_id: { type: 'string', description: 'Optional primary cache node ID' },
                replica_cache_id: { type: 'string', description: 'Optional replica cache node ID' },
            },
            required: ['compute_id', 'primary_db_id', 'replica_db_id'],
        },
    },
    {
        name: 'provision_ha_data_tier',
        description: 'Connect compute nodes in primary and secondary AZs to a stateful data tier (RDS or ElastiCache) with full replication, local read/write, and cross-AZ write paths.',
        inputSchema: {
            type: 'object',
            properties: {
                primary_az_compute_id: { type: 'string', description: 'Compute node ID in the primary AZ' },
                secondary_az_compute_id: { type: 'string', description: 'Compute node ID in the secondary AZ' },
                data_resource_type: { type: 'string', enum: ['rds', 'elasticache'], description: 'Stateful data tier type' },
            },
            required: ['primary_az_compute_id', 'secondary_az_compute_id', 'data_resource_type'],
        },
    },
    {
        name: 'get_state',
        description: 'Get the current diagram state as a JSON summary — containers, nodes, edges. Use this to review the diagram before finalizing.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'builder_validate',
        description: 'Run validation on the current diagram without opening it. Returns any errors found.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'validate_file',
        description: 'Validate a draw.io XML file in the workspace. Returns validation errors. Use this to validate files without launching terminal processes.',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: 'Absolute path to the XML/drawio file to validate.' }
            },
            required: ['file_path']
        },
    },
    {
        name: 'compile_json_spec',
        description: 'MANDATORY: Use this tool to generate all new diagrams (AWS, GCP, PFD, K8s, ERD, Network, BPMN, flowcharts, mind maps, sequence) in a single turn by passing the complete JSON spec directly. Runs full layout engine, topological corrections, and validation.',
        inputSchema: {
            type: 'object',
            properties: {
                spec: {
                    type: 'object',
                    description: 'The declarative JSON diagram spec object containing title, theme, type, containers, nodes, and edges.'
                },
                spec_path: { type: 'string', description: 'Absolute path to the JSON spec file.' },
                output_path: { type: 'string', description: 'Absolute path where the compiled .drawio XML file should be saved.' }
            }
        },
    },
    {
        name: 'finalize',
        description: 'Validate the diagram and open it in draw.io. If validation fails, errors are returned instead.',
        inputSchema: { type: 'object', properties: {} },
    },
];

const BUILDER_TOOL_NAMES = new Set(BUILDER_TOOLS.map(t => t.name));

// ---------------------------------------------------------------------------
// Spawn the @drawio/mcp child process
// ---------------------------------------------------------------------------
let child;
if (useNpx) {
    child = spawn('npx', ['-y', '@drawio/mcp@1.3.4'], { stdio: ['pipe', 'pipe', 'pipe'] });
} else {
    child = spawn('node', [mcpPath], { stdio: ['pipe', 'pipe', 'pipe'] });
}

child.stderr.on('data', chunk => process.stderr.write(chunk));

// Keep track of pending finalize requests
const pendingFinalize = new Map();

// ---------------------------------------------------------------------------
// Child stdout interception — augment tools/list responses
// ---------------------------------------------------------------------------
let childBuffer = Buffer.alloc(0);

child.stdout.on('data', chunk => {
    childBuffer = Buffer.concat([childBuffer, chunk]);

    while (true) {
        const index = childBuffer.indexOf('\n');
        if (index === -1) break;

        const lineStr = childBuffer.slice(0, index).toString('utf8').replace(/\r$/, '');
        childBuffer = childBuffer.slice(index + 1);

        try {
            const msg = JSON.parse(lineStr);

            // Replace any external diagrams.net or draw.io links with local relative path /draw/
            if (msg.result && msg.result.content && Array.isArray(msg.result.content)) {
                for (const item of msg.result.content) {
                    if (item.type === 'text' && typeof item.text === 'string') {
                        item.text = item.text.replace(/https?:\/\/(?:[a-z0-9-]+\.)?(?:diagrams\.net|draw\.io)\//gi, '/draw/');
                    }
                }
            }

            // Check if this is a response to a finalize request
            if (msg.id !== undefined && pendingFinalize.has(msg.id)) {
                const xml = pendingFinalize.get(msg.id);
                pendingFinalize.delete(msg.id);
                if (msg.result) {
                    msg.result.xml = xml;
                }
                process.stdout.write(JSON.stringify(msg) + '\n');
                continue;
            }

            // Augment tools/list response with builder tools
            if (msg.result && msg.result.tools && Array.isArray(msg.result.tools)) {
                const openXmlTool = msg.result.tools.find(t => t.name === 'open_drawio_xml');
                if (openXmlTool) {
                    openXmlTool.description = 'Only use for loading existing diagrams from files. Do NOT use this tool to create new diagrams. Use compile_json_spec for all new diagram generation instead.';
                }
                msg.result.tools.push(...BUILDER_TOOLS);
                console.error(`[WRAPPER] Augmented tools/list with ${BUILDER_TOOLS.length} builder tools`);
                process.stdout.write(JSON.stringify(msg) + '\n');
                continue;
            }
        } catch (e) {
            // Not JSON — pass through
        }

        // Pass through unmodified
        process.stdout.write(lineStr + '\n');
    }
});

function compileSpecToBuilder(builderInstance, config) {
    // 1. Initialize diagram
    const initRes = builderInstance.init(config.title || 'Architecture', config.theme || 'light', config.type || 'architecture');
    if (!initRes.success) return initRes;

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
                    const res = builderInstance.addContainer(c.id, c.label, c.type, parentId, c.tier);
                    if (!res.success) return res;
                    added.add(c.id);
                } else {
                    nextPending.push(c);
                }
            }
            pending = nextPending;
            loops++;
        }
    }

    // 3. Add nodes
    if (config.nodes && Array.isArray(config.nodes)) {
        for (const n of config.nodes) {
            const parentId = n.parentId || n.parent_id || '1';
            const res = builderInstance.addNode(n.id, n.label, n.type, parentId, n.variant, n.columns);
            if (!res.success) return res;
        }
    }

    // 4. Add connections
    if (config.edges && Array.isArray(config.edges)) {
        for (const e of config.edges) {
            const res = builderInstance.connect(e.sourceId || e.source_id, e.targetId || e.target_id, e.label, e.style, e.color, e.exitPort || e.exit_port, e.entryPort || e.entry_port);
            if (!res.success) return res;
        }
    }

    return { success: true };
}

// ---------------------------------------------------------------------------
// Handle builder tool calls
// ---------------------------------------------------------------------------
function handleBuilderTool(toolName, args, msgId) {
    let result;

    switch (toolName) {
        case 'init_diagram':
            result = builder.init(args.title, args.theme, args.type);
            break;
        case 'add_container':
            result = builder.addContainer(args.id, args.label, args.type, args.parent_id || '1', args.tier);
            break;
        case 'add_node':
            result = builder.addNode(args.id, args.label, args.type, args.parent_id, args.variant, args.columns);
            break;
        case 'connect':
            result = builder.connect(args.source_id, args.target_id, args.label, args.style, args.color, args.exit_port, args.entry_port);
            break;
        case 'disconnect':
            result = builder.disconnect(args.source_id, args.target_id);
            break;
        case 'connect_tiers':
            result = builder.connectTiers(args.source_tier, args.target_tier, args.label, args.style);
            break;
        case 'connect_ha_compute_to_data':
            result = builder.connectHaComputeToData(
                args.compute_id,
                args.primary_db_id,
                args.replica_db_id,
                args.primary_cache_id,
                args.replica_cache_id
            );
            break;
        case 'provision_ha_data_tier':
            result = builder.provisionHaDataTier(
                args.primary_az_compute_id,
                args.secondary_az_compute_id,
                args.data_resource_type
            );
            break;
        case 'get_state':
            result = builder.getState();
            break;
        case 'builder_validate':
            result = builder.validate();
            break;
        case 'validate_file':
            try {
                if (!args.file_path || !fs.existsSync(args.file_path)) {
                    result = { success: false, error: `File not found: ${args.file_path}` };
                } else {
                    const xml = fs.readFileSync(args.file_path, 'utf8');
                    result = validateXml(xml);
                }
            } catch (e) {
                result = { success: false, error: `Validation crash: ${e.message}` };
            }
            break;
        case 'compile_json_spec':
            try {
                let config;
                if (args.spec) {
                    config = args.spec;
                } else {
                    if (!args.spec_path || !fs.existsSync(args.spec_path)) {
                        result = { success: false, error: `File not found: ${args.spec_path}` };
                        break;
                    }
                    config = JSON.parse(fs.readFileSync(args.spec_path, 'utf8'));
                }
                const compileRes = compileSpecToBuilder(builder, config);
                if (!compileRes.success) {
                    result = compileRes;
                } else {
                    const validation = builder.validate();
                    result = { 
                        success: true, 
                        valid: validation.success,
                        validation_errors: validation.success ? [] : (validation.details || [validation.error]),
                        xml: builder.toXml()
                    };
                    if (args.output_path) {
                        fs.writeFileSync(args.output_path, result.xml, 'utf8');
                    }
                }
            } catch (e) {
                result = { success: false, error: `Compilation crash: ${e.message}` };
            }
            break;
        case 'finalize':
            result = builder.finalize();
            break;
        default:
            result = { success: false, error: `Unknown builder tool: ${toolName}` };
    }

    // If finalize succeeded, we need to forward to the downstream MCP server
    if (toolName === 'finalize' && result.success) {
        pendingFinalize.set(msgId, result.xml);
        return { finalize: true, xml: result.xml, type: result.type, msgId };
    }

    // Return result directly to the client
    const response = {
        jsonrpc: '2.0',
        id: msgId,
        result: {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
            isError: !result.success,
        },
    };

    process.stdout.write(JSON.stringify(response) + '\n');
    return { finalize: false };
}

// ---------------------------------------------------------------------------
// NDJSON message loop — stdin from client
// ---------------------------------------------------------------------------
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', chunk => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);

    while (true) {
        const index = inputBuffer.indexOf('\n');
        if (index === -1) break;

        const lineBuf = inputBuffer.slice(0, index + 1);
        const lineStr = inputBuffer.slice(0, index).toString('utf8').replace(/\r$/, '');
        inputBuffer = inputBuffer.slice(index + 1);

        try {
            const msg = JSON.parse(lineStr);

            // Handle builder tool calls locally
            if (msg.method === 'tools/call' && msg.params && BUILDER_TOOL_NAMES.has(msg.params.name)) {
                const toolName = msg.params.name;
                const args = msg.params.arguments || {};
                console.error(`[BUILDER] ${toolName}(${JSON.stringify(args).slice(0, 100)})`);

                const outcome = handleBuilderTool(toolName, args, msg.id);

                if (outcome.finalize) {
                    // Forward as open_drawio_xml to the downstream server.
                    // NOTE: We deliberately omit routing='libavoid' here because:
                    //   1. libavoid runs a WASM module with a slow cold-start (~10-30s)
                    //   2. The resulting XML is returned directly to the frontend via
                    //      setGraphXml(), not opened in a browser — draw.io handles
                    //      client-side edge routing on its own when the diagram renders.
                    console.error(`[BUILDER] Finalize: forwarding validated XML (${Buffer.byteLength(outcome.xml)} bytes) for type "${outcome.type}" (no libavoid — headless path)`);
                    const forwardMsg = {
                        jsonrpc: '2.0',
                        id: msg.id,
                        method: 'tools/call',
                        params: {
                            name: 'open_drawio_xml',
                            arguments: { content: outcome.xml },
                        },
                    };
                    child.stdin.write(JSON.stringify(forwardMsg) + '\n');
                }
                continue;
            }

            // Handle open_drawio_xml validation (existing behavior)
            if (msg.method === 'tools/call' && msg.params && msg.params.name === 'open_drawio_xml') {
                const xmlContent = msg.params.arguments.content;
                const byteLen = Buffer.byteLength(xmlContent, 'utf8');
                console.error(`[WRAPPER] Intercepted open_drawio_xml (${byteLen} bytes)`);

                if (!validationEnabled) {
                    child.stdin.write(lineBuf);
                    continue;
                }

                try {
                    const result = validateXml(xmlContent);
                    if (result.success) {
                        console.error('[WRAPPER] Validation PASSED — forwarding to server');
                        child.stdin.write(lineBuf);
                    } else {
                        console.error(`[WRAPPER] Validation FAILED — returning ${result.errors.length} errors to agent`);
                        const response = {
                            jsonrpc: '2.0',
                            id: msg.id,
                            result: {
                                content: [{ type: 'text', text: 'Validation failed!\n' + result.errors.join('\n') }],
                                isError: true,
                            },
                        };
                        process.stdout.write(JSON.stringify(response) + '\n');
                    }
                } catch (error) {
                    console.error(`[WRAPPER] Validation CRASHED — ${error.message}`);
                    child.stdin.write(lineBuf);
                }
                continue;
            }

            // Everything else: forward to child
            child.stdin.write(lineBuf);
        } catch (e) {
            child.stdin.write(lineBuf);
        }
    }
});

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code !== null ? code : 1));
