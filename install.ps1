# PowerShell script to install Draw.io MCP server across multiple clients on Windows

Write-Host "=== Draw.io MCP Server & Agent Installer (Windows) ===" -ForegroundColor Cyan

# Pre-flight check: Verify Node.js is installed and version is 24+
$NodeExists = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeExists) {
    Write-Host "Error: Node.js is required but was not found in your PATH." -ForegroundColor Red
    Write-Host "Please install Node.js 24+ and try again." -ForegroundColor Red
    exit 1
}

$NodeVersion = & node -e "console.log(process.versions.node.split('.')[0])"
if ([int]$NodeVersion -lt 24) {
    Write-Host "Error: Node.js version 24 or higher is required. You have version $($NodeVersion)." -ForegroundColor Red
    exit 1
}

$HomeDir = $env:USERPROFILE
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = (Get-Location).Path
}

# 1. Setup Kiro CLI/IDE
$KiroDir = Join-Path $HomeDir ".kiro"
$KiroAgentsDir = Join-Path $KiroDir "agents"
$KiroSkillsDir = Join-Path $KiroDir "skills\drawio"
if (Test-Path $KiroDir) {
    Write-Host "Installing Kiro agent and skill files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $KiroAgentsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $KiroSkillsDir | Out-Null

    # Install agent config with prompt pointing to skill location
    $FormattedHome = $HomeDir.Replace("\", "/")
    $JsonTemplate = Get-Content (Join-Path $ScriptDir "drawio.json") -Raw
    $ResolvedJson = $JsonTemplate.Replace("{{HOME}}", $FormattedHome)
    [System.IO.File]::WriteAllText((Join-Path $KiroAgentsDir "drawio.json"), $ResolvedJson, [System.Text.UTF8Encoding]::new($false))

    # Install skill with full directory structure
    Copy-Item -Force (Join-Path $ScriptDir "skills\drawio\SKILL.md") (Join-Path $KiroSkillsDir "SKILL.md")

    # Copy references/ for progressive disclosure (loaded on-demand)
    $RefsDir = Join-Path $ScriptDir "skills\drawio\references"
    if (Test-Path $RefsDir) {
        $KiroRefsTarget = Join-Path $KiroSkillsDir "references"
        if (Test-Path $KiroRefsTarget) { Remove-Item -Recurse -Force $KiroRefsTarget }
        Copy-Item -Recurse -Force $RefsDir $KiroRefsTarget
    }

    # Copy scripts/ for executable utilities
    $ScriptsDir = Join-Path $ScriptDir "scripts"
    if (Test-Path $ScriptsDir) {
        $KiroScriptsTarget = Join-Path $KiroSkillsDir "scripts"
        if (Test-Path $KiroScriptsTarget) { Remove-Item -Recurse -Force $KiroScriptsTarget }
        Copy-Item -Recurse -Force $ScriptsDir $KiroScriptsTarget
    }

    # Remove legacy drawio.md from agents/ if present from older installs
    $LegacyMd = Join-Path $KiroAgentsDir "drawio.md"
    if (Test-Path $LegacyMd) {
        Remove-Item -Force $LegacyMd
        Write-Host "  - Cleaned up legacy agent spec: $LegacyMd" -ForegroundColor Yellow
    }
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
    Copy-Item -Force (Join-Path $ScriptDir "skills\drawio\SKILL.md") (Join-Path $SkillDest "SKILL.md")

    $RefsDir = Join-Path $ScriptDir "skills\drawio\references"
    if (Test-Path $RefsDir) {
        Copy-Item -Recurse -Force $RefsDir (Join-Path $SkillDest "references")
    }
    # Clean up target examples folder (if any) to keep agent environment clean
    $TargetExamples = Join-Path $SkillDest "examples"
    if (Test-Path $TargetExamples) {
        Remove-Item -Recurse -Force $TargetExamples
    }

    
    $ScriptsDir = Join-Path $ScriptDir "scripts"
    if (Test-Path $ScriptsDir) {
        Copy-Item -Recurse -Force $ScriptsDir (Join-Path $SkillDest "scripts")
    }
}

$DrawioMdPath = Join-Path $ScriptDir "skills\drawio\SKILL.md"
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
    # Claude Code supports the full SKILL.md + subdirectory structure natively
    Copy-Item -Force $DrawioMdPath (Join-Path $ClaudeSkillsDir "SKILL.md")

    # Copy references/ for progressive disclosure (loaded on-demand)
    $RefsDir = Join-Path $ScriptDir "skills\drawio\references"
    if (Test-Path $RefsDir) {
        $ClaudeRefsTarget = Join-Path $ClaudeSkillsDir "references"
        if (Test-Path $ClaudeRefsTarget) { Remove-Item -Recurse -Force $ClaudeRefsTarget }
        Copy-Item -Recurse -Force $RefsDir $ClaudeRefsTarget
    }

    # Copy scripts/ for executable utilities
    $ScriptsDir = Join-Path $ScriptDir "scripts"
    if (Test-Path $ScriptsDir) {
        $ClaudeScriptsTarget = Join-Path $ClaudeSkillsDir "scripts"
        if (Test-Path $ClaudeScriptsTarget) { Remove-Item -Recurse -Force $ClaudeScriptsTarget }
        Copy-Item -Recurse -Force $ScriptsDir $ClaudeScriptsTarget
    }
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

# 5. Setup Copilot Skill
$CopilotDir = Join-Path $HomeDir ".github"
$CopilotSkillsDir = Join-Path $CopilotDir "skills\drawio"
if (Test-Path (Join-Path $HomeDir ".copilot")) {
    Write-Host "Installing Copilot skill files..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $CopilotSkillsDir | Out-Null
    # Copilot CLI supports the full SKILL.md + subdirectory structure
    Copy-Item -Force $DrawioMdPath (Join-Path $CopilotSkillsDir "SKILL.md")

    # Copy references/ for progressive disclosure (loaded on-demand)
    $RefsDir = Join-Path $ScriptDir "skills\drawio\references"
    if (Test-Path $RefsDir) {
        $CopilotRefsTarget = Join-Path $CopilotSkillsDir "references"
        if (Test-Path $CopilotRefsTarget) { Remove-Item -Recurse -Force $CopilotRefsTarget }
        Copy-Item -Recurse -Force $RefsDir $CopilotRefsTarget
    }

    # Copy scripts/ for executable utilities
    $ScriptsDir = Join-Path $ScriptDir "scripts"
    if (Test-Path $ScriptsDir) {
        $CopilotScriptsTarget = Join-Path $CopilotSkillsDir "scripts"
        if (Test-Path $CopilotScriptsTarget) { Remove-Item -Recurse -Force $CopilotScriptsTarget }
        Copy-Item -Recurse -Force $ScriptsDir $CopilotScriptsTarget
    }

    # Remove legacy .agent.md file if present from older installs
    $LegacyAgent = Join-Path $CopilotDir "agents\drawio.agent.md"
    if (Test-Path $LegacyAgent) {
        Remove-Item -Force $LegacyAgent
        Write-Host "  - Cleaned up legacy agent file: $LegacyAgent" -ForegroundColor Yellow
    }
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
