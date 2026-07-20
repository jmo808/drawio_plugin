const assert = require('assert');
const { DiagramBuilder } = require('./diagram-builder.js');
const ELK = require('elkjs');

console.log('Running applyElkLayout TDD Red Phase tests...');

const builder = new DiagramBuilder();
builder.init('AWS Architecture');

// Create test graph
builder.addContainer('reg', 'us-east-1', 'region', '1');
builder.addContainer('vpc_1', 'Prod VPC', 'vpc', 'reg');
builder.addContainer('az_1', 'AZ-A', 'az', 'vpc_1');
builder.addContainer('sub_pub', 'Public Subnet', 'subnet', 'az_1', 'public');
builder.addNode('web_server', 'Web EC2', 'ec2', 'sub_pub');
builder.addNode('db_server', 'RDS DB', 'rds', 'sub_pub');
builder.connect('web_server', 'db_server', 'SQL');

const elk = new ELK();
const elkGraph = builder.toElkGraph();

elk.layout(elkGraph)
    .then((layoutResult) => {
        try {
            assert.strictEqual(typeof builder.applyElkLayout, 'function', 'applyElkLayout should be a function');
            
            builder.applyElkLayout(layoutResult);
            
            // Check that positions were updated in cells map
            const webCell = builder.cells.get('web_server');
            const dbCell = builder.cells.get('db_server');
            const subCell = builder.cells.get('sub_pub');
            
            assert.ok(webCell, 'Web cell should exist');
            assert.ok(dbCell, 'DB cell should exist');
            assert.ok(subCell, 'Subnet cell should exist');
            
            // ELK-computed coordinates are relative to their parent container
            // Let's assert coordinates are non-zero/valid
            assert.ok(typeof webCell.x === 'number', 'Web cell should have a numeric X position');
            assert.ok(typeof webCell.y === 'number', 'Web cell should have a numeric Y position');
            
            // The size of the subnet container should have been updated by ELK auto-sizing
            assert.ok(subCell.width > 100, 'Subnet container width should be sized by ELK');
            assert.ok(subCell.height > 100, 'Subnet container height should be sized by ELK');
            
            // Check edge routing waypoints
            const edge = Array.from(builder.edges.values())[0];
            assert.ok(edge, 'Should find edge');
            assert.ok(Array.isArray(edge.points), 'Edge should contain a points array for waypoints');
            
            console.log('applyElkLayout test passed successfully!');
            process.exit(0);
        } catch (e) {
            console.error('RED PHASE: applyElkLayout test failed as expected:', e.message);
            process.exit(1);
        }
    })
    .catch((err) => {
        console.error('ELK Layout failed:', err);
        process.exit(1);
    });
