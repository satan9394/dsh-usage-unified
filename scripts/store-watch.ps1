# Append the status of the DSH STORE contract issue to logs\dsh-store-806.log.
#
# The store rechecks every 8 hours; this task polls on the same cadence and
# records state / last-updated / latest comment so the outcome is visible
# without visiting GitHub.
#
#   pwsh -NoProfile -File scripts\store-watch.ps1
param(
    [string]$Repo = 'AI-Scarlett/DSH-Store',
    [int]$Issue = 806
)
$ErrorActionPreference = 'Continue'
# `gh` emits UTF-8; PowerShell otherwise decodes native stdout with the console
# code page and mangles non-ASCII, breaking ConvertFrom-Json.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "dsh-store-$Issue.log"
$stamp = Get-Date -Format s

try {
    $json = gh issue view $Issue --repo $Repo --json state,updatedAt,title,comments 2>&1 | Out-String
    $view = $json | ConvertFrom-Json
} catch {
    Add-Content -LiteralPath $log -Encoding utf8 -Value "[$stamp] ERROR: $($_.Exception.Message)"
    return
}

$last = ''
if ($view.comments -and $view.comments.Count -gt 0) {
    $body = [string]$view.comments[-1].body
    $body = ($body -replace '\s+', ' ').Trim()
    if ($body.Length -gt 240) { $body = $body.Substring(0, 240) + '…' }
    $last = $body
}
$entry = "[$stamp] state=$($view.state) updated=$($view.updatedAt) comments=$($view.comments.Count) last=$last"
Add-Content -LiteralPath $log -Encoding utf8 -Value $entry
Write-Host $entry
