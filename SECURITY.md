# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **jmo808** (via [GitHub profile](https://github.com/jmo808)) or use [GitHub's private vulnerability reporting](https://github.com/jmo808/drawio_plugin/security/advisories/new).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

This is a side project maintained in spare time. I will make a best effort to:

- Acknowledge receipt within 7 days
- Provide an initial assessment within 14 days
- Release a fix for confirmed vulnerabilities as time permits

## Scope

The following are in scope:

- `scripts/mcp-wrapper.js` — MCP proxy handling stdin/stdout
- `scripts/diagram-builder.js` — XML generation engine
- `scripts/validate.js` and `scripts/validators/*` — Validation pipeline
- `install.sh` / `install.ps1` — Installation scripts that modify user config files

The following are out of scope:

- The upstream `@drawio/mcp` package (report to [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp))
- The draw.io web editor itself
