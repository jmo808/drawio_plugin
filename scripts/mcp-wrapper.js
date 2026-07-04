#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const child = spawn('node', [path.join(__dirname, '..', 'node_modules', '@drawio', 'mcp', 'src', 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Proxy child stdout/stderr to process stdout/stderr
child.stdout.on('data', chunk => process.stdout.write(chunk));
child.stderr.on('data', chunk => process.stderr.write(chunk));

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', chunk => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);

    while (true) {
        const headerEnd = inputBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const headerStr = inputBuffer.slice(0, headerEnd).toString();
        const match = headerStr.match(/Content-Length: (\d+)/i);
        if (!match) {
            break; 
        }

        const contentLength = parseInt(match[1], 10);
        if (inputBuffer.length < headerEnd + 4 + contentLength) {
            // Incomplete message
            break;
        }

        const messageStr = inputBuffer.slice(headerEnd + 4, headerEnd + 4 + contentLength).toString();
        const fullMessageBuf = inputBuffer.slice(0, headerEnd + 4 + contentLength);
        inputBuffer = inputBuffer.slice(headerEnd + 4 + contentLength);

        try {
            const msg = JSON.parse(messageStr);
            if (msg.method === 'tools/call' && msg.params && msg.params.name === 'open_drawio_xml') {
                const xmlContent = msg.params.arguments.content;
                const tmpFile = path.join(os.tmpdir(), `drawio-validate-${Date.now()}.xml`);
                fs.writeFileSync(tmpFile, xmlContent, 'utf8');

                try {
                    const validateScript = path.join(__dirname, 'validate.js');
                    execSync(`node "${validateScript}" "${tmpFile}"`, { stdio: 'pipe' });
                    // Validation passed, forward original message to child
                    child.stdin.write(fullMessageBuf);
                } catch (error) {
                    // Validation failed
                    const stdout = error.stdout ? error.stdout.toString() : '';
                    const stderr = error.stderr ? error.stderr.toString() : error.message;
                    
                    const response = {
                        jsonrpc: "2.0",
                        id: msg.id,
                        result: {
                            content: [
                                {
                                    type: "text",
                                    text: "Validation failed!\n" + stdout + "\n" + stderr,
                                    isError: true
                                }
                            ],
                            isError: true
                        }
                    };
                    
                    const responseStr = JSON.stringify(response);
                    const buf = Buffer.from(responseStr, 'utf-8');
                    process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n${responseStr}`);
                }
                
                try { fs.unlinkSync(tmpFile); } catch (e) {}
            } else {
                // Not open_drawio_xml, forward to child
                child.stdin.write(fullMessageBuf);
            }
        } catch (e) {
            // Parse error or something else, forward to child
            child.stdin.write(fullMessageBuf);
        }
    }
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code !== null ? code : 1));
