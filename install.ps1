# PowerShell script to install Draw.io MCP server across multiple clients on Windows

Write-Host "=== Draw.io MCP Server & Agent Installer (Windows) ===" -ForegroundColor Cyan

$HomeDir = $env:USERPROFILE
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = (Get-Location).Path
}

# 1. Setup Kiro CLI Agents
$KiroDir = Join-Path $HomeDir ".kiro"
$KiroAgentsDir = Join-Path $KiroDir "agents"
if (Test-Path $KiroDir) {
    Write-Host "Installing Kiro agent files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $KiroAgentsDir | Out-Null

    # Replace {{HOME}} placeholder in drawio.json
    # Convert backslashes to forward slashes for the file URI
    $FormattedHome = $HomeDir.Replace("\", "/")
    $JsonTemplate = Get-Content (Join-Path $ScriptDir "drawio.json") -Raw
    $ResolvedJson = $JsonTemplate.Replace("{{HOME}}", $FormattedHome)
    [System.IO.File]::WriteAllText((Join-Path $KiroAgentsDir "drawio.json"), $ResolvedJson, [System.Text.UTF8Encoding]::new($false))

    Copy-Item -Force (Join-Path $ScriptDir "drawio.md") (Join-Path $KiroAgentsDir "drawio.md")
}

# 2. Setup Antigravity Agent Plugins
$GeminiDir = Join-Path $HomeDir ".gemini"
$GeminiPluginsDir = Join-Path $GeminiDir "config\plugins"
if (Test-Path $GeminiPluginsDir) {
    Write-Host "Installing Antigravity plugin files..." -ForegroundColor Green
    $PluginDest = Join-Path $GeminiPluginsDir "drawio"
    $SkillDest = Join-Path $PluginDest "skills\drawio"
    New-Item -ItemType Directory -Force -Path $SkillDest | Out-Null

    Copy-Item -Force (Join-Path $ScriptDir "plugin.json") (Join-Path $PluginDest "plugin.json")
    Copy-Item -Force (Join-Path $ScriptDir "drawio.md") (Join-Path $SkillDest "SKILL.md")

    $RefsDir = Join-Path $ScriptDir "references"
    if (Test-Path $RefsDir) {
        Copy-Item -Recurse -Force $RefsDir (Join-Path $SkillDest "references")
    }
    $ExamplesDir = Join-Path $ScriptDir "examples"
    if (Test-Path $ExamplesDir) {
        Copy-Item -Recurse -Force $ExamplesDir (Join-Path $SkillDest "examples")
    }
}

# Extract the body of drawio.md
$DrawioMdPath = Join-Path $ScriptDir "drawio.md"
$DrawioBody = ""
if (Test-Path $DrawioMdPath) {
    # Skip first 8 lines
    $DrawioBodyLines = (Get-Content $DrawioMdPath) | Select-Object -Skip 8
    $DrawioBody = $DrawioBodyLines -join "`n"
}

# 3. Setup Claude Code Skill
$ClaudeDir = Join-Path $HomeDir ".claude"
$ClaudeSkillsDir = Join-Path $ClaudeDir "skills\drawio"
if (Test-Path $ClaudeDir) {
    Write-Host "Installing Claude Code skill files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $ClaudeSkillsDir | Out-Null
    Copy-Item -Force $DrawioMdPath (Join-Path $ClaudeSkillsDir "SKILL.md")
}

# 4. Setup Cursor Rule
$CursorDir = Join-Path $HomeDir ".cursor"
$CursorRulesDir = Join-Path $CursorDir "rules"
if (Test-Path $CursorDir) {
    Write-Host "Installing Cursor rule files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $CursorRulesDir | Out-Null
    $CursorMdcContent = @"
---
description: Specialized agent for generating, updating, and exporting technical diagrams using the Draw.io MCP server.
globs: *
alwaysApply: false
---
$DrawioBody
"@
    [System.IO.File]::WriteAllText((Join-Path $CursorRulesDir "drawio.mdc"), $CursorMdcContent, [System.Text.UTF8Encoding]::new($false))
}

# 5. Setup Copilot Agent
$CopilotDir = Join-Path $HomeDir ".github"
$CopilotAgentsDir = Join-Path $CopilotDir "agents"
if (Test-Path (Join-Path $HomeDir ".copilot")) {
    Write-Host "Installing Copilot agent files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $CopilotAgentsDir | Out-Null
    $CopilotAgentContent = @"
---
name: drawio
description: Specialized agent for generating, updating, and exporting technical diagrams using the Draw.io MCP server.
---
$DrawioBody
"@
    [System.IO.File]::WriteAllText((Join-Path $CopilotAgentsDir "drawio.agent.md"), $CopilotAgentContent, [System.Text.UTF8Encoding]::new($false))
}

# 6. Configure MCP Servers across clients
Write-Host "Updating MCP configurations..." -ForegroundColor Green

$AppData = $env:APPDATA

$Paths = @(
    @{ Name = "Kiro CLI"; Path = Join-Path $HomeDir ".kiro\settings\mcp.json" },
    @{ Name = "Claude Desktop"; Path = Join-Path $AppData "Claude\claude_desktop_config.json" },
    @{ Name = "Claude Code"; Path = Join-Path $HomeDir ".claude.json" },
    @{ Name = "Claude Code (Settings)"; Path = Join-Path $HomeDir ".claude\settings.json" },
    @{ Name = "Cursor"; Path = Join-Path $HomeDir ".cursor\mcp.json" },
    @{ Name = "Copilot CLI"; Path = Join-Path $HomeDir ".copilot\mcp-config.json" },
    @{ Name = "Antigravity"; Path = Join-Path $HomeDir ".gemini\config\mcp_config.json" }
)

foreach ($Client in $Paths) {
    $FilePath = $Client.Path
    $ParentDir = Split-Path -Parent $FilePath

    if (-not (Test-Path $ParentDir)) {
        continue
    }

    if (Test-Path $FilePath) {
        Copy-Item -Force $FilePath "$FilePath.bak"
    }

    $Data = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    if (Test-Path $FilePath) {
        try {
            $Content = Get-Content $FilePath -Raw
            if (-not [string]::IsNullOrWhiteSpace($Content)) {
                $Data = ConvertFrom-Json $Content -ErrorAction Stop
            }
        } catch {
            Write-Warning "Skip: Could not parse JSON at $FilePath. Skipping this client: $_"
            continue
        }
    }

    if (-not $Data.PSObject.Properties['mcpServers']) {
        $Data | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{})
    }

    $DrawioConfig = [PSCustomObject]@{
        command = "npx"
        args = @("-y", "@drawio/mcp@1.3.4")
    }

    $Data.mcpServers | Add-Member -NotePropertyName "drawio" -NotePropertyValue $DrawioConfig -Force

    $UpdatedJson = ConvertTo-Json $Data -Depth 100
    $TmpPath = "$FilePath.tmp"
    [System.IO.File]::WriteAllText($TmpPath, $UpdatedJson, [System.Text.UTF8Encoding]::new($false))
    Move-Item -Force $TmpPath $FilePath
    Write-Host "- Configured $($Client.Name) at: $FilePath" -ForegroundColor Yellow
}

Write-Host "Verifying @drawio/mcp package..." -ForegroundColor Cyan
try {
    $null = & npx -y @drawio/mcp@1.3.4 --help 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`u{2713} @drawio/mcp package verified successfully" -ForegroundColor Green
    } else {
        Write-Host "`u{26A0} WARNING: @drawio/mcp package could not be verified. The MCP server may not work until the package is available." -ForegroundColor Yellow
    }
} catch {
    Write-Host "`u{26A0} WARNING: @drawio/mcp package could not be verified. The MCP server may not work until the package is available." -ForegroundColor Yellow
}

Write-Host "Installation complete! Please restart your client sessions to load the drawio tools." -ForegroundColor Green
