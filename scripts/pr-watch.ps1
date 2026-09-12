# Append the status of upstream PR junhoyeo/tokscale#1328 to logs\pr-1328.log.
#
# Recorded fields: state, mergeability, review decision, whether any check is
# failing, and the failing check names. Runs daily via `ai.tokscale.pr-watch`;
# run manually with:
#   pwsh -NoProfile -File scripts\pr-watch.ps1
param(
    [string]$Repo = 'junhoyeo/tokscale',
    [string]$Pr = '1328'
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "pr-$Pr.log"
$stamp = Get-Date -Format s

try {
    $view = gh pr view $Pr --repo $Repo --json state,mergeable,mergeStateStatus,reviewDecision,updatedAt 2>&1 | ConvertFrom-Json
} catch {
    Add-Content -LiteralPath $log -Encoding UTF8 -Value "[$stamp] ERROR reading PR: $($_.Exception.Message)"
    return
}

# `gh pr checks` exits non-zero when a check fails; capture text regardless.
$checksText = (gh pr checks $Pr --repo $Repo 2>&1 | Out-String)
$failing = @()
foreach ($line in ($checksText -split "`r?`n")) {
    if ($line -match '\bfail\b' -or $line -match '\bFAIL\b') {
        $failing += ($line -split "`t")[0].Trim()
    }
}
$failNote = if ($failing.Count -gt 0) { 'failing=[' + ($failing -join ', ') + ']' } else { 'failing=[]' }

$entry = "[$stamp] state=$($view.state) mergeable=$($view.mergeable) mergeState=$($view.mergeStateStatus) review=$($view.reviewDecision) $failNote"
Add-Content -LiteralPath $log -Encoding UTF8 -Value $entry
Write-Host $entry
