const assert = require('assert');
const { DiagramBuilder } = require('./diagram-builder.js');
const ELK = require('elkjs');

console.log('Running ELK pipeline integration tests...');

const builder = new DiagramBuilder();
builder.init('AWS Integration Test');

// 1. Build a basic tiered topology without manual coordinates
builder.addContainer('reg', 'us-east-1', 'region', '1');
builder.addContainer('vpc_1', 'Prod VPC', 'vpc', 'reg');
builder.addContainer('az_1', 'AZ-A', 'az', 'vpc_1');
builder.addContainer('sub_pub', 'Public Subnet', 'subnet', 'az_1', 'public');
builder.addNode('web_server', 'Web EC2', 'ec2', 'sub_pub');
builder.addNode('db_server', 'RDS DB', 'rds', 'sub_pub');
builder.connect('web_server', 'db_server', 'SQL');

// 2. Perform layout using ELK
const elk = new ELK();
const elkGraph = builder.toElkGraph();

elk.layout(elkGraph)
    .then((layoutResult) => {
        builder.applyElkLayout(layoutResult);
        builder.elkLayoutApplied = true;
        
        // 3. Finalize and check spatial errors are warnings (not errors)
        const finalOutcome = builder.finalize();
        console.log('Finalize result:', JSON.stringify(finalOutcome, null, 2));
        
        assert.strictEqual(finalOutcome.success, true, 'Finalize should succeed even with spatial warning indicators');
        assert.ok(finalOutcome.xml, 'XML should be returned');
        assert.ok(finalOutcome.xml.includes('web_server'), 'Web server node should be serialized in XML');
        
        console.log('ELK pipeline integration tests passed successfully!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('ELK Layout failed:', err);
        process.exit(1);
    });
