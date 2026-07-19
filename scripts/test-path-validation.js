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
    cleanup();
} catch (e) {
    console.error('Test FAILED:', e);
    cleanup();
    process.exit(1);
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
