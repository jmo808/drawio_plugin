# PowerShell script to uninstall Draw.io MCP server across multiple clients on Windows

Write-Host "=== Draw.io MCP Server & Agent Uninstaller (Windows) ===" -ForegroundColor Cyan

$HomeDir = $env:USERPROFILE
$AppData = $env:APPDATA

# 1. Remove Kiro agent and skill files
$KiroAgentsDir = Join-Path $HomeDir ".kiro\agents"
$KiroSkillsDir = Join-Path $HomeDir ".kiro\skills\drawio"
$KiroJson = Join-Path $KiroAgentsDir "drawio.json"

if (Test-Path $KiroJson) {
    Remove-Item -Force $KiroJson
    Write-Host "- Removed Kiro agent config: $KiroJson" -ForegroundColor Yellow
}
if ((Test-Path $KiroSkillsDir) -and -not (Get-Item $KiroSkillsDir).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    Remove-Item -Recurse -Force $KiroSkillsDir
    Write-Host "- Removed Kiro skill: $KiroSkillsDir" -ForegroundColor Yellow
}
# Remove legacy drawio.md from agents/ if present from older installs
$KiroLegacyMd = Join-Path $KiroAgentsDir "drawio.md"
if (Test-Path $KiroLegacyMd) {
    Remove-Item -Force $KiroLegacyMd
    Write-Host "- Removed legacy Kiro agent spec: $KiroLegacyMd" -ForegroundColor Yellow
}

# 2. Remove Antigravity plugin directory
$GeminiPluginDir = Join-Path $HomeDir ".gemini\config\plugins\drawio"
if ((Test-Path $GeminiPluginDir) -and -not (Get-Item $GeminiPluginDir).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    Remove-Item -Recurse -Force $GeminiPluginDir
    Write-Host "- Removed Antigravity plugin: $GeminiPluginDir" -ForegroundColor Yellow
}

# 3. Remove Claude Code Skill
$ClaudeSkillsDir = Join-Path $HomeDir ".claude\skills\drawio"
if ((Test-Path $ClaudeSkillsDir) -and -not (Get-Item $ClaudeSkillsDir).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    Remove-Item -Recurse -Force $ClaudeSkillsDir
    Write-Host "- Removed Claude Code skill: $ClaudeSkillsDir" -ForegroundColor Yellow
}

# 4. Remove Cursor Rule
$CursorRuleFile = Join-Path $HomeDir ".cursor\rules\drawio.mdc"
if (Test-Path $CursorRuleFile) {
    Remove-Item -Force $CursorRuleFile
    Write-Host "- Removed Cursor rule: $CursorRuleFile" -ForegroundColor Yellow
}

# 5. Remove Copilot Skill
$CopilotSkillsDir = Join-Path $HomeDir ".github\skills\drawio"
if ((Test-Path $CopilotSkillsDir) -and -not (Get-Item $CopilotSkillsDir).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    Remove-Item -Recurse -Force $CopilotSkillsDir
    Write-Host "- Removed Copilot skill: $CopilotSkillsDir" -ForegroundColor Yellow
}
# Remove legacy .agent.md file if present from older installs
$CopilotLegacy = Join-Path $HomeDir ".github\agents\drawio.agent.md"
if (Test-Path $CopilotLegacy) {
    Remove-Item -Force $CopilotLegacy
    Write-Host "- Removed legacy Copilot agent: $CopilotLegacy" -ForegroundColor Yellow
}

# 6. Remove 'drawio' key from MCP config files
Write-Host "Cleaning MCP configurations..." -ForegroundColor Green

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

    if (-not (Test-Path $FilePath)) {
        continue
    }

    if (Test-Path $FilePath) {
        Copy-Item -Force $FilePath "$FilePath.bak"
    }

    try {
        $Content = Get-Content $FilePath -Raw
        if ([string]::IsNullOrWhiteSpace($Content)) {
            continue
        }
        $Data = ConvertFrom-Json $Content -ErrorAction Stop
    } catch {
        Write-Warning "Could not parse $FilePath. Skipping: $_"
        continue
    }

    if ($Data.PSObject.Properties['mcpServers'] -and $Data.mcpServers.PSObject.Properties['drawio']) {
        $Data.mcpServers.PSObject.Properties.Remove('drawio')
        $UpdatedJson = ConvertTo-Json $Data -Depth 100
        $TmpPath = "$FilePath.tmp"
        [System.IO.File]::WriteAllText($TmpPath, $UpdatedJson, [System.Text.UTF8Encoding]::new($false))
        Move-Item -Force $TmpPath $FilePath
        Write-Host "- Removed drawio from $($Client.Name): $FilePath" -ForegroundColor Yellow
    }
}

Write-Host "Uninstallation complete! Please restart your client sessions." -ForegroundColor Green
