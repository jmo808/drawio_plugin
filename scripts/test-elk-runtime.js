const assert = require('assert');
const ELK = require('elkjs');
const elk = new ELK();

console.log('Running ELK runtime performance benchmarks...');

function generateGraph(size) {
    const children = [];
    const edges = [];
    
    // Create nodes
    for (let i = 0; i < size; i++) {
        children.push({
            id: `n${i}`,
            width: 80,
            height: 50
        });
    }
    
    // Create hierarchical edges (e.g. n_i to n_i+1 or random branch)
    for (let i = 0; i < size - 1; i++) {
        // Connect to next node, and sometimes branch
        edges.push({
            id: `e${i}`,
            source: `n${i}`,
            target: `n${i+1}`
        });
        if (i < size - 5 && i % 4 === 0) {
            edges.push({
                id: `e_branch_${i}`,
                source: `n${i}`,
                target: `n${i+3}`
            });
        }
    }
    
    return {
        id: "root",
        layoutOptions: { 
            'elk.algorithm': 'layered',
            'elk.direction': 'DOWN',
            'elk.spacing.nodeSelf': '40'
        },
        children,
        edges
    };
}

async function run() {
    try {
        // 1. Warm up run
        const warmGraph = generateGraph(2);
        await elk.layout(warmGraph);
        
        // 2. Benchmark 50 nodes
        const graph50 = generateGraph(50);
        const start50 = Date.now();
        const res50 = await elk.layout(graph50);
        const duration50 = Date.now() - start50;
        console.log(`ELK Layout on 50 nodes completed in ${duration50}ms!`);
        assert.ok(res50, 'Should return layout result for 50 nodes');
        assert.ok(duration50 < 50, `50-node layout exceeded NFR limit: ${duration50}ms (expected < 50ms)`);
        
        // 3. Benchmark 100 nodes
        const graph100 = generateGraph(100);
        const start100 = Date.now();
        const res100 = await elk.layout(graph100);
        const duration100 = Date.now() - start100;
        console.log(`ELK Layout on 100 nodes completed in ${duration100}ms!`);
        assert.ok(res100, 'Should return layout result for 100 nodes');
        assert.ok(duration100 < 50, `100-node layout exceeded NFR limit: ${duration100}ms (expected < 50ms)`);
        
        console.log('ELK runtime performance benchmarks passed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Benchmark execution failed:', err);
        process.exit(1);
    }
}

run();
