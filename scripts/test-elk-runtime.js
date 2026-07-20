const assert = require('assert');

console.log('Running ELK runtime test...');

try {
    const ELK = require('elkjs');
    const elk = new ELK();

    const graph = {
        id: "root",
        layoutOptions: { 'elk.algorithm': 'layered' },
        children: [
            { id: "n1", width: 30, height: 30 },
            { id: "n2", width: 30, height: 30 }
        ],
        edges: [
            { id: "e1", source: "n1", target: "n2" }
        ]
    };

    // Warm up run
    elk.layout(graph)
        .then(() => {
            const start = Date.now();
            return elk.layout(graph).then((layoutResult) => {
                const duration = Date.now() - start;
                console.log(`ELK Layout successfully completed in ${duration}ms!`);
                
                // Basic assertions
                assert.ok(layoutResult, 'Should return a layout result');
                assert.strictEqual(layoutResult.id, 'root', 'Root ID should match');
                
                const n1 = layoutResult.children.find(c => c.id === 'n1');
                const n2 = layoutResult.children.find(c => c.id === 'n2');
                
                assert.ok(n1, 'Should contain child n1');
                assert.ok(n2, 'Should contain child n2');
                assert.ok(typeof n1.x === 'number', 'n1 should have an x coordinate');
                assert.ok(typeof n2.x === 'number', 'n2 should have an x coordinate');
                
                assert.ok(duration < 10, `ELK layout took too long: ${duration}ms (expected <10ms)`);
                console.log('ELK runtime test passed successfully!');
                process.exit(0);
            });
        })
        .catch((err) => {
            console.error('ELK Layout execution failed:', err);
            process.exit(1);
        });
} catch (e) {
    console.error('RED PHASE: Failed to require/load elkjs as expected:', e.message);
    process.exit(1); // Exit with non-zero for test failure
}
