# Guided, opt-in setup for the tokscale leaderboard.
#
# Nothing is uploaded until you run this (and confirm). The plugin itself is
# local-only. See docs/LEADERBOARD.md for the full flow and the exact data
# that leaves the machine.
#
#   npm run leaderboard:setup          # interactive
#   pwsh -File scripts\setup-leaderboard.ps1 -Yes   # non-interactive
param([switch]$Yes)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$tokscaleDir = Join-Path $env:APPDATA 'tokscale'
$settingsPath = Join-Path $tokscaleDir 'settings.json'

Write-Host ''
Write-Host '=== tokscale leaderboard setup (optional) ==='
Write-Host 'tokscale uploads AGGREGATES ONLY: per-day token buckets, cost, message'
Write-Host 'counts, client/model names, MCP server names, timing metrics, a random'
Write-Host 'device key, CLI version. It NEVER uploads prompts, responses, source code,'
Write-Host 'or workspace/file paths. Details: docs/LEADERBOARD.md'
Write-Host ''
if (-not $Yes) {
    $answer = Read-Host 'Proceed: log in and submit to the public leaderboard? (y/N)'
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host 'Cancelled. Nothing was uploaded; the plugin keeps working locally.'
        return
    }
}

if (-not (Get-Command tokscale -ErrorAction SilentlyContinue)) {
    Write-Host 'tokscale is not installed. Install it first:'
    Write-Host '  bun add -g tokscale@latest    # or: npm i -g tokscale'
    return
}
Write-Host ("tokscale: " + ((tokscale --version 2>&1) -join ''))

$who = (tokscale whoami 2>&1 | Out-String)
if ($who -notmatch 'Username') {
    Write-Host 'Not logged in — opening GitHub OAuth...'
    tokscale login
}

Write-Host 'Exporting the local supplement tokscale cannot read...'
# DSH needs no export: tokscale >= 4.17.0 reads its versioned logs directly.
if ((tokscale --version 2>&1) -match '(\d+)\.(\d+)' -and [int]$Matches[1] -eq 4 -and [int]$Matches[2] -lt 17) {
    Write-Host 'WARNING: tokscale < 4.17.0 cannot read DSH''s versioned logs; upgrade it or DSH usage will be under-counted.'
}
node (Join-Path $PSScriptRoot 'ccswitch-export.mjs')
node (Join-Path $PSScriptRoot 'custom-pricing.mjs')

Write-Host "Registering the supplements in $settingsPath ..."
New-Item -ItemType Directory -Force -Path $tokscaleDir | Out-Null
$raw = if (Test-Path $settingsPath) { Get-Content -Raw $settingsPath } else { '{}' }
$obj = $raw | ConvertFrom-Json
if ($null -eq $obj.PSObject.Properties['scanner']) {
    $obj | Add-Member -MemberType NoteProperty -Name scanner -Value ([pscustomobject]@{}) -Force
}
$extra = [pscustomobject]@{
    claude = @((Join-Path $root '.ccswitch-home'))
}
$obj.scanner | Add-Member -MemberType NoteProperty -Name extraScanPaths -Value $extra -Force
$obj | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $settingsPath -Encoding UTF8

Write-Host 'First submit (dry run, then real)...'
tokscale submit --dry-run
tokscale submit

# Replace tokscale's own autosubmit with a task that also refreshes the
# supplements; only this task sees DSH v3 / CC Switch claude.
tokscale autosubmit disable 2>&1 | Out-Null
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" }
$script = Join-Path $PSScriptRoot 'refresh-and-submit.ps1'
$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 09:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'ai.tokscale.refresh' -Action $action -Trigger $trigger -Settings $settings -Description 'dsh-usage-unified: refresh DSH/CC Switch supplements and tokscale submit' -Force | Out-Null

Write-Host ''
Write-Host 'Done. Daily refresh task "ai.tokscale.refresh" registered; tokscale autosubmit disabled.'
Write-Host 'Set TOKSCALE_USERNAME to your handle, then `npm run report` to embed your card.'
Write-Host 'Turn it off anytime with: npm run leaderboard:off'
