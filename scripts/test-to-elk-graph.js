const assert = require('assert');
const { DiagramBuilder } = require('./diagram-builder.js');

console.log('Running toElkGraph TDD Red Phase tests...');

const builder = new DiagramBuilder();
const initRes = builder.init('AWS Architecture');
assert.strictEqual(initRes.success, true);

// 1. Build a basic tiered topology
builder.addContainer('reg', 'us-east-1', 'region', '1');
builder.addContainer('vpc_1', 'Prod VPC', 'vpc', 'reg');
builder.addContainer('az_1', 'AZ-A', 'az', 'vpc_1');
builder.addContainer('sub_pub', 'Public Subnet', 'subnet', 'az_1', 'public');
builder.addNode('web_server', 'Web EC2', 'ec2', 'sub_pub');
builder.addNode('db_server', 'RDS DB', 'rds', 'sub_pub');
builder.connect('web_server', 'db_server', 'SQL');

// Check that calling toElkGraph throws or fails before implementation
try {
    assert.strictEqual(typeof builder.toElkGraph, 'function', 'toElkGraph should be a function');
    
    const elkGraph = builder.toElkGraph();
    assert.ok(elkGraph, 'Should return an ELK graph structure');
    assert.strictEqual(elkGraph.id, 'root', 'Root ID should be "root"');
    
    // Check nesting structure
    const regNode = elkGraph.children.find(c => c.id === 'reg');
    assert.ok(regNode, 'Should find region container');
    assert.strictEqual(regNode.children.length, 1, 'Region should contain 1 child (VPC)');
    
    const vpcNode = regNode.children[0];
    assert.strictEqual(vpcNode.id, 'vpc_1', 'VPC ID should match');
    assert.strictEqual(vpcNode.children.length, 1, 'VPC should contain 1 child (AZ)');
    
    const azNode = vpcNode.children[0];
    assert.strictEqual(azNode.id, 'az_1', 'AZ ID should match');
    
    const subNode = azNode.children.find(c => c.id === 'sub_pub');
    assert.ok(subNode, 'Should find subnet container');
    assert.strictEqual(subNode.children.length, 2, 'Subnet should contain 2 nodes');
    
    const webNode = subNode.children.find(c => c.id === 'web_server');
    const dbNode = subNode.children.find(c => c.id === 'db_server');
    assert.ok(webNode, 'Should find web node');
    assert.ok(dbNode, 'Should find db node');
    
    // Check sizes
    assert.strictEqual(webNode.width, 78, 'EC2 width should match default 78');
    assert.strictEqual(webNode.height, 78, 'EC2 height should match default 78');
    
    // Check layout options
    assert.ok(elkGraph.layoutOptions, 'Root should have layout options');
    assert.strictEqual(elkGraph.layoutOptions['elk.direction'], 'DOWN', 'Direction should be DOWN');
    
    console.log('toElkGraph test passed successfully!');
    process.exit(0);
} catch (e) {
    console.error('RED PHASE: toElkGraph test failed as expected:', e.message);
    process.exit(1);
}
