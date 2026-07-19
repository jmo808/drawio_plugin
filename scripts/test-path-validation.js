const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Try to load validatePath from mcp-wrapper.js
let validatePath;
try {
    const wrapper = require('./mcp-wrapper.js');
    validatePath = wrapper.validatePath;
} catch (e) {
    console.error('Failed to load mcp-wrapper.js:', e);
    process.exit(1);
}

if (typeof validatePath !== 'function') {
    console.error('validatePath is not exported as a function. Red phase check successful!');
    process.exit(1);
}

const baseDir = path.resolve(__dirname, 'sandbox-test');
if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir);
}

// Setup some symlinks for testing
const outsideFile = path.resolve(__dirname, 'outside.txt');
fs.writeFileSync(outsideFile, 'secret data');

const insideSymlink = path.join(baseDir, 'link-outside.txt');
if (fs.existsSync(insideSymlink)) {
    fs.unlinkSync(insideSymlink);
}
try {
    fs.symlinkSync(outsideFile, insideSymlink);
} catch (e) {
    console.warn('Could not create symlink (might lack permissions on Windows/some fs):', e.message);
}

const insideFile = path.join(baseDir, 'safe.json');
fs.writeFileSync(insideFile, '{}');

const insideSafeSymlink = path.join(baseDir, 'link-safe.json');
if (fs.existsSync(insideSafeSymlink)) {
    fs.unlinkSync(insideSafeSymlink);
}
try {
    fs.symlinkSync(insideFile, insideSafeSymlink);
} catch (e) {
    // Ignore
}

(async () => {
    try {
        console.log('Running path validation tests...');

        // 1. Accepts paths within workspace root
        let res = validatePath('safe.json', baseDir);
        assert.strictEqual(res.valid, true, 'Should accept relative path within workspace root');
        assert.strictEqual(res.resolvedPath, insideFile, 'Should resolve correct absolute path');

        res = validatePath('./safe.json', baseDir);
        assert.strictEqual(res.valid, true, 'Should accept explicit relative path');

        res = validatePath('nested/dir/file.json', baseDir);
        assert.strictEqual(res.valid, true, 'Should accept nested relative path (even if not existing yet)');

        // 2. Rejects .. traversal attempts
        res = validatePath('../outside.txt', baseDir);
        assert.strictEqual(res.valid, false, 'Should reject double-dot traversal escaping baseDir');
        assert.match(res.error, /resolves outside sandbox/, 'Error message should describe traversal');

        res = validatePath('nested/../../outside.txt', baseDir);
        assert.strictEqual(res.valid, false, 'Should reject sneaky double-dot traversal');

        // 3. Rejects absolute paths outside workspace
        res = validatePath('/etc/passwd', baseDir);
        assert.strictEqual(res.valid, false, 'Should reject absolute paths outside sandbox');

        res = validatePath(outsideFile, baseDir);
        assert.strictEqual(res.valid, false, 'Should reject absolute path to outside file');

        // 4. Rejects symlinks pointing outside sandbox
        if (fs.existsSync(insideSymlink)) {
            res = validatePath('link-outside.txt', baseDir);
            assert.strictEqual(res.valid, false, 'Should reject symlinks escaping the sandbox');
            assert.match(res.error, /Symlink traversal detected/, 'Error message should describe symlink traversal');
        }

        // 5. Accepts symlinks pointing inside sandbox
        if (fs.existsSync(insideSafeSymlink)) {
            res = validatePath('link-safe.json', baseDir);
            assert.strictEqual(res.valid, true, 'Should accept symlinks within the sandbox');
        }

        console.log('All path validation tests PASSED!');
        
        // Run environment sanitization test
        console.log('Running environment sanitization tests...');
        await testEnvSanitization();

        // Run message size limit test
        console.log('Running message size limit tests...');
        await testMessageSizeLimit();

        // Run timeout limit test
        console.log('Running timeout limit tests...');
        await testTimeoutLimit();

        // Run no npx fallback test
        console.log('Running no npx fallback tests...');
        await testNoNpxFallback();
        
        cleanup();
    } catch (e) {
        console.error('Test FAILED:', e);
        cleanup();
        process.exit(1);
    }
})();

function testEnvSanitization() {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
        const envPrinter = path.resolve(__dirname, 'env-printer.js');
        fs.writeFileSync(envPrinter, 'console.error(JSON.stringify(process.env)); process.exit(0);');

        const wrapperPath = path.resolve(__dirname, 'mcp-wrapper.js');
        const childProc = spawn('node', [wrapperPath], {
            env: {
                PATH: process.env.PATH,
                DRAWIO_MCP_PATH: envPrinter,
                LLM_API_KEY: 'super-secret-key-123',
                ANY_OTHER_SECRET: 'some-value'
            }
        });

        let stderrData = '';
        childProc.stderr.on('data', data => {
            stderrData += data.toString();
        });

        childProc.on('close', code => {
            try {
                if (fs.existsSync(envPrinter)) fs.unlinkSync(envPrinter);

                // Find the JSON string in the stderr output
                const lines = stderrData.split('\n');
                let parsedEnv = null;
                for (const line of lines) {
                    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
                        try {
                            parsedEnv = JSON.parse(line);
                            break;
                        } catch (e) {}
                    }
                }

                if (!parsedEnv) {
                    throw new Error('Could not parse child process environment from stderr: ' + stderrData);
                }

                // Assertions
                assert.ok(parsedEnv.PATH, 'PATH env var should be preserved');
                assert.ok(parsedEnv.DRAWIO_MCP_PATH, 'DRAWIO_MCP_PATH should be preserved');
                assert.strictEqual(parsedEnv.LLM_API_KEY, undefined, 'LLM_API_KEY should be sanitized/omitted');
                assert.strictEqual(parsedEnv.ANY_OTHER_SECRET, undefined, 'Arbitrary secret should be sanitized/omitted');
                assert.strictEqual(parsedEnv.NODE_OPTIONS, '--max-old-space-size=512', 'NODE_OPTIONS should be set to limit memory to 512MB');

                console.log('Environment sanitization tests PASSED!');
                resolve();
            } catch (err) {
                if (fs.existsSync(envPrinter)) fs.unlinkSync(envPrinter);
                reject(err);
            }
        });
    });
}

function testMessageSizeLimit() {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
        const wrapperPath = path.resolve(__dirname, 'mcp-wrapper.js');
        const childProc = spawn('node', [wrapperPath]);

        childProc.stdin.on('error', () => {});

        // Send a very large chunk (11MB) without a newline
        const largeChunk = Buffer.alloc(11 * 1024 * 1024, 'a');
        childProc.stdin.write(largeChunk);

        childProc.on('close', code => {
            if (code !== 0) {
                console.log('Message size limit tests PASSED!');
                resolve();
            } else {
                reject(new Error('Wrapper did not exit when sending message > 10MB'));
            }
        });
    });
}

function testTimeoutLimit() {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
        const wrapperPath = path.resolve(__dirname, 'mcp-wrapper.js');
        // Start wrapper with MCP_TIMEOUT_LIMIT_MS=200
        const childProc = spawn('node', [wrapperPath], {
            env: {
                PATH: process.env.PATH,
                MCP_TIMEOUT_LIMIT_MS: '200'
            }
        });

        let stdoutData = '';
        childProc.stdout.on('data', data => {
            stdoutData += data.toString();
        });

        // Send a tools/call request for 'search_shapes' (which is forwarded to child)
        const req = {
            jsonrpc: '2.0',
            id: 999,
            method: 'tools/call',
            params: {
                name: 'search_shapes',
                arguments: { query: 'server' }
            }
        };
        childProc.stdin.write(JSON.stringify(req) + '\n');

        setTimeout(() => {
            try {
                const lines = stdoutData.split('\n').filter(l => l.trim() !== '');
                let response = null;
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.id === 999) {
                            response = parsed;
                            break;
                        }
                    } catch (e) {}
                }

                if (!response) {
                    throw new Error('Could not find response with ID 999 in: ' + stdoutData);
                }

                assert.ok(response.error, 'Response should contain error');
                assert.match(response.error.message, /timed out/, 'Error message should indicate timeout');
                console.log('Timeout limit tests PASSED!');
                childProc.kill();
                resolve();
            } catch (err) {
                childProc.kill();
                reject(err);
            }
        }, 500);
    });
}

function testNoNpxFallback() {
    const { spawn } = require('child_process');
    const localMcpDir = path.resolve(__dirname, '..', 'node_modules', '@drawio', 'mcp');
    const localMcpBackup = localMcpDir + '.bak';
    
    let isBackupCreated = false;
    if (fs.existsSync(localMcpDir)) {
        fs.renameSync(localMcpDir, localMcpBackup);
        isBackupCreated = true;
    }

    const restore = () => {
        if (isBackupCreated && fs.existsSync(localMcpBackup)) {
            fs.renameSync(localMcpBackup, localMcpDir);
            isBackupCreated = false;
        }
    };

    return new Promise((resolve, reject) => {
        const wrapperPath = path.resolve(__dirname, 'mcp-wrapper.js');
        // Spawn wrapper with DRAWIO_MCP_PATH pointing to non-existent file
        const childProc = spawn('node', [wrapperPath], {
            env: {
                PATH: process.env.PATH,
                DRAWIO_MCP_PATH: '/nonexistent/path/to/mcp.js'
            }
        });

        let stderrData = '';
        childProc.stderr.on('data', data => {
            stderrData += data.toString();
        });

        childProc.on('close', code => {
            restore();
            try {
                assert.strictEqual(code, 1, 'Wrapper should exit with code 1');
                assert.match(stderrData, /Fallback to npx is disabled/, 'Error message should indicate npx fallback is disabled');
                console.log('No npx fallback tests PASSED!');
                resolve();
            } catch (err) {
                reject(err);
            }
        });

        childProc.on('error', err => {
            restore();
            reject(err);
        });
    });
}

function cleanup() {
    try {
        if (fs.existsSync(insideSymlink)) fs.unlinkSync(insideSymlink);
        if (fs.existsSync(insideSafeSymlink)) fs.unlinkSync(insideSafeSymlink);
        if (fs.existsSync(insideFile)) fs.unlinkSync(insideFile);
        if (fs.existsSync(outsideFile)) fs.unlinkSync(outsideFile);
        if (fs.existsSync(baseDir)) fs.rmdirSync(baseDir);
    } catch (e) {
        // Ignore
    }
}
