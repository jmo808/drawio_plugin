const assert = require('assert');

console.log('Running ELK layout config tests...');

try {
    const elkLayout = require('./elk-layout.js');
    
    // Test 1: getElkOptions exports and functions correctly
    assert.strictEqual(typeof elkLayout.getElkOptions, 'function', 'getElkOptions should be a function');
    
    // Test 2: options for 'architecture' diagram type
    const archOptions = elkLayout.getElkOptions('architecture');
    assert.ok(archOptions, 'Should return options for architecture');
    assert.strictEqual(archOptions['elk.algorithm'], 'layered', 'Architecture should use layered algorithm');
    assert.strictEqual(archOptions['elk.direction'], 'DOWN', 'Architecture direction should be DOWN');
    assert.strictEqual(archOptions['elk.spacing.nodeNode'], '40', 'Node-node spacing should be 40');
    assert.strictEqual(archOptions['elk.spacing.edgeNode'], '30', 'Edge-node spacing should be 30');
    
    // Test 3: options for 'flowchart' diagram type
    const flowOptions = elkLayout.getElkOptions('flowchart');
    assert.ok(flowOptions, 'Should return options for flowchart');
    assert.strictEqual(flowOptions['elk.direction'], 'DOWN', 'Flowchart direction should be DOWN');
    
    // Test 4: options for 'network' diagram type
    const netOptions = elkLayout.getElkOptions('network');
    assert.ok(netOptions, 'Should return options for network');
    assert.strictEqual(netOptions['elk.direction'], 'RIGHT', 'Network direction should be RIGHT');
    
    // Test 5: CONTAINER_PADDING export
    assert.ok(elkLayout.CONTAINER_PADDING, 'CONTAINER_PADDING should be exported');
    assert.ok(elkLayout.CONTAINER_PADDING.vpc, 'vpc padding should be defined');
    assert.strictEqual(elkLayout.CONTAINER_PADDING.vpc.top, 40, 'vpc top padding should match existing DiagramBuilder constants');
    
    // Test 6: NODE_SIZES export
    assert.ok(elkLayout.NODE_SIZES, 'NODE_SIZES should be exported');
    assert.ok(elkLayout.NODE_SIZES.ec2, 'ec2 size should be defined');
    assert.strictEqual(elkLayout.NODE_SIZES.ec2.width, 78, 'ec2 width should match existing constants');
    
    console.log('ELK layout config tests passed successfully!');
    process.exit(0);
} catch (e) {
    console.error('RED PHASE: ELK layout config test failed as expected:', e.message);
    process.exit(1);
}
